/**
 * authValidator.js
 *
 * Input validation helpers for authentication routes.
 *
 * These functions validate request bodies and return a list of error
 * messages. They do NOT throw; callers decide how to respond.
 *
 * Rules:
 *  - Use plain JS (no external validation library) to keep the dependency
 *    footprint minimal.
 *  - Never log passwords.
 *  - Publicly allowed registration roles are defined centrally here so
 *    the rule cannot silently diverge from the route handler.
 */

'use strict';

const { USER_ROLES } = require('../models/User');

// ---------------------------------------------------------------------------
// Public registration roles
// ---------------------------------------------------------------------------

/**
 * Roles that a user is allowed to self-register with.
 *
 * ADMIN is intentionally excluded -- admin accounts must be created through
 * a separate privileged operation (not implemented in the MVP).
 *
 * EXPERT and OFFICER registration may also need vetting; for the MVP only
 * FARMER is open for self-registration unless the API spec explicitly
 * requires otherwise.
 */
const PUBLIC_REGISTRATION_ROLES = [
  USER_ROLES.FARMER,
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a registration request body.
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of human-readable error messages (empty = valid)
 */
function validateRegisterInput(body) {
  const errors = [];
  const { name, email, password, role, language } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required');
  }

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.push('email is not valid');
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    errors.push('password must be at least 8 characters');
  }

  if (!role || typeof role !== 'string') {
    errors.push('role is required');
  } else if (!PUBLIC_REGISTRATION_ROLES.includes(role.trim().toLowerCase())) {
    // This rejects admin, expert, officer self-registration.
    // It also rejects any arbitrary or unknown role.
    errors.push(
      `role must be one of: ${PUBLIC_REGISTRATION_ROLES.join(', ')}`
    );
  }

  if (!language || typeof language !== 'string' || language.trim().length === 0) {
    errors.push('language is required');
  }

  return errors;
}

/**
 * Validate a login request body.
 *
 * @param {object} body - req.body
 * @returns {string[]} Array of error messages (empty = valid)
 */
function validateLoginInput(body) {
  const errors = [];
  const { email, password } = body;

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('email is required');
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push('password is required');
  }

  return errors;
}

module.exports = {
  validateRegisterInput,
  validateLoginInput,
  PUBLIC_REGISTRATION_ROLES,
};
