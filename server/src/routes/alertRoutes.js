/**
 * alertRoutes.js
 *
 * Express router for Alert endpoints.
 *
 * Specification: Docs/API.md Sections 23, 24
 *
 * All routes require authentication via `authenticate` middleware.
 * Ownership enforcement is handled inside alertController.js.
 *
 * Routes:
 *   GET   /api/alerts          -- getAlerts
 *   PATCH /api/alerts/:id/read -- markAlertAsRead
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const {
  getAlerts,
  markAlertAsRead,
} = require('../controllers/alertController');

const router = express.Router();

// All alert routes require authentication
router.get('/', authenticate, getAlerts);
router.patch('/:id/read', authenticate, markAlertAsRead);

module.exports = router;
