/**
 * detectionRoutes.js
 *
 * Express router for Detection endpoints with image upload and AI analysis support.
 *
 * All routes require authentication via the `authenticate` middleware.
 * Multipart file handling is processed by `uploadImageMiddleware`.
 * Ownership enforcement is verified in detectionController.js.
 *
 * Routes:
 *   POST /api/detections             -- Create a detection with crop image upload (multipart/form-data)
 *   GET  /api/detections             -- List authenticated farmer's detections
 *   GET  /api/detections/:id         -- Get a single detection by ID
 *   POST /api/detections/:id/analyze -- Trigger AI analysis on a detection
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const { uploadImageMiddleware } = require('../middleware/upload');
const {
  createDetection,
  getDetections,
  getDetection,
  analyzeDetection,
} = require('../controllers/detectionController');
const {
  getDetectionRisk,
  recalculateDetectionRisk,
} = require('../controllers/riskController');

const router = express.Router();

// All detection routes require a valid JWT
// POST /api/detections processes single image upload via multipart/form-data
router.post('/', authenticate, uploadImageMiddleware, createDetection);
router.get('/', authenticate, getDetections);
router.get('/:id', authenticate, getDetection);
router.post('/:id/analyze', authenticate, analyzeDetection);

// Contextual Risk Assessment routes (Docs/API.md Section 22)
router.get('/:id/risk', authenticate, getDetectionRisk);
router.post('/:id/risk/recalculate', authenticate, recalculateDetectionRisk);

module.exports = router;
