/**
 * testFieldRoutes.js
 *
 * Automated integration tests for the Field CRUD API.
 *
 * Usage:
 *   node src/scripts/testFieldRoutes.js
 *
 * The script:
 *  1. Starts the Express app (connects to the real database from .env).
 *  2. Registers two synthetic test farmer accounts.
 *  3. Exercises all 16 verification scenarios from the task specification.
 *  4. Cleans up all test records (users + fields) from the database.
 *  5. Reports PASS/FAIL for each test and exits with code 0 (all pass) or 1.
 *
 * Security:
 *  - Uses synthetic email addresses with a domain that cannot receive mail
 *    (test.invalid) so no real accounts are created or impersonated.
 *  - All test records are deleted after the run regardless of pass/fail.
 *
 * Dependencies:
 *  - Node.js built-in `http` module only (no external test library).
 *  - Requires the server .env file to contain a valid MONGODB_URI.
 */

'use strict';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Load .env from the server root (two directories up from src/scripts/).
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const { connectDatabase } = require('../config/database');
const { User } = require('../models/User');
const { Field } = require('../models/Field');
const app = require('../app');

// Test state — populated during the run and used for cleanup.
const state = {
  server: null,
  port: null,
  farmerA: { email: null, password: null, token: null, userId: null },
  farmerB: { email: null, password: null, token: null, userId: null },
  createdFieldId: null,
};

