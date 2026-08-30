/**
 * followUpController.js
 *
 * Controller handling Follow-Up observations for Detections.
 *
 * Routes handled:
 *   POST /api/detections/:id/follow-ups (multipart/form-data)
 *   GET  /api/detections/:id/follow-ups
 */

'use strict';

const mongoose = require('mongoose');
const { FollowUp, FOLLOW_UP_STATUSES } = require('../models/FollowUp');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const imageStorageService = require('../services/imageStorageService');

// Eligible post-diagnosis detection states for follow-up recording
const ELIGIBLE_DETECTION_STATUSES = [
  DETECTION_STATUSES.ACTIONABLE,
  DETECTION_STATUSES.CONFIRMED,
  DETECTION_STATUSES.CORRECTED,
  DETECTION_STATUSES.FOLLOW_UP_REQUIRED,
];

/**
 * Format a safe FollowUp document for API responses.
 */
function safeFollowUpData(followUp) {
  return {
    id: followUp._id.toString(),
    detectionId: followUp.detectionId.toString(),
    userId: followUp.userId.toString(),
    fieldId: followUp.fieldId.toString(),
    followUpDate: followUp.followUpDate,
    imageUrl: followUp.imageUrl || null,
    observation: followUp.observation || null,
    status: followUp.status,
    newDetectionId: followUp.newDetectionId ? followUp.newDetectionId.toString() : null,
    createdAt: followUp.createdAt,
    updatedAt: followUp.updatedAt,
  };
}

/**
 * Create a new Follow-Up observation for an authorized detection.
 *
 * POST /api/detections/:id/follow-ups
 */
async function createFollowUp(req, res, next) {
  let uploadedStorageKey = null;

  try {
    const { id: detectionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(detectionId)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DETECTION_NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const detection = await Detection.findById(detectionId);

    // Enforce ownership: 404 if detection does not exist or belongs to another user
    if (!detection || detection.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DETECTION_NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    // Enforce lifecycle eligibility: reject pre-diagnosis and closed detections
    if (!ELIGIBLE_DETECTION_STATUSES.includes(detection.status)) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'INVALID_DETECTION_STATE',
          message: `Cannot record follow-up for detection in status "${detection.status}". Follow-ups are only allowed for actionable, confirmed, or corrected detections.`,
        },
      });
    }

    const { status, observation, followUpDate } = req.body;

    // Validate status enum
    if (!status || !Object.values(FOLLOW_UP_STATUSES).includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `status is required and must be one of: ${Object.values(FOLLOW_UP_STATUSES).join(', ')}`,
        },
      });
    }

    // Validate observation text length if provided
    if (observation && typeof observation === 'string' && observation.length > 1000) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'OBSERVATION_TOO_LONG',
          message: 'Observation notes cannot exceed 1000 characters.',
        },
      });
    }

    // Process optional image upload via Cloudinary service
    let imageUrl = null;
    if (req.file && req.file.buffer) {
      try {
        const uploadResult = await imageStorageService.uploadDetectionImage(req.file.buffer);
        imageUrl = uploadResult.url;
        uploadedStorageKey = uploadResult.storageKey;
      } catch (uploadError) {
        return res.status(uploadError.status || 502).json({
          success: false,
          error: {
            code: uploadError.code || 'STORAGE_UPLOAD_FAILED',
            message: uploadError.message || 'Failed to upload follow-up image to cloud storage.',
          },
        });
      }
    }

    const followUp = new FollowUp({
      detectionId: detection._id,
      userId: req.user._id,
      fieldId: detection.fieldId,
      followUpDate: followUpDate ? new Date(followUpDate) : new Date(),
      imageUrl,
      observation: observation ? observation.trim() : null,
      status,
      newDetectionId: null,
    });

    try {
      await followUp.save();
    } catch (dbError) {
      // Orphan image cleanup if database persistence fails
      if (uploadedStorageKey) {
        await imageStorageService.deleteImage(uploadedStorageKey);
      }
      throw dbError;
    }

    return res.status(201).json({
      success: true,
      data: {
        followUp: safeFollowUpData(followUp),
      },
      message: 'Follow-up observation recorded successfully',
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: messages.join('; '),
        },
      });
    }
    next(error);
  }
}

/**
 * Retrieve all follow-up observations for an authorized detection.
 *
 * GET /api/detections/:id/follow-ups
 */
async function getFollowUps(req, res, next) {
  try {
    const { id: detectionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(detectionId)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DETECTION_NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const detection = await Detection.findById(detectionId);

    // Enforce ownership
    if (!detection || detection.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DETECTION_NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    // Query follow-ups ordered by followUpDate ascending
    const followUps = await FollowUp.find({ detectionId: detection._id }).sort({
      followUpDate: 1,
      createdAt: 1,
    });

    return res.status(200).json({
      success: true,
      data: {
        followUps: followUps.map(safeFollowUpData),
      },
      message: 'Follow-ups retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createFollowUp,
  getFollowUps,
  ELIGIBLE_DETECTION_STATUSES,
  safeFollowUpData,
};
