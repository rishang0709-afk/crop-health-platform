/**
 * authService.js
 *
 * Business logic for authentication operations.
 *
 * Responsibilities:
 *  - Hash passwords using bcrypt (never store plaintext).
 *  - Compare a plain password against a stored hash.
 *  - Generate signed JWTs.
 *  - Verify and decode JWTs.
 *
 * This service has no knowledge of HTTP (no req/res). It is called by
 * the auth controller and the auth middleware.
 *
 * Security notes:
 *  - Passwords are never logged.
 *  - JWT secret is read from process.env.JWT_SECRET at call time so that
 *    tests can set it without reloading the module.
 *  - JWT payload contains only userId and role -- no personal data.
 */

'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

/**
 * Number of bcrypt salt rounds.
 * 12 is a reasonable production default; higher is slower but more secure.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Hash a plain-text password.
 *
 * @param {string} plainPassword
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 *
 * @param {string} plainPassword
 * @param {string} hash - stored passwordHash
 * @returns {Promise<boolean>} true if the password matches
 */
async function verifyPassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/**
 * Read and validate the JWT secret from the environment.
 * Throws a clear error if the secret is missing so the developer knows
 * exactly what to set in .env.
 *
 * @returns {string} JWT secret
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Add it to your .env file. See .env.example.'
    );
  }
  return secret;
}

/**
 * Generate a signed JWT for an authenticated user.
 *
 * Payload contains only the minimum required identity information:
 *   - sub  (standard JWT subject claim) = user _id as a string
 *   - role = user role string
 *
 * No passwords, email addresses, or other personal data are embedded.
 *
 * @param {{ _id: ObjectId, role: string }} user
 * @returns {string} signed JWT
 */
function generateToken(user) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const payload = {
    sub: user._id.toString(),
    role: user.role,
  };

  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param {string} token
 * @returns {{ sub: string, role: string, iat: number, exp: number }}
 * @throws {JsonWebTokenError | TokenExpiredError} when token is invalid
 */
function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

// ---------------------------------------------------------------------------
// Safe user projection
// ---------------------------------------------------------------------------

/**
 * Build a safe user object suitable for returning in API responses.
 *
 * NEVER includes: passwordHash, __v, or any other sensitive field.
 *
 * @param {import('../models/User').User} user - Mongoose document
 * @returns {object}
 */
function safeUserProfile(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    language: user.language,
    phone: user.phone,
    district: user.district,
    state: user.state,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  safeUserProfile,
};
