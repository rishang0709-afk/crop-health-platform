/**
 * detectionValidator.js
 *
 * Input validation helpers for Detection API routes.
 *
 * These functions validate request bodies and query parameters, returning an
 * array of human-readable error messages. They do NOT throw; callers decide
 * how to handle responses.
 *
 * Design decisions:
 *  - Plain JavaScript only -- no external validation libraries (consistent
 *    with fieldValidator.js and authValidator.js).
 *  - Layer-1 controller-level validation catching obvious malformed inputs
 *    before database operations.
 *  - userId / owner are rejected on creation -- server always derives ownership
 *    from req.user (per AI_RULES.md and task spec).
 *  - Location GeoJSON validation checks longitude (-180..180) and latitude (-90..90).
 *  - Symptoms must be an array of strings if provided.
 */

'use strict';

const mongoose = require('mongoose');
const { DETECTION_STATUSES } = require('../models/Detection');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the value is a finite number (not NaN, not Infinity).
 */
function isFiniteNumber(v) {
  return typeof v === 'number' && isFinite(v);
}

/**
 * Returns true if the string is a valid 24-hex MongoDB ObjectId.
 */
function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Returns true if the value represents a valid date.
 */
function isValidDate(d) {
  if (d instanceof Date) return !isNaN(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    return !isNaN(parsed.getTime());
  }
  return false;
}

// ---------------------------------------------------------------------------
// validateCreateDetectionInput
// ---------------------------------------------------------------------------

/**
 * Validate a POST /api/detections request body.
 *
 * Required:
 *   fieldId, image.url
 *
 * Optional / Derivable from Field:
 *   crop, growthStage, location
 *
 * Optional:
 *   image.storageKey, image.uploadedAt, symptoms
 *
 * Prohibited:
 *   userId, owner
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateCreateDetectionInput(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push('Request body must be a JSON object');
    return errors;
  }

  // ---- Reject client-supplied ownership fields ----
  if (body.userId !== undefined) {
    errors.push('userId must not be supplied by the client');
  }
  if (body.owner !== undefined) {
    errors.push('owner must not be supplied by the client');
  }

  // ---- fieldId ----
  if (!body.fieldId) {
    errors.push('fieldId is required');
  } else if (!isValidObjectId(body.fieldId)) {
    errors.push('fieldId must be a valid ObjectId');
  }

  // ---- image ----
  const img = body.image;
  if (!img || typeof img !== 'object' || Array.isArray(img)) {
    errors.push('image must be an object containing at least url');
  } else {
    // image.url
    if (!img.url || typeof img.url !== 'string' || img.url.trim().length === 0) {
      errors.push('image.url is required and must be a non-empty string');
    }

    // image.storageKey (optional)
    if (img.storageKey !== undefined && img.storageKey !== null && typeof img.storageKey !== 'string') {
      errors.push('image.storageKey must be a string if provided');
    }

    // image.uploadedAt (optional, defaults to now if omitted)
    if (img.uploadedAt !== undefined && img.uploadedAt !== null && !isValidDate(img.uploadedAt)) {
      errors.push('image.uploadedAt must be a valid date if provided');
    }
  }

  // ---- crop (optional in body; derived from Field if omitted) ----
  if (body.crop !== undefined && body.crop !== null) {
    if (typeof body.crop !== 'string' || body.crop.trim().length === 0) {
      errors.push('crop must be a non-empty string if provided');
    }
  }

  // ---- growthStage (optional in body; derived from Field if omitted) ----
  if (body.growthStage !== undefined && body.growthStage !== null) {
    if (typeof body.growthStage !== 'string') {
      errors.push('growthStage must be a string if provided');
    }
  }

  // ---- symptoms (optional array of strings) ----
  if (body.symptoms !== undefined && body.symptoms !== null) {
    if (!Array.isArray(body.symptoms)) {
      errors.push('symptoms must be an array of strings if provided');
    } else {
      for (let i = 0; i < body.symptoms.length; i++) {
        if (typeof body.symptoms[i] !== 'string' || body.symptoms[i].trim().length === 0) {
          errors.push(`symptoms[${i}] must be a non-empty string`);
        }
      }
    }
  }

  // ---- location (optional in body; derived from Field if omitted) ----
  if (body.location !== undefined && body.location !== null) {
    const loc = body.location;
    if (typeof loc !== 'object' || Array.isArray(loc)) {
      errors.push('location must be an object with type "Point" and coordinates [longitude, latitude]');
    } else {
      if (loc.type !== 'Point') {
        errors.push('location.type must be "Point"');
      }

      const coords = loc.coordinates;
      if (!Array.isArray(coords) || coords.length !== 2) {
        errors.push('location.coordinates must be an array of [longitude, latitude]');
      } else {
        const [lng, lat] = coords;

        if (!isFiniteNumber(lng)) {
          errors.push('location.coordinates[0] (longitude) must be a number');
        } else if (lng < -180 || lng > 180) {
          errors.push('longitude must be between -180 and 180');
        }

        if (!isFiniteNumber(lat)) {
          errors.push('location.coordinates[1] (latitude) must be a number');
        } else if (lat < -90 || lat > 90) {
          errors.push('latitude must be between -90 and 90');
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateGetDetectionsQuery
// ---------------------------------------------------------------------------

/**
 * Validate query parameters for GET /api/detections.
 *
 * Supported filters:
 *   fieldId, status, crop, from, to
 *
 * @param {object} query - req.query
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateGetDetectionsQuery(query) {
  const errors = [];

  if (!query || typeof query !== 'object') return errors;

  if (query.fieldId !== undefined && !isValidObjectId(query.fieldId)) {
    errors.push('fieldId filter must be a valid ObjectId');
  }

  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || query.status.trim().length === 0) {
      errors.push('status filter must be a non-empty string');
    } else if (!Object.values(DETECTION_STATUSES).includes(query.status.trim())) {
      errors.push(`status filter must be one of: ${Object.values(DETECTION_STATUSES).join(', ')}`);
    }
  }

  if (query.crop !== undefined) {
    if (typeof query.crop !== 'string' || query.crop.trim().length === 0) {
      errors.push('crop filter must be a non-empty string');
    }
  }

  if (query.from !== undefined && !isValidDate(query.from)) {
    errors.push('from filter must be a valid date');
  }

  if (query.to !== undefined && !isValidDate(query.to)) {
    errors.push('to filter must be a valid date');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  validateCreateDetectionInput,
  validateGetDetectionsQuery,
  isValidObjectId,
};
