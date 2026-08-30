/**
 * expertReviewController.js
 *
 * HTTP handlers for the Expert Review Workflow.
 *
 * Routes handled:
 *   GET  /api/expert-reviews/queue            -- getReviewQueue (expert, admin)
 *   POST /api/expert-reviews/:detectionId/claim   -- claimReview (expert, admin)
 *   POST /api/expert-reviews/:detectionId/confirm -- confirmReview (claiming expert)
 *   POST /api/expert-reviews/:detectionId/correct -- correctReview (claiming expert)
 *   GET  /api/expert-reviews/:detectionId        -- getReviewDetails (expert, admin, detection owner)
 *
 * Data Integrity & Concurrency Guarantees:
 *  - Uses MongoDB ACID transactions for paired Detection + ExpertReview writes.
 *  - Original AI prediction in Detection.prediction is strictly immutable and preserved.
 *  - Atomic conditional claim prevents concurrent duplicate reviews.
 *  - Enforces review lock: only the claiming expert can submit confirm/correct decisions.
 */

'use strict';

const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const {
  ExpertReview,
  REVIEW_STATUSES,
  EXPERT_DECISIONS,
} = require('../models/ExpertReview');
const {
  isValidObjectId,
  validateConfirmReviewInput,
  validateCorrectReviewInput,
  validateReviewQueueQuery,
} = require('../validators/expertReviewValidator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeReviewData(review) {
  if (!review) return null;
  return {
    id: review._id.toString(),
    detectionId: review.detectionId.toString(),
    expertId: review.expertId.toString(),
    status: review.status,
    decision: review.decision || null,
    originalPrediction: review.originalPrediction,
    correctedDiagnosis: review.correctedDiagnosis || null,
    comment: review.comment || null,
    requiresLabDiagnosis: review.requiresLabDiagnosis || false,
    startedAt: review.startedAt,
    completedAt: review.completedAt || null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function safeDetectionData(detection) {
  if (!detection) return null;
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

// ---------------------------------------------------------------------------
// GET /api/expert-reviews/queue
// ---------------------------------------------------------------------------

/**
 * Return detections waiting for expert review.
 * Only detections with status = EXPERT_REVIEW_REQUIRED.
 * Ordered oldest first (createdAt: 1) to prioritize cases waiting longest.
 */
async function getReviewQueue(req, res, next) {
  try {
    const errors = validateReviewQueueQuery(req.query);
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

    const filter = { status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED };

    if (req.query.crop) {
      filter.crop = new RegExp(`^${req.query.crop.trim()}$`, 'i');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [total, detections] = await Promise.all([
      Detection.countDocuments(filter),
      Detection.find(filter)
        .sort({ createdAt: 1 }) // Oldest first
        .skip(skip)
        .limit(limit),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        detections: detections.map(safeDetectionData),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/expert-reviews/:detectionId/claim
// ---------------------------------------------------------------------------

/**
 * Claim a detection for expert review.
 * Atomically transitions Detection from EXPERT_REVIEW_REQUIRED to EXPERT_REVIEW_IN_PROGRESS
 * and creates an ExpertReview document within a MongoDB transaction.
 */
async function claimReview(req, res, next) {
  const { detectionId } = req.params;

  if (!isValidObjectId(detectionId)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Detection not found',
      },
    });
  }

  let session = null;
  let useTransactions = true;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (sessErr) {
    // If standalone/mock environment does not support replica set transactions
    useTransactions = false;
  }

  try {
    // 1. Atomic claim on Detection
    const sessionOption = useTransactions && session ? { session } : {};
    const claimedDetection = await Detection.findOneAndUpdate(
      {
        _id: detectionId,
        status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
      },
      {
        $set: { status: DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS },
      },
      {
        returnDocument: 'after',
        ...sessionOption,
      }
    );

    // 2. If atomic claim failed, identify the reason safely
    if (!claimedDetection) {
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }

      const existing = await Detection.findById(detectionId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Detection not found',
          },
        });
      }

      if (existing.status === DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'REVIEW_IN_PROGRESS',
            message: 'Detection is already claimed and in progress by an expert',
          },
        });
      }

      if (existing.status === DETECTION_STATUSES.CONFIRMED || existing.status === DETECTION_STATUSES.CORRECTED) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'REVIEW_ALREADY_COMPLETED',
            message: `Detection review is already completed with status '${existing.status}'`,
          },
        });
      }

      return res.status(409).json({
        success: false,
        error: {
          code: 'INVALID_DETECTION_STATUS',
          message: `Detection cannot be claimed in state '${existing.status}'. Must be EXPERT_REVIEW_REQUIRED.`,
        },
      });
    }

    // 3. Create associated ExpertReview record
    const originalPred = claimedDetection.prediction || {
      type: 'unknown',
      name: null,
      confidence: null,
    };

    const review = new ExpertReview({
      detectionId: claimedDetection._id,
      expertId: req.user._id,
      status: REVIEW_STATUSES.IN_PROGRESS,
      decision: null,
      originalPrediction: {
        type: originalPred.type || 'unknown',
        name: originalPred.name ?? null,
        confidence: originalPred.confidence ?? null,
      },
      startedAt: new Date(),
    });

    await review.save(sessionOption);

    if (useTransactions && session) {
      await session.commitTransaction();
      session.endSession();
    }

    return res.status(201).json({
      success: true,
      data: {
        review: safeReviewData(review),
        detection: safeDetectionData(claimedDetection),
      },
      message: 'Detection claimed for expert review successfully',
    });
  } catch (error) {
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch {
        // Suppress secondary abort error
      }
    } else {
      // Fallback rollback if running without transactions
      try {
        await Detection.updateOne(
          { _id: detectionId, status: DETECTION_STATUSES.EXPERT_REVIEW_IN_PROGRESS },
          { $set: { status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED } }
        );
      } catch {
        // Suppress rollback error
      }
    }

    // Handle duplicate key error (if review already exists)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_REVIEW',
          message: 'An expert review record already exists for this detection',
        },
      });
    }

    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/expert-reviews/:detectionId/confirm
