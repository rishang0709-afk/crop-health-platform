/**
 * Detection.js
 *
 * Mongoose model for the `detections` collection.
 *
 * Specification: Docs/DATABASE.md -- Sections 8, 9, 10, 22, 23, 24
 *                Docs/AI.md       -- Sections 5, 6, 7, 8, 9
 *
 * This model defines the schema only.
 * Detection routes, controllers, AI calls, and risk engine are handled
 * in separate tasks.
 *
 * Key design decisions:
 *  - The AI prediction result is EMBEDDED inside this document.
 *    There is no separate ai_results collection (DATABASE.md Section 8).
 *  - AI confidence is a separate concept from overall crop-health risk.
 *    The risk assessment belongs in its own future collection (Section 23).
 *  - Severity may be null when the model does not support reliable
 *    severity estimation (AI.md Section 9).
 *  - Status transitions are controlled entirely by the backend; the schema
 *    only enforces that the value is one of the documented lifecycle states.
 *    High AI confidence does NOT automatically set status to CONFIRMED.
 *  - Location uses GeoJSON Point: coordinates[0] = longitude,
 *    coordinates[1] = latitude (DATABASE.md Section 19).
 *  - weatherSnapshot is stored as a snapshot so that old detections can
 *    be reconstructed accurately even after weather conditions change
 *    (DATABASE.md Section 22).
 */

'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * All valid detection lifecycle states.
 * Defined here so they can be imported by future controllers/services without
 * duplicating the strings across the codebase.
 *
 * DATABASE.md Section 10 defines the allowed values and transition rules.
 * The task request also adds ACTIONABLE as a valid intermediate state.
 */
const DETECTION_STATUSES = {
  CREATED: 'CREATED',
  AI_ANALYZING: 'AI_ANALYZING',
  AI_RESULT_AVAILABLE: 'AI_RESULT_AVAILABLE',
  ACTIONABLE: 'ACTIONABLE',
  EXPERT_REVIEW_REQUIRED: 'EXPERT_REVIEW_REQUIRED',
  EXPERT_REVIEW_IN_PROGRESS: 'EXPERT_REVIEW_IN_PROGRESS',
  CONFIRMED: 'CONFIRMED',
  CORRECTED: 'CORRECTED',
  FOLLOW_UP_REQUIRED: 'FOLLOW_UP_REQUIRED',
  CLOSED: 'CLOSED',
  AI_FAILED: 'AI_FAILED',
};

/**
 * Allowed AI prediction types (AI.md Section 5).
 */
const PREDICTION_TYPES = {
  DISEASE: 'disease',
  PEST: 'pest',
  HEALTHY: 'healthy',
  UNKNOWN: 'unknown',
};

/**
 * Allowed severity levels (AI.md Section 9, DATABASE.md Section 9).
 * Severity may be absent (null) when the model cannot reliably estimate it.
 */
const SEVERITY_LEVELS = {
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/**
 * GeoJSON Point sub-schema.
 *
 * MongoDB requires type to be exactly "Point" for geospatial indexing.
 * Coordinates must be [longitude, latitude] -- do not reverse this order.
 * DATABASE.md Section 19 specifies this convention explicitly.
 */
const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['Point'],
        message: 'location.type must be "Point"',
      },
      required: [true, 'location.type is required'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, 'location.coordinates are required'],
      validate: {
        validator: function (coords) {
          // Exactly two numbers required.
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          // Longitude: -180 to 180 | Latitude: -90 to 90
          return (
            typeof lng === 'number' &&
            typeof lat === 'number' &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message:
          'location.coordinates must be [longitude, latitude] — ' +
          'longitude -180 to 180, latitude -90 to 90',
      },
    },
  },
  { _id: false }
);

/**
 * Image sub-schema.
 *
 * Stores a reference to the uploaded crop image.
 * Actual file upload/storage is implemented in a separate task.
 * DATABASE.md Section 9 specifies image.url (required) and
 * image.storageKey (optional) and image.uploadedAt (required).
 */
const imageSchema = new mongoose.Schema(
  {
    // URL or path to the stored image
    url: {
      type: String,
      required: [true, 'image.url is required'],
      trim: true,
    },
    // Optional backend storage key (e.g. S3 object key, GCS blob name)
    storageKey: {
      type: String,
      trim: true,
      default: null,
    },
    // When the image was received by the system
    uploadedAt: {
      type: Date,
      required: [true, 'image.uploadedAt is required'],
    },
  },
  { _id: false }
);

