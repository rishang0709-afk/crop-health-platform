/**
 * authorizeRoles.js
 *
 * Role-based authorization middleware factory.
 *
 * Usage:
 *   const authorizeRoles = require('../middleware/authorizeRoles');
 *
 *   // Allow only farmers:
 *   router.post('/fields', authenticate, authorizeRoles('farmer'), handler);
 *
 *   // Allow experts and admins:
 *   router.get('/reviews', authenticate, authorizeRoles('expert', 'admin'), handler);
 *
 * This middleware MUST be placed AFTER authenticate in the middleware chain.
 * If the user is not authenticated, authenticate will have already rejected
 * the request with 401. This middleware only handles 403 (wrong role).
 *
 * Security:
 *  - Role is read from req.user, which is populated by the authenticate
 *    middleware from the verified JWT. It is NEVER taken from client input.
 */

'use strict';

/**
 * Returns an Express middleware that requires the authenticated user to
 * have one of the specified roles.
 *
 * @param {...string} allowedRoles - One or more allowed role strings.
 * @returns {Function} Express middleware
 */
function authorizeRoles(...allowedRoles) {
  return function (req, res, next) {
    // authenticate must have run first and set req.user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.',
        },
      });
    }

    next();
  };
}

module.exports = authorizeRoles;