// ---------------------------------------------------------------------------

/**
 * Confirm the original AI diagnosis.
 * Only the expert who claimed the review can submit the decision.
 * Preserves original Detection.prediction and Detection.severity intact.
 */
async function confirmReview(req, res, next) {
  const { detectionId } = req.params;

  if (!isValidObjectId(detectionId)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Detection not found',
      },
    });
  }

  const errors = validateConfirmReviewInput(req.body);
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

  try {
    const review = await ExpertReview.findOne({ detectionId });

    if (!review) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'No expert review found for this detection. Claim the detection first.',
        },
      });
    }

    if (review.status === REVIEW_STATUSES.COMPLETED) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'REVIEW_ALREADY_COMPLETED',
          message: `This review has already been completed with decision '${review.decision}'`,
        },
      });
    }

    // Authorization: Only the claiming expert can complete the review
    if (review.expertId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the expert who claimed this review can submit a decision',
        },
      });
    }

    let session = null;
    let useTransactions = true;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      useTransactions = false;
    }

    const sessionOption = useTransactions && session ? { session } : {};

    try {
      // 1. Update ExpertReview
      review.decision = EXPERT_DECISIONS.CONFIRMED;
      review.status = REVIEW_STATUSES.COMPLETED;
      review.comment = req.body.comment ? req.body.comment.trim() : null;
      review.requiresLabDiagnosis = Boolean(req.body.requiresLabDiagnosis);
      review.completedAt = new Date();
      await review.save(sessionOption);

      // 2. Update Detection status to CONFIRMED (preserving prediction & severity)
      const updatedDetection = await Detection.findByIdAndUpdate(
        detectionId,
        { $set: { status: DETECTION_STATUSES.CONFIRMED } },
        { returnDocument: 'after', ...sessionOption }
      );

      if (useTransactions && session) {
        await session.commitTransaction();
        session.endSession();
      }

      return res.status(200).json({
        success: true,
        data: {
          review: safeReviewData(review),
          detection: safeDetectionData(updatedDetection),
        },
        message: 'Expert review confirmed successfully',
      });
    } catch (dbErr) {
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      throw dbErr;
    }
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/expert-reviews/:detectionId/correct
// ---------------------------------------------------------------------------

