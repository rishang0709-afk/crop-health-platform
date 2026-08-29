/**
 * authRoutes.js
 *
 * Express router for authentication endpoints.
 *
 * Routes:
 *   POST /api/auth/register  -- public
 *   POST /api/auth/login     -- public
 *   GET  /api/auth/me        -- requires authentication
 *   POST /api/auth/logout    -- requires authentication
 *
 * This file only wires routes to handlers.
 * Business logic lives in authController.js and authService.js.
 */

'use strict';

const express = require('express');
const { register, login, getMe, logout } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// Public routes — no authentication required
router.post('/register', register);
router.post('/login', login);

// Protected routes — authentication required
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
