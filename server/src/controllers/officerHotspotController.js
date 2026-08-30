'use strict';

/**
 * officerHotspotController.js
 *
 * Handles HTTP requests for officer hotspot and map reports endpoints.
 */

const hotspotService = require('../services/hotspotService');
const { RISK_LEVELS } = require('../models/RiskAssessment');

exports.getHotspots = async (req, res, next) => {
  try {
    const { crop, disease, from, to } = req.query;

    // Validate dates
    if (from && isNaN(new Date(from).getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid from date' } });
    }
    if (to && isNaN(new Date(to).getTime())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid to date' } });
    }
    if (from && to && new Date(from) > new Date(to)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'from date cannot be after to date' } });
    }

    const filters = { crop, disease, from, to };
    
    const hotspots = await hotspotService.calculateHotspots(filters);

    res.json({
      success: true,
      data: {
        hotspots
      },
      message: 'Hotspots retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

exports.getMapReports = async (req, res, next) => {
  try {
    const { crop, disease, risk } = req.query;

    if (risk && !Object.values(RISK_LEVELS).includes(risk.toUpperCase())) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid risk level' } });
    }

    const filters = { crop, disease, risk };

    const mapReports = await hotspotService.calculateMapReports(filters);

    res.json({
      success: true,
      data: {
        mapReports
      },
      message: 'Map reports retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};
