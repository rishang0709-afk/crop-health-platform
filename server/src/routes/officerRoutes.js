'use strict';

/**
 * officerRoutes.js
 *
 * Express router for officer-level surveillance and hotspot APIs.
 */

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/authenticate');
const authorizeRoles = require('../middleware/authorizeRoles');
const officerHotspotController = require('../controllers/officerHotspotController');

// Enforce authentication on all officer routes
router.use(authenticate);

// Docs/API.md lists Hotspot API access as "Limited" for Farmers/Experts, but 
// without defining exactly what that means for these specific endpoints. 
// Thus, this MVP restricts them purely to officer and admin.
router.use(authorizeRoles('officer', 'admin'));

// GET /api/officer/hotspots
router.get('/hotspots', officerHotspotController.getHotspots);

// GET /api/officer/map/reports
router.get('/map/reports', officerHotspotController.getMapReports);

module.exports = router;
