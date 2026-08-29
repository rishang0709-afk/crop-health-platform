/**
 * detectionController.js
 *
 * HTTP handlers for Detection endpoints with image upload integration.
 *
 * Routes handled:
 *   POST   /api/detections      -- createDetection (multipart/form-data)
 *   GET    /api/detections      -- getDetections
 *   GET    /api/detections/:id  -- getDetection
 *
 * Specification & Security rules:
 *  - userId is ALWAYS derived from req.user._id (set by authenticate middleware).
 *    Client-supplied userId or owner is rejected.
 *  - A detection may ONLY be created for a Field owned by the authenticated farmer.
 *    Validates field exists and belongs to req.user._id.
 *  - Uploads crop image buffer to Cloudinary via imageStorageService.
 *  - If database creation fails after upload, automatically deletes the uploaded
 *    asset to avoid orphaned files.
 *  - Derives crop, growthStage, location from the associated Field when not provided.
 *  - Newly created detections begin with status = CREATED.
 *  - prediction and severity remain null / unpopulated at this stage.
 *  - GET /api/detections returns ONLY detections owned by the authenticated farmer.
 *  - GET /api/detections/:id returns 404 for missing or another farmer's detection (preventing enumeration).
 *
 * Response format follows Docs/API.md Section 4.
 */

'use strict';

const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { Field } = require('../models/Field');
const {
  validateCreateDetectionInput,
  validateGetDetectionsQuery,
  isValidObjectId,
} = require('../validators/detectionValidator');
const imageStorageService = require('../services/imageStorageService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a safe Detection document for API responses.
 */
function safeDetectionData(detection) {
  return {
    id: detection._id.toString(),
    userId: detection.userId.toString(),
    fieldId: detection.fieldId.toString(),
    image: {
      url: detection.image.url,
      storageKey: detection.image.storageKey || null,
      uploadedAt: detection.image.uploadedAt,
    },
    crop: detection.crop,
    growthStage: detection.growthStage || null,
    symptoms: detection.symptoms || [],
    prediction: detection.prediction || null,
    severity: detection.severity || null,
    status: detection.status,
    location: detection.location,
    weatherSnapshot: detection.weatherSnapshot || null,
    createdAt: detection.createdAt,
    updatedAt: detection.updatedAt,
  };
}

/**
 * Extract user-friendly messages from Mongoose validation errors.
 */
function extractMongooseValidationErrors(err) {
  return Object.values(err.errors).map((e) => e.message);
}

// ---------------------------------------------------------------------------
// POST /api/detections (multipart/form-data)
// ---------------------------------------------------------------------------

/**
 * Create a new Detection record with real image upload to Cloudinary.
 *
 * - Authenticated farmer only.
 * - Requires multipart image file upload.
 * - Enforces field ownership: referenced fieldId must exist and belong to req.user._id.
 * - Uploads image buffer to Cloudinary.
 * - If DB save fails, automatically attempts orphan cleanup in Cloudinary.
 * - Initial status: CREATED.
 * - prediction & severity remain null.
 */
async function createDetection(req, res, next) {
  let uploadedStorageKey = null;

  try {
    // ---- 1. Validate request (file and body fields) ----
    const { errors, parsedData } = validateCreateDetectionInput(req);
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

    const { fieldId, crop, growthStage, symptoms, location, file } = parsedData;

    // ---- 2. Verify Field exists and belongs to authenticated farmer ----
    const field = await Field.findOne({
      _id: fieldId,
      userId: req.user._id,
    });

    if (!field) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FIELD_NOT_FOUND',
          message: 'Field not found or does not belong to the authenticated user',
        },
      });
    }

    // ---- 3. Upload image buffer to Cloudinary ----
    let uploadResult;
    try {
      uploadResult = await imageStorageService.uploadDetectionImage(file.buffer);
      uploadedStorageKey = uploadResult.storageKey;
    } catch (uploadError) {
      return res.status(uploadError.status || 502).json({
        success: false,
        error: {
          code: uploadError.code || 'STORAGE_UPLOAD_FAILED',
          message: uploadError.message || 'Failed to upload image to storage service',
        },
      });
    }

    // ---- 4. Derive or use supplied crop, growthStage, and location ----
    const resolvedCrop = (crop && crop.length > 0) ? crop : field.crop;
    const resolvedGrowthStage = (growthStage !== undefined && growthStage !== null)
      ? growthStage
      : (field.growthStage || null);
    const resolvedLocation = location || field.location;

    // ---- 5. Build and save Detection document ----
    const detection = new Detection({
      userId: req.user._id,
      fieldId: field._id,
      image: {
        url: uploadResult.url,
        storageKey: uploadResult.storageKey,
        uploadedAt: uploadResult.uploadedAt,
      },
      crop: resolvedCrop,
      growthStage: resolvedGrowthStage,
      symptoms: symptoms || [],
      prediction: null,
      severity: null,
      status: DETECTION_STATUSES.CREATED,
      location: resolvedLocation,
      weatherSnapshot: null,
    });

    try {
      await detection.save();
    } catch (dbError) {
      // Orphan cleanup: if DB save fails, attempt to delete uploaded image from Cloudinary
      if (uploadedStorageKey) {
        await imageStorageService.deleteImage(uploadedStorageKey);
      }
      throw dbError;
    }

    return res.status(201).json({
      success: true,
      data: {
        detection: safeDetectionData(detection),
      },
      message: 'Detection created successfully',
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
// GET /api/detections
// ---------------------------------------------------------------------------

/**
 * Return all detections owned by the authenticated farmer.
 *
 * Supports optional filters:
 *   - fieldId
 *   - status
 *   - crop
 *   - from (date)
 *   - to (date)
 *
 * Sorted by createdAt descending (newest first).
 */
async function getDetections(req, res, next) {
  try {
    const errors = validateGetDetectionsQuery(req.query);
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

    // Always filter by authenticated user
    const filter = { userId: req.user._id };

    if (req.query.fieldId) {
      filter.fieldId = req.query.fieldId;
    }

    if (req.query.status) {
      filter.status = req.query.status.trim();
    }

    if (req.query.crop) {
      filter.crop = req.query.crop.trim();
    }

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) {
        filter.createdAt.$gte = new Date(req.query.from);
      }
      if (req.query.to) {
        filter.createdAt.$lte = new Date(req.query.to);
      }
    }

    const detections = await Detection.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        detections: detections.map(safeDetectionData),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/detections/:id
// ---------------------------------------------------------------------------

/**
 * Return a single detection by ID for the authenticated farmer.
 *
 * Returns 404 for missing detections or detections owned by another user,
 * preventing resource enumeration.
 */
async function getDetection(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const detection = await Detection.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!detection) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        detection: safeDetectionData(detection),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createDetection,
  getDetections,
  getDetection,
};
