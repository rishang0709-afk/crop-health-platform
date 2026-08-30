/**
 * RiskAssessment.js
 *
 * Mongoose model for the `risk_assessments` collection.
 *
 * Specification: Docs/DATABASE.md -- Section 11 (Risk Assessment Collection)
 *                Docs/AI.md       -- Sections 17, 18, 19
 *
 * Stores the contextual risk score calculated by combining:
 *  - AI vision detection and severity
 *  - Environmental/weather conditions
 *  - Crop growth stage susceptibility
 *  - Geospatial and historical context (when available)
 */

'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const RISK_SCORE_THRESHOLDS = {
  LOW_MAX: 35,
  MEDIUM_MAX: 65,
  HIGH_MAX: 84,
  // 85–100 is CRITICAL
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const factorsSchema = new mongoose.Schema(
  {
    aiEvidence: {
      type: Number,
      min: [0, 'aiEvidence must be between 0 and 1'],
      max: [1, 'aiEvidence must be between 0 and 1'],
      default: null,
    },
    weatherRisk: {
      type: Number,
      min: [0, 'weatherRisk must be between 0 and 1'],
      max: [1, 'weatherRisk must be between 0 and 1'],
      default: null,
    },
    cropStageRisk: {
      type: Number,
      min: [0, 'cropStageRisk must be between 0 and 1'],
      max: [1, 'cropStageRisk must be between 0 and 1'],
      default: null,
    },
    nearbyReportsRisk: {
      type: Number,
      min: [0, 'nearbyReportsRisk must be between 0 and 1'],
      max: [1, 'nearbyReportsRisk must be between 0 and 1'],
      default: 0,
    },
    historicalRisk: {
      type: Number,
      min: [0, 'historicalRisk must be between 0 and 1'],
      max: [1, 'historicalRisk must be between 0 and 1'],
      default: 0,
    },
  },
  { _id: false }
);

const riskAssessmentSchema = new mongoose.Schema(
  {
    // Reference to the Detection this assessment was generated for
    detectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      required: [true, 'detectionId is required'],
      unique: true, // One risk assessment document per detection
    },

    // Owning user (farmer)
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

    // Overall composite risk score (0 to 100)
    score: {
      type: Number,
      required: [true, 'Risk score is required'],
      min: [0, 'Risk score must be at least 0'],
      max: [100, 'Risk score must be at most 100'],
    },

    // Categorical risk level
    level: {
      type: String,
      required: [true, 'Risk level is required'],
      enum: {
        values: Object.values(RISK_LEVELS),
        message: 'Risk level must be one of: LOW, MEDIUM, HIGH, CRITICAL',
      },
    },

    // Contributing factor breakdown (normalized sub-scores 0.0 to 1.0)
    factors: {
      type: factorsSchema,
      required: true,
    },

    // Natural-language explanations for transparency
    explanation: {
      type: [String],
      default: [],
    },

    // Snapshot of the weather data used during this risk calculation
    weatherSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'risk_assessments',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

riskAssessmentSchema.index({ detectionId: 1 }, { unique: true });
riskAssessmentSchema.index({ userId: 1, createdAt: -1 });
riskAssessmentSchema.index({ fieldId: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const RiskAssessment = mongoose.model('RiskAssessment', riskAssessmentSchema);

module.exports = {
  RiskAssessment,
  RISK_LEVELS,
  RISK_SCORE_THRESHOLDS,
};
