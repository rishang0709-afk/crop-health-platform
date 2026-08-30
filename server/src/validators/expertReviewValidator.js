/**
 * expertReviewValidator.js
 *
 * Input validation for Expert Review endpoints.
 */

'use strict';

const mongoose = require('mongoose');
const { DIAGNOSIS_TYPES, SEVERITY_LEVELS } = require('../models/ExpertReview');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

/**
 * Validate input for POST /api/expert-reviews/:detectionId/confirm
 *
 * @param {object} body
 * @returns {string[]} List of validation error messages
 */
function validateConfirmReviewInput(body = {}) {
  const errors = [];

  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') {
      errors.push('comment must be a string');
    } else if (body.comment.length > 2000) {
      errors.push('comment cannot exceed 2000 characters');
    }
  }

  if (body.requiresLabDiagnosis !== undefined && body.requiresLabDiagnosis !== null) {
    if (typeof body.requiresLabDiagnosis !== 'boolean') {
      errors.push('requiresLabDiagnosis must be a boolean');
    }
  }

  return errors;
}

/**
 * Validate input for POST /api/expert-reviews/:detectionId/correct
 *
 * @param {object} body
 * @returns {string[]} List of validation error messages
 */
function validateCorrectReviewInput(body = {}) {
  const errors = [];

  if (!body.correctedDiagnosis || typeof body.correctedDiagnosis !== 'object' || Array.isArray(body.correctedDiagnosis)) {
    errors.push('correctedDiagnosis object is required');
    return errors;
  }

  const { name, type, severity } = body.correctedDiagnosis;

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('correctedDiagnosis.name is required and must be a non-empty string');
  }

  if (!type || typeof type !== 'string') {
    errors.push('correctedDiagnosis.type is required');
  } else if (!Object.values(DIAGNOSIS_TYPES).includes(type.toLowerCase())) {
    errors.push(
      `correctedDiagnosis.type must be one of: ${Object.values(DIAGNOSIS_TYPES).join(', ')}`
    );
  }

  if (severity !== undefined && severity !== null) {
    if (typeof severity !== 'object' || Array.isArray(severity)) {
      errors.push('correctedDiagnosis.severity must be an object');
    } else {
      if (severity.level !== undefined && severity.level !== null) {
        if (!Object.values(SEVERITY_LEVELS).includes(severity.level.toLowerCase())) {
          errors.push(
            `correctedDiagnosis.severity.level must be one of: ${Object.values(SEVERITY_LEVELS).join(', ')}`
          );
        }
      }
      if (severity.score !== undefined && severity.score !== null) {
        if (typeof severity.score !== 'number' || isNaN(severity.score) || severity.score < 0 || severity.score > 100) {
          errors.push('correctedDiagnosis.severity.score must be a number between 0 and 100');
        }
      }
    }
  }

  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') {
      errors.push('comment must be a string');
    } else if (body.comment.length > 2000) {
      errors.push('comment cannot exceed 2000 characters');
    }
  }

  if (body.requiresLabDiagnosis !== undefined && body.requiresLabDiagnosis !== null) {
    if (typeof body.requiresLabDiagnosis !== 'boolean') {
      errors.push('requiresLabDiagnosis must be a boolean');
    }
  }

  return errors;
}

/**
 * Validate query parameters for GET /api/expert-reviews/queue
 *
 * @param {object} query
 * @returns {string[]} List of validation error messages
 */
function validateReviewQueueQuery(query = {}) {
  const errors = [];

  if (query.crop !== undefined && (typeof query.crop !== 'string' || !query.crop.trim())) {
    errors.push('crop filter must be a non-empty string');
  }

  if (query.page !== undefined) {
    const pageNum = parseInt(query.page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.push('page must be a positive integer');
    }
  }

  if (query.limit !== undefined) {
    const limitNum = parseInt(query.limit, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      errors.push('limit must be between 1 and 100');
    }
  }

  return errors;
}

module.exports = {
  isValidObjectId,
  validateConfirmReviewInput,
  validateCorrectReviewInput,
  validateReviewQueueQuery,
};