/**
 * AI prediction sub-schema (embedded AI result).
 *
 * This represents what the AI model concluded from the crop image.
 * It is intentionally separate from the overall risk assessment
 * (DATABASE.md Section 23, AI.md Section 6).
 *
 * Fields:
 *   type       -- disease / pest / healthy / unknown (AI.md Section 5)
 *   name       -- predicted condition name; may be null for "unknown" type
 *   confidence -- model confidence 0.0–1.0 (AI.md Section 6)
 *   modelName  -- name of the model that produced this prediction
 *   modelVersion -- version of the model
 *
 * Confidence is NOT treated as expert confirmation and must NOT be used
 * directly as the overall risk level.
 */
const predictionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: Object.values(PREDICTION_TYPES),
        message: 'prediction.type must be one of: disease, pest, healthy, unknown',
      },
      required: [true, 'prediction.type is required'],
    },
    // Name of the predicted disease or pest.
    // May be null when type is "unknown" or "healthy".
    name: {
      type: String,
      trim: true,
      default: null,
    },
    // Confidence score from the model, 0.0 (no confidence) to 1.0 (full confidence).
    // AI.md Section 6: confidence is separate from overall risk.
    confidence: {
      type: Number,
      required: [true, 'prediction.confidence is required'],
      min: [0, 'prediction.confidence must be between 0 and 1'],
      max: [1, 'prediction.confidence must be between 0 and 1'],
    },
    // Model metadata -- important for reproducibility and future model evaluation.
    // AI.md Section 5: the AI output should include model name and version.
    modelName: {
      type: String,
      trim: true,
      default: null,
    },
    modelVersion: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

/**
 * Severity sub-schema.
 *
 * Describes the apparent extent of the detected condition.
 * AI.md Section 9: severity may be null if the model cannot reliably estimate it.
 * DATABASE.md Section 9: severity.level and severity.score are both optional.
 *
 * Do NOT conflate severity with AI confidence or with overall risk.
 */
const severitySchema = new mongoose.Schema(
  {
    // Qualitative severity level
    level: {
      type: String,
      enum: {
        values: Object.values(SEVERITY_LEVELS),
        message: 'severity.level must be one of: low, moderate, high, critical',
      },
      default: null,
    },
    // Optional numeric severity score (0–100).
    // Provided by the AI service where supported.
    score: {
      type: Number,
      min: [0, 'severity.score must be between 0 and 100'],
      max: [100, 'severity.score must be between 0 and 100'],
      default: null,
    },
  },
  { _id: false }
);

/**
 * Weather snapshot sub-schema.
 *
 * Records the weather conditions at the time of analysis.
 * DATABASE.md Section 22: snapshots are stored so old detections
 * can be reconstructed accurately even after weather changes.
 *
 * Actual weather API integration is implemented in a separate task.
 * All fields are optional because the snapshot may not be available
 * (e.g. weather service temporarily unavailable) without blocking detection.
 */
