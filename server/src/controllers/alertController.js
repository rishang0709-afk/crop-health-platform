/**
 * alertController.js
 *
 * HTTP handlers for Alert endpoints.
 *
 * Routes handled:
 *   GET   /api/alerts          -- getAlerts
 *   PATCH /api/alerts/:id/read -- markAlertAsRead
 *
 * Specification: Docs/API.md Sections 23, 24; Docs/DATABASE.md Section 13
 */

'use strict';

const mongoose = require('mongoose');
const { Alert, ALERT_TYPES, ALERT_SEVERITIES } = require('../models/Alert');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function safeAlertData(alert) {
  return {
    id: alert._id.toString(),
    userId: alert.userId.toString(),
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    relatedDetectionId: alert.relatedDetectionId ? alert.relatedDetectionId.toString() : null,
    relatedFieldId: alert.relatedFieldId ? alert.relatedFieldId.toString() : null,
    location: alert.location || null,
    isRead: Boolean(alert.isRead),
    readAt: alert.readAt || null,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// GET /api/alerts
// ---------------------------------------------------------------------------

/**
 * Return paginated list of alerts for the authenticated farmer with optional filters.
 */
async function getAlerts(req, res, next) {
  try {
    const userId = req.user._id;
    const { unread, type, severity, page = 1, limit = 20 } = req.query;

    const query = { userId };

    if (unread === 'true' || unread === true) {
      query.isRead = false;
    } else if (unread === 'false' || unread === false) {
      query.isRead = true;
    }

    if (type && Object.values(ALERT_TYPES).includes(type)) {
      query.type = type;
    }

    if (severity && Object.values(ALERT_SEVERITIES).includes(severity)) {
      query.severity = severity;
    }

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    // Run queries in parallel
    const [alerts, total, unreadCount] = await Promise.all([
      Alert.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      Alert.countDocuments(query),
      Alert.countDocuments({ userId, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        alerts: alerts.map(safeAlertData),
        unreadCount,
        total,
        page: parsedPage,
        limit: parsedLimit,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/alerts/:id/read
// ---------------------------------------------------------------------------

/**
 * Mark a single alert owned by the authenticated user as read.
 */
async function markAlertAsRead(req, res, next) {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Alert not found',
        },
      });
    }

    const alert = await Alert.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Alert not found or does not belong to the authenticated user',
        },
      });
    }

    if (!alert.isRead) {
      alert.isRead = true;
      alert.readAt = new Date();
      await alert.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        alert: safeAlertData(alert),
      },
      message: 'Alert marked as read',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAlerts,
  markAlertAsRead,
};