// ---------------------------------------------------------------------------
// Test runner utilities
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅  PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  ❌  FAIL  ${name}`);
  console.log(`           Reason: ${reason}`);
  failed++;
}

/**
 * Send an HTTP request to the test server.
 * Returns a Promise resolving to { status, body }.
 */
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: state.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Setup: register two synthetic farmer accounts
// ---------------------------------------------------------------------------

async function setup() {
  const suffix = Date.now();
  state.farmerA.email = `test-farmer-a-${suffix}@test.invalid`;
  state.farmerA.password = 'TestPassword_A_123';
  state.farmerB.email = `test-farmer-b-${suffix}@test.invalid`;
  state.farmerB.password = 'TestPassword_B_123';

  // Register farmerA
  const regA = await request('POST', '/api/auth/register', {
    name: 'Test Farmer A',
    email: state.farmerA.email,
    password: state.farmerA.password,
    role: 'farmer',
    language: 'en',
  });
  if (regA.status !== 201) throw new Error(`Setup: failed to register farmerA: ${JSON.stringify(regA.body)}`);
  state.farmerA.userId = regA.body.data.user.id;

  // Register farmerB
  const regB = await request('POST', '/api/auth/register', {
    name: 'Test Farmer B',
    email: state.farmerB.email,
    password: state.farmerB.password,
    role: 'farmer',
    language: 'en',
  });
  if (regB.status !== 201) throw new Error(`Setup: failed to register farmerB: ${JSON.stringify(regB.body)}`);
  state.farmerB.userId = regB.body.data.user.id;

  // Login farmerA
  const loginA = await request('POST', '/api/auth/login', {
    email: state.farmerA.email,
    password: state.farmerA.password,
  });
  if (loginA.status !== 200) throw new Error('Setup: failed to login farmerA');
  state.farmerA.token = loginA.body.data.token;

  // Login farmerB
  const loginB = await request('POST', '/api/auth/login', {
    email: state.farmerB.email,
    password: state.farmerB.password,
  });
  if (loginB.status !== 200) throw new Error('Setup: failed to login farmerB');
  state.farmerB.token = loginB.body.data.token;

  console.log('  Setup complete. Two synthetic test farmers registered and authenticated.');
}

// ---------------------------------------------------------------------------
// Cleanup: delete all test data from the database
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log('\n--- Cleanup ---');
  try {
    // Delete fields belonging to both test users
    const fieldResult = await Field.deleteMany({
      userId: { $in: [state.farmerA.userId, state.farmerB.userId] },
    });
    console.log(`  Deleted ${fieldResult.deletedCount} test field(s)`);

    // Delete the test user accounts
    const userResult = await User.deleteMany({
      email: { $in: [state.farmerA.email, state.farmerB.email] },
    });
    console.log(`  Deleted ${userResult.deletedCount} test user(s)`);
  } catch (err) {
    console.error('  Cleanup error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Valid field payload used as a baseline throughout the tests
// ---------------------------------------------------------------------------

const VALID_FIELD = {
  name: 'Test North Field',
  crop: 'Tomato',
  variety: 'Roma',
  plantingDate: '2026-07-15',
  growthStage: 'flowering',
  area: { value: 2.5, unit: 'acre' },
  location: { type: 'Point', coordinates: [83.37, 26.76] },
  notes: 'Synthetic test field',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  // -------------------------------------------------------------------------
  // Test 1 — Unauthenticated request is rejected (401)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 1: Unauthenticated request rejected';
    const res = await request('POST', '/api/fields', VALID_FIELD);
    if (res.status === 401 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 2 — Authenticated farmer can create a field (201)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 2: Authenticated farmer creates a field';
    const res = await request('POST', '/api/fields', VALID_FIELD, state.farmerA.token);
    if (
      res.status === 201 &&
      res.body.success === true &&
      res.body.data.field.id
    ) {
      state.createdFieldId = res.body.data.field.id;
      pass(name);
    } else {
      fail(name, `Expected 201 with field, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 3 — userId is derived from the authenticated user (not from body)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 3: userId derived from token, not from client body';
    // We already have the created field from Test 2.
    // Verify that the userId in the response matches farmerA's id.
    if (state.createdFieldId) {
      const res = await request('GET', `/api/fields/${state.createdFieldId}`, null, state.farmerA.token);
      const returnedUserId = res.body.data && res.body.data.field && res.body.data.field.userId;
      if (returnedUserId === state.farmerA.userId) {
        pass(name);
      } else {
        fail(name, `userId in response (${returnedUserId}) does not match farmerA (${state.farmerA.userId})`);
      }
    } else {
      fail(name, 'Skipped — no field was created in Test 2');
    }
  }

  // -------------------------------------------------------------------------
  // Test 4 — Client cannot assign the field to another user
  //           (userId in request body is rejected with 400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 4: Client cannot assign field to another user (userId rejected)';
    const payload = { ...VALID_FIELD, userId: state.farmerB.userId };
    const res = await request('POST', '/api/fields', payload, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 5 — Farmer can list their own fields (GET /api/fields)
  // -------------------------------------------------------------------------
  {
    const name = "Test 5: Farmer lists only their own fields";
    const res = await request('GET', '/api/fields', null, state.farmerA.token);
    if (
      res.status === 200 &&
      res.body.success === true &&
      Array.isArray(res.body.data.fields)
    ) {
      // All returned fields must belong to farmerA
      const allOwned = res.body.data.fields.every(
        (f) => f.userId === state.farmerA.userId
      );
      if (allOwned && res.body.data.fields.length >= 1) {
        pass(name);
      } else {
        fail(name, `Fields not all owned by farmerA or list empty: ${JSON.stringify(res.body.data.fields)}`);
      }
    } else {
      fail(name, `Expected 200 with fields array, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 6 — Farmer cannot access another user's field (404, no info leak)
  // -------------------------------------------------------------------------
  {
    const name = "Test 6: Farmer cannot access another user's field";
    if (state.createdFieldId) {
      // farmerB tries to access farmerA's field
      const res = await request('GET', `/api/fields/${state.createdFieldId}`, null, state.farmerB.token);
      if (res.status === 404 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available from Test 2');
    }
  }

  // -------------------------------------------------------------------------
  // Test 7 — Farmer can retrieve their own field (GET /api/fields/:id)
  // -------------------------------------------------------------------------
  {
    const name = "Test 7: Farmer retrieves their own field";
    if (state.createdFieldId) {
      const res = await request('GET', `/api/fields/${state.createdFieldId}`, null, state.farmerA.token);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.field.id === state.createdFieldId
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with field, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available');
    }
  }

  // -------------------------------------------------------------------------
  // Test 8 — Farmer can update their own field (PATCH /api/fields/:id)
  // -------------------------------------------------------------------------
  {
    const name = "Test 8: Farmer updates their own field";
    if (state.createdFieldId) {
      const res = await request(
        'PATCH',
        `/api/fields/${state.createdFieldId}`,
        { name: 'Updated North Field', growthStage: 'fruiting' },
        state.farmerA.token
      );
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.field.name === 'Updated North Field' &&
        res.body.data.field.growthStage === 'fruiting'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with updated field, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available');
    }
  }

  // -------------------------------------------------------------------------
  // Test 9 — Farmer cannot update another user's field (404)
  // -------------------------------------------------------------------------
  {
    const name = "Test 9: Farmer cannot update another user's field";
    if (state.createdFieldId) {
      const res = await request(
        'PATCH',
        `/api/fields/${state.createdFieldId}`,
        { name: 'Hijacked Field' },
        state.farmerB.token
      );
      if (res.status === 404 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available');
    }
  }

  // -------------------------------------------------------------------------
  // Test 10 — Invalid coordinates are rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 10: Invalid coordinates rejected';
    const payload = {
      ...VALID_FIELD,
      location: { type: 'Point', coordinates: [200, 26.76] }, // longitude > 180
    };
    const res = await request('POST', '/api/fields', payload, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 11 — Invalid area is rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 11: Invalid area rejected';
    const payload = {
      ...VALID_FIELD,
      area: { value: -5, unit: 'acre' }, // negative area
    };
    const res = await request('POST', '/api/fields', payload, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 12 — Invalid isActive type/value is rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 12: Invalid isActive type rejected';
    if (state.createdFieldId) {
      // Send "isActive" as a string, not a boolean
      const res = await request(
        'PATCH',
        `/api/fields/${state.createdFieldId}/status`,
        { isActive: 'yes' },
        state.farmerA.token
      );
      if (res.status === 400 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available');
    }
  }

  // -------------------------------------------------------------------------
  // Test 13 — Field deactivation works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 13: Field deactivation works';
    if (state.createdFieldId) {
      const res = await request(
        'PATCH',
        `/api/fields/${state.createdFieldId}/status`,
        { isActive: false },
        state.farmerA.token
      );
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.field.isActive === false
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with isActive=false, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — no field available');
    }
  }

  // -------------------------------------------------------------------------
  // Test 14 — GET /api/health still works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 14: GET /api/health still works';
    const res = await request('GET', '/api/health');
    if (res.status === 200 && res.body.status === 'ok') {
      pass(name);
    } else {
      fail(name, `Expected 200 with status=ok, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 15 — MongoDB connection is active (verified by database operations)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 15: MongoDB connection active';
    const res = await request('GET', '/api/health');
    if (res.status === 200 && res.body.database && res.body.database.connected === true) {
      pass(name);
    } else {
      fail(name, `Database not connected per health check: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 16 — No real personal data used (verified by email domain)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 16: No real personal data used (synthetic accounts only)';
    const domainA = state.farmerA.email.split('@')[1];
    const domainB = state.farmerB.email.split('@')[1];
    if (domainA === 'test.invalid' && domainB === 'test.invalid') {
      pass(name);
    } else {
      fail(name, `Unexpected email domain: ${domainA}, ${domainB}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n========================================');
  console.log(' Field CRUD API — Integration Tests');
  console.log('========================================\n');

  let exitCode = 0;

  try {
    // Connect to the database
    await connectDatabase();
    console.log('  Database connected.\n');

    // Start the HTTP server on a random port to avoid conflicts
    await new Promise((resolve) => {
      state.server = http.createServer(app);
      state.server.listen(0, '127.0.0.1', () => {
        state.port = state.server.address().port;
        console.log(`  Test server started on port ${state.port}.\n`);
        resolve();
      });
    });

    // Register and authenticate test accounts
    console.log('--- Setup ---');
    await setup();

    // Run all tests
    console.log('\n--- Tests ---');
    await runTests();
  } catch (err) {
    console.error('\nFatal error during test run:', err.message);
    exitCode = 1;
  } finally {
    // Always clean up, even on error
    await cleanup();

    // Stop the server
    if (state.server) {
      await new Promise((resolve) => state.server.close(resolve));
      console.log('\n  Test server stopped.');
    }

    // Summary
    const total = passed + failed;
    console.log('\n========================================');
    console.log(` Results: ${passed}/${total} passed, ${failed} failed`);
    console.log('========================================\n');

    if (failed > 0) {
      exitCode = 1;
    }

    process.exit(exitCode);
  }
}

main();
