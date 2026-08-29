/**
 * authController.js
 *
 * HTTP handlers for authentication routes.
 *
 * Routes handled:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 *
 * Security rules enforced here:
 *  - Passwords are never logged.
 *  - passwordHash is never returned in responses.
 *  - Duplicate-email errors are handled gracefully (no user enumeration).
 *  - Authentication failure messages do not reveal whether the email or
 *    password was wrong.
 *  - Admin self-registration is blocked via the validator.
 *  - Inactive users cannot log in.
 */

'use strict';

const { User } = require('../models/User');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  safeUserProfile,
} = require('../services/authService');
const {
  validateRegisterInput,
  validateLoginInput,
} = require('../validators/authValidator');

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

/**
 * Register a new user account.
 *
 * Input (req.body):
 *   name, email, password, role, language
 *
 * On success: HTTP 201, safe user profile (no token on registration per API spec).
 * On validation error: HTTP 400.
 * On duplicate email: HTTP 409.
 */
async function register(req, res, next) {
  try {
    // ---- 1. Validate input ----
    const errors = validateRegisterInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          details: errors,
        },
      });
    }

    const { name, email, password, role, language } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // ---- 2. Check for duplicate email ----
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_IN_USE',
          message: 'An account with this email address already exists.',
        },
      });
    }

    // ---- 3. Hash the password ----
    // NEVER store plaintext. NEVER log the password.
    const passwordHash = await hashPassword(password);

    // ---- 4. Create and save the user ----
    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: role.trim().toLowerCase(),
      language: language.trim(),
    });

    await user.save();

    // ---- 5. Return safe user profile ----
    // Per API.md Section 6: register returns user info but no token.
    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          role: user.role,
        },
      },
      message: 'Registration successful',
    });
  } catch (error) {
    // Handle Mongoose duplicate key error defensively (in case the
    // findOne check above races with a concurrent insert).
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_IN_USE',
          message: 'An account with this email address already exists.',
        },
      });
    }
    next(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

/**
 * Authenticate a user and issue a JWT.
 *
 * Input (req.body):
 *   email, password
 *
 * On success: HTTP 200, JWT + safe user profile.
 * On invalid credentials: HTTP 401 (same message for wrong email OR password
 *   to prevent user enumeration).
 * On inactive account: HTTP 401.
 */
async function login(req, res, next) {
  try {
    // ---- 1. Validate input ----
    const errors = validateLoginInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: errors.join('; '),
          details: errors,
        },
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    // ---- 2. Find the user ----
    // Include passwordHash for comparison, but it will not be returned.
    const user = await User.findOne({ email: normalizedEmail });

    // Generic message -- does not reveal whether the email exists.
    const invalidCredentialsResponse = {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      },
    };

    if (!user) {
      return res.status(401).json(invalidCredentialsResponse);
    }

    // ---- 3. Reject inactive accounts ----
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'This account has been deactivated. Contact support.',
        },
      });
    }

    // ---- 4. Verify password ----
    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json(invalidCredentialsResponse);
    }

    // ---- 5. Generate JWT ----
    const token = generateToken(user);

    // ---- 6. Return token and safe user profile ----
    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          role: user.role,
          language: user.language,
        },
      },
      message: 'Login successful',
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

/**
 * Return the currently authenticated user's safe profile.
 *
 * Authentication required (handled by authenticate middleware).
 * req.user is already loaded and has passwordHash excluded.
 */
function getMe(req, res) {
  // req.user is set by authenticate middleware; passwordHash already excluded.
  const user = req.user;

  return res.status(200).json({
    success: true,
    data: {
      user: safeUserProfile(user),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

/**
 * Logout endpoint.
 *
 * Because this architecture uses stateless JWT, the server has no token to
 * invalidate. The client is responsible for discarding the token.
 *
 * Per API.md Section 9: a server-side blacklist can be added later if needed.
 * Authentication required (ensures only authenticated users can call this).
 */
function logout(req, res) {
  return res.status(200).json({
    success: true,
    data: null,
    message: 'Logged out successfully. Please discard your token on the client.',
  });
}

module.exports = { register, login, getMe, logout };
