/**
 * testLiveCloudinaryAndUpload.js
 *
 * Real Cloudinary live integration test and upload boundary verification.
 *
 * Exercises:
 *  1. Live Cloudinary upload using real credentials from .env
 *  2. Verification of secure_url (https://res.cloudinary.com/...)
 *  3. Verification of storageKey (public_id) in crop-health/detections
 *  4. Live Cloudinary deleteImage cleanup and confirmation (result: ok)
 *  5. End-to-end multipart upload test (>10 MB limit returns HTTP 400)
 *  6. Unsupported MIME type rejection (returns HTTP 400)
 *  7. Missing image file rejection (returns HTTP 400)
 *  8. Detection creation flow with real Cloudinary upload
 *  9. Detection verification: status CREATED, prediction null, severity null
 *  10. Cloudinary asset cleanup after test
 *  11. GET /api/detections and GET /api/detections/:id regression
 *  12. GET /api/health verification
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { Field } = require('../models/Field');
const { User } = require('../models/User');
const { generateToken } = require('../services/authService');
const {
  createDetection,
  getDetections,
  getDetection,
} = require('../controllers/detectionController');
const imageStorageService = require('../services/imageStorageService');
const app = require('../app');

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

// 1x1 transparent PNG in base64
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

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
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname || 'image'}"; filename="${file.filename || 'sample.png'}"\r\nContent-Type: ${file.mimetype || 'image/png'}\r\n\r\n`
    ));
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function sendMultipartRequest(port, path, fields, file, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const payload = buildMultipartBody(fields, file, boundary);

    const options = {
      hostname: '127.0.0.1',
      port,
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

async function runLiveTests() {
  console.log('\n========================================');
  console.log(' Live Cloudinary & Image Upload Tests');
  console.log('========================================\n');

  let server;
  let port;
  const uploadedCloudinaryKeys = [];

  const dummyValidId = new mongoose.Types.ObjectId().toString();
  const dummyAnotherId = new mongoose.Types.ObjectId().toString();

  const mockUser = {
    _id: new mongoose.Types.ObjectId(dummyValidId),
    name: 'Test Farmer',
    email: 'farmer@test.invalid',
    role: 'farmer',
    language: 'en',
    isActive: true,
  };

  const authToken = generateToken(mockUser);

  // Mock User.findById for authenticate middleware when DB is offline
  const origUserFindById = User.findById;
  User.findById = function (id) {
    return {
      select: async () => (id.toString() === dummyValidId ? mockUser : null),
    };
  };

  try {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // -------------------------------------------------------------------------
    // 1. Real Cloudinary Service: Upload live asset
    // -------------------------------------------------------------------------
    let liveUploadResult = null;
    {
      const name = '1. Real Cloudinary API: upload tiny PNG buffer';
      try {
        liveUploadResult = await imageStorageService.uploadDetectionImage(
          TINY_PNG_BUFFER,
          { publicId: 'live_test_' + Date.now() }
        );

        if (
          liveUploadResult &&
          liveUploadResult.url &&
          liveUploadResult.url.startsWith('https://res.cloudinary.com') &&
          liveUploadResult.storageKey &&
          liveUploadResult.storageKey.startsWith('crop-health/detections/')
        ) {
          uploadedCloudinaryKeys.push(liveUploadResult.storageKey);
          pass(name);
        } else {
          fail(name, `Unexpected upload response: ${JSON.stringify(liveUploadResult)}`);
        }
      } catch (err) {
        fail(name, `Live Cloudinary upload threw error: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // 2. Real Cloudinary Service: Delete live asset and verify cleanup
    // -------------------------------------------------------------------------
    {
      const name = '2. Real Cloudinary API: deleteImage cleans up uploaded asset';
      if (liveUploadResult && liveUploadResult.storageKey) {
        const delResult = await imageStorageService.deleteImage(liveUploadResult.storageKey);
        if (delResult === true) {
          const idx = uploadedCloudinaryKeys.indexOf(liveUploadResult.storageKey);
          if (idx !== -1) uploadedCloudinaryKeys.splice(idx, 1);
          pass(name);
        } else {
          fail(name, `Cloudinary deleteImage returned false for key: ${liveUploadResult.storageKey}`);
        }
      } else {
        fail(name, 'Skipped — upload failed in test 1');
      }
    }

    // -------------------------------------------------------------------------
    // 3. Multer limit test: >10 MB image returns HTTP 400 (LIMIT_FILE_SIZE)
    // -------------------------------------------------------------------------
    {
      const name = '3. Oversized file (>10 MB) rejected with HTTP 400 (LIMIT_FILE_SIZE)';
      // 10.5 MB buffer
      const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024);
      const res = await sendMultipartRequest(
        port,
        '/api/detections',
        { fieldId: dummyValidId },
        { fieldname: 'image', filename: 'huge_leaf.jpg', mimetype: 'image/jpeg', buffer: oversizedBuffer },
        authToken
      );

      if (res.status === 400 && res.body.error && res.body.error.code === 'LIMIT_FILE_SIZE') {
        pass(name);
      } else {
        fail(name, `Expected 400 LIMIT_FILE_SIZE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Multer filter test: Unsupported MIME type (text/plain) rejected with HTTP 400
    // -------------------------------------------------------------------------
    {
      const name = '4. Unsupported file MIME type (text/plain) rejected with HTTP 400';
      const res = await sendMultipartRequest(
        port,
        '/api/detections',
        { fieldId: dummyValidId },
        { fieldname: 'image', filename: 'notes.txt', mimetype: 'text/plain', buffer: Buffer.from('hello') },
        authToken
      );

      if (res.status === 400 && res.body.error && res.body.error.code === 'UNSUPPORTED_FILE_TYPE') {
        pass(name);
      } else {
        fail(name, `Expected 400 UNSUPPORTED_FILE_TYPE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Missing file: No image file attached rejected with HTTP 400
    // -------------------------------------------------------------------------
    {
      const name = '5. Missing image file rejected with HTTP 400';
      const res = await sendMultipartRequest(
        port,
        '/api/detections',
        { fieldId: dummyValidId },
        null,
        authToken
      );

      if (res.status === 400 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // 6. Controller: Full Detection creation flow with REAL Cloudinary upload
    // -------------------------------------------------------------------------
    let createdDetectionKey = null;
    {
      const name = '6. Controller creates Detection with real Cloudinary upload (secure URL + storageKey)';
      const origFieldFindOne = Field.findOne;
      const origSave = Detection.prototype.save;

      const mockField = {
        _id: new mongoose.Types.ObjectId(dummyValidId),
        userId: new mongoose.Types.ObjectId(dummyValidId),
        crop: 'Tomato',
        growthStage: 'flowering',
        location: { type: 'Point', coordinates: [83.37, 26.76] },
      };

      Field.findOne = async () => mockField;
      Detection.prototype.save = async function () { return this; };

      const req = {
        user: { _id: mockField.userId },
        body: {
          fieldId: dummyValidId,
          crop: 'Tomato',
          growthStage: 'flowering',
          symptoms: '["brown spots", "yellowing"]',
          location: '{"type":"Point","coordinates":[83.37,26.76]}',
        },
        file: {
          fieldname: 'image',
          originalname: 'tomato_leaf.png',
          mimetype: 'image/png',
          buffer: TINY_PNG_BUFFER,
        },
      };

      let statusCode = null;
      let responseBody = null;
      const res = {
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; },
      };

      await createDetection(req, res, (e) => { throw e; });

      Field.findOne = origFieldFindOne;
      Detection.prototype.save = origSave;

      const det = responseBody && responseBody.data && responseBody.data.detection;

      if (
        statusCode === 201 &&
        responseBody.success === true &&
        det &&
        det.status === 'CREATED' &&
        det.prediction === null &&
        det.severity === null &&
        det.image.url.startsWith('https://res.cloudinary.com') &&
        det.image.storageKey.startsWith('crop-health/detections/')
      ) {
        createdDetectionKey = det.image.storageKey;
        uploadedCloudinaryKeys.push(createdDetectionKey);
        pass(name);
      } else {
        fail(name, `Detection creation failed: ${statusCode}, ${JSON.stringify(responseBody)}`);
      }
    }

    // -------------------------------------------------------------------------
    // 7. Cleanup created test Detection asset from Cloudinary
    // -------------------------------------------------------------------------
    {
      const name = '7. Cleanup real Cloudinary asset created during test';
      if (createdDetectionKey) {
        const delOk = await imageStorageService.deleteImage(createdDetectionKey);
        if (delOk === true) {
          const idx = uploadedCloudinaryKeys.indexOf(createdDetectionKey);
          if (idx !== -1) uploadedCloudinaryKeys.splice(idx, 1);
          pass(name);
        } else {
          fail(name, `Failed to delete key: ${createdDetectionKey}`);
        }
      } else {
        fail(name, 'Skipped — no key from test 6');
      }
    }

    // -------------------------------------------------------------------------
    // 8. GET /api/detections regression test
    // -------------------------------------------------------------------------
    {
      const name = '8. GET /api/detections returns farmer detections sorted newest first';
      const origFind = Detection.find;

      Detection.find = function (filter) {
        return {
          sort: async () => [
            {
              _id: new mongoose.Types.ObjectId(dummyValidId),
              userId: new mongoose.Types.ObjectId(dummyValidId),
              fieldId: new mongoose.Types.ObjectId(dummyValidId),
              image: {
                url: 'https://res.cloudinary.com/test/image/upload/v1/crop-health/detections/1.jpg',
                storageKey: 'crop-health/detections/1',
                uploadedAt: new Date(),
              },
              crop: 'Tomato',
              growthStage: 'flowering',
              symptoms: ['leaf spots'],
              prediction: null,
              severity: null,
              status: 'CREATED',
              location: { type: 'Point', coordinates: [83.37, 26.76] },
              weatherSnapshot: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        };
      };

      const req = {
        user: { _id: new mongoose.Types.ObjectId(dummyValidId) },
        query: { status: 'CREATED', crop: 'Tomato' },
      };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(c) { statusCode = c; return this; },
        json(b) { responseBody = b; },
      };

      await getDetections(req, res, (e) => { throw e; });
      Detection.find = origFind;

      if (
        statusCode === 200 &&
        responseBody.success === true &&
        Array.isArray(responseBody.data.detections) &&
        responseBody.data.detections.length === 1 &&
        responseBody.data.detections[0].image.storageKey === 'crop-health/detections/1'
      ) {
        pass(name);
      } else {
        fail(name, `GET /api/detections failed: ${statusCode}, ${JSON.stringify(responseBody)}`);
      }
    }

    // -------------------------------------------------------------------------
    // 9. GET /api/detections/:id regression test
    // -------------------------------------------------------------------------
    {
      const name = '9. GET /api/detections/:id returns own detection and 404 for unowned';
      const origFindOne = Detection.findOne;

      // Own detection found
      Detection.findOne = async (query) => {
        if (query.userId.toString() === dummyValidId && query._id.toString() === dummyValidId) {
          return {
            _id: new mongoose.Types.ObjectId(dummyValidId),
            userId: new mongoose.Types.ObjectId(dummyValidId),
            fieldId: new mongoose.Types.ObjectId(dummyValidId),
            image: {
              url: 'https://res.cloudinary.com/test/image/upload/v1/crop-health/detections/1.jpg',
              storageKey: 'crop-health/detections/1',
              uploadedAt: new Date(),
            },
            crop: 'Tomato',
            growthStage: 'flowering',
            symptoms: [],
            prediction: null,
            severity: null,
            status: 'CREATED',
            location: { type: 'Point', coordinates: [83.37, 26.76] },
            weatherSnapshot: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      };

      // Test own
      const reqOwn = {
        user: { _id: new mongoose.Types.ObjectId(dummyValidId) },
        params: { id: dummyValidId },
      };
      let statusOwn = null;
      let bodyOwn = null;
      const resOwn = { status(c) { statusOwn = c; return this; }, json(b) { bodyOwn = b; } };
      await getDetection(reqOwn, resOwn, (e) => { throw e; });

      // Test other user
      const reqOther = {
        user: { _id: new mongoose.Types.ObjectId(dummyAnotherId) },
        params: { id: dummyValidId },
      };
      let statusOther = null;
      let bodyOther = null;
      const resOther = { status(c) { statusOther = c; return this; }, json(b) { bodyOther = b; } };
      await getDetection(reqOther, resOther, (e) => { throw e; });

      Detection.findOne = origFindOne;

      if (
        statusOwn === 200 && bodyOwn.success === true &&
        statusOther === 404 && bodyOther.error.code === 'NOT_FOUND'
      ) {
        pass(name);
      } else {
        fail(name, `GET /api/detections/:id failed: own=${statusOwn}, other=${statusOther}`);
      }
    }

    // -------------------------------------------------------------------------
    // 10. GET /api/health verification
    // -------------------------------------------------------------------------
    {
      const name = '10. GET /api/health returns 200 ok';
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/health`, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => {
            try {
              resolve({ status: r.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: r.statusCode, body: data });
            }
          });
        }).on('error', reject);
      });

      if (res.status === 200 && res.body.status === 'ok') {
        pass(name);
      } else {
        fail(name, `Expected 200 status ok, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    failed++;
  } finally {
    User.findById = origUserFindById;

    // Teardown: ensure any remaining Cloudinary assets are destroyed
    if (uploadedCloudinaryKeys.length > 0) {
      console.log(`\n--- Cleaning up ${uploadedCloudinaryKeys.length} remaining Cloudinary test asset(s) ---`);
      for (const key of uploadedCloudinaryKeys) {
        await imageStorageService.deleteImage(key);
      }
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    console.log('\n========================================');
    console.log(` Results: ${passed}/${passed + failed} passed, ${failed} failed`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
  }
}

runLiveTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
