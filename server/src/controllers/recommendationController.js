/**
 * recommendationController.js
 *
 * HTTP handlers for Recommendation endpoints.
 *
 * Routes handled:
 *   GET  /api/detections/:id/recommendation            -- getDetectionRecommendation
 *   POST /api/detections/:id/recommendation/regenerate -- regenerateDetectionRecommendation
 *
 * Specification: Docs/API.md Section 18, Docs/DATABASE.md Section 16
 */

'use strict';

const mongoose = require('mongoose');
const { Detection } = require('../models/Detection');
const { Recommendation } = require('../models/Recommendation');
const recommendationEngineService = require('../services/recommendationEngineService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function safeRecommendationData(rec) {
  return {
    id: rec._id.toString(),
    detectionId: rec.detectionId.toString(),
    userId: rec.userId.toString(),
    fieldId: rec.fieldId.toString(),
    riskAssessmentId: rec.riskAssessmentId ? rec.riskAssessmentId.toString() : null,
    ruleVersion: rec.ruleVersion,
    effectiveDiagnosis: rec.effectiveDiagnosis,
    immediateActions: rec.immediateActions || [],
    monitoringActions: rec.monitoringActions || [],
    culturalControls: rec.culturalControls || [],
    biologicalControls: rec.biologicalControls || [],
    chemicalGuidance: rec.chemicalGuidance || [],
    expertReferral: rec.expertReferral,
    source: rec.source,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/detections/:id/recommendation
// ---------------------------------------------------------------------------

/**
 * Return the structured IPM recommendation for a detection owned by the authenticated user.
 */
async function getDetectionRecommendation(req, res, next) {
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

    // Find the associated Recommendation document
    const recommendation = await Recommendation.findOne({ detectionId: id });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RECOMMENDATION_NOT_FOUND',
          message: 'No recommendation has been generated for this detection',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        recommendation: safeRecommendationData(recommendation),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/detections/:id/recommendation/regenerate
// ---------------------------------------------------------------------------

/**
 * Regenerate the structured IPM recommendation using current risk and expert review state.
 */
async function regenerateDetectionRecommendation(req, res, next) {
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

    const updated = await recommendationEngineService.generateAndPersistRecommendation(detection._id);

    if (!updated) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'RECOMMENDATION_GENERATION_FAILED',
          message: 'Failed to generate recommendation for this detection',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        recommendation: safeRecommendationData(updated),
      },
      message: 'Recommendation regenerated successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDetectionRecommendation,
  regenerateDetectionRecommendation,
};
