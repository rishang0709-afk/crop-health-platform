/**
 * riskController.js
 *
 * HTTP handlers for Risk Assessment endpoints.
 *
 * Routes handled:
 *   GET  /api/detections/:id/risk             -- getDetectionRisk
 *   POST /api/detections/:id/risk/recalculate -- recalculateDetectionRisk
 *
 * Specification: Docs/API.md Section 22, Docs/DATABASE.md Section 11
 */

'use strict';

const mongoose = require('mongoose');
const { Detection } = require('../models/Detection');
const { Field } = require('../models/Field');
const { RiskAssessment } = require('../models/RiskAssessment');
const weatherService = require('../services/weatherService');
const riskEngineService = require('../services/riskEngineService');
const recommendationEngineService = require('../services/recommendationEngineService');
const alertService = require('../services/alertService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function safeRiskData(risk) {
  return {
    id: risk._id.toString(),
    detectionId: risk.detectionId.toString(),
    userId: risk.userId.toString(),
    fieldId: risk.fieldId.toString(),
    score: risk.score,
    level: risk.level,
    factors: risk.factors,
    explanation: risk.explanation || [],
    weatherSnapshot: risk.weatherSnapshot || null,
    createdAt: risk.createdAt,
    updatedAt: risk.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/detections/:id/risk
// ---------------------------------------------------------------------------

/**
 * Return the detailed risk assessment for a detection owned by the authenticated user.
 */
async function getDetectionRisk(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    // Verify detection exists and belongs to the authenticated farmer
    const detection = await Detection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!detection) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found or does not belong to the authenticated user',
        },
      });
    }

    // Find the associated RiskAssessment document
    const risk = await RiskAssessment.findOne({ detectionId: id });

    if (!risk) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RISK_ASSESSMENT_NOT_FOUND',
          message: 'No risk assessment has been generated for this detection',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        risk: safeRiskData(risk),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/detections/:id/risk/recalculate
// ---------------------------------------------------------------------------

/**
 * Recalculate the contextual risk score for a detection using fresh weather data.
 */
async function recalculateDetectionRisk(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const detection = await Detection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!detection) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found or does not belong to the authenticated user',
        },
      });
    }

    if (!detection.prediction || !detection.prediction.type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DETECTION_NOT_ANALYZED',
          message: 'Detection must be analyzed before calculating risk',
        },
      });
    }

    if (detection.prediction.type === 'unknown') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_CALCULATE_RISK_FOR_UNKNOWN',
          message: 'Risk assessment cannot be calculated for unknown prediction type',
        },
      });
    }

    // 1. Resolve coordinates from detection or field
    let coords = detection.location?.coordinates;
    if (!coords || !Array.isArray(coords)) {
      const field = await Field.findById(detection.fieldId);
      coords = field?.location?.coordinates;
    }

    // 2. Fetch fresh weather snapshot bypassing the coordinate cache
    let weatherSnapshot = null;
    if (coords && coords.length === 2) {
      weatherSnapshot = await weatherService.getWeatherSnapshot(
        { longitude: coords[0], latitude: coords[1] },
        { forceRefresh: true }
      );
    }

    // 3. Calculate risk using the central risk engine
    const riskResult = riskEngineService.calculateRisk(detection, weatherSnapshot);

    if (!riskResult) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'RISK_CALCULATION_FAILED',
          message: 'Failed to evaluate risk for this detection',
        },
      });
    }

    // 4. Upsert RiskAssessment document (guarantees no duplicates)
    const updatedRisk = await RiskAssessment.findOneAndUpdate(
      { detectionId: detection._id },
      {
        $set: {
          userId: detection.userId,
          fieldId: detection.fieldId,
          score: riskResult.score,
          level: riskResult.level,
          factors: riskResult.factors,
          explanation: riskResult.explanation,
          weatherSnapshot: riskResult.weatherSnapshot,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    // 5. Update weather snapshot copy on Detection if weather was obtained
    if (weatherSnapshot) {
      await Detection.updateOne(
        { _id: detection._id },
        { $set: { weatherSnapshot } }
      );
    }

    // 6. Regenerate IPM recommendation (non-blocking)
    try {
      await recommendationEngineService.generateAndPersistRecommendation(detection._id);
    } catch (recError) {
      console.warn(`Post-recalculation recommendation regeneration warning for detection ${detection._id}: ${recError.message}`);
    }

    // 7. Re-evaluate early warning alerts (non-blocking)
    try {
      await alertService.evaluateAndCreateAlerts({
        detection,
        riskAssessment: updatedRisk,
      });
    } catch (alertErr) {
      console.warn(`Post-recalculation alert evaluation warning for detection ${detection._id}: ${alertErr.message}`);
    }

    return res.status(200).json({
      success: true,
      data: {
        risk: safeRiskData(updatedRisk),
      },
      message: 'Risk assessment recalculated successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDetectionRisk,
  recalculateDetectionRisk,
};
