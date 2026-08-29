/**
 * confidenceRoutingService.js
 *
 * Centralized service for confidence-based post-analysis routing.
 *
 * Evaluates completed AI predictions and determines the next lifecycle state:
 *   - ACTIONABLE (High confidence disease, pest, or healthy prediction)
 *   - EXPERT_REVIEW_REQUIRED (Low or medium confidence, or unknown prediction)
 *
 * Specification: Docs/AI.md Section 7, Docs/DATABASE.md Section 10, Docs/API.md Section 53.
 *
 * Important rules:
 *  - AI confidence is NOT expert confirmation. Never transitions to CONFIRMED or CORRECTED.
 *  - Unknown predictions (type = 'unknown') ALWAYS route to EXPERT_REVIEW_REQUIRED.
 *  - Severity (level/score) describes condition extent for downstream risk scoring;
 *    it does not override confidence routing thresholds.
 */

'use strict';

const { DETECTION_STATUSES } = require('../models/Detection');

/**
 * Centralized confidence thresholds.
 * Configured in one location to avoid magic numbers scattered across the codebase.
 */
const CONFIDENCE_THRESHOLDS = Object.freeze({
  LOW_MAX: 0.60,  // < 0.60 is low confidence
  HIGH_MIN: 0.85, // >= 0.85 is high confidence
});

/**
 * Reasons for routing decisions (for traceability).
 */
const ROUTING_REASONS = Object.freeze({
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  MEDIUM_CONFIDENCE: 'MEDIUM_CONFIDENCE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  UNKNOWN_PREDICTION: 'UNKNOWN_PREDICTION',
});

/**
 * Custom error class for confidence routing failures.
 */
class ConfidenceRoutingError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ConfidenceRoutingError';
    this.code = 'CONFIDENCE_ROUTING_ERROR';
    this.details = details;
  }
}

/**
 * Determine the confidence band from a numerical confidence score.
 *
 * @param {number} confidence - Value between 0.0 and 1.0
 * @returns {'low' | 'medium' | 'high'}
 */
function getConfidenceBand(confidence) {
  if (typeof confidence !== 'number' || isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new ConfidenceRoutingError(
      `Invalid confidence value '${confidence}'. Must be a number between 0.0 and 1.0.`
    );
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH_MIN) {
    return 'high';
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.LOW_MAX) {
    return 'medium';
  }

  return 'low';
}

/**
 * Evaluate an AI prediction and return the next lifecycle state and routing decision.
 *
 * @param {object} prediction - { type, name, confidence, modelName, modelVersion }
 * @returns {{
 *   confidenceBand: 'low' | 'medium' | 'high',
 *   nextStatus: 'ACTIONABLE' | 'EXPERT_REVIEW_REQUIRED',
 *   requiresExpertReview: boolean,
 *   reason: string
 * }}
 */
function evaluateConfidenceRouting(prediction) {
  if (!prediction || typeof prediction !== 'object') {
    throw new ConfidenceRoutingError('Prediction object is required for confidence routing.');
  }

  const { type, confidence } = prediction;

  if (!type || typeof type !== 'string') {
    throw new ConfidenceRoutingError('Prediction type is missing or invalid.');
  }

  const confidenceBand = getConfidenceBand(confidence);

  // 1. Unknown predictions (type = 'unknown') can NEVER be ACTIONABLE.
  // Must unconditionally route to EXPERT_REVIEW_REQUIRED.
  if (type.toLowerCase() === 'unknown') {
    return {
      confidenceBand,
      nextStatus: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
      requiresExpertReview: true,
      reason: ROUTING_REASONS.UNKNOWN_PREDICTION,
    };
  }

  // 2. High confidence (>= 0.85) for disease, pest, or healthy -> ACTIONABLE
  if (confidenceBand === 'high') {
    return {
      confidenceBand: 'high',
      nextStatus: DETECTION_STATUSES.ACTIONABLE,
      requiresExpertReview: false,
      reason: ROUTING_REASONS.HIGH_CONFIDENCE,
    };
  }

  // 3. Medium confidence (0.60 <= confidence < 0.85) -> EXPERT_REVIEW_REQUIRED
  if (confidenceBand === 'medium') {
    return {
      confidenceBand: 'medium',
      nextStatus: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
      requiresExpertReview: true,
      reason: ROUTING_REASONS.MEDIUM_CONFIDENCE,
    };
  }

  // 4. Low confidence (< 0.60) -> EXPERT_REVIEW_REQUIRED
  return {
    confidenceBand: 'low',
    nextStatus: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
    requiresExpertReview: true,
    reason: ROUTING_REASONS.LOW_CONFIDENCE,
  };
}

module.exports = {
  CONFIDENCE_THRESHOLDS,
  ROUTING_REASONS,
  ConfidenceRoutingError,
  getConfidenceBand,
  evaluateConfidenceRouting,
};
