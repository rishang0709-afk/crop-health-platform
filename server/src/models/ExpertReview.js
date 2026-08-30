/**
 * ExpertReview.js
 *
 * Mongoose model for the `expert_reviews` collection.
 *
 * Specification: Docs/DATABASE.md -- Sections 14, 15
 *                Docs/API.md      -- Sections 25, 26, 27
 *                Docs/AI.md       -- Sections 5, 8
 *
 * Key rules:
 *  - Stores expert validation and corrections separately from the original AI prediction.
 *  - Original AI prediction evidence in Detection.prediction is NEVER overwritten.
 *  - Unique index on detectionId ensures a Detection cannot have multiple review documents.
 *  - originalPrediction.name is nullable to support type = 'unknown' (where name is null).
 */

'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Constants & Enums
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
});

const EXPERT_DECISIONS = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  CORRECTED: 'CORRECTED',
});

const DIAGNOSIS_TYPES = Object.freeze({
  DISEASE: 'disease',
  PEST: 'pest',
  HEALTHY: 'healthy',
  UNKNOWN: 'unknown',
});

const SEVERITY_LEVELS = Object.freeze({
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical',
});

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/**
 * Snapshot of original AI prediction at claim time.
 * Supports type = 'unknown' with name = null.
 */
const originalPredictionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: Object.values(DIAGNOSIS_TYPES),
        message: 'originalPrediction.type must be one of: disease, pest, healthy, unknown',
      },
      required: [true, 'originalPrediction.type is required'],
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    confidence: {
      type: Number,
      min: [0, 'originalPrediction.confidence must be between 0 and 1'],
      max: [1, 'originalPrediction.confidence must be between 0 and 1'],
      default: null,
    },
  },
  { _id: false }
);

/**
 * Corrected diagnosis provided by the expert on decision = CORRECTED.
 */
const correctedDiagnosisSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: Object.values(DIAGNOSIS_TYPES),
        message: 'correctedDiagnosis.type must be one of: disease, pest, healthy, unknown',
      },
      required: [true, 'correctedDiagnosis.type is required'],
    },
    name: {
      type: String,
      required: [true, 'correctedDiagnosis.name is required'],
      trim: true,
    },
    severity: {
      level: {
        type: String,
        enum: {
          values: Object.values(SEVERITY_LEVELS),
          message: 'correctedDiagnosis.severity.level must be one of: low, moderate, high, critical',
        },
        default: null,
      },
      score: {
        type: Number,
        min: [0, 'correctedDiagnosis.severity.score must be between 0 and 100'],
        max: [100, 'correctedDiagnosis.severity.score must be between 0 and 100'],
        default: null,
      },
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main ExpertReview Schema
// ---------------------------------------------------------------------------

const expertReviewSchema = new mongoose.Schema(
  {
    detectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      required: [true, 'detectionId is required'],
      unique: true, // Enforce one review record per detection
      index: true,
    },
    expertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'expertId is required'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(REVIEW_STATUSES),
        message: 'status must be IN_PROGRESS or COMPLETED',
      },
      default: REVIEW_STATUSES.IN_PROGRESS,
      index: true,
    },
    decision: {
      type: String,
      enum: {
        values: Object.values(EXPERT_DECISIONS),
        message: 'decision must be CONFIRMED or CORRECTED',
      },
      default: null,
    },
    originalPrediction: {
      type: originalPredictionSchema,
      required: [true, 'originalPrediction snapshot is required'],
    },
    correctedDiagnosis: {
      type: correctedDiagnosisSchema,
      default: null,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [2000, 'comment cannot exceed 2000 characters'],
      default: null,
    },
    requiresLabDiagnosis: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      required: [true, 'startedAt timestamp is required'],
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'expert_reviews',
  }
);

// Compound index for filtering reviews by expert and status
expertReviewSchema.index({ expertId: 1, status: 1 });

const ExpertReview = mongoose.model('ExpertReview', expertReviewSchema);

module.exports = {
  ExpertReview,
  REVIEW_STATUSES,
  EXPERT_DECISIONS,
  DIAGNOSIS_TYPES,
  SEVERITY_LEVELS,
};