/**
 * Correct the AI diagnosis with expert-provided disease/pest details.
 * Only the claiming expert can submit the correction.
 * Stores corrected diagnosis in ExpertReview; original Detection.prediction remains unchanged.
 */
async function correctReview(req, res, next) {
  const { detectionId } = req.params;

  if (!isValidObjectId(detectionId)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Detection not found',
      },
    });
  }

  const errors = validateCorrectReviewInput(req.body);
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

  try {
    const review = await ExpertReview.findOne({ detectionId });

    if (!review) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'No expert review found for this detection. Claim the detection first.',
        },
      });
    }

    if (review.status === REVIEW_STATUSES.COMPLETED) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'REVIEW_ALREADY_COMPLETED',
          message: `This review has already been completed with decision '${review.decision}'`,
        },
      });
    }

    // Authorization: Only the claiming expert can complete the review
    if (review.expertId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the expert who claimed this review can submit a decision',
        },
      });
    }

    const { correctedDiagnosis } = req.body;
    let normalizedSeverity = null;
    if (correctedDiagnosis.severity) {
      normalizedSeverity = {
        level: correctedDiagnosis.severity.level ? correctedDiagnosis.severity.level.toLowerCase() : null,
        score: correctedDiagnosis.severity.score ?? null,
      };
    }

    let session = null;
    let useTransactions = true;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      useTransactions = false;
    }

    const sessionOption = useTransactions && session ? { session } : {};

    try {
      // 1. Update ExpertReview with corrected diagnosis
      review.decision = EXPERT_DECISIONS.CORRECTED;
      review.status = REVIEW_STATUSES.COMPLETED;
      review.correctedDiagnosis = {
        name: correctedDiagnosis.name.trim(),
        type: correctedDiagnosis.type.toLowerCase(),
        severity: normalizedSeverity,
      };
      review.comment = req.body.comment ? req.body.comment.trim() : null;
      review.requiresLabDiagnosis = Boolean(req.body.requiresLabDiagnosis);
      review.completedAt = new Date();
      await review.save(sessionOption);

      // 2. Update Detection status to CORRECTED (preserving original AI prediction & severity)
      const updatedDetection = await Detection.findByIdAndUpdate(
        detectionId,
        { $set: { status: DETECTION_STATUSES.CORRECTED } },
        { returnDocument: 'after', ...sessionOption }
      );

      if (useTransactions && session) {
        await session.commitTransaction();
        session.endSession();
      }

      return res.status(200).json({
        success: true,
        data: {
          review: safeReviewData(review),
          detection: safeDetectionData(updatedDetection),
        },
        message: 'Expert review correction submitted successfully',
      });
    } catch (dbErr) {
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      throw dbErr;
    }
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/expert-reviews/:detectionId
// ---------------------------------------------------------------------------

/**
 * Retrieve review details for a detection.
 * Access granted to:
 *   - Reviewers (expert, admin)
 *   - The farmer who owns the underlying detection
 */
async function getReviewDetails(req, res, next) {
  try {
    const { detectionId } = req.params;

    if (!isValidObjectId(detectionId)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const detection = await Detection.findById(detectionId);

    if (!detection) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    // Access control: If user is a farmer, they must own the detection
    if (req.user.role === 'farmer' && detection.userId.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Detection not found',
        },
      });
    }

    const review = await ExpertReview.findOne({ detectionId });

    return res.status(200).json({
      success: true,
      data: {
        detection: safeDetectionData(detection),
        review: safeReviewData(review),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getReviewQueue,
  claimReview,
  confirmReview,
  correctReview,
  getReviewDetails,
};
