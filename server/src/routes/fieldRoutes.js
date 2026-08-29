/**
 * fieldRoutes.js
 *
 * Express router for Field CRUD endpoints.
 *
 * All routes require authentication.
 * Ownership enforcement is handled in fieldController.js.
 *
 * Routes:
 *   POST   /api/fields              -- Create a new field
 *   GET    /api/fields              -- List the authenticated user's fields
 *   GET    /api/fields/:id          -- Get one field (ownership verified)
 *   PATCH  /api/fields/:id          -- Update permitted field properties
 *   PATCH  /api/fields/:id/status   -- Activate / deactivate a field
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const {
  createField,
  getFields,
  getField,
  updateField,
  updateFieldStatus,
} = require('../controllers/fieldController');

const router = express.Router();

// All field routes require a valid JWT.
// The authenticate middleware sets req.user from the verified token.

router.post('/', authenticate, createField);
router.get('/', authenticate, getFields);
router.get('/:id', authenticate, getField);

// Status sub-route is declared BEFORE the general /:id PATCH route so that
// Express never accidentally treats the literal string "status" as a field ID.
router.patch('/:id/status', authenticate, updateFieldStatus);
router.patch('/:id', authenticate, updateField);

module.exports = router;
