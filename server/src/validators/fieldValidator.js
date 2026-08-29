/**
 * fieldValidator.js
 *
 * Input validation helpers for Field API routes.
 *
 * These functions validate request bodies and return a list of human-readable
 * error messages. They do NOT throw; callers decide how to respond.
 *
 * Design decisions:
 *  - Plain JavaScript only -- no external validation library. Keeps the
 *    dependency footprint minimal, consistent with authValidator.js.
 *  - These are layer-1 (controller-level) checks that catch obvious mistakes
 *    early, before touching the database.
 *  - Mongoose schema validators act as layer-2 and will catch anything that
 *    slips through (e.g. coordinate edge cases).
 *  - userId/owner fields are rejected on creation -- the server always derives
 *    the owner from the authenticated user's token, never from the client.
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the value is a finite number (not NaN, not Infinity).
 */
function isFiniteNumber(v) {
  return typeof v === 'number' && isFinite(v);
}

// ---------------------------------------------------------------------------
// validateCreateFieldInput
// ---------------------------------------------------------------------------

/**
 * Validate a POST /api/fields request body.
 *
 * Required:
 *   name, crop, location.type, location.coordinates
 *
 * Optional (validated when present):
 *   variety, plantingDate, growthStage, area, notes
 *
 * Rejected:
 *   userId, owner — must never be supplied by the client
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateCreateFieldInput(body) {
  const errors = [];

  // ---- Reject client-supplied ownership fields ----
  // The server always derives userId from the authenticated user's token.
  // Allowing the client to specify an owner would be a security violation.
  if (body.userId !== undefined) {
    errors.push('userId must not be supplied by the client');
  }
  if (body.owner !== undefined) {
    errors.push('owner must not be supplied by the client');
  }

  // ---- name ----
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string');
  }

  // ---- crop ----
  if (!body.crop || typeof body.crop !== 'string' || body.crop.trim().length === 0) {
    errors.push('crop is required and must be a non-empty string');
  }

  // ---- location ----
  const loc = body.location;
  if (!loc || typeof loc !== 'object') {
    errors.push('location is required');
  } else {
    // location.type
    if (loc.type !== 'Point') {
      errors.push('location.type must be "Point"');
    }

    // location.coordinates
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

  // ---- area (optional sub-document) ----
  if (body.area !== undefined && body.area !== null) {
    if (typeof body.area !== 'object') {
      errors.push('area must be an object with value and unit');
    } else {
      const { value } = body.area;
      if (value !== undefined && value !== null) {
        if (!isFiniteNumber(value)) {
          errors.push('area.value must be a number');
        } else if (value < 0) {
          errors.push('area.value must be a non-negative number');
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateUpdateFieldInput
// ---------------------------------------------------------------------------

/**
 * Validate a PATCH /api/fields/:id request body.
 *
 * Permitted update fields:
 *   name, crop, variety, plantingDate, growthStage, area, location, notes
 *
 * Prohibited fields (rejected, never silently ignored):
 *   _id, userId, createdAt, owner
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateUpdateFieldInput(body) {
  const errors = [];

  // ---- Reject immutable / ownership fields ----
  if (body._id !== undefined) {
    errors.push('_id cannot be changed');
  }
  if (body.userId !== undefined) {
    errors.push('userId cannot be changed');
  }
  if (body.createdAt !== undefined) {
    errors.push('createdAt cannot be changed');
  }
  if (body.owner !== undefined) {
    errors.push('owner cannot be changed');
  }

  // ---- name (if provided) ----
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push('name must be a non-empty string');
    }
  }

  // ---- crop (if provided) ----
  if (body.crop !== undefined) {
    if (typeof body.crop !== 'string' || body.crop.trim().length === 0) {
      errors.push('crop must be a non-empty string');
    }
  }

  // ---- location (if provided) ----
  if (body.location !== undefined) {
    const loc = body.location;

    if (!loc || typeof loc !== 'object') {
      errors.push('location must be an object');
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

  // ---- area (if provided) ----
  if (body.area !== undefined && body.area !== null) {
    if (typeof body.area !== 'object') {
      errors.push('area must be an object with value and unit');
    } else {
      const { value } = body.area;
      if (value !== undefined && value !== null) {
        if (!isFiniteNumber(value)) {
          errors.push('area.value must be a number');
        } else if (value < 0) {
          errors.push('area.value must be a non-negative number');
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// validateUpdateFieldStatusInput
// ---------------------------------------------------------------------------

/**
 * Validate a PATCH /api/fields/:id/status request body.
 *
 * Required:
 *   isActive -- must be a boolean
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateUpdateFieldStatusInput(body) {
  const errors = [];

  if (body.isActive === undefined) {
    errors.push('isActive is required');
  } else if (typeof body.isActive !== 'boolean') {
    errors.push('isActive must be a boolean (true or false)');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  validateCreateFieldInput,
  validateUpdateFieldInput,
  validateUpdateFieldStatusInput,
};
