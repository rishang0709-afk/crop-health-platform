/**
 * recommendationEngineService.js
 *
 * Rule-based Integrated Pest Management (IPM) Recommendation Engine.
 *
 * Specification: Docs/ARCHITECTURE.md Section 17, Docs/DATABASE.md Section 16, Docs/AI.md Section 28
 *
 * Core responsibilities:
 *  - Resolves authoritative effective diagnosis (Expert Review > AI Vision Prediction).
 *  - Evaluates conservative IPM guidance based on crop, condition, growth stage, and risk level.
 *  - Enforces strict safety guardrails (no pesticide brands, dosages, rigid schedules, or specific biological strains).
 *  - Manages non-blocking generation and idempotent persistence (1:1 with Detection).
 */

'use strict';

const mongoose = require('mongoose');
const {
  RULE_VERSION,
  CONDITION_RULES,
  RISK_URGENCY_MODULATORS,
  GROWTH_STAGE_NOTES,
} = require('../config/ipmRules');
const { Recommendation, DIAGNOSIS_SOURCES, RECOMMENDATION_SOURCES } = require('../models/Recommendation');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { RiskAssessment } = require('../models/RiskAssessment');
const { ExpertReview, REVIEW_STATUSES, EXPERT_DECISIONS } = require('../models/ExpertReview');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the authoritative effective diagnosis driving recommendations.
 *
 * Precedence rule: Completed Expert Review overrides or confirms AI prediction.
 * Never modifies the underlying Detection.prediction or confidence.
 *
 * @param {object} detection - Detection document
 * @param {object|null} expertReview - ExpertReview document
 * @returns {object} { type, name, severity, source }
 */
function resolveEffectiveDiagnosis(detection, expertReview = null) {
  if (expertReview && expertReview.status === REVIEW_STATUSES.COMPLETED) {
    if (expertReview.decision === EXPERT_DECISIONS.CORRECTED && expertReview.correctedDiagnosis) {
      return {
        type: expertReview.correctedDiagnosis.type || 'disease',
        name: expertReview.correctedDiagnosis.name || null,
        severity: expertReview.correctedDiagnosis.severity || detection?.severity || null,
        source: DIAGNOSIS_SOURCES.EXPERT_CORRECTED,
      };
    }

    if (expertReview.decision === EXPERT_DECISIONS.CONFIRMED) {
      return {
        type: detection?.prediction?.type || 'unknown',
        name: detection?.prediction?.name || null,
        severity: detection?.severity || null,
        source: DIAGNOSIS_SOURCES.EXPERT_CONFIRMED,
      };
    }
  }

  // Default to AI prediction evidence
  return {
    type: detection?.prediction?.type || 'unknown',
    name: detection?.prediction?.name || null,
    severity: detection?.severity || null,
    source: DIAGNOSIS_SOURCES.AI,
  };
}

// ---------------------------------------------------------------------------
// Core Recommendation Generator
// ---------------------------------------------------------------------------

/**
 * Generate structured IPM recommendations from detection context, risk assessment,
 * and expert review state.
 *
 * @param {object} params - { detection, riskAssessment, expertReview }
 * @returns {object} Structured recommendation payload
 */
