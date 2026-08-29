/**
 * Field.js
 *
 * Mongoose model for the `fields` collection.
 *
 * Specification: Docs/DATABASE.md -- Section 6 (Field Collection)
 *
 * This model defines the schema only.
 * Field API routes and controllers are handled in a separate task.
 *
 * Key design decisions:
 *  - Crop is stored as a plain string inside this document (not a separate
 *    collection) as required by DATABASE.md Section 7.
 *  - Location uses GeoJSON Point format: coordinates[0] = longitude,
 *    coordinates[1] = latitude -- as specified in DATABASE.md Section 19.
 *  - A sparse 2dsphere index is created on `location` so that documents
 *    without a location are still allowed (sparse = true avoids indexing
 *    null entries), while geospatial queries work correctly on populated ones.
 *  - `area` is an optional sub-document with `value` (Number) and `unit`
 *    (String) so that different area measurements can be recorded cleanly.
 */

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/**
 * GeoJSON Point sub-schema.
 *
 * MongoDB requires `type` to be exactly "Point" for geospatial indexing.
 * Coordinates must be [longitude, latitude] -- do not reverse this order.
 *
 * Both `type` and `coordinates` are required when a location is provided;
 * the outer `location` field itself is required as per DATABASE.md Section 6.
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
          // Must be exactly two numbers: longitude and latitude.
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          // Longitude: -180 to 180, Latitude: -90 to 90
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
          'location.coordinates must be [longitude, latitude] with valid ranges ' +
          '(longitude -180 to 180, latitude -90 to 90)',
      },
    },
  },
  { _id: false } // No separate _id for embedded sub-documents
);

/**
 * Area sub-schema.
 *
 * Stores field size as a value + unit pair so that different measurement
 * systems (acre, hectare, etc.) can be recorded without ambiguity.
 * See DATABASE.md Section 6: area.value / area.unit.
 */
const areaSchema = new mongoose.Schema(
  {
    value: {
      type: Number,
      min: [0, 'area.value must be a non-negative number'],
    },
    unit: {
      type: String,
      trim: true,
      // Not restricting to an enum here; the full list of supported units
      // (acre, hectare, bigha, etc.) will be defined in a future task once
      // crop-specific configuration requirements are clarified.
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Field schema
// ---------------------------------------------------------------------------

const fieldSchema = new mongoose.Schema(
  {
    // Reference to the owning farmer.
    // The backend must verify that the authenticated user owns this field
    // before allowing any create/read/update/delete operation.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    // Human-readable field name (e.g. "North Field", "Khet 1")
    name: {
      type: String,
      required: [true, 'Field name is required'],
      trim: true,
    },

    // Crop currently growing in this field (e.g. "Tomato", "Wheat").
    // Stored as a plain string per DATABASE.md Section 7 -- no separate
    // Crop collection in the MVP.
    crop: {
      type: String,
      required: [true, 'Crop is required'],
      trim: true,
    },

    // Optional crop variety (e.g. "Roma", "Pusa Gold")
    variety: {
      type: String,
      trim: true,
      default: null,
    },

    // Date the crop was planted in this field.
    // Used for growth-stage calculations and risk assessment context.
    plantingDate: {
      type: Date,
      default: null,
    },

    // Current growth stage of the crop (e.g. "seedling", "vegetative",
    // "flowering", "fruiting", "harvest").
    // Stored as a free-form string for MVP flexibility; may be constrained
    // to crop-specific enums in a future task.
    growthStage: {
      type: String,
      trim: true,
      default: null,
    },

    // Field area (optional sub-document with value + unit).
    // Example: { value: 2.5, unit: "acre" }
    area: {
      type: areaSchema,
      default: null,
    },

    // Precise field location using GeoJSON Point.
    // coordinates[0] = longitude, coordinates[1] = latitude.
    // Required as specified in DATABASE.md Section 6 field table.
    location: {
      type: pointSchema,
      required: [true, 'location is required'],
    },

    // Optional free-text notes about the field (soil type, irrigation, etc.)
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Soft-delete / active flag.
    // Inactive fields are hidden from the dashboard but data is preserved.
    // This supports the requirement to never silently delete historical records.
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` fields.
    timestamps: true,

    // Use the collection name defined in DATABASE.md Section 6.
    collection: 'fields',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// 2dsphere index -- required for MongoDB geospatial queries ($near, $geoWithin).
// sparse: true means documents without a `location` field are not indexed,
// consistent with the User model convention and safe for future schema changes.
fieldSchema.index({ location: '2dsphere' }, { sparse: true });

// Index on userId to speed up "get all fields belonging to a farmer" queries.
// This is the most common access pattern for the fields collection.
fieldSchema.index({ userId: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const Field = mongoose.model('Field', fieldSchema);

module.exports = { Field };
