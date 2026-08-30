'use strict';

/**
 * hotspotService.js
 *
 * Core business logic for aggregating detections into regional hotspots and map reports.
 */

const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { RiskAssessment } = require('../models/RiskAssessment');
const { ExpertReview, EXPERT_DECISIONS } = require('../models/ExpertReview');
const hotspotRules = require('../config/hotspotRules');

/**
 * Helper to compute fixed-grid cell from coordinates.
 * Works correctly for positive and negative coordinates by utilizing Math.floor.
 * @param {Number} lat 
 * @param {Number} lng 
 * @returns {Object} { latIndex, lngIndex, centerLat, centerLng }
 */
function getGridCell(lat, lng) {
  const resolution = hotspotRules.GRID_RESOLUTION;
  const latIndex = Math.floor(lat / resolution);
  const lngIndex = Math.floor(lng / resolution);
  
  // Center of the cell
  const centerLat = (latIndex * resolution) + (resolution / 2);
  const centerLng = (lngIndex * resolution) + (resolution / 2);
  
  return { latIndex, lngIndex, centerLat, centerLng };
}

/**
 * Helper to determine hotspot severity.
 */
function calculateSeverity(contributions, avgRisk) {
  if (contributions >= hotspotRules.SEVERITY_THRESHOLDS.CRITICAL.minContributions && 
      (avgRisk === null || avgRisk >= hotspotRules.SEVERITY_THRESHOLDS.CRITICAL.minRiskScore)) {
    return 'CRITICAL';
  }
  if (contributions >= hotspotRules.SEVERITY_THRESHOLDS.HIGH.minContributions && 
      (avgRisk === null || avgRisk >= hotspotRules.SEVERITY_THRESHOLDS.HIGH.minRiskScore)) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

/**
 * Fetch and process detections to form hotspots or map reports.
 * 
 * @param {Object} filters - Supported filters (crop, disease, from, to, risk)
 * @returns {Array} List of grouped and filtered cell data
 */
async function aggregateSurveillanceData(filters = {}) {
  // 1. Establish the time window (default 14 days, or overridden by from/to filters)
  const toDate = filters.to ? new Date(filters.to) : new Date();
  const fromDate = filters.from 
    ? new Date(filters.from) 
    : new Date(toDate.getTime() - (hotspotRules.TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  // 2. Query qualifying detections within the time window
  // Only include states that can contribute to a hotspot.
  const qualifyingStatuses = [
    DETECTION_STATUSES.ACTIONABLE,
    DETECTION_STATUSES.CONFIRMED,
    DETECTION_STATUSES.CORRECTED
  ];

  const matchStage = {
    status: { $in: qualifyingStatuses },
    createdAt: { $gte: fromDate, $lte: toDate }
  };
  if (filters.crop) {
    // We filter roughly by crop here, but exact normalized grouping happens in memory to be safe.
    matchStage.crop = { $regex: new RegExp(`^\\s*${filters.crop}\\s*$`, 'i') };
  }

  const detections = await Detection.find(matchStage)
    .populate('userId', '_id')
    .populate('fieldId', '_id')
    .lean();

  if (!detections.length) return [];

  // Fetch all expert reviews and risk assessments for these detections
  const detectionIds = detections.map(d => d._id);
  const [reviews, risks] = await Promise.all([
    ExpertReview.find({ detectionId: { $in: detectionIds } }).lean(),
    RiskAssessment.find({ detectionId: { $in: detectionIds } }).lean()
  ]);

  const reviewMap = new Map(reviews.map(r => [r.detectionId.toString(), r]));
  const riskMap = new Map(risks.map(r => [r.detectionId.toString(), r]));

  // 3. Resolve effective diagnosis and group by field/crop/diagnosis
  // We enforce ONE contribution per field + normalized crop + normalized diagnosis.
  const fieldContributions = new Map();

  for (const d of detections) {
    let effectiveType = d.prediction?.type;
    let effectiveName = d.prediction?.name;
    let reviewDecision = null;

    const review = reviewMap.get(d._id.toString());
    if (review && review.decision === EXPERT_DECISIONS.CORRECTED && review.correctedDiagnosis) {
      effectiveType = review.correctedDiagnosis.type;
      effectiveName = review.correctedDiagnosis.name;
      reviewDecision = 'CORRECTED';
    } else if (review && review.decision === EXPERT_DECISIONS.CONFIRMED) {
      reviewDecision = 'CONFIRMED';
    } else if (d.status === DETECTION_STATUSES.ACTIONABLE) {
      reviewDecision = 'ACTIONABLE';
    } else if (d.status === DETECTION_STATUSES.CONFIRMED) {
      // In case status is CONFIRMED but review is missing or wasn't fetched right
      reviewDecision = 'CONFIRMED';
    } else if (d.status === DETECTION_STATUSES.CORRECTED) {
      reviewDecision = 'CORRECTED';
    }

    // Exclude healthy, unknown, or missing
    if (!effectiveType || !effectiveName || effectiveType === 'healthy' || effectiveType === 'unknown') {
      continue;
    }

    // Normalization for grouping (trim, lowercase)
    const normCrop = d.crop.trim().toLowerCase();
    const normDisease = effectiveName.trim().toLowerCase();

    // If a disease filter is applied, apply it to the resolved name
    if (filters.disease) {
      const filterDisease = filters.disease.trim().toLowerCase();
      if (normDisease !== filterDisease) continue;
    }

    const fieldKey = `${d.fieldId._id.toString()}_${normCrop}_${normDisease}`;
    
    // We want the most recent qualifying detection per field
    // Since we queried without sorting, we compare dates
    const existing = fieldContributions.get(fieldKey);
    if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) {
      
      const risk = riskMap.get(d._id.toString());

      fieldContributions.set(fieldKey, {
        detectionId: d._id,
        createdAt: d.createdAt,
        userId: d.userId._id.toString(),
        fieldId: d.fieldId._id.toString(),
        crop: d.crop.trim(), // human readable
        normCrop,
        disease: effectiveName.trim(), // human readable
        normDisease,
        lat: d.location.coordinates[1],
        lng: d.location.coordinates[0],
        riskScore: risk ? risk.score : null, // keep null if missing
        reviewDecision // Actionable, Confirmed, Corrected
      });
    }
  }

  // 4. Grid Binning
  // Group by Grid Cell + Normalized Crop + Normalized Disease
  const gridGroups = new Map();

  for (const contribution of fieldContributions.values()) {
    const cell = getGridCell(contribution.lat, contribution.lng);
    const gridKey = `${cell.latIndex}_${cell.lngIndex}_${contribution.normCrop}_${contribution.normDisease}`;

    if (!gridGroups.has(gridKey)) {
      gridGroups.set(gridKey, {
        cell,
        crop: contribution.crop,
        disease: contribution.disease,
        normCrop: contribution.normCrop,
        normDisease: contribution.normDisease,
        contributions: [],
        uniqueFarmers: new Set(),
        uniqueFields: new Set()
      });
    }

    const group = gridGroups.get(gridKey);
    group.contributions.push(contribution);
    group.uniqueFarmers.add(contribution.userId);
    group.uniqueFields.add(contribution.fieldId);
  }

  // 5. Calculate severity, filter and format output
  const results = [];

  for (const [gridKey, group] of gridGroups.entries()) {
    // Privacy and MVP thresholds
    if (group.uniqueFields.size < hotspotRules.MIN_DISTINCT_FIELDS) continue;
    if (group.uniqueFarmers.size < hotspotRules.MIN_DISTINCT_FARMERS) continue;
    if (group.contributions.length < hotspotRules.MIN_REPORTS) continue;

    // Calculate Average Risk Score
    let sumRisk = 0;
    let countRisk = 0;
    let validationBreakdown = { ACTIONABLE: 0, CONFIRMED: 0, CORRECTED: 0 };

    for (const c of group.contributions) {
      if (c.riskScore !== null) {
        sumRisk += c.riskScore;
        countRisk++;
      }
      if (c.reviewDecision) {
        validationBreakdown[c.reviewDecision] = (validationBreakdown[c.reviewDecision] || 0) + 1;
      }
    }

    const averageRiskScore = countRisk > 0 ? (sumRisk / countRisk) : null;

    // Optional risk filter applied on average
    if (filters.risk) {
      // Very basic filtering if requested by /api/officer/map/reports
      // Actually /api/officer/map/reports allows filtering by risk. Let's calculate the canonical level.
    }

    const riskLevel = calculateSeverity(group.contributions.length, averageRiskScore);

    if (filters.risk && filters.risk.toUpperCase() !== riskLevel) {
       continue; // filter out if risk filter provided and doesn't match
    }

    results.push({
      id: gridKey, // Using grid key as a deterministic ID
      crop: group.crop,
      disease: group.disease,
      reportCount: group.contributions.length,
      riskLevel: riskLevel,
      averageRiskScore: averageRiskScore !== null ? Math.round(averageRiskScore) : null,
      validationBreakdown,
      center: {
        latitude: group.cell.centerLat,
        longitude: group.cell.centerLng
      }
    });
  }

  return results;
}

/**
 * Get active regional hotspots.
 */
async function calculateHotspots(filters = {}) {
  const data = await aggregateSurveillanceData(filters);
  return data;
}

/**
 * Get privacy-safe map reports.
 */
async function calculateMapReports(filters = {}) {
  // Essentially the same aggregation, but we format for map display.
  // The aggregateSurveillanceData already enforces distinct fields/farmers and returns rounded centers.
  const data = await aggregateSurveillanceData(filters);
  
  return data.map(d => ({
    id: d.id,
    crop: d.crop,
    disease: d.disease,
    reportCount: d.reportCount,
    riskLevel: d.riskLevel,
    averageRiskScore: d.averageRiskScore,
    center: d.center
  }));
}

module.exports = {
  calculateHotspots,
  calculateMapReports,
  getGridCell
};
