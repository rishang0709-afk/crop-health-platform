/**
 * testDetectionRoutes.js
 *
 * Automated integration tests for Detection API with multipart image upload.
 *
 * Usage:
 *   node src/scripts/testDetectionRoutes.js
 *
 * Exercises all 18 verification scenarios against MongoDB Atlas and Cloudinary:
 *  1. Unauthenticated POST rejected (401).
 *  2. Authenticated farmer can create detection for own field with real image upload (201).
 *  3. Detection receives userId from req.user (not client body).
 *  4. Detection begins with status CREATED.
 *  5. prediction remains empty/null.
 *  6. severity remains empty/null.
 *  7. Farmer cannot create detection for another farmer's field (404).
 *  8. Invalid fieldId rejected (400).
 *  9. Invalid coordinates rejected (400).
 *  10. Invalid symptoms rejected (400).
 *  11. GET /api/detections returns only own detections.
 *  12. Field filter works on GET /api/detections.
 *  13. Status filter works on GET /api/detections.
 *  14. GET /api/detections/:id returns own detection.
 *  15. Another user's detection returns 404.
 *  16. GET /api/health still works.
 *  17. MongoDB connection still works.
 *  18. Fallback derivation of crop, growthStage, location from Field works (201).
 *
 * Security:
 *  - Uses synthetic email addresses with test.invalid domain.
 *  - All test records (Users, Fields, Detections) and Cloudinary assets are deleted after execution.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const { connectDatabase } = require('../config/database');
const { User } = require('../models/User');
const { Field } = require('../models/Field');
const { Detection } = require('../models/Detection');
const imageStorageService = require('../services/imageStorageService');
const app = require('../app');

// 1x1 valid transparent PNG binary sequence
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Test state
const state = {
  server: null,
  port: null,
  farmerA: { email: null, password: null, token: null, userId: null, fieldId: null },
  farmerB: { email: null, password: null, token: null, userId: null, fieldId: null },
  detectionAId: null,
  detectionBId: null,
  detectionMinimalId: null,
  uploadedCloudinaryKeys: [],
};

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

function jsonRequest(method, path, body, token) {
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

function buildMultipartBody(fields, file, boundary) {
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      ));
    }
  }

  if (file) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname || 'image'}"; filename="${file.filename || 'tomato_leaf.png'}"\r\nContent-Type: ${file.mimetype || 'image/png'}\r\n\r\n`
    ));
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function multipartRequest(path, fields, file, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const payload = buildMultipartBody(fields, file, boundary);

    const options = {
      hostname: '127.0.0.1',
      port: state.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
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
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Setup: register two synthetic farmers and create a field for each
// ---------------------------------------------------------------------------

async function setup() {
  const suffix = Date.now();
  state.farmerA.email = `test-det-farmer-a-${suffix}@test.invalid`;
  state.farmerA.password = 'TestPassword_A_123';
  state.farmerB.email = `test-det-farmer-b-${suffix}@test.invalid`;
  state.farmerB.password = 'TestPassword_B_123';

  // Register farmerA
  const regA = await jsonRequest('POST', '/api/auth/register', {
    name: 'Test Farmer A',
    email: state.farmerA.email,
    password: state.farmerA.password,
    role: 'farmer',
    language: 'en',
  });
  if (regA.status !== 201) throw new Error(`Setup: failed to register farmerA: ${JSON.stringify(regA.body)}`);
  state.farmerA.userId = regA.body.data.user.id;

  // Register farmerB
  const regB = await jsonRequest('POST', '/api/auth/register', {
    name: 'Test Farmer B',
    email: state.farmerB.email,
    password: state.farmerB.password,
    role: 'farmer',
    language: 'en',
  });
  if (regB.status !== 201) throw new Error(`Setup: failed to register farmerB: ${JSON.stringify(regB.body)}`);
  state.farmerB.userId = regB.body.data.user.id;

  // Login farmerA
  const loginA = await jsonRequest('POST', '/api/auth/login', {
    email: state.farmerA.email,
    password: state.farmerA.password,
  });
  if (loginA.status !== 200) throw new Error('Setup: failed to login farmerA');
  state.farmerA.token = loginA.body.data.token;

  // Login farmerB
  const loginB = await jsonRequest('POST', '/api/auth/login', {
    email: state.farmerB.email,
    password: state.farmerB.password,
  });
  if (loginB.status !== 200) throw new Error('Setup: failed to login farmerB');
  state.farmerB.token = loginB.body.data.token;

  // Create Field for farmerA
  const fieldResA = await jsonRequest(
    'POST',
    '/api/fields',
    {
      name: 'Farmer A Tomato Field',
      crop: 'Tomato',
      variety: 'Roma',
      growthStage: 'flowering',
      location: { type: 'Point', coordinates: [83.37, 26.76] },
    },
    state.farmerA.token
  );
  if (fieldResA.status !== 201) throw new Error(`Setup: failed to create field for farmerA: ${JSON.stringify(fieldResA.body)}`);
  state.farmerA.fieldId = fieldResA.body.data.field.id;

  // Create Field for farmerB
  const fieldResB = await jsonRequest(
    'POST',
    '/api/fields',
    {
      name: 'Farmer B Potato Field',
      crop: 'Potato',
      variety: 'Kufri',
      growthStage: 'vegetative',
      location: { type: 'Point', coordinates: [83.40, 26.80] },
    },
    state.farmerB.token
  );
  if (fieldResB.status !== 201) throw new Error(`Setup: failed to create field for farmerB: ${JSON.stringify(fieldResB.body)}`);
  state.farmerB.fieldId = fieldResB.body.data.field.id;

  console.log('  Setup complete. Registered 2 farmers with 2 fields.');
}

// ---------------------------------------------------------------------------
// Cleanup: Cloudinary assets + MongoDB test records
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log('\n--- Cleanup ---');
  try {
    // 1. Delete all Cloudinary test assets uploaded during the run
    if (state.uploadedCloudinaryKeys.length > 0) {
      console.log(`  Deleting ${state.uploadedCloudinaryKeys.length} Cloudinary test asset(s)...`);
      for (const key of state.uploadedCloudinaryKeys) {
        try {
          const res = await imageStorageService.deleteImage(key);
          console.log(`    Deleted Cloudinary asset ${key}: ${res}`);
        } catch (e) {
          console.error(`    Error deleting Cloudinary asset ${key}:`, e.message);
        }
      }
    }

    // 2. Delete test detections from MongoDB
    const detResult = await Detection.deleteMany({
      userId: { $in: [state.farmerA.userId, state.farmerB.userId] },
    });
    console.log(`  Deleted ${detResult.deletedCount} test detection(s) from MongoDB`);

    // 3. Delete test fields from MongoDB
    const fieldResult = await Field.deleteMany({
      userId: { $in: [state.farmerA.userId, state.farmerB.userId] },
    });
    console.log(`  Deleted ${fieldResult.deletedCount} test field(s) from MongoDB`);

    // 4. Delete test users from MongoDB
    const userResult = await User.deleteMany({
      email: { $in: [state.farmerA.email, state.farmerB.email] },
    });
    console.log(`  Deleted ${userResult.deletedCount} test user(s) from MongoDB`);
  } catch (err) {
    console.error('  Cleanup error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

async function runTests() {
  const sampleImage = {
    fieldname: 'image',
    filename: 'tomato_leaf.png',
    mimetype: 'image/png',
    buffer: VALID_PNG_BUFFER,
  };

  const validMultipartFields = {
    fieldId: state.farmerA.fieldId,
    crop: 'Tomato',
    growthStage: 'flowering',
    symptoms: '["brown spots on lower leaves", "yellowing margins"]',
    location: '{"type":"Point","coordinates":[83.37,26.76]}',
  };

  // -------------------------------------------------------------------------
  // Test 1 — Unauthenticated POST rejected (401)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 1: Unauthenticated POST rejected (401)';
    const res = await multipartRequest('/api/detections', validMultipartFields, sampleImage);
    if (res.status === 401 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 2 — Authenticated farmer can create detection for own field (201)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 2: Authenticated farmer can create detection for own field (201)';
    const res = await multipartRequest('/api/detections', validMultipartFields, sampleImage, state.farmerA.token);
    if (
      res.status === 201 &&
      res.body.success === true &&
      res.body.data &&
      res.body.data.detection &&
      res.body.data.detection.id
    ) {
      state.detectionAId = res.body.data.detection.id;
      if (res.body.data.detection.image && res.body.data.detection.image.storageKey) {
        state.uploadedCloudinaryKeys.push(res.body.data.detection.image.storageKey);
      }
      pass(name);
    } else {
      fail(name, `Expected 201 with detection, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 3 — Detection receives userId from req.user (not from client)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 3: Detection receives userId from req.user';
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerA.token);
      const returnedUserId = res.body.data && res.body.data.detection && res.body.data.detection.userId;
      if (returnedUserId === state.farmerA.userId) {
        pass(name);
      } else {
        fail(name, `userId in detection (${returnedUserId}) does not match req.user._id (${state.farmerA.userId})`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created in Test 2');
    }
  }

  // -------------------------------------------------------------------------
  // Test 4 — Detection begins with status CREATED
  // -------------------------------------------------------------------------
  {
    const name = 'Test 4: Detection begins with status CREATED';
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerA.token);
      const returnedStatus = res.body.data && res.body.data.detection && res.body.data.detection.status;
      if (returnedStatus === 'CREATED') {
        pass(name);
      } else {
        fail(name, `Expected status "CREATED", got "${returnedStatus}"`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created');
    }
  }

  // -------------------------------------------------------------------------
  // Test 5 — prediction remains empty/null
  // -------------------------------------------------------------------------
  {
    const name = 'Test 5: prediction remains empty/null';
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerA.token);
      const prediction = res.body.data && res.body.data.detection && res.body.data.detection.prediction;
      if (prediction === null || prediction === undefined) {
        pass(name);
      } else {
        fail(name, `Expected prediction to be null, got: ${JSON.stringify(prediction)}`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created');
    }
  }

  // -------------------------------------------------------------------------
  // Test 6 — severity remains empty/null
  // -------------------------------------------------------------------------
  {
    const name = 'Test 6: severity remains empty/null';
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerA.token);
      const severity = res.body.data && res.body.data.detection && res.body.data.detection.severity;
      if (severity === null || severity === undefined) {
        pass(name);
      } else {
        fail(name, `Expected severity to be null, got: ${JSON.stringify(severity)}`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created');
    }
  }

  // -------------------------------------------------------------------------
  // Test 7 — Farmer cannot create detection for another farmer's field
  // -------------------------------------------------------------------------
  {
    const name = "Test 7: Farmer cannot create detection for another farmer's field";
    const hijackFields = {
      ...validMultipartFields,
      fieldId: state.farmerB.fieldId,
    };
    const res = await multipartRequest('/api/detections', hijackFields, sampleImage, state.farmerA.token);
    if (res.status === 404 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 8 — Invalid fieldId rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 8: Invalid fieldId rejected (400)';
    const invalidFields = {
      ...validMultipartFields,
      fieldId: 'not-a-valid-object-id',
    };
    const res = await multipartRequest('/api/detections', invalidFields, sampleImage, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 9 — Invalid coordinates rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 9: Invalid coordinates rejected (400)';
    const invalidCoordsFields = {
      ...validMultipartFields,
      location: JSON.stringify({ type: 'Point', coordinates: [250, 95] }),
    };
    const res = await multipartRequest('/api/detections', invalidCoordsFields, sampleImage, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 10 — Invalid symptoms JSON rejected (400)
  // -------------------------------------------------------------------------
  {
    const name = 'Test 10: Invalid symptoms rejected (400)';
    const invalidSymptomsFields = {
      ...validMultipartFields,
      symptoms: '["unclosed json string',
    };
    const res = await multipartRequest('/api/detections', invalidSymptomsFields, sampleImage, state.farmerA.token);
    if (res.status === 400 && res.body.success === false) {
      pass(name);
    } else {
      fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // Create a detection for Farmer B as well for testing isolation
  {
    const detBRes = await multipartRequest(
      '/api/detections',
      {
        fieldId: state.farmerB.fieldId,
        crop: 'Potato',
        growthStage: 'vegetative',
        symptoms: '["black lesions on stems"]',
        location: '{"type":"Point","coordinates":[83.40,26.80]}',
      },
      sampleImage,
      state.farmerB.token
    );
    if (detBRes.status === 201) {
      state.detectionBId = detBRes.body.data.detection.id;
      if (detBRes.body.data.detection.image && detBRes.body.data.detection.image.storageKey) {
        state.uploadedCloudinaryKeys.push(detBRes.body.data.detection.image.storageKey);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Test 11 — GET /api/detections returns only own detections
  // -------------------------------------------------------------------------
  {
    const name = 'Test 11: GET /api/detections returns only own detections';
    const resA = await jsonRequest('GET', '/api/detections', null, state.farmerA.token);
    if (
      resA.status === 200 &&
      resA.body.success === true &&
      Array.isArray(resA.body.data.detections)
    ) {
      const allFarmerA = resA.body.data.detections.every((d) => d.userId === state.farmerA.userId);
      const containsFarmerB = resA.body.data.detections.some((d) => d.userId === state.farmerB.userId);

      if (allFarmerA && !containsFarmerB && resA.body.data.detections.length >= 1) {
        pass(name);
      } else {
        fail(name, `Detections contain unauthorized records or list is empty: ${JSON.stringify(resA.body.data.detections)}`);
      }
    } else {
      fail(name, `Expected 200 with detections, got ${resA.status}: ${JSON.stringify(resA.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 12 — Field filter works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 12: Field filter works (GET /api/detections?fieldId=...)';
    const res = await jsonRequest('GET', `/api/detections?fieldId=${state.farmerA.fieldId}`, null, state.farmerA.token);
    if (
      res.status === 200 &&
      res.body.success === true &&
      Array.isArray(res.body.data.detections) &&
      res.body.data.detections.every((d) => d.fieldId === state.farmerA.fieldId)
    ) {
      pass(name);
    } else {
      fail(name, `Expected filtered detections for fieldId ${state.farmerA.fieldId}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 13 — Status filter works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 13: Status filter works (GET /api/detections?status=CREATED)';
    const res = await jsonRequest('GET', '/api/detections?status=CREATED', null, state.farmerA.token);
    if (
      res.status === 200 &&
      res.body.success === true &&
      Array.isArray(res.body.data.detections) &&
      res.body.data.detections.every((d) => d.status === 'CREATED')
    ) {
      pass(name);
    } else {
      fail(name, `Expected status=CREATED filtered detections: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 14 — GET /api/detections/:id returns own detection
  // -------------------------------------------------------------------------
  {
    const name = 'Test 14: GET /api/detections/:id returns own detection';
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerA.token);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection &&
        res.body.data.detection.id === state.detectionAId
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with detection, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created');
    }
  }

  // -------------------------------------------------------------------------
  // Test 15 — Another user's detection returns 404 (no information leakage)
  // -------------------------------------------------------------------------
  {
    const name = "Test 15: Another user's detection returns 404";
    if (state.detectionAId) {
      const res = await jsonRequest('GET', `/api/detections/${state.detectionAId}`, null, state.farmerB.token);
      if (res.status === 404 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 404 for unauthorized detection access, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    } else {
      fail(name, 'Skipped — detectionA was not created');
    }
  }

  // -------------------------------------------------------------------------
  // Test 16 — GET /api/health still works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 16: GET /api/health still works';
    const res = await jsonRequest('GET', '/api/health');
    if (res.status === 200 && res.body.status === 'ok') {
      pass(name);
    } else {
      fail(name, `Expected 200 status ok, got ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 17 — MongoDB connection still works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 17: MongoDB connection still works';
    const res = await jsonRequest('GET', '/api/health');
    if (res.status === 200 && res.body.database && res.body.database.connected === true) {
      pass(name);
    } else {
      fail(name, `Database not connected: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 18 — Deriving crop, growthStage, location from Field works
  // -------------------------------------------------------------------------
  {
    const name = 'Test 18: Fallback derivation from Field works when omitted in body';
    const minimalFields = {
      fieldId: state.farmerA.fieldId,
    };
    const res = await multipartRequest('/api/detections', minimalFields, sampleImage, state.farmerA.token);
    if (
      res.status === 201 &&
      res.body.success === true &&
      res.body.data.detection.crop === 'Tomato' &&
      res.body.data.detection.growthStage === 'flowering' &&
      res.body.data.detection.location &&
      res.body.data.detection.location.type === 'Point' &&
      res.body.data.detection.location.coordinates[0] === 83.37
    ) {
      state.detectionMinimalId = res.body.data.detection.id;
      if (res.body.data.detection.image && res.body.data.detection.image.storageKey) {
        state.uploadedCloudinaryKeys.push(res.body.data.detection.image.storageKey);
      }
      pass(name);
    } else {
      fail(name, `Failed to derive crop/growthStage/location from Field: ${JSON.stringify(res.body)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n========================================');
  console.log(' Detection API — Integration Tests');
  console.log('========================================\n');

  let exitCode = 0;

  try {
    await connectDatabase();
    console.log('  Database connected.\n');

    await new Promise((resolve) => {
      state.server = http.createServer(app);
      state.server.listen(0, '127.0.0.1', () => {
        state.port = state.server.address().port;
        console.log(`  Test server started on port ${state.port}.\n`);
        resolve();
      });
    });

    console.log('--- Setup ---');
    await setup();

    console.log('\n--- Tests ---');
    await runTests();
  } catch (err) {
    console.error('\nFatal error during test run:', err.message);
    exitCode = 1;
  } finally {
    await cleanup();

    if (state.server) {
      await new Promise((resolve) => state.server.close(resolve));
      console.log('\n  Test server stopped.');
    }

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
