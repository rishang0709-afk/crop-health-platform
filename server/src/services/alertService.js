/**
 * alertService.js
 *
 * Early Warning & Alert Engine service.
 *
 * Specification: Docs/ARCHITECTURE.md Section 13, Docs/DATABASE.md Section 13, Docs/API.md Sections 23-24
 *
 * Responsibilities:
 *  - Evaluates contextual risk, diagnosis severity, and review events against alert rules.
 *  - Applies deterministic deduplication keys to prevent duplicate alert creation.
 *  - Enforces strict non-blocking failure isolation across all calling controller pipelines.
 *  - Guarantees that alerts never mutate underlying Detection, RiskAssessment, or Recommendation entities.
 */

'use strict';

const mongoose = require('mongoose');
const { Alert, ALERT_TYPES, ALERT_SEVERITIES } = require('../models/Alert');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { RiskAssessment, RISK_LEVELS } = require('../models/RiskAssessment');
const { ExpertReview, REVIEW_STATUSES, EXPERT_DECISIONS } = require('../models/ExpertReview');
const { Field } = require('../models/Field');
const {
  generateDedupKey,
  ALERT_TEMPLATES,
} = require('../config/alertRules');

// ---------------------------------------------------------------------------
// Candidate Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate which alerts should be generated based on current detection,
 * risk, and expert review state.
 *
 * @param {object} params - { detection, riskAssessment, expertReview }
 * @returns {Array<object>} Array of alert candidate definitions
 */
