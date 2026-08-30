/**
 * Recommendation.js
 *
 * Mongoose model for the `recommendations` collection.
 *
 * Specification: Docs/DATABASE.md -- Section 16 (Recommendation Collection)
 *                Docs/ARCHITECTURE.md -- Section 17 (Recommendation Engine)
 *                Docs/AI.md -- Section 28 (Recommendation Boundary)
 *
 * Stores structured Integrated Pest Management (IPM) guidance associated with a Detection.
 * Includes provenance (`ruleVersion`, `effectiveDiagnosis.source`) and preserves
 * strict boundaries between AI vision predictions, expert validation, risk, and management advice.
 */

'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIAGNOSIS_SOURCES = Object.freeze({
  AI: 'AI',
  EXPERT_CONFIRMED: 'EXPERT_CONFIRMED',
  EXPERT_CORRECTED: 'EXPERT_CORRECTED',
});

const RECOMMENDATION_SOURCES = Object.freeze({
  RULE_BASED: 'RULE_BASED',
  EXPERT_ADVISED: 'EXPERT_ADVISED',
});

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const effectiveDiagnosisSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['disease', 'pest', 'healthy', 'unknown'],
        message: 'effectiveDiagnosis.type must be one of: disease, pest, healthy, unknown',
      },
      required: [true, 'effectiveDiagnosis.type is required'],
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    source: {
      type: String,
      enum: {
        values: Object.values(DIAGNOSIS_SOURCES),
        message: 'effectiveDiagnosis.source must be one of: AI, EXPERT_CONFIRMED, EXPERT_CORRECTED',
      },
      default: DIAGNOSIS_SOURCES.AI,
      required: true,
    },
  },
  { _id: false }
);

const expertReferralSchema = new mongoose.Schema(
  {
    recommended: {
      type: Boolean,
      default: false,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main Schema
// ---------------------------------------------------------------------------

const recommendationSchema = new mongoose.Schema(
  {
    // Parent Detection reference (strictly 1:1)
    detectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      required: [true, 'detectionId is required'],
      unique: true,
    },

    // Owning farmer
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    // Associated field
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: [true, 'fieldId is required'],
    },

    // Associated Risk Assessment (if generated)
    riskAssessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RiskAssessment',
      default: null,
    },

    // Provenance / Rule Version
    ruleVersion: {
      type: String,
      default: 'ipm-mvp-v1',
      required: true,
    },

    // Authoritative condition driving this recommendation
    effectiveDiagnosis: {
      type: effectiveDiagnosisSchema,
      required: true,
    },

    // Categorized IPM Action Arrays
    immediateActions: {
      type: [String],
      default: [],
    },

    monitoringActions: {
      type: [String],
      default: [],
    },

    culturalControls: {
      type: [String],
      default: [],
    },

    biologicalControls: {
      type: [String],
      default: [],
    },

    chemicalGuidance: {
      type: [String],
      default: [],
    },

    expertReferral: {
      type: expertReferralSchema,
      required: true,
      default: () => ({ recommended: false, reason: null }),
    },

    // Origin of guidance logic
    source: {
      type: String,
      enum: {
        values: Object.values(RECOMMENDATION_SOURCES),
        message: 'Recommendation source must be RULE_BASED or EXPERT_ADVISED',
      },
      default: RECOMMENDATION_SOURCES.RULE_BASED,
    },
  },
  {
    timestamps: true,
    collection: 'recommendations',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

recommendationSchema.index({ detectionId: 1 }, { unique: true });
recommendationSchema.index({ userId: 1, createdAt: -1 });
recommendationSchema.index({ fieldId: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const Recommendation = mongoose.model('Recommendation', recommendationSchema);

module.exports = {
  Recommendation,
  DIAGNOSIS_SOURCES,
  RECOMMENDATION_SOURCES,
};
