/**
 * detectionController.js
 *
 * HTTP handlers for Detection endpoints with image upload & AI inference integration.
 *
 * Routes handled:
 *   POST   /api/detections             -- createDetection (multipart/form-data)
 *   GET    /api/detections             -- getDetections
 *   GET    /api/detections/:id         -- getDetection
 *   POST   /api/detections/:id/analyze -- analyzeDetection
 *
 * Specification & Security rules:
 *  - userId is ALWAYS derived from req.user._id (set by authenticate middleware).
 *    Client-supplied userId or owner is rejected.
 *  - A detection may ONLY be created or analyzed by the owner of the Detection / Field.
 *  - Atomic status claim: Only transitions from CREATED or AI_FAILED to AI_ANALYZING,
 *    preventing race conditions from concurrent analyze requests.
 *  - Communicates with FastAPI AI service via aiService with timeouts and response validation.
 *  - On failure, sets status = AI_FAILED and ensures no fake prediction is persisted.
 *  - On success, sets status = AI_RESULT_AVAILABLE, maps prediction and severity to top-level fields.
 *  - Response format follows Docs/API.md.
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
const aiService = require('../services/aiService');

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
// POST /api/detections/:id/analyze
// ---------------------------------------------------------------------------

/**
 * Trigger AI analysis for a Detection.
 *
 * Workflow:
 *  1. Atomically claim Detection (transition from CREATED or AI_FAILED to AI_ANALYZING).
 *  2. Fetch image from Detection.image.url.
 *  3. Send image and context to FastAPI /predict.
 *  4. Validate AI response and map to Detection.prediction and Detection.severity.
 *  5. Transition status to AI_RESULT_AVAILABLE on success, or AI_FAILED on error.
 */
async function analyzeDetection(req, res, next) {
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

    // 1. Atomic claim: Only transition from CREATED or AI_FAILED to AI_ANALYZING
    // Prevents race conditions from concurrent analyze requests on the same detection.
    const claimedDetection = await Detection.findOneAndUpdate(
      {
        _id: id,
        userId: req.user._id,
        status: { $in: [DETECTION_STATUSES.CREATED, DETECTION_STATUSES.AI_FAILED] },
      },
      {
        $set: { status: DETECTION_STATUSES.AI_ANALYZING },
      },
      {
        returnDocument: 'after',
      }
    );

    // 2. If atomic claim failed, identify the reason safely
    if (!claimedDetection) {
      const existing = await Detection.findOne({
        _id: id,
        userId: req.user._id,
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Detection not found or does not belong to the authenticated user',
          },
        });
      }

      if (existing.status === DETECTION_STATUSES.AI_ANALYZING) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ANALYSIS_IN_PROGRESS',
            message: 'Detection analysis is currently in progress',
          },
        });
      }

      return res.status(409).json({
        success: false,
        error: {
          code: 'DETECTION_ALREADY_ANALYZED',
          message: `Detection cannot be analyzed in state '${existing.status}'`,
        },
      });
    }

    // 3. Ensure Detection has a valid image URL
    if (!claimedDetection.image || !claimedDetection.image.url) {
      await Detection.updateOne(
        { _id: claimedDetection._id },
        { $set: { status: DETECTION_STATUSES.AI_FAILED, prediction: null, severity: null } }
      );
      return res.status(400).json({
        success: false,
        error: {
          code: 'IMAGE_NOT_AVAILABLE',
          message: 'Detection has no valid image URL to analyze',
        },
      });
    }

    // 4. Perform analysis via aiService
    try {
      const context = {
        crop: claimedDetection.crop,
        growthStage: claimedDetection.growthStage,
        symptoms: claimedDetection.symptoms,
      };

      const aiResult = await aiService.analyzeDetectionImage(claimedDetection.image.url, context);

      // 5. Update Detection with AI results
      claimedDetection.prediction = aiResult.prediction;
      claimedDetection.severity = aiResult.severity;
      claimedDetection.status = DETECTION_STATUSES.AI_RESULT_AVAILABLE;
      await claimedDetection.save();

      return res.status(200).json({
        success: true,
        data: {
          detection: safeDetectionData(claimedDetection),
        },
        message: 'Crop analysis completed',
      });
    } catch (error) {
      // 6. On failure, transition to AI_FAILED and ensure no fake prediction is saved
      try {
        await Detection.updateOne(
          { _id: claimedDetection._id },
          {
            $set: {
              status: DETECTION_STATUSES.AI_FAILED,
              prediction: null,
              severity: null,
            },
          }
        );
      } catch (saveErr) {
        // Suppress secondary update error
      }

      const statusCode = (error instanceof aiService.AiServiceError) ? error.statusCode : 502;
      const errorCode = (error instanceof aiService.AiServiceError) ? error.code : 'AI_ANALYSIS_FAILED';

      return res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message: error.message || 'Detection analysis failed',
          details: error.details || null,
        },
      });
    }
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
  analyzeDetection,
};