const weatherSnapshotSchema = new mongoose.Schema(
  {
    // Temperature in degrees Celsius
    temperature: {
      type: Number,
      default: null,
    },
    // Relative humidity (percentage, 0–100)
    humidity: {
      type: Number,
      min: [0, 'weatherSnapshot.humidity must be between 0 and 100'],
      max: [100, 'weatherSnapshot.humidity must be between 0 and 100'],
      default: null,
    },
    // Rainfall in mm
    rainfall: {
      type: Number,
      min: [0, 'weatherSnapshot.rainfall must be non-negative'],
      default: null,
    },
    // Wind speed in km/h
    windSpeed: {
      type: Number,
      min: [0, 'weatherSnapshot.windSpeed must be non-negative'],
      default: null,
    },
    // Short-range forecast data
    forecast: {
      // Probability of rain in the next 24 hours (percentage, 0–100)
      next24hRainProbability: {
        type: Number,
        min: [0, 'forecast.next24hRainProbability must be between 0 and 100'],
        max: [100, 'forecast.next24hRainProbability must be between 0 and 100'],
        default: null,
      },
    },
    // When this weather data was captured from the weather service
    capturedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Detection schema
// ---------------------------------------------------------------------------

const detectionSchema = new mongoose.Schema(
  {
    // -----------------------------------------------------------------------
    // Ownership and field reference
    // -----------------------------------------------------------------------

    // The farmer who submitted this detection.
    // The backend must verify that the authenticated user matches this ID.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    // The field this detection is associated with.
    // The backend must verify that the field belongs to the authenticated user.
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Field',
      required: [true, 'fieldId is required'],
    },

    // -----------------------------------------------------------------------
    // Image
    // -----------------------------------------------------------------------

    // Reference to the submitted crop image.
    // Actual file storage is implemented in a separate task.
    image: {
      type: imageSchema,
      required: [true, 'image is required'],
    },

    // -----------------------------------------------------------------------
    // Crop context
    // -----------------------------------------------------------------------

    // Crop name at time of detection (e.g. "Tomato").
    // Stored here separately from the Field document because the farmer
    // may change the crop in the field after this detection was recorded,
    // and historical accuracy must be preserved.
    crop: {
      type: String,
      required: [true, 'crop is required'],
      trim: true,
    },

    // Growth stage at the time of detection (e.g. "flowering").
    // Optional: farmer may not always know or report it.
    growthStage: {
      type: String,
      trim: true,
      default: null,
    },

    // Farmer-reported symptoms as an array of free-text strings.
    // Optional: e.g. ["brown spots on leaves", "yellowing"]
    symptoms: {
      type: [String],
      default: [],
    },

    // -----------------------------------------------------------------------
    // Embedded AI result (prediction)
    // -----------------------------------------------------------------------

    // The AI prediction is embedded here rather than in a separate collection
    // (DATABASE.md Section 8).
    // It may be null before the AI service has processed the image.
    // IMPORTANT: prediction.confidence is NOT the same as overall risk.
    // Risk assessment lives in the separate risk_assessments collection.
    prediction: {
      type: predictionSchema,
      default: null,
    },

    // -----------------------------------------------------------------------
    // Severity
    // -----------------------------------------------------------------------

    // Severity of the detected condition as estimated by the AI model.
    // May remain null if the model does not support reliable severity estimation.
    // AI.md Section 9: do NOT conflate severity with confidence or risk.
    severity: {
      type: severitySchema,
      default: null,
    },

    // -----------------------------------------------------------------------
    // Detection lifecycle status
    // -----------------------------------------------------------------------

    // Controls the detection workflow state.
    // Transitions are managed exclusively by the backend service layer.
    // High AI confidence does NOT automatically set this to CONFIRMED.
    status: {
      type: String,
      enum: {
        values: Object.values(DETECTION_STATUSES),
        message:
          'status must be one of the documented detection lifecycle states',
      },
      required: [true, 'status is required'],
      default: DETECTION_STATUSES.CREATED,
    },

    // -----------------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------------

    // GeoJSON Point location of the field/detection.
    // coordinates[0] = longitude, coordinates[1] = latitude.
    // Required: location is essential for hotspot detection and risk analysis.
    location: {
      type: pointSchema,
      required: [true, 'location is required'],
    },

    // -----------------------------------------------------------------------
    // Weather snapshot
    // -----------------------------------------------------------------------

    // Weather conditions captured at analysis time.
    // Stored so that old detections can be fully reconstructed even after
    // live weather data changes (DATABASE.md Section 22).
    // Optional: weather service may be temporarily unavailable.
    weatherSnapshot: {
      type: weatherSnapshotSchema,
      default: null,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt`.
    timestamps: true,

    // Collection name as defined in DATABASE.md Section 8.
    collection: 'detections',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// All indexes are specified in DATABASE.md Section 24.

// Geospatial index -- required for $near, $geoWithin queries.
// sparse: true is consistent with the User and Field models and avoids
// index errors if a document is ever stored without a location.
detectionSchema.index({ location: '2dsphere' }, { sparse: true });

// Farmer lookup: "get all detections for this user"
detectionSchema.index({ userId: 1 });

// Field lookup: "get all detections for this field"
detectionSchema.index({ fieldId: 1 });

// Time-based queries: "recent detections", dashboard feeds
detectionSchema.index({ createdAt: -1 });

// Disease/pest filtering: hotspot detection, extension-worker dashboards
detectionSchema.index({ 'prediction.name': 1 });

// Status filtering: "pending reviews", "active cases"
detectionSchema.index({ status: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const Detection = mongoose.model('Detection', detectionSchema);

module.exports = { Detection, DETECTION_STATUSES, PREDICTION_TYPES, SEVERITY_LEVELS };
