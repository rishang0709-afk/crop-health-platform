/**
 * fieldController.js
 *
 * HTTP handlers for Field CRUD endpoints.
 *
 * Routes handled:
 *   POST   /api/fields              -- createField
 *   GET    /api/fields              -- getFields
 *   GET    /api/fields/:id          -- getField
 *   PATCH  /api/fields/:id          -- updateField
 *   PATCH  /api/fields/:id/status   -- updateFieldStatus
 *
 * Security / ownership rules enforced here:
 *  - userId is ALWAYS derived from req.user._id (set by authenticate middleware).
 *    The client must never supply or influence the owner of a field.
 *  - All read/update operations verify ownership via:
 *      Field.findOne({ _id: id, userId: req.user._id })
 *    This returns null for both "field not found" and "field belongs to a
 *    different user", so the response is always 404 -- no info leakage.
 *  - Mongoose validation errors are caught and returned as structured 400s.
 *  - Unexpected errors are passed to the global error handler via next().
 *
 * Response format follows API.md Section 4:
 *   Success: { success: true,  data: {},   message: "..." }
 *   Error:   { success: false, error: { code: "...", message: "..." } }
 */

'use strict';

const mongoose = require('mongoose');
const { Field } = require('../models/Field');
const {
  validateCreateFieldInput,
  validateUpdateFieldInput,
  validateUpdateFieldStatusInput,
} = require('../validators/fieldValidator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given string is a valid MongoDB ObjectId.
 * Used to produce a clear 400 (not a confusing Mongoose CastError) when
 * a caller passes a malformed id in the URL.
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Build a safe field object for API responses.
 * Ensures a consistent shape regardless of Mongoose internals.
 */
function safeFieldData(field) {
  return {
    id: field._id.toString(),
    userId: field.userId.toString(),
    name: field.name,
    crop: field.crop,
    variety: field.variety,
    plantingDate: field.plantingDate,
    growthStage: field.growthStage,
    area: field.area,
    location: field.location,
    notes: field.notes,
    isActive: field.isActive,
    createdAt: field.createdAt,
    updatedAt: field.updatedAt,
  };
}

/**
 * Extract a user-friendly message from a Mongoose ValidationError.
 * Returns an array of strings suitable for the validation error response.
 */
function extractMongooseValidationErrors(err) {
  return Object.values(err.errors).map((e) => e.message);
}

// ---------------------------------------------------------------------------
// POST /api/fields
// ---------------------------------------------------------------------------

/**
 * Create a new field owned by the authenticated user.
 *
 * - userId is derived from req.user._id. Any client-supplied userId is
 *   explicitly rejected by the validator (per AI_RULES.md and task spec).
 * - Returns HTTP 201 on success.
 */
async function createField(req, res, next) {
  try {
    // ---- 1. Validate input ----
    const errors = validateCreateFieldInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          details: errors,
        },
      });
    }

    // ---- 2. Build field document ----
    // Extract only the permitted fields. userId comes from the authenticated
    // user -- never from the client body.
    const { name, crop, variety, plantingDate, growthStage, area, location, notes } = req.body;

    const field = new Field({
      userId: req.user._id,   // always from token, never from client
      name: name.trim(),
      crop: crop.trim(),
      variety: variety !== undefined ? variety : undefined,
      plantingDate: plantingDate !== undefined ? plantingDate : undefined,
      growthStage: growthStage !== undefined ? growthStage : undefined,
      area: area !== undefined ? area : undefined,
      location,
      notes: notes !== undefined ? notes : undefined,
    });

    // ---- 3. Save (Mongoose runs schema validation here) ----
    await field.save();

    // ---- 4. Return created field ----
    return res.status(201).json({
      success: true,
      data: {
        field: safeFieldData(field),
      },
      message: 'Field created successfully',
    });
  } catch (error) {
    // Catch Mongoose validation errors and return structured 400
    if (error.name === 'ValidationError') {
      const details = extractMongooseValidationErrors(error);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: details.join('; '),
          details,
        },
      });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/fields
// ---------------------------------------------------------------------------

/**
 * Return all fields owned by the authenticated user.
 *
 * Only returns fields where userId matches req.user._id.
 * Other users' fields are never returned.
 *
 * Sorted by createdAt descending (most recent first) for a natural default.
 */
async function getFields(req, res, next) {
  try {
    const fields = await Field.find({ userId: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        fields: fields.map(safeFieldData),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/fields/:id
// ---------------------------------------------------------------------------

/**
 * Return one field by ID, only if it belongs to the authenticated user.
 *
 * Ownership is verified by querying { _id, userId } together.
 * Both "field not found" and "field owned by another user" return 404
 * to avoid leaking information about resources the caller cannot access.
 */
async function getField(req, res, next) {
  try {
    const { id } = req.params;

    // Validate ObjectId format before querying to avoid confusing CastErrors.
    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    // Ownership check is atomic -- no separate ownership query.
    const field = await Field.findOne({ _id: id, userId: req.user._id });

    if (!field) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        field: safeFieldData(field),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/fields/:id
// ---------------------------------------------------------------------------

/**
 * Partially update a field owned by the authenticated user.
 *
 * Permitted update fields:
 *   name, crop, variety, plantingDate, growthStage, area, location, notes
 *
 * Prohibited fields (_id, userId, createdAt) are rejected by the validator.
 * isActive is NOT updated here -- use PATCH /api/fields/:id/status.
 */
async function updateField(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    // ---- 1. Validate input ----
    const errors = validateUpdateFieldInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          details: errors,
        },
      });
    }

    // ---- 2. Build safe update object ----
    // Only extract fields that are explicitly permitted to be updated.
    // This prevents mass-assignment vulnerabilities.
    const PERMITTED_UPDATE_FIELDS = [
      'name', 'crop', 'variety', 'plantingDate',
      'growthStage', 'area', 'location', 'notes',
    ];

    const updates = {};
    for (const key of PERMITTED_UPDATE_FIELDS) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid fields to update were provided',
        },
      });
    }

    // ---- 3. Find, verify ownership, and update atomically ----
    // runValidators: true -- Mongoose re-runs schema validators on update.
    // new: true          -- Returns the updated document.
    const field = await Field.findOneAndUpdate(
      { _id: id, userId: req.user._id },  // ownership filter
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!field) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        field: safeFieldData(field),
      },
      message: 'Field updated successfully',
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const details = extractMongooseValidationErrors(error);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: details.join('; '),
          details,
        },
      });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/fields/:id/status
// ---------------------------------------------------------------------------

/**
 * Activate or deactivate a field (soft delete support).
 *
 * Accepts: { "isActive": true | false }
 *
 * Hard deletion is intentionally not implemented -- historical field records
 * must be preserved for traceability (DATABASE.md, AI_RULES.md Section 12).
 */
async function updateFieldStatus(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    // ---- 1. Validate input ----
    const errors = validateUpdateFieldStatusInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          details: errors,
        },
      });
    }

    // ---- 2. Find, verify ownership, and update ----
    const field = await Field.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true }
    );

    if (!field) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Field not found',
        },
      });
    }

    const action = field.isActive ? 'activated' : 'deactivated';

    return res.status(200).json({
      success: true,
      data: {
        field: safeFieldData(field),
      },
      message: `Field ${action} successfully`,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const details = extractMongooseValidationErrors(error);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: details.join('; '),
          details,
        },
      });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createField,
  getFields,
  getField,
  updateField,
  updateFieldStatus,
};
