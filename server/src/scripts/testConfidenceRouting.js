/**
 * testConfidenceRouting.js
 *
 * Comprehensive unit and integration tests for confidence-based post-analysis routing.
 *
 * Exercises:
 *  1. Low confidence (< 0.60) -> EXPERT_REVIEW_REQUIRED (LOW_CONFIDENCE)
 *  2. Exact lower boundary (0.60) -> EXPERT_REVIEW_REQUIRED (MEDIUM_CONFIDENCE)
 *  3. Medium confidence (0.75) -> EXPERT_REVIEW_REQUIRED (MEDIUM_CONFIDENCE)
 *  4. Exact high boundary (0.85) -> ACTIONABLE (HIGH_CONFIDENCE)
 *  5. High confidence (> 0.85) -> ACTIONABLE (HIGH_CONFIDENCE)
 *  6. Unknown prediction with high score (0.95) -> EXPERT_REVIEW_REQUIRED (UNKNOWN_PREDICTION)
 *  7. Unknown prediction with low score (0.42) -> EXPERT_REVIEW_REQUIRED (UNKNOWN_PREDICTION)
 *  8. Healthy prediction with high score (0.95) -> ACTIONABLE
 *  9. Healthy prediction with low score (0.50) -> EXPERT_REVIEW_REQUIRED
 *  10. Pest prediction with high score (0.89) -> ACTIONABLE
 *  11. Pest prediction with low score (0.40) -> EXPERT_REVIEW_REQUIRED
 *  12. Severity presence does not alter confidence routing decision
 *  13. Centralized thresholds are immutable
 *  14. Never transitions to CONFIRMED or CORRECTED
 *  15. Controller integration: High-confidence analysis finishes at ACTIONABLE
 *  16. Controller integration: Unknown analysis finishes at EXPERT_REVIEW_REQUIRED
 *  17. Controller integration: AI_RESULT_AVAILABLE is persisted before routing step completes
 *  18. Controller integration: Routing error keeps AI_RESULT_AVAILABLE without setting AI_FAILED
 *  19. Controller integration: Upstream AI failure sets AI_FAILED and clears prediction/severity
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { User } = require('../models/User');
const { generateToken } = require('../services/authService');
const {
  CONFIDENCE_THRESHOLDS,
  ROUTING_REASONS,
  getConfidenceBand,
  evaluateConfidenceRouting,
} = require('../services/confidenceRoutingService');
const confidenceRoutingService = require('../services/confidenceRoutingService');
const aiService = require('../services/aiService');
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

async function runTests() {
  console.log('\n========================================');
  console.log(' Confidence-Based Routing Tests');
  console.log('========================================\n');

  // =========================================================================
  // Section 1: Pure Unit Tests on confidenceRoutingService
  // =========================================================================
  console.log('--- Unit Tests: Routing Logic ---');

  // 1. Low confidence (< 0.60)
  {
    const name = '1. Low confidence (< 0.60) routes to EXPERT_REVIEW_REQUIRED (LOW_CONFIDENCE)';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Early Blight',
      confidence: 0.45,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.confidenceBand === 'low' &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.LOW_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 2. Exact lower boundary (0.60)
  {
    const name = '2. Exact lower boundary (0.60) routes to EXPERT_REVIEW_REQUIRED (MEDIUM_CONFIDENCE)';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Early Blight',
      confidence: 0.60,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.confidenceBand === 'medium' &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.MEDIUM_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 3. Medium confidence (0.75)
  {
    const name = '3. Medium confidence (0.75) routes to EXPERT_REVIEW_REQUIRED (MEDIUM_CONFIDENCE)';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Late Blight',
      confidence: 0.75,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.confidenceBand === 'medium' &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.MEDIUM_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 4. Exact high boundary (0.85)
  {
    const name = '4. Exact high boundary (0.85) routes to ACTIONABLE (HIGH_CONFIDENCE)';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Early Blight',
      confidence: 0.85,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.ACTIONABLE &&
      res.confidenceBand === 'high' &&
      res.requiresExpertReview === false &&
      res.reason === ROUTING_REASONS.HIGH_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 5. High confidence (> 0.85)
  {
    const name = '5. High confidence (0.91) routes to ACTIONABLE (HIGH_CONFIDENCE)';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Early Blight',
      confidence: 0.91,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.ACTIONABLE &&
      res.confidenceBand === 'high' &&
      res.requiresExpertReview === false &&
      res.reason === ROUTING_REASONS.HIGH_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 6. Unknown prediction with high numerical score (0.95)
  {
    const name = '6. Unknown prediction (type="unknown", conf=0.95) unconditionally routes to EXPERT_REVIEW_REQUIRED';
    const res = evaluateConfidenceRouting({
      type: 'unknown',
      name: null,
      confidence: 0.95,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.UNKNOWN_PREDICTION
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 7. Unknown prediction with low numerical score (0.42)
  {
    const name = '7. Unknown prediction (type="unknown", conf=0.42) routes to EXPERT_REVIEW_REQUIRED';
    const res = evaluateConfidenceRouting({
      type: 'unknown',
      name: null,
      confidence: 0.42,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.UNKNOWN_PREDICTION
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 8. Healthy prediction with high score (0.95)
  {
    const name = '8. Healthy prediction (type="healthy", conf=0.95) routes to ACTIONABLE';
    const res = evaluateConfidenceRouting({
      type: 'healthy',
      name: 'Healthy',
      confidence: 0.95,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.ACTIONABLE &&
      res.requiresExpertReview === false &&
      res.reason === ROUTING_REASONS.HIGH_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 9. Healthy prediction with low score (0.50)
  {
    const name = '9. Healthy prediction (type="healthy", conf=0.50) routes to EXPERT_REVIEW_REQUIRED';
    const res = evaluateConfidenceRouting({
      type: 'healthy',
      name: 'Healthy',
      confidence: 0.50,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.LOW_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 10. Pest prediction with high score (0.89)
  {
    const name = '10. Pest prediction (type="pest", conf=0.89) routes to ACTIONABLE';
    const res = evaluateConfidenceRouting({
      type: 'pest',
      name: 'Aphids',
      confidence: 0.89,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.ACTIONABLE &&
      res.requiresExpertReview === false &&
      res.reason === ROUTING_REASONS.HIGH_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 11. Pest prediction with low score (0.40)
  {
    const name = '11. Pest prediction (type="pest", conf=0.40) routes to EXPERT_REVIEW_REQUIRED';
    const res = evaluateConfidenceRouting({
      type: 'pest',
      name: 'Aphids',
      confidence: 0.40,
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.LOW_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 12. Severity presence does not alter confidence routing decision
  {
    const name = '12. Critical severity with low confidence (0.45) still routes to EXPERT_REVIEW_REQUIRED';
    const res = evaluateConfidenceRouting({
      type: 'disease',
      name: 'Late Blight',
      confidence: 0.45,
      severity: { level: 'critical', score: 95 },
    });
    if (
      res.nextStatus === DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED &&
      res.requiresExpertReview === true &&
      res.reason === ROUTING_REASONS.LOW_CONFIDENCE
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected: ${JSON.stringify(res)}`);
    }
  }

  // 13. Centralized thresholds are immutable
  {
    const name = '13. CONFIDENCE_THRESHOLDS object is frozen/immutable';
    const isFrozen = Object.isFrozen(CONFIDENCE_THRESHOLDS);
    if (isFrozen && CONFIDENCE_THRESHOLDS.LOW_MAX === 0.60 && CONFIDENCE_THRESHOLDS.HIGH_MIN === 0.85) {
      pass(name);
    } else {
      fail(name, `CONFIDENCE_THRESHOLDS not frozen or has wrong values`);
    }
  }

  // 14. Never transitions to CONFIRMED or CORRECTED
  {
    const name = '14. Routing decisions never output CONFIRMED or CORRECTED';
    const testCases = [
      { type: 'disease', confidence: 0.99 },
      { type: 'healthy', confidence: 1.0 },
      { type: 'pest', confidence: 0.95 },
      { type: 'disease', confidence: 0.1 },
    ];
    const results = testCases.map(evaluateConfidenceRouting);
    const forbidden = results.some(
      (r) => r.nextStatus === DETECTION_STATUSES.CONFIRMED || r.nextStatus === DETECTION_STATUSES.CORRECTED
    );
    if (!forbidden) {
      pass(name);
    } else {
      fail(name, `Found forbidden status transition in: ${JSON.stringify(results)}`);
    }
  }

  // =========================================================================
  // Section 2: Controller & Two-Phase Lifecycle Integration Tests
  // =========================================================================
  console.log('\n--- Integration Tests: Controller & Lifecycle Transitions ---');

  let appServer;
  let appPort;
  let mockAiServer;
  let mockAiPort;
  let mockImageServer;
  let mockImagePort;

  const farmerAId = new mongoose.Types.ObjectId().toString();
  const fieldAId = new mongoose.Types.ObjectId().toString();

  const mockUserA = {
    _id: new mongoose.Types.ObjectId(farmerAId),
    name: 'Farmer A',
    email: 'farmer.a@test.invalid',
    role: 'farmer',
    language: 'en',
    isActive: true,
  };

  const tokenA = generateToken(mockUserA);

  const origUserFindById = User.findById;
  User.findById = function (id) {
    return {
      select: async () => (id.toString() === farmerAId ? mockUserA : null),
    };
  };

  const detectionStore = new Map();
  const savedStatusHistory = new Map(); // Track status changes saved to detection

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

  Detection.findOneAndUpdate = async (query, update) => {
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
          const history = savedStatusHistory.get(doc._id.toString()) || [];
          history.push(update.$set.status || doc.status);
          savedStatusHistory.set(doc._id.toString(), history);
        }
        return doc;
      }
    }
    return null;
  };

  Detection.updateOne = async (query, update) => {
    for (const doc of detectionStore.values()) {
      if (query._id && doc._id.toString() === query._id.toString()) {
        if (update.$set) {
          Object.assign(doc, update.$set);
          const history = savedStatusHistory.get(doc._id.toString()) || [];
          history.push(update.$set.status || doc.status);
          savedStatusHistory.set(doc._id.toString(), history);
        }
        return { modifiedCount: 1 };
      }
    }
    return { modifiedCount: 0 };
  };

  Detection.prototype.save = async function () {
    detectionStore.set(this._id.toString(), this);
    const history = savedStatusHistory.get(this._id.toString()) || [];
    history.push(this.status);
    savedStatusHistory.set(this._id.toString(), history);
    return this;
  };

  try {
    // 1. App server
    appServer = http.createServer(app);
    await new Promise((resolve) => {
      appServer.listen(0, '127.0.0.1', () => {
        appPort = appServer.address().port;
        resolve();
      });
    });

    // 2. Mock Image Server
    mockImageServer = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': VALID_PNG_BUFFER.length,
      });
      res.end(VALID_PNG_BUFFER);
    });

    await new Promise((resolve) => {
      mockImageServer.listen(0, '127.0.0.1', () => {
        mockImagePort = mockImageServer.address().port;
        resolve();
      });
    });

    // 3. Mock AI Server
    let mockAiResponse = null;
    let mockAiStatus = 200;

    mockAiServer = http.createServer((req, res) => {
      let body = [];
      req.on('data', (c) => body.push(c));
      req.on('end', () => {
        if (mockAiStatus !== 200) {
          res.writeHead(mockAiStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'AI Error' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockAiResponse));
      });
    });

    await new Promise((resolve) => {
      mockAiServer.listen(0, '127.0.0.1', () => {
        mockAiPort = mockAiServer.address().port;
        resolve();
      });
    });

    process.env.AI_SERVICE_URL = `http://127.0.0.1:${mockAiPort}`;
    const validImageUrl = `http://127.0.0.1:${mockImagePort}/leaf.png`;

    function seedDetection(idStr, status = 'CREATED', crop = 'Tomato') {
      const doc = new Detection({
        _id: new mongoose.Types.ObjectId(idStr),
        userId: new mongoose.Types.ObjectId(farmerAId),
        fieldId: new mongoose.Types.ObjectId(fieldAId),
        image: {
          url: validImageUrl,
          storageKey: 'crop-health/detections/test_sample',
          uploadedAt: new Date(),
        },
        crop,
        growthStage: 'flowering',
        symptoms: ['yellowing'],
        prediction: null,
        severity: null,
        status,
        location: { type: 'Point', coordinates: [83.37, 26.76] },
        weatherSnapshot: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      detectionStore.set(idStr, doc);
      savedStatusHistory.set(idStr, [status]);
      return doc;
    }

    // -------------------------------------------------------------------------
    // Test 15: Controller integration -> High confidence Tomato analysis finishes at ACTIONABLE
    // -------------------------------------------------------------------------
    {
      const name = '15. Controller integration: High-confidence analysis routes to ACTIONABLE';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, 'CREATED', 'Tomato');

      mockAiResponse = {
        success: true,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.91,
          severity: { level: 'moderate', score: 62 },
        },
        model: { name: 'mock-crop-health-model', version: '0.1.0' },
      };

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {}, tokenA);
      const doc = detectionStore.get(detId);

      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.status === 'ACTIONABLE' &&
        res.body.data.routing.requiresExpertReview === false &&
        doc &&
        doc.status === 'ACTIONABLE' &&
        doc.prediction.name === 'Early Blight' &&
        doc.severity.level === 'moderate'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 ACTIONABLE, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 16: Controller integration -> Unknown analysis finishes at EXPERT_REVIEW_REQUIRED
    // -------------------------------------------------------------------------
    {
      const name = '16. Controller integration: Unknown analysis routes to EXPERT_REVIEW_REQUIRED';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, 'CREATED', 'UnknownCrop');

      mockAiResponse = {
        success: true,
        prediction: {
          type: 'unknown',
          name: null,
          confidence: 0.42,
          severity: null,
        },
        model: { name: 'mock-crop-health-model', version: '0.1.0' },
      };

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {}, tokenA);
      const doc = detectionStore.get(detId);

      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.status === 'EXPERT_REVIEW_REQUIRED' &&
        res.body.data.routing.requiresExpertReview === true &&
        res.body.data.routing.reason === 'UNKNOWN_PREDICTION' &&
        doc &&
        doc.status === 'EXPERT_REVIEW_REQUIRED' &&
        doc.prediction.type === 'unknown'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 EXPERT_REVIEW_REQUIRED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 17: Controller integration -> AI_RESULT_AVAILABLE is persisted BEFORE routing step completes
    // -------------------------------------------------------------------------
    {
      const name = '17. Controller integration: AI_RESULT_AVAILABLE is persisted before routing step completes';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, 'CREATED', 'Tomato');

      mockAiResponse = {
        success: true,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.91,
          severity: { level: 'moderate', score: 62 },
        },
        model: { name: 'mock-crop-health-model', version: '0.1.0' },
      };

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {}, tokenA);
      const history = savedStatusHistory.get(detId) || [];

      // History should sequence: CREATED -> AI_ANALYZING -> AI_RESULT_AVAILABLE -> ACTIONABLE
      const hasAiAnalyzing = history.includes('AI_ANALYZING');
      const hasAiResultAvailable = history.includes('AI_RESULT_AVAILABLE');
      const finalStatus = history[history.length - 1];

      if (hasAiAnalyzing && hasAiResultAvailable && finalStatus === 'ACTIONABLE') {
        pass(name);
      } else {
        fail(name, `Status progression unexpected: ${JSON.stringify(history)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 18: Controller integration -> Routing error preserves AI_RESULT_AVAILABLE (does NOT mark AI_FAILED)
    // -------------------------------------------------------------------------
    {
      const name = '18. Controller integration: Routing error preserves AI_RESULT_AVAILABLE without setting AI_FAILED';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, 'CREATED', 'Tomato');

      mockAiResponse = {
        success: true,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.91,
          severity: { level: 'moderate', score: 62 },
        },
        model: { name: 'mock-crop-health-model', version: '0.1.0' },
      };

      // Stub evaluateConfidenceRouting to simulate unexpected internal routing error
      const origEvaluate = confidenceRoutingService.evaluateConfidenceRouting;
      confidenceRoutingService.evaluateConfidenceRouting = () => {
        throw new Error('Simulated internal routing rule engine crash');
      };

      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {}, tokenA);
      confidenceRoutingService.evaluateConfidenceRouting = origEvaluate;

      const doc = detectionStore.get(detId);

      if (
        res.status === 500 &&
        res.body.error &&
        res.body.error.code === 'CONFIDENCE_ROUTING_FAILED' &&
        doc &&
        doc.status === 'AI_RESULT_AVAILABLE' &&
        doc.prediction !== null &&
        doc.prediction.name === 'Early Blight' &&
        doc.severity !== null
      ) {
        pass(name);
      } else {
        fail(name, `Expected 500 with preserved AI_RESULT_AVAILABLE, got status ${res.status}, doc status: ${doc && doc.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 19: Controller integration -> Upstream AI failure sets AI_FAILED and clears prediction/severity
    // -------------------------------------------------------------------------
    {
      const name = '19. Controller integration: Upstream AI failure sets AI_FAILED and clears prediction/severity';
      const detId = new mongoose.Types.ObjectId().toString();
      seedDetection(detId, 'CREATED', 'Tomato');

      mockAiStatus = 500;
      const res = await jsonRequest(appPort, 'POST', `/api/detections/${detId}/analyze`, {}, tokenA);
      mockAiStatus = 200;

      const doc = detectionStore.get(detId);

      if (
        res.status === 502 &&
        doc &&
        doc.status === 'AI_FAILED' &&
        doc.prediction === null &&
        doc.severity === null
      ) {
        pass(name);
      } else {
        fail(name, `Expected 502 AI_FAILED with null prediction, got ${res.status}: ${JSON.stringify(res.body)}`);
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

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
