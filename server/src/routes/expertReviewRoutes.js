/**
 * expertReviewRoutes.js
 *
 * Express router for Expert Review Workflow endpoints.
 *
 * All routes require authentication via `authenticate`.
 * Management/decision endpoints require `authorizeRoles('expert', 'admin')`.
 * Details endpoint allows access to reviewers and the detection's owner.
 *
 * Routes:
 *   GET  /api/expert-reviews/queue            -- Get detections waiting for expert review
 *   POST /api/expert-reviews/:detectionId/claim   -- Claim detection for review
 *   POST /api/expert-reviews/:detectionId/confirm -- Confirm original AI diagnosis
 *   POST /api/expert-reviews/:detectionId/correct -- Correct diagnosis with expert findings
 *   GET  /api/expert-reviews/:detectionId        -- Get review and detection details
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const {
  getReviewQueue,
  claimReview,
  confirmReview,
  correctReview,
  getReviewDetails,
} = require('../controllers/expertReviewController');

const router = express.Router();

// Queue and claim/decision endpoints require expert or admin role
router.get('/queue', authenticate, authorizeRoles('expert', 'admin'), getReviewQueue);
router.post('/:detectionId/claim', authenticate, authorizeRoles('expert', 'admin'), claimReview);
router.post('/:detectionId/confirm', authenticate, authorizeRoles('expert', 'admin'), confirmReview);
router.post('/:detectionId/correct', authenticate, authorizeRoles('expert', 'admin'), correctReview);

// Details can be retrieved by experts, admins, or the owning farmer
router.get('/:detectionId', authenticate, getReviewDetails);

module.exports = router;
