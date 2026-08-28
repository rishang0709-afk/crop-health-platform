/**
 * User.js
 *
 * Mongoose model for the `users` collection.
 *
 * Specification: Docs/DATABASE.md — Section 4 (User Collection) and Section 5 (User Roles)
 *
 * This model defines the schema only.
 * Authentication (password hashing, JWT) is handled in a separate task.
 */

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Allowed user roles.
 * Defined centrally here so they can be imported elsewhere without
 * duplicating the values across the codebase.
 */
const USER_ROLES = {
  FARMER: 'farmer',
  EXPERT: 'expert',
  OFFICER: 'officer',
  ADMIN: 'admin',
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const userSchema = new mongoose.Schema(
  {
    // Full name of the user
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },

    // Login email address
    // Marked unique so two accounts cannot share the same email.
    // May become optional in a future version if phone-based auth is added.
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Hashed password — populated during authentication implementation.
    // Stored as a plain string field here; hashing logic belongs in auth middleware/service.
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },

    // Role controls what the user can do in the system.
    // Backend authorization must enforce role permissions — frontend is not the security boundary.
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: Object.values(USER_ROLES),
        message: 'Role must be one of: farmer, expert, officer, admin',
      },
    },

    // Preferred display/communication language (e.g. 'en', 'hi')
    language: {
      type: String,
      required: [true, 'Language is required'],
      trim: true,
      default: 'en',
    },

    // Optional phone number
    phone: {
      type: String,
      trim: true,
      default: null,
    },

    // Optional approximate user location (GeoJSON Point)
    // Used for regional surveillance and proximity queries.
    // Format: { type: 'Point', coordinates: [longitude, latitude] }
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },

    // Administrative area — for regional filtering and extension-worker dashboards
    district: {
      type: String,
      trim: true,
      default: null,
    },

    state: {
      type: String,
      trim: true,
      default: null,
    },

    // Soft-delete / account activation flag.
    // Deactivated accounts cannot log in but their data is preserved.
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` fields.
    timestamps: true,

    // Use the collection name defined in DATABASE.md
    collection: 'users',
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Geospatial index — required for location-based queries (hotspot detection, nearby reports).
// Only created when the location field is present on a document.
userSchema.index({ location: '2dsphere' }, { sparse: true });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const User = mongoose.model('User', userSchema);

module.exports = { User, USER_ROLES };
