/**
 * testDetectionAnalyze.js
 *
 * Automated integration tests for POST /api/detections/:id/analyze
 * verifying backend-to-AI-service integration, atomic concurrency claim,
 * lifecycle transitions, timeouts, and error recovery.
 *
 * Usage:
 *   node src/scripts/testDetectionAnalyze.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { Field } = require('../models/Field');
const { User } = require('../models/User');
const { generateToken } = require('../services/authService');
const aiService = require('../services/aiService');
const { analyzeDetection } = require('../controllers/detectionController');
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

// 1x1 valid transparent PNG binary sequence
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function jsonRequest(port, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port,
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

async function runAnalyzeTests() {
  console.log('\n========================================');
  console.log(' Detection AI Analysis Integration Tests');
  console.log('========================================\n');

  let appServer;
  let appPort;
  let mockAiServer;
  let mockAiPort;
  let mockImageServer;
  let mockImagePort;

  const farmerAId = new mongoose.Types.ObjectId().toString();
  const farmerBId = new mongoose.Types.ObjectId().toString();
  const fieldAId = new mongoose.Types.ObjectId().toString();

  const mockUserA = {
    _id: new mongoose.Types.ObjectId(farmerAId),
    name: 'Farmer A',
    email: 'farmer.a@test.invalid',
    role: 'farmer',
    language: 'en',
    isActive: true,
  };

  const mockUserB = {
    _id: new mongoose.Types.ObjectId(farmerBId),
    name: 'Farmer B',
    email: 'farmer.b@test.invalid',
    role: 'farmer',
    language: 'en',
    isActive: true,
  };

  const tokenA = generateToken(mockUserA);
  const tokenB = generateToken(mockUserB);

  // Mock User.findById for auth middleware when running test in isolation
  const origUserFindById = User.findById;
  User.findById = function (id) {
    return {
      select: async () => {
        const idStr = id.toString();
        if (idStr === farmerAId) return mockUserA;
        if (idStr === farmerBId) return mockUserB;
        return null;
      },
    };
  };

  // In-memory detection store for test execution
  const detectionStore = new Map();

  // Mock Detection Mongoose methods for unit/integration isolation
  const origFindOne = Detection.findOne;
  const origFindOneAndUpdate = Detection.findOneAndUpdate;
  const origUpdateOne = Detection.updateOne;
  const origSave = Detection.prototype.save;

  Detection.findOne = async (query) => {
    for (const doc of detectionStore.values()) {
      let match = true;
      if (query._id && doc._id.toString() !== query._id.toString()) match = false;
      if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
      if (match) return doc;
    }
    return null;
  };

  Detection.findOneAndUpdate = async (query, update, options) => {
    for (const doc of detectionStore.values()) {
      let match = true;
      if (query._id && doc._id.toString() !== query._id.toString()) match = false;
      if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
      if (query.status && query.status.$in) {
        if (!query.status.$in.includes(doc.status)) match = false;
      } else if (query.status && doc.status !== query.status) {
        match = false;
      }

      if (match) {
        if (update.$set) {
          Object.assign(doc, update.$set);
        }
        return doc;
      }
    }
    return null;
  };

  Detection.updateOne = async (query, update) => {
    for (const doc of detectionStore.values()) {
      if (query._id && doc._id.toString() === query._id.toString()) {
        if (update.$set) Object.assign(doc, update.$set);
        return { modifiedCount: 1 };
      }
    }
    return { modifiedCount: 0 };
  };

  Detection.prototype.save = async function () {
    detectionStore.set(this._id.toString(), this);
    return this;
  };

  try {
    // 1. Start App server
    appServer = http.createServer(app);
    await new Promise((resolve) => {
      appServer.listen(0, '127.0.0.1', () => {
        appPort = appServer.address().port;
        resolve();
      });
    });

    // 2. Start Mock Image Server (serves synthetic image downloads)
    let imageServerDelayMs = 0;
    let imageServerStatus = 200;
    mockImageServer = http.createServer((req, res) => {
      setTimeout(() => {
        if (imageServerStatus !== 200) {
          res.writeHead(imageServerStatus);
          res.end('Image Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': VALID_PNG_BUFFER.length,
        });
        res.end(VALID_PNG_BUFFER);
      }, imageServerDelayMs);
    });

    await new Promise((resolve) => {
      mockImageServer.listen(0, '127.0.0.1', () => {
        mockImagePort = mockImageServer.address().port;
        resolve();
      });
    });

    // 3. Start Mock FastAPI AI Server
    let aiServerDelayMs = 0;
    let aiServerResponseCode = 200;
    let aiServerResponseBody = null;
    let lastAiReceivedHeaders = null;

    mockAiServer = http.createServer((req, res) => {
      lastAiReceivedHeaders = req.headers;
      let bodyData = [];
      req.on('data', (chunk) => bodyData.push(chunk));
      req.on('end', () => {
        const fullBody = Buffer.concat(bodyData).toString();

        setTimeout(() => {
          if (aiServerResponseCode !== 200) {
            res.writeHead(aiServerResponseCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: 'AI Server Error' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (aiServerResponseBody) {
            res.end(JSON.stringify(aiServerResponseBody));
          } else {
            // Default canonical response for Tomato
            const isPotato = fullBody.includes('Potato');
            const isWheat = fullBody.includes('Wheat');
            const isUnknown = fullBody.includes('DragonFruit');

            let pred = {
              type: 'disease',
              name: 'Early Blight',
              confidence: 0.91,
              severity: { level: 'moderate', score: 62 },
            };

            if (isPotato) {
              pred = {
                type: 'disease',
                name: 'Late Blight',
                confidence: 0.88,
                severity: { level: 'high', score: 78 },
              };
            } else if (isWheat) {
              pred = {
                type: 'disease',
                name: 'Leaf Rust',
                confidence: 0.85,
                severity: { level: 'low', score: 30 },
              };
            } else if (isUnknown) {
              pred = {
                type: 'unknown',
                name: null,
                confidence: 0.42,
                severity: null,
              };
            }

            res.end(
              JSON.stringify({
                success: true,
                prediction: pred,
                model: {
                  name: 'mock-crop-health-model',
                  version: '0.1.0',
                },
              })
            );
          }
        }, aiServerDelayMs);
      });
    });

    await new Promise((resolve) => {
      mockAiServer.listen(0, '127.0.0.1', () => {
        mockAiPort = mockAiServer.address().port;
        resolve();
      });
    });

    // Configure AI_SERVICE_URL dynamically to point to our test AI server
    process.env.AI_SERVICE_URL = `http://127.0.0.1:${mockAiPort}`;

    const validImageUrl = `http://127.0.0.1:${mockImagePort}/sample_leaf.png`;

    // Helper to create in-memory detection
    function seedDetection(idStr, userIdStr, status = 'CREATED', crop = 'Tomato') {
      const doc = new Detection({
        _id: new mongoose.Types.ObjectId(idStr),
        userId: new mongoose.Types.ObjectId(userIdStr),
        fieldId: new mongoose.Types.ObjectId(fieldAId),
        image: {
          url: validImageUrl,
          storageKey: 'crop-health/detections/test_1',
          uploadedAt: new Date(),
        },
        crop,
        growthStage: 'flowering',
        symptoms: ['yellowing on lower leaves'],
        prediction: null,
        severity: null,
        status,
        location: { type: 'Point', coordinates: [83.37, 26.76] },
        weatherSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      detectionStore.set(idStr, doc);
      return doc;
    }

    // -------------------------------------------------------------------------
    // Test 1 — Unauthenticated analyze request rejected (401)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 1: Unauthenticated analyze request rejected (401)';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, farmerAId);

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {});
      if (res.status === 401 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 401, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 2 — Farmer can analyze own Detection (200) -> ACTIONABLE
    // -------------------------------------------------------------------------
    const detAId = new mongoose.Types.ObjectId().toString();
    {
      const name = 'Test 2: Authenticated farmer analyzes own Detection (200) -> ACTIONABLE';
      seedDetection(detAId, farmerAId, 'CREATED', 'Tomato');

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detAId}/analyze`, {}, tokenA);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data &&
        res.body.data.detection &&
        res.body.data.detection.status === 'ACTIONABLE'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 ACTIONABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 3 — Another farmer cannot analyze it (404)
    // -------------------------------------------------------------------------
    {
      const name = "Test 3: Another farmer cannot analyze unowned Detection (404)";
      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detAId}/analyze`, {}, tokenB);
      if (res.status === 404 && res.body.success === false) {
        pass(name);
      } else {
        fail(name, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 4 — Prediction and Severity are correctly mapped and persisted
    // -------------------------------------------------------------------------
    {
      const name = 'Test 4: Prediction & Severity mapped to Detection fields';
      const doc = detectionStore.get(detAId);
      if (
        doc &&
        doc.prediction &&
        doc.prediction.type === 'disease' &&
        doc.prediction.name === 'Early Blight' &&
        doc.prediction.confidence === 0.91 &&
        doc.prediction.modelName === 'mock-crop-health-model' &&
        doc.prediction.modelVersion === '0.1.0' &&
        doc.severity &&
        doc.severity.level === 'moderate' &&
        doc.severity.score === 62
      ) {
        pass(name);
      } else {
        fail(name, `Detection fields unexpected: ${JSON.stringify(doc)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 5 — Confidence remains strictly bounded within [0, 1]
    // -------------------------------------------------------------------------
    {
      const name = 'Test 5: Prediction confidence is between 0 and 1';
      const doc = detectionStore.get(detAId);
      if (doc && doc.prediction && typeof doc.prediction.confidence === 'number' && doc.prediction.confidence >= 0 && doc.prediction.confidence <= 1) {
        pass(name);
      } else {
        fail(name, `Confidence out of bounds: ${doc && doc.prediction && doc.prediction.confidence}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 6 — Status persisted as AI_ANALYZING before AI call finishes
    // -------------------------------------------------------------------------
    {
      const name = 'Test 6: AI_ANALYZING status persisted before AI call finishes';
      const detDelayId = new mongoose.Types.ObjectId().toString();
      seedDetection(detDelayId, farmerAId, 'CREATED', 'Potato');

      aiServerDelayMs = 200; // Delay AI response by 200ms

      const analyzePromise = jsonRequest(appPort, 'POST', `/api/detections/${detDelayId}/analyze`, {}, tokenA);

      // Check status in DB after 50ms (while AI is still computing)
      await new Promise((r) => setTimeout(r, 50));
      const midDoc = detectionStore.get(detDelayId);
      const intermediateStatus = midDoc ? midDoc.status : null;

      const res = await analyzePromise;
      aiServerDelayMs = 0;

      if (intermediateStatus === 'AI_ANALYZING' && res.status === 200 && res.body.data.detection.status === 'ACTIONABLE') {
        pass(name);
      } else {
        fail(name, `Intermediate status was '${intermediateStatus}', expected 'AI_ANALYZING'`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 7 — Concurrent requests: Only ONE request claims analysis, second gets 409
    // -------------------------------------------------------------------------
    {
      const name = 'Test 7: Concurrent requests claim prevention (atomic claim returns 409 for second)';
      const detRaceId = new mongoose.Types.ObjectId().toString();
      seedDetection(detRaceId, farmerAId, 'CREATED', 'Wheat');

      aiServerDelayMs = 250; // Give time for race condition check

      const req1 = jsonRequest(appPort, 'POST', `/api/detections/${detRaceId}/analyze`, {}, tokenA);
      const req2 = jsonRequest(appPort, 'POST', `/api/detections/${detRaceId}/analyze`, {}, tokenA);

      const [res1, res2] = await Promise.all([req1, req2]);
      aiServerDelayMs = 0;

      const statuses = [res1.status, res2.status].sort();
      if (statuses[0] === 200 && statuses[1] === 409) {
        pass(name);
      } else {
        fail(name, `Expected [200, 409], got [${res1.status}, ${res2.status}]`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 8 — Re-analysis of already analyzed detection rejected with 409
    // -------------------------------------------------------------------------
    {
      const name = 'Test 8: Re-analysis of already analyzed detection rejected (409)';
      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detAId}/analyze`, {}, tokenA);
      if (res.status === 409 && res.body.error.code === 'DETECTION_ALREADY_ANALYZED') {
        pass(name);
      } else {
        fail(name, `Expected 409 DETECTION_ALREADY_ANALYZED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 9 — Missing/Unset AI_SERVICE_URL fails with 503 and sets AI_FAILED
    // -------------------------------------------------------------------------
    {
      const name = 'Test 9: Missing AI_SERVICE_URL fails with 503 and marks AI_FAILED';
      const detMissingUrlId = new mongoose.Types.ObjectId().toString();
      seedDetection(detMissingUrlId, farmerAId, 'CREATED');

      const origUrl = process.env.AI_SERVICE_URL;
      delete process.env.AI_SERVICE_URL;

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detMissingUrlId}/analyze`, {}, tokenA);
      process.env.AI_SERVICE_URL = origUrl;

      const doc = detectionStore.get(detMissingUrlId);
      if (res.status === 503 && doc && doc.status === 'AI_FAILED' && doc.prediction === null) {
        pass(name);
      } else {
        fail(name, `Expected 503 with AI_FAILED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 10 — AI Service unavailable (bad port) marks AI_FAILED and returns 502
    // -------------------------------------------------------------------------
    {
      const name = 'Test 10: AI Service unavailable marks AI_FAILED and returns 502';
      const detBadPortId = new mongoose.Types.ObjectId().toString();
      seedDetection(detBadPortId, farmerAId, 'CREATED');

      const origUrl = process.env.AI_SERVICE_URL;
      process.env.AI_SERVICE_URL = 'http://127.0.0.1:59999'; // Non-existent port

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detBadPortId}/analyze`, {}, tokenA);
      process.env.AI_SERVICE_URL = origUrl;

      const doc = detectionStore.get(detBadPortId);
      if (res.status === 502 && doc && doc.status === 'AI_FAILED' && doc.prediction === null) {
        pass(name);
      } else {
        fail(name, `Expected 502 with AI_FAILED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 11 — Image download failure (404) marks AI_FAILED and returns 502
    // -------------------------------------------------------------------------
    {
      const name = 'Test 11: Image download failure marks AI_FAILED and returns 502';
      const detBadImgId = new mongoose.Types.ObjectId().toString();
      const doc = seedDetection(detBadImgId, farmerAId, 'CREATED');
      doc.image.url = `http://127.0.0.1:${mockImagePort}/non_existent_leaf.png`;

      imageServerStatus = 404;
      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detBadImgId}/analyze`, {}, tokenA);
      imageServerStatus = 200;

      const updatedDoc = detectionStore.get(detBadImgId);
      if (res.status === 502 && updatedDoc && updatedDoc.status === 'AI_FAILED') {
        pass(name);
      } else {
        fail(name, `Expected 502 with AI_FAILED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 12 — Invalid AI response schema marks AI_FAILED and returns 502
    // -------------------------------------------------------------------------
    {
      const name = 'Test 12: Invalid AI response schema marks AI_FAILED and returns 502';
      const detMalformedId = new mongoose.Types.ObjectId().toString();
      seedDetection(detMalformedId, farmerAId, 'CREATED');

      aiServerResponseBody = { success: true, prediction: { type: 'invalid_type', confidence: 'not-a-number' } };
      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detMalformedId}/analyze`, {}, tokenA);
      aiServerResponseBody = null;

      const doc = detectionStore.get(detMalformedId);
      if (res.status === 502 && doc && doc.status === 'AI_FAILED' && doc.prediction === null) {
        pass(name);
      } else {
        fail(name, `Expected 502 with AI_FAILED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 13 — Re-analysis of AI_FAILED detection is permitted and succeeds -> ACTIONABLE
    // -------------------------------------------------------------------------
    {
      const name = 'Test 13: Re-analysis of AI_FAILED detection succeeds -> ACTIONABLE';
      const detRetryId = new mongoose.Types.ObjectId().toString();
      seedDetection(detRetryId, farmerAId, 'AI_FAILED', 'Tomato');

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detRetryId}/analyze`, {}, tokenA);
      const doc = detectionStore.get(detRetryId);
      if (res.status === 200 && doc && doc.status === 'ACTIONABLE' && doc.prediction !== null) {
        pass(name);
      } else {
        fail(name, `Expected retry to succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 14 — GET /api/detections/:id returns completed analysis results
    // -------------------------------------------------------------------------
    {
      const name = 'Test 14: GET /api/detections/:id returns completed AI results';
      const res = await jsonRequest(appPort, 'GET', `/api/detections/${detAId}`, null, tokenA);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.status === 'ACTIONABLE' &&
        res.body.data.detection.prediction.name === 'Early Blight' &&
        res.body.data.detection.severity.level === 'moderate'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with AI results, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 15 — GET /api/health still works
    // -------------------------------------------------------------------------
    {
      const name = 'Test 15: GET /api/health returns 200';
      const res = await jsonRequest(appPort, 'GET', '/api/health');
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
    Detection.findOne = origFindOne;
    Detection.findOneAndUpdate = origFindOneAndUpdate;
    Detection.updateOne = origUpdateOne;
    Detection.prototype.save = origSave;

    if (appServer) await new Promise((r) => appServer.close(r));
    if (mockAiServer) await new Promise((r) => mockAiServer.close(r));
    if (mockImageServer) await new Promise((r) => mockImageServer.close(r));

    console.log('\n========================================');
    console.log(` Results: ${passed}/${passed + failed} passed, ${failed} failed`);
    console.log('========================================\n');

    if (failed > 0) process.exit(1);
  }
}

runAnalyzeTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
