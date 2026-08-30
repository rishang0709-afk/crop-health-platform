/**
 * Alert.js
 *
 * Mongoose model for the `alerts` collection.
 *
 * Specification: Docs/DATABASE.md -- Section 13 (Alert Collection)
 *                Docs/ARCHITECTURE.md -- Section 13 (Alert Engine)
 *                Docs/API.md -- Sections 23, 24
 *
 * Stores user-facing actionable early warnings and notifications.
 *
 * Schema fields conform to Docs/DATABASE.md Section 13:
 *  - userId: Owning farmer reference
 *  - type: Canonical alert type enum
 *  - severity: Canonical alert severity enum
 *  - title: User-facing headline
 *  - message: User-facing explanatory message (treatment-free)
 *  - relatedDetectionId: Reference to associated detection (nullable)
 *  - relatedFieldId: Reference to associated field (nullable)
 *  - location: GeoJSON Point coordinates
 *  - isRead: Read status boolean (default false)
 *  - readAt: Timestamp when marked read (default null)
 *  - dedupKey: Internal sparse unique index for deterministic deduplication
 */

'use strict';

const mongoose = require('mongoose');
const { ALERT_TYPES, ALERT_SEVERITIES } = require('../config/alertRules');

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const pointLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    // GeoJSON standard: [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coords) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: 'coordinates must be [longitude, latitude] with valid geographic ranges',
      },
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main Schema
// ---------------------------------------------------------------------------

const alertSchema = new mongoose.Schema(
  {
    // Owning user (farmer recipient)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    // Canonical alert type enum (Docs/DATABASE.md Section 13)
    type: {
      type: String,
      enum: {
        values: Object.values(ALERT_TYPES),
        message: 'Alert type must be one of: EARLY_WARNING, HIGH_RISK, HOTSPOT, EXPERT_REVIEW, FOLLOW_UP, SYSTEM',
      },
      required: [true, 'Alert type is required'],
    },

    // Severity level
    severity: {
      type: String,
      enum: {
        values: Object.values(ALERT_SEVERITIES),
        message: 'Alert severity must be one of: LOW, MEDIUM, HIGH, CRITICAL',
      },
      required: [true, 'Alert severity is required'],
    },

    // User-facing headline
    title: {
      type: String,
      required: [true, 'Alert title is required'],
      trim: true,
      maxlength: [200, 'Alert title cannot exceed 200 characters'],
    },

    // Explanatory message
    message: {
      type: String,
      required: [true, 'Alert message is required'],
      trim: true,
      maxlength: [1000, 'Alert message cannot exceed 1000 characters'],
    },

    // Associated detection reference
    relatedDetectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      default: null,
      index: true,
    },

    // Associated field reference
    relatedFieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      default: null,
      index: true,
    },

    // GeoJSON location coordinates
    location: {
      type: pointLocationSchema,
      default: null,
    },

    // Read state tracking
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Internal deduplication key to guarantee idempotency across re-evaluations
    dedupKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
    collection: 'alerts',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

alertSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const Alert = mongoose.model('Alert', alertSchema);

module.exports = {
  Alert,
  ALERT_TYPES,
  ALERT_SEVERITIES,
};
