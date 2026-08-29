/**
 * detectionRoutes.js
 *
 * Express router for initial Detection endpoints.
 *
 * All routes require authentication via the `authenticate` middleware.
 * Ownership enforcement is verified in detectionController.js.
 *
 * Routes:
 *   POST /api/detections      -- Create a pre-analysis detection record
 *   GET  /api/detections      -- List authenticated farmer's detections
 *   GET  /api/detections/:id  -- Get a single detection by ID
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const {
  createDetection,
  getDetections,
  getDetection,
} = require('../controllers/detectionController');

const router = express.Router();

// All detection routes require a valid JWT
router.post('/', authenticate, createDetection);
router.get('/', authenticate, getDetections);
router.get('/:id', authenticate, getDetection);

module.exports = router;