function generateRecommendation({ detection, riskAssessment = null, expertReview = null }) {
  const effective = resolveEffectiveDiagnosis(detection, expertReview);
  const status = detection?.status;
  const growthStage = detection?.growthStage ? String(detection.growthStage).trim().toLowerCase() : null;
  const riskLevel = riskAssessment?.level;

  let ruleSet = null;
  let expertReferral = { recommended: false, reason: null };

  // 1. Check special lifecycle states and prediction types
  if (status === DETECTION_STATUSES.AI_FAILED) {
    ruleSet = CONDITION_RULES.ai_failed;
    expertReferral = {
      recommended: true,
      reason: 'AI analysis failed to process the image; in-person inspection or image retry is recommended.',
    };
  } else if (effective.type === 'unknown') {
    ruleSet = CONDITION_RULES.unknown;
    expertReferral = {
      recommended: true,
      reason: 'Condition cannot be identified with confidence. Consultation with an agricultural expert is recommended.',
    };
  } else if (
    effective.source === DIAGNOSIS_SOURCES.AI &&
    (status === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED || status === DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS)
  ) {
    // Provisional safe state while awaiting expert review
    ruleSet = CONDITION_RULES.provisional_review;
    expertReferral = {
      recommended: true,
      reason:
        status === DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS
          ? 'Human expert review is currently in progress; defer chemical treatments until validated.'
          : 'AI confidence is below review threshold; human expert review has been requested.',
    };
  } else if (effective.type === 'healthy') {
    ruleSet = CONDITION_RULES.healthy;
    expertReferral = { recommended: false, reason: null };
  } else if (effective.type === 'pest') {
    const key = effective.name ? String(effective.name).trim().toLowerCase() : 'generic_pest';
    ruleSet = CONDITION_RULES[key] || CONDITION_RULES.generic_pest;
    expertReferral = { recommended: false, reason: null };
  } else {
    // Disease
    const key = effective.name ? String(effective.name).trim().toLowerCase() : 'generic_disease';
    ruleSet = CONDITION_RULES[key] || CONDITION_RULES.generic_disease;
    expertReferral = { recommended: false, reason: null };
  }

  // 2. Clone rule arrays
  const immediateActions = [...(ruleSet.immediateActions || [])];
  const monitoringActions = [...(ruleSet.monitoringActions || [])];
  const culturalControls = [...(ruleSet.culturalControls || [])];
  const biologicalControls = [...(ruleSet.biologicalControls || [])];
  const chemicalGuidance = [...(ruleSet.chemicalGuidance || [])];

  // 3. Modulate monitoring urgency based on environmental risk level (if disease/pest)
  if (effective.type === 'disease' || effective.type === 'pest') {
    if (riskLevel && RISK_URGENCY_MODULATORS[riskLevel]) {
      monitoringActions.push(RISK_URGENCY_MODULATORS[riskLevel]);
    }
  }

  // 4. Modulate cultural controls based on crop growth stage
  if (growthStage && GROWTH_STAGE_NOTES[growthStage] && effective.type !== 'healthy' && effective.type !== 'unknown') {
    culturalControls.push(GROWTH_STAGE_NOTES[growthStage]);
  }

  // 5. Add expert correction notice if applicable
  if (effective.source === DIAGNOSIS_SOURCES.EXPERT_CORRECTED) {
    immediateActions.unshift('Guidance updated based on human expert diagnosis correction.');
  }

  return {
    ruleVersion: RULE_VERSION,
    effectiveDiagnosis: {
      type: effective.type,
      name: effective.name,
      source: effective.source,
    },
    immediateActions,
    monitoringActions,
    culturalControls,
    biologicalControls,
    chemicalGuidance,
    expertReferral,
    source:
      expertReview && expertReview.status === REVIEW_STATUSES.COMPLETED
        ? RECOMMENDATION_SOURCES.EXPERT_ADVISED
        : RECOMMENDATION_SOURCES.RULE_BASED,
  };
}

// ---------------------------------------------------------------------------
// Persistence Handler (Non-Blocking & Idempotent)
// ---------------------------------------------------------------------------

/**
 * Generate and upsert a Recommendation document for a given detection.
 *
 * @param {string|mongoose.Types.ObjectId} detectionId
 * @returns {Promise<object|null>} Persisted Recommendation document
 */
async function generateAndPersistRecommendation(detectionId) {
  if (!detectionId) {
    return null;
  }

  const detection = await Detection.findById(detectionId);
  if (!detection) {
    return null;
  }

  let riskAssessment = null;
  let expertReview = null;

  if (mongoose.connection.readyState === 1) {
    riskAssessment = await RiskAssessment.findOne({ detectionId: detection._id });
    expertReview = await ExpertReview.findOne({ detectionId: detection._id });
  }

  const recData = generateRecommendation({
    detection,
    riskAssessment,
    expertReview,
  });

  if (mongoose.connection.readyState === 1) {
    const updated = await Recommendation.findOneAndUpdate(
      { detectionId: detection._id },
      {
        $set: {
          userId: detection.userId,
          fieldId: detection.fieldId,
          riskAssessmentId: riskAssessment ? riskAssessment._id : null,
          ruleVersion: recData.ruleVersion,
          effectiveDiagnosis: recData.effectiveDiagnosis,
          immediateActions: recData.immediateActions,
          monitoringActions: recData.monitoringActions,
          culturalControls: recData.culturalControls,
          biologicalControls: recData.biologicalControls,
          chemicalGuidance: recData.chemicalGuidance,
          expertReferral: recData.expertReferral,
          source: recData.source,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
    return updated;
  }

  // In-memory representation for test environments without an active MongoDB connection
  return {
    _id: new mongoose.Types.ObjectId(),
    detectionId: detection._id,
    userId: detection.userId,
    fieldId: detection.fieldId,
    riskAssessmentId: riskAssessment ? riskAssessment._id : null,
    ruleVersion: recData.ruleVersion,
    effectiveDiagnosis: recData.effectiveDiagnosis,
    immediateActions: recData.immediateActions,
    monitoringActions: recData.monitoringActions,
    culturalControls: recData.culturalControls,
    biologicalControls: recData.biologicalControls,
    chemicalGuidance: recData.chemicalGuidance,
    expertReferral: recData.expertReferral,
    source: recData.source,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

module.exports = {
  resolveEffectiveDiagnosis,
  generateRecommendation,
  generateAndPersistRecommendation,
};