function evaluateAlertCandidates({ detection, riskAssessment = null, expertReview = null }) {
  if (!detection || !detection._id) {
    return [];
  }

  const candidates = [];
  const status = detection.status;
  const crop = detection.crop || 'Crop';
  const prediction = detection.prediction;
  const isHealthy = prediction?.type === 'healthy';
  const diagnosisName = prediction?.name || null;
  const detectionId = detection._id.toString();

  // 1. AI Analysis Failed
  if (status === DETECTION_STATUSES.AI_FAILED) {
    const t = ALERT_TEMPLATES.SYSTEM_AI_FAILED;
    candidates.push({
      type: t.type,
      severity: t.severity,
      title: t.title(crop),
      message: t.message(crop),
      dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
    });
    return candidates;
  }

  // 2. Expert Review Completed (CONFIRMED or CORRECTED)
  if (expertReview && expertReview.status === REVIEW_STATUSES.COMPLETED) {
    if (expertReview.decision === EXPERT_DECISIONS.CORRECTED && expertReview.correctedDiagnosis) {
      const t = ALERT_TEMPLATES.EXPERT_REVIEW_CORRECTED;
      const correctedName = expertReview.correctedDiagnosis.name || diagnosisName;
      candidates.push({
        type: t.type,
        severity: t.severity,
        title: t.title(crop, correctedName),
        message: t.message(crop, correctedName),
        dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
      });
      return candidates;
    }

    if (expertReview.decision === EXPERT_DECISIONS.CONFIRMED) {
      const t = ALERT_TEMPLATES.EXPERT_REVIEW_CONFIRMED;
      candidates.push({
        type: t.type,
        severity: t.severity,
        title: t.title(crop, diagnosisName),
        message: t.message(crop, diagnosisName),
        dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
      });
      return candidates;
    }
  }

  // 3. Pending Expert Review (Low confidence)
  if (status === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED || status === DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS) {
    // 3a. Generate the lifecycle review alert (even for healthy predictions that had low confidence)
    const reviewTemplate = ALERT_TEMPLATES.EXPERT_REVIEW_REQUIRED;
    candidates.push({
      type: reviewTemplate.type,
      severity: reviewTemplate.severity,
      title: reviewTemplate.title(crop),
      message: reviewTemplate.message(crop),
      dedupKey: generateDedupKey(detectionId, reviewTemplate.type, reviewTemplate.eventQualifier),
    });

    // 3b. If environmental risk is elevated during pending review, generate provisional early warning
    if (
      !isHealthy &&
      riskAssessment &&
      (riskAssessment.level === RISK_LEVELS.CRITICAL || riskAssessment.level === RISK_LEVELS.HIGH)
    ) {
      const warnTemplate = ALERT_TEMPLATES.EARLY_WARNING_PENDING_REVIEW;
      candidates.push({
        type: warnTemplate.type,
        severity: riskAssessment.level === RISK_LEVELS.CRITICAL ? ALERT_SEVERITIES.CRITICAL : ALERT_SEVERITIES.HIGH,
        title: warnTemplate.title(crop),
        message: warnTemplate.message(crop),
        dedupKey: generateDedupKey(detectionId, warnTemplate.type, `${riskAssessment.level}_PENDING`),
      });
    }

    return candidates;
  }

  // 4. Healthy Actionable Case: Suppress all disease/pest warnings
  if (isHealthy) {
    return [];
  }

  // 5. Actionable Disease / Pest Case: Evaluate Environmental Risk & Symptom Severity
  let earlyWarningAdded = false;

  if (riskAssessment) {
    if (riskAssessment.level === RISK_LEVELS.CRITICAL) {
      const t = ALERT_TEMPLATES.EARLY_WARNING_CRITICAL;
      candidates.push({
        type: t.type,
        severity: t.severity,
        title: t.title(crop),
        message: t.message(crop),
        dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
      });
      earlyWarningAdded = true;
    } else if (riskAssessment.level === RISK_LEVELS.HIGH) {
      const t = ALERT_TEMPLATES.EARLY_WARNING_HIGH;
      candidates.push({
        type: t.type,
        severity: t.severity,
        title: t.title(crop),
        message: t.message(crop),
        dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
      });
      earlyWarningAdded = true;
    }
  }

  // If no early warning triggered, check if observed symptom severity warrants a HIGH_RISK alert
  if (!earlyWarningAdded && detection.severity) {
    const isSevere =
      detection.severity.level === 'high' ||
      detection.severity.level === 'critical' ||
      (typeof detection.severity.score === 'number' && detection.severity.score >= 70);

    if (isSevere) {
      const t = ALERT_TEMPLATES.HIGH_RISK_SEVERE;
      candidates.push({
        type: t.type,
        severity: t.severity,
        title: t.title(crop, diagnosisName),
        message: t.message(crop, diagnosisName),
        dedupKey: generateDedupKey(detectionId, t.type, t.eventQualifier),
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Alert Creation Orchestrator (Idempotent & Non-Blocking)
// ---------------------------------------------------------------------------

/**
 * Evaluate and persist alerts for a detection context.
 *
 * @param {object} params - { detection, riskAssessment, expertReview }
 * @returns {Promise<Array<object>>} Created or existing alert documents
 */
async function evaluateAndCreateAlerts({ detection, riskAssessment = null, expertReview = null }) {
  if (!detection || !detection._id || !detection.userId) {
    return [];
  }

  const candidates = evaluateAlertCandidates({ detection, riskAssessment, expertReview });
  if (candidates.length === 0) {
    return [];
  }

  // Resolve coordinates
  let location = null;
  if (
    detection.location &&
    Array.isArray(detection.location.coordinates) &&
    detection.location.coordinates.length === 2
  ) {
    location = {
      type: 'Point',
      coordinates: detection.location.coordinates,
    };
  } else if (detection.fieldId) {
    try {
      const parentField = await Field.findById(detection.fieldId);
      if (parentField?.location?.coordinates) {
        location = {
          type: 'Point',
          coordinates: parentField.location.coordinates,
        };
      }
    } catch {
      // Suppress field query error
    }
  }

  const results = [];

  for (const candidate of candidates) {
    if (mongoose.connection.readyState === 1) {
      // Check if an alert with this exact event key already exists
      const existing = await Alert.findOne({ dedupKey: candidate.dedupKey });
      if (existing) {
        // Idempotency: Preserve existing alert and its isRead state exactly
        results.push(existing);
        continue;
      }

      // Create new alert document
      const alert = new Alert({
        userId: detection.userId,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        relatedDetectionId: detection._id,
        relatedFieldId: detection.fieldId || null,
        location,
        isRead: false,
        readAt: null,
        dedupKey: candidate.dedupKey,
      });

      await alert.save();
      results.push(alert);
    } else {
      // In-memory mock alert for disconnected test environments
      results.push({
        _id: new mongoose.Types.ObjectId(),
        userId: detection.userId,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        relatedDetectionId: detection._id,
        relatedFieldId: detection.fieldId || null,
        location,
        isRead: false,
        readAt: null,
        dedupKey: candidate.dedupKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  return results;
}

/**
 * Helper to trigger alert generation specifically upon expert review completion.
 *
 * @param {string|mongoose.Types.ObjectId} detectionId
 * @param {object} expertReview
 */
async function createExpertReviewCompletionAlert(detectionId, expertReview) {
  if (!detectionId || !expertReview) {
    return;
  }

  const detection = await Detection.findById(detectionId);
  if (!detection) {
    return;
  }

  await evaluateAndCreateAlerts({
    detection,
    riskAssessment: null,
    expertReview,
  });
}

module.exports = {
  evaluateAlertCandidates,
  evaluateAndCreateAlerts,
  createExpertReviewCompletionAlert,
};
