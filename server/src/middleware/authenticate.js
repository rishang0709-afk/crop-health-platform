/**
 * authenticate.js
 *
 * JWT authentication middleware.
 *
 * Usage:
 *   const authenticate = require('../middleware/authenticate');
 *   router.get('/protected', authenticate, handler);
 *
 * Behavior:
 *  1. Reads:  Authorization: Bearer <JWT>
 *  2. Verifies the token signature and expiry.
 *  3. Rejects missing, malformed, or expired tokens with HTTP 401.
 *  4. Looks up the user by the id embedded in the token.
 *  5. Rejects inactive users with HTTP 401.
 *  6. Attaches the user document to req.user for downstream handlers.
 *
 * Security:
 *  - Role and userId are taken from the verified token, never from the
 *    client request body or query string.
 *  - The user is re-fetched from the database so that deactivated accounts
 *    are blocked even if their token has not expired yet.
 *  - passwordHash is excluded from req.user via Mongoose field selection.
 */

'use strict';

const { verifyToken } = require('../services/authService');
const { User } = require('../models/User');

/**
 * Express middleware that enforces JWT authentication.
 * Sets req.user on success; calls next(err) or returns 401 on failure.
 */
async function authenticate(req, res, next) {
  try {
    // ---- 1. Extract the Bearer token ----
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required. Provide a valid Bearer token.',
        },
      });
    }

    const token = authHeader.slice(7); // remove "Bearer "

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required. Token is empty.',
        },
      });
    }

    // ---- 2. Verify the token ----
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (jwtError) {
      // Distinguish expired tokens from other invalid tokens for clarity
      // in logs (never expose raw error message to client in production).
      const isExpired = jwtError.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        error: {
          code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: isExpired
            ? 'Your session has expired. Please log in again.'
            : 'Invalid authentication token.',
        },
      });
    }

    // ---- 3. Load the user from the database ----
    // This re-validates that the account still exists and is active.
    // Exclude passwordHash from the loaded document.
    const user = await User.findById(decoded.sub).select('-passwordHash -__v');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account no longer exists.',
        },
      });
    }

    // ---- 4. Reject inactive accounts ----
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'This account has been deactivated.',
        },
      });
    }

    // ---- 5. Attach user to request ----
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticate;
