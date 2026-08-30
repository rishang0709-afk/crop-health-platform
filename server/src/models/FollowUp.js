/**
 * FollowUp.js
 *
 * Mongoose model for the `follow_ups` collection.
 *
 * Specification: Docs/DATABASE.md -- Section 17 & 18
 *                Docs/API.md      -- Section 28 & 29
 *
 * Tracks longitudinal crop condition after the initial detection.
 * Append-only observation record that preserves original detection evidence.
 */

'use strict';

const mongoose = require('mongoose');

// Canonical documented follow-up status enum (Docs/DATABASE.md Section 18)
const FOLLOW_UP_STATUSES = Object.freeze({
  IMPROVED: 'IMPROVED',
  STABLE: 'STABLE',
  WORSENED: 'WORSENED',
  NO_CHANGE: 'NO_CHANGE',
  UNKNOWN: 'UNKNOWN',
});

const followUpSchema = new mongoose.Schema(
  {
    // Parent Detection reference
    detectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      required: [true, 'detectionId is required'],
    },

    // Owning user (farmer)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },

    // Associated agricultural field
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: [true, 'fieldId is required'],
      index: true,
    },

    // Authoritative observation date
    followUpDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Optional image URL from Cloudinary
    imageUrl: {
      type: String,
      default: null,
    },

    // Farmer-reported descriptive observation notes
    observation: {
      type: String,
      trim: true,
      maxlength: [1000, 'Observation cannot exceed 1000 characters'],
      default: null,
    },

    // Categorical follow-up condition status
    status: {
      type: String,
      enum: {
        values: Object.values(FOLLOW_UP_STATUSES),
        message: 'Status must be one of: IMPROVED, STABLE, WORSENED, NO_CHANGE, UNKNOWN',
      },
      required: [true, 'status is required'],
    },

    // Optional reference to a new follow-up detection (nullable for MVP)
    newDetectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Detection',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'follow_ups',
  }
);

// Compound index for timeline queries ordered chronologically by followUpDate
followUpSchema.index({ detectionId: 1, followUpDate: 1, createdAt: 1 });

const FollowUp = mongoose.model('FollowUp', followUpSchema);

module.exports = {
  FollowUp,
  FOLLOW_UP_STATUSES,
};
