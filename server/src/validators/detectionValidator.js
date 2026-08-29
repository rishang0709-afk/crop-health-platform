/**
 * detectionValidator.js
 *
 * Input validation helpers for Detection API routes.
 *
 * These functions validate request bodies, multipart fields, and query parameters,
 * returning an array of human-readable error messages.
 *
 * Design & Security decisions:
 *  - Plain JavaScript only -- no external validation libraries (consistent
 *    with fieldValidator.js and authValidator.js).
 *  - Supports multipart stringified fields (JSON-encoded symptoms and location)
 *    with structured error handling for JSON.parse.
 *  - Rejects client-supplied userId / owner.
 *  - Location GeoJSON validation checks longitude (-180..180) and latitude (-90..90).
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

/**
 * Safely parse and validate symptoms field from multipart/form-data.
 *
 * @param {any} symptoms - Symptoms input (array, JSON string, or comma-separated)
 * @param {string[]} errors - Array to push error messages into
 * @returns {string[]} Parsed array of strings
 */
function parseAndValidateSymptoms(symptoms, errors) {
  if (symptoms === undefined || symptoms === null || symptoms === '') {
    return [];
  }

  let list = symptoms;
  if (typeof symptoms === 'string') {
    const trimmed = symptoms.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        list = JSON.parse(trimmed);
      } catch (e) {
        errors.push('symptoms must be a valid JSON array of strings');
        return [];
      }
    } else if (trimmed.length > 0) {
      list = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      return [];
    }
  }

  if (!Array.isArray(list)) {
    errors.push('symptoms must be an array of strings');
    return [];
  }

  const result = [];
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string' || list[i].trim().length === 0) {
      errors.push(`symptoms[${i}] must be a non-empty string`);
    } else {
      result.push(list[i].trim());
    }
  }

  return result;
}

/**
 * Safely parse and validate location field from multipart/form-data.
 *
 * @param {any} location - Location input (object or JSON string)
 * @param {string[]} errors - Array to push error messages into
 * @returns {object|null} Parsed GeoJSON Point object or null
 */
function parseAndValidateLocation(location, errors) {
  if (location === undefined || location === null || location === '') {
    return null;
  }

  let loc = location;
  if (typeof location === 'string') {
    try {
      loc = JSON.parse(location);
    } catch (e) {
      errors.push('location must be a valid JSON object with GeoJSON Point format');
      return null;
    }
  }

  if (!loc || typeof loc !== 'object' || Array.isArray(loc)) {
    errors.push('location must be an object with type "Point" and coordinates [longitude, latitude]');
    return null;
  }

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

  return loc;
}

// ---------------------------------------------------------------------------
// validateCreateDetectionInput
// ---------------------------------------------------------------------------

/**
 * Validate a POST /api/detections request (multipart or JSON).
 *
 * @param {object} req - Express request object (includes req.body and req.file)
 * @returns {{ errors: string[], parsedData: object }}
 */
function validateCreateDetectionInput(req) {
  const errors = [];
  const body = req.body || {};
  const file = req.file;

  // ---- Reject client-supplied ownership fields ----
  if (body.userId !== undefined) {
    errors.push('userId must not be supplied by the client');
  }
  if (body.owner !== undefined) {
    errors.push('owner must not be supplied by the client');
  }

  // ---- Image file validation ----
  if (!file) {
    errors.push('Image file is required (use form field "image")');
  }

  // ---- fieldId ----
  if (!body.fieldId || typeof body.fieldId !== 'string' || body.fieldId.trim().length === 0) {
    errors.push('fieldId is required');
  } else if (!isValidObjectId(body.fieldId.trim())) {
    errors.push('fieldId must be a valid ObjectId');
  }

  // ---- crop (optional; derived from Field if omitted) ----
  let crop = undefined;
  if (body.crop !== undefined && body.crop !== null && body.crop !== '') {
    if (typeof body.crop !== 'string' || body.crop.trim().length === 0) {
      errors.push('crop must be a non-empty string if provided');
    } else {
      crop = body.crop.trim();
    }
  }

  // ---- growthStage (optional; derived from Field if omitted) ----
  let growthStage = undefined;
  if (body.growthStage !== undefined && body.growthStage !== null && body.growthStage !== '') {
    if (typeof body.growthStage !== 'string') {
      errors.push('growthStage must be a string if provided');
    } else {
      growthStage = body.growthStage.trim();
    }
  }

  // ---- symptoms (optional; parsed from JSON or array) ----
  const symptoms = parseAndValidateSymptoms(body.symptoms, errors);

  // ---- location (optional; parsed from JSON or object) ----
  const location = parseAndValidateLocation(body.location, errors);

  return {
    errors,
    parsedData: {
      fieldId: body.fieldId ? body.fieldId.trim() : undefined,
      crop,
      growthStage,
      symptoms,
      location,
      file,
    },
  };
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
  parseAndValidateSymptoms,
  parseAndValidateLocation,
  isValidObjectId,
};
