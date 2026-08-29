/**
 * detectionRoutes.js
 *
 * Express router for Detection endpoints with image upload support.
 *
 * All routes require authentication via the `authenticate` middleware.
 * Multipart file handling is processed by `uploadImageMiddleware`.
 * Ownership enforcement is verified in detectionController.js.
 *
 * Routes:
 *   POST /api/detections      -- Create a detection with crop image upload (multipart/form-data)
 *   GET  /api/detections      -- List authenticated farmer's detections
 *   GET  /api/detections/:id  -- Get a single detection by ID
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const { uploadImageMiddleware } = require('../middleware/upload');
const {
  createDetection,
  getDetections,
  getDetection,
} = require('../controllers/detectionController');

const router = express.Router();

// All detection routes require a valid JWT
// POST /api/detections processes single image upload via multipart/form-data
router.post('/', authenticate, uploadImageMiddleware, createDetection);
router.get('/', authenticate, getDetections);
router.get('/:id', authenticate, getDetection);

module.exports = router;
