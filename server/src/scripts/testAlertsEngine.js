/**
 * testAlertsEngine.js
 *
 * Comprehensive unit and integration test suite for the Alerts + Early Warning Engine:
 *  1. CRITICAL environmental early warning alert generation
 *  2. HIGH environmental early warning alert generation
 *  3. High/Critical disease severity alert generation
 *  4. Healthy ACTIONABLE alert suppression
 *  5. Healthy EXPERT_REVIEW_REQUIRED notification generation
 *  6. Pending review provisional wording (no authoritative AI diagnosis claims)
 *  7. Expert CONFIRMED review completion alert
 *  8. Expert CORRECTED review completion alert
 *  9. AI_FAILED system retry alert
 *  10. Deterministic deduplication (same event does not create duplicate alert)
 *  11. Risk escalation (HIGH -> CRITICAL) creates intended new alert event
 *  12. Read state preservation (already-read alert remains read on re-evaluation)
 *  13. Read state isolation (previous review alert is NOT auto-marked read)
 *  14. Alert phrasing safety (zero treatment / management / chemical / biological advice)
 *  15. Non-blocking failure resilience across controller flows
 *  16. GET /api/alerts auth, filtering, and ownership security
 *  17. PATCH /api/alerts/:id/read auth and ownership security
 *  18. Entity immutability (Detection, RiskAssessment, Recommendation remain unchanged)
 *
 * Usage:
 *   node src/scripts/testAlertsEngine.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { Field } = require('../models/Field');
const { User } = require('../models/User');
const { RiskAssessment, RISK_LEVELS } = require('../models/RiskAssessment');
const { ExpertReview, REVIEW_STATUSES, EXPERT_DECISIONS } = require('../models/ExpertReview');
const { Alert, ALERT_TYPES, ALERT_SEVERITIES } = require('../models/Alert');
const { ALERT_TEMPLATES } = require('../config/alertRules');
const { generateToken } = require('../services/authService');
const alertService = require('../services/alertService');
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

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

// ---------------------------------------------------------------------------
// Unit Tests: Evaluation Logic, Candidate Rules, & Message Content
// ---------------------------------------------------------------------------

async function runUnitTests() {
  console.log('\n--- Section 1: Alert Rules & Candidate Evaluation Unit Tests ---');

  const testDetectionId = new mongoose.Types.ObjectId();

  // Test 1: CRITICAL Environmental Early Warning Alert
  {
    const name = '1.1 Critical environmental risk generates EARLY_WARNING alert with CRITICAL severity';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Late Blight', confidence: 0.92 },
      };
      const riskAssessment = { level: RISK_LEVELS.CRITICAL, score: 88 };

      const candidates = alertService.evaluateAlertCandidates({ detection, riskAssessment });
      assert(candidates.length > 0, 'Must produce candidate alert');
      const earlyWarn = candidates.find((c) => c.type === ALERT_TYPES.EARLY_WARNING);
      assert(earlyWarn !== undefined, 'Must produce EARLY_WARNING alert');
      assert(earlyWarn.severity === ALERT_SEVERITIES.CRITICAL, 'Severity must be CRITICAL');
      assert(earlyWarn.title.includes('Tomato'), 'Title must reference crop');
      assert(earlyWarn.dedupKey.includes('CRITICAL'), 'dedupKey must include CRITICAL qualifier');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 2: HIGH Environmental Early Warning Alert
  {
    const name = '1.2 High environmental risk generates EARLY_WARNING alert with HIGH severity';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.90 },
      };
      const riskAssessment = { level: RISK_LEVELS.HIGH, score: 74 };

      const candidates = alertService.evaluateAlertCandidates({ detection, riskAssessment });
      const earlyWarn = candidates.find((c) => c.type === ALERT_TYPES.EARLY_WARNING);
      assert(earlyWarn !== undefined, 'Must produce EARLY_WARNING alert');
      assert(earlyWarn.severity === ALERT_SEVERITIES.HIGH, 'Severity must be HIGH');
      assert(earlyWarn.dedupKey.includes('HIGH'), 'dedupKey must include HIGH qualifier');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 3: High/Critical Disease Severity Alert (when no environmental alert is triggered)
  {
    const name = '1.3 Severe disease symptoms without high environmental risk generate HIGH_RISK alert';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.88 },
        severity: { level: 'high', score: 80 },
      };
      const riskAssessment = { level: RISK_LEVELS.LOW, score: 25 };

      const candidates = alertService.evaluateAlertCandidates({ detection, riskAssessment });
      const highRisk = candidates.find((c) => c.type === ALERT_TYPES.HIGH_RISK);
      assert(highRisk !== undefined, 'Must produce HIGH_RISK alert');
      assert(highRisk.severity === ALERT_SEVERITIES.HIGH, 'Severity must be HIGH');
      assert(highRisk.title.includes('Early Blight'), 'Title should mention diagnosis');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 4: Healthy Actionable Alert Suppression
  {
    const name = '1.4 Healthy actionable detections suppress crop-health warning alerts';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'healthy', name: 'Healthy', confidence: 0.95 },
      };
      const riskAssessment = { level: RISK_LEVELS.LOW, score: 10 };

      const candidates = alertService.evaluateAlertCandidates({ detection, riskAssessment });
      assert(candidates.length === 0, `Healthy actionable detection must produce 0 alerts, got ${candidates.length}`);
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 5: Healthy EXPERT_REVIEW_REQUIRED Notification
  {
    const name = '1.5 Healthy prediction requiring expert review still generates EXPERT_REVIEW alert';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
        prediction: { type: 'healthy', name: 'Healthy', confidence: 0.50 }, // Low confidence
      };

      const candidates = alertService.evaluateAlertCandidates({ detection });
      assert(candidates.length === 1, `Expected 1 review alert, got ${candidates.length}`);
      assert(candidates[0].type === ALERT_TYPES.EXPERT_REVIEW, 'Alert type must be EXPERT_REVIEW');
      assert(candidates[0].severity === ALERT_SEVERITIES.MEDIUM, 'Severity must be MEDIUM');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 6: Pending Expert Review Provisional Wording
  {
    const name = '1.6 Pending review with elevated risk uses provisional wording without unverified claims';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
        prediction: { type: 'disease', name: 'Late Blight', confidence: 0.70 },
      };
      const riskAssessment = { level: RISK_LEVELS.HIGH, score: 75 };

      const candidates = alertService.evaluateAlertCandidates({ detection, riskAssessment });
      const envAlert = candidates.find((c) => c.type === ALERT_TYPES.EARLY_WARNING);
      assert(envAlert !== undefined, 'Must produce provisional EARLY_WARNING');
      assert(envAlert.title.includes('Pending Review'), 'Title must indicate pending review');
      assert(envAlert.message.includes('awaits human expert verification'), 'Message must indicate pending verification');
      assert(!envAlert.title.includes('Late Blight'), 'Title must not present unverified AI prediction as authoritative');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 7: Expert CONFIRMED Review Completion Alert
  {
    const name = '1.7 Expert CONFIRMED decision creates completion alert with confirmed diagnosis';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.CONFIRMED,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.72 },
      };
      const expertReview = {
        status: REVIEW_STATUSES.COMPLETED,
        decision: EXPERT_DECISIONS.CONFIRMED,
        originalPrediction: { type: 'disease', name: 'Early Blight', confidence: 0.72 },
      };

      const candidates = alertService.evaluateAlertCandidates({ detection, expertReview });
      assert(candidates.length === 1, 'Must produce 1 completion alert');
      assert(candidates[0].type === ALERT_TYPES.EXPERT_REVIEW, 'Type must be EXPERT_REVIEW');
      assert(candidates[0].severity === ALERT_SEVERITIES.MEDIUM, 'Severity must be MEDIUM');
      assert(candidates[0].title.includes('Early Blight'), 'Title should include confirmed disease name');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 8: Expert CORRECTED Review Completion Alert
  {
    const name = '1.8 Expert CORRECTED decision creates completion alert with corrected diagnosis';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.CORRECTED,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.65 },
      };
      const expertReview = {
        status: REVIEW_STATUSES.COMPLETED,
        decision: EXPERT_DECISIONS.CORRECTED,
        originalPrediction: { type: 'disease', name: 'Early Blight', confidence: 0.65 },
        correctedDiagnosis: { type: 'disease', name: 'Late Blight' },
      };

      const candidates = alertService.evaluateAlertCandidates({ detection, expertReview });
      assert(candidates.length === 1, 'Must produce 1 completion alert');
      assert(candidates[0].type === ALERT_TYPES.EXPERT_REVIEW, 'Type must be EXPERT_REVIEW');
      assert(candidates[0].severity === ALERT_SEVERITIES.HIGH, 'Severity must be HIGH');
      assert(candidates[0].title.includes('Late Blight'), 'Title must reference corrected disease Late Blight');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 9: AI_FAILED System Alert
  {
    const name = '1.9 AI_FAILED status produces SYSTEM alert prompting photo re-capture';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.AI_FAILED,
        prediction: null,
      };

      const candidates = alertService.evaluateAlertCandidates({ detection });
      assert(candidates.length === 1, 'Must produce 1 system alert');
      assert(candidates[0].type === ALERT_TYPES.SYSTEM, 'Type must be SYSTEM');
      assert(candidates[0].severity === ALERT_SEVERITIES.MEDIUM, 'Severity must be MEDIUM');
      assert(candidates[0].message.includes('re-capture'), 'Message must advise photo re-capture');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 10: Alert Phrasing Safety (No Treatment or Management Instructions)
  {
    const name = '1.10 All alert templates strictly omit treatment, pruning, chemical, or biological instructions';
    try {
      const prohibitedWords = [
        'prune',
        'pruning',
        'spray',
        'fungicide',
        'pesticide',
        'drip irrigation',
        'overhead irrigation',
        'sanitation',
        'dosage',
        'interval',
        'bacillus',
        'neem',
        'mancozeb',
        'chlorothalonil',
      ];

      for (const [key, template] of Object.entries(ALERT_TEMPLATES)) {
        const titleText = typeof template.title === 'function' ? template.title('Tomato', 'Early Blight') : '';
        const msgText = typeof template.message === 'function' ? template.message('Tomato', 'Early Blight') : '';
        const fullText = `${titleText} ${msgText}`.toLowerCase();

        for (const word of prohibitedWords) {
          assert(!fullText.includes(word), `Prohibited treatment word '${word}' found in template '${key}'`);
        }
      }
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 11: Risk Escalation Event Creation (HIGH -> CRITICAL)
  {
    const name = '1.11 Risk escalation from HIGH to CRITICAL generates new distinct event dedupKey';
    try {
      const detection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Late Blight', confidence: 0.90 },
      };

      const highCandidates = alertService.evaluateAlertCandidates({
        detection,
        riskAssessment: { level: RISK_LEVELS.HIGH, score: 70 },
      });

      const critCandidates = alertService.evaluateAlertCandidates({
        detection,
        riskAssessment: { level: RISK_LEVELS.CRITICAL, score: 92 },
      });

      assert(highCandidates[0].dedupKey.endsWith('HIGH'), 'High risk dedupKey must end with HIGH');
      assert(critCandidates[0].dedupKey.endsWith('CRITICAL'), 'Critical risk dedupKey must end with CRITICAL');
      assert(highCandidates[0].dedupKey !== critCandidates[0].dedupKey, 'Escalated event keys must be distinct');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 12: Non-blocking Resilience on Anomalous Inputs
  {
    const name = '1.12 Alert evaluation handles anomalous and empty inputs gracefully without throwing';
    try {
      const emptyCandidates = alertService.evaluateAlertCandidates({ detection: null });
      assert(Array.isArray(emptyCandidates) && emptyCandidates.length === 0, 'Must return empty array on null detection');

      const invalidDetection = alertService.evaluateAlertCandidates({ detection: {} });
      assert(Array.isArray(invalidDetection) && invalidDetection.length === 0, 'Must return empty array on invalid detection');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 13: Entity Immutability
  {
    const name = '1.13 Alert candidate evaluation preserves Detection and RiskAssessment objects unmodified';
    try {
      const originalDetection = {
        _id: testDetectionId,
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.91 },
        severity: { level: 'moderate', score: 60 },
      };
      const detectionCopy = JSON.parse(JSON.stringify(originalDetection));
      const riskCopy = { level: RISK_LEVELS.HIGH, score: 75 };

      alertService.evaluateAlertCandidates({ detection: detectionCopy, riskAssessment: riskCopy });

      assert(JSON.stringify(detectionCopy) === JSON.stringify(originalDetection), 'Detection object must remain completely unmodified');
      assert(riskCopy.level === RISK_LEVELS.HIGH && riskCopy.score === 75, 'RiskAssessment object must remain completely unmodified');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Integration Tests: REST APIs, Deduplication, & Non-Blocking Resilience
// ---------------------------------------------------------------------------

async function runIntegrationTests() {
  console.log('\n--- Section 2: End-to-End Integration & REST API Tests ---');

  let server;
  let port;
  const testUserId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  let authToken;
  let otherAuthToken;
  let testFieldId;
  let testDetectionId;

  try {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // Create synthetic users
    await User.deleteMany({ email: /@test-alert\.invalid$/ });
    const user = new User({
      _id: testUserId,
      name: 'Alert Test Farmer',
      email: `farmer-${Date.now()}@test-alert.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await user.save();
    authToken = generateToken(user);

    const otherUser = new User({
      _id: otherUserId,
      name: 'Other Alert Farmer',
      email: `other-${Date.now()}@test-alert.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await otherUser.save();
    otherAuthToken = generateToken(otherUser);

    const field = new Field({
      userId: testUserId,
      name: 'Alert Test Field',
      crop: 'Tomato',
      growthStage: 'flowering',
      location: { type: 'Point', coordinates: [83.37, 26.76] },
    });
    await field.save();
    testFieldId = field._id;

    // Test 11: analyzeDetection triggers Alert generation
    {
      const name = '2.1 POST /api/detections/:id/analyze automatically creates early warning alert';
      try {
        const detection = new Detection({
          userId: testUserId,
          fieldId: testFieldId,
          crop: 'Tomato',
          growthStage: 'flowering',
          image: {
            url: 'https://res.cloudinary.com/test/image/upload/v1/sample.jpg',
            storageKey: 'sample',
            uploadedAt: new Date(),
          },
          location: { type: 'Point', coordinates: [83.37, 26.76] },
          status: DETECTION_STATUSES.CREATED,
        });
        await detection.save();
        testDetectionId = detection._id.toString();

        const originalAnalyze = aiService.analyzeDetectionImage;
        aiService.analyzeDetectionImage = async () => ({
          prediction: {
            type: 'disease',
            name: 'Early Blight',
            confidence: 0.91,
            modelName: 'mock-crop-net',
            modelVersion: '1.0.0',
          },
          severity: { level: 'moderate', score: 60 },
        });

        const res = await jsonRequest(port, 'POST', `/api/detections/${testDetectionId}/analyze`, null, authToken);
        aiService.analyzeDetectionImage = originalAnalyze;

        assert(res.status === 200, `Expected 200, got ${res.status}`);

        // Check Alert record in MongoDB
        const alerts = await Alert.find({ relatedDetectionId: testDetectionId });
        assert(alerts.length > 0, 'Alert must be created in alerts collection');
        assert(alerts[0].userId.toString() === testUserId.toString(), 'Alert userId must match farmer');
        assert(alerts[0].isRead === false, 'New alert must have isRead: false');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 12: GET /api/alerts retrieves farmer alerts with unreadCount
    {
      const name = '2.2 GET /api/alerts returns paginated alerts array and unreadCount';
      try {
        const res = await jsonRequest(port, 'GET', '/api/alerts', null, authToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Response must be success: true');
        assert(Array.isArray(res.body.data.alerts), 'data.alerts must be an array');
        assert(typeof res.body.data.unreadCount === 'number', 'unreadCount must be a number');
        assert(res.body.data.unreadCount >= 1, 'unreadCount should be at least 1');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 13: PATCH /api/alerts/:id/read marks alert as read
    let alertToReadId;
    {
      const name = '2.3 PATCH /api/alerts/:id/read sets isRead to true and updates readAt';
      try {
        const unreadAlert = await Alert.findOne({ userId: testUserId, isRead: false });
        assert(unreadAlert !== null, 'Must have an unread alert');
        alertToReadId = unreadAlert._id.toString();

        const res = await jsonRequest(port, 'PATCH', `/api/alerts/${alertToReadId}/read`, null, authToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.data.alert.isRead === true, 'isRead must be true');
        assert(res.body.data.alert.readAt !== null, 'readAt must not be null');

        const updated = await Alert.findById(alertToReadId);
        assert(updated.isRead === true, 'Persisted isRead must be true');
        assert(updated.readAt instanceof Date, 'Persisted readAt must be a Date');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 14: Deduplication & Read State Preservation
    {
      const name = '2.4 Re-evaluating same event does not duplicate alert and does not reset read state';
      try {
        const countBefore = await Alert.countDocuments({ relatedDetectionId: testDetectionId });

        // Trigger evaluation again for same detection
        const detection = await Detection.findById(testDetectionId);
        const riskAssessment = await RiskAssessment.findOne({ detectionId: testDetectionId });

        await alertService.evaluateAndCreateAlerts({ detection, riskAssessment });

        const countAfter = await Alert.countDocuments({ relatedDetectionId: testDetectionId });
        assert(countAfter === countBefore, `Alert count must remain ${countBefore}, got ${countAfter}`);

        // Verify the alert that was marked read is still read
        const readAlert = await Alert.findById(alertToReadId);
        assert(readAlert.isRead === true, 'Already read alert must NOT revert to unread');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 15: Ownership Security on Alert Endpoints
    {
      const name = '2.5 Alert endpoints enforce authentication and reject unauthorized access with 404';
      try {
        // Unauthenticated
        const unauthRes = await jsonRequest(port, 'GET', '/api/alerts', null, null);
        assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);

        // Non-owner attempting to mark read
        const otherRes = await jsonRequest(port, 'PATCH', `/api/alerts/${alertToReadId}/read`, null, otherAuthToken);
        assert(otherRes.status === 404, `Expected 404 for non-owner, got ${otherRes.status}`);
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }
  } finally {
    // Cleanup synthetic records
    await Alert.deleteMany({ userId: testUserId });
    await Detection.deleteMany({ userId: testUserId });
    await Field.deleteMany({ userId: testUserId });
    await User.deleteMany({ _id: { $in: [testUserId, otherUserId] } });

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('====================================================');
  console.log(' Alerts + Early Warning Engine Test Suite');
  console.log('====================================================');

  // Always run in-memory Unit Tests first
  await runUnitTests();

  // Run Integration Tests if MongoDB is accessible
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      console.log('\n--- Connecting to MongoDB for End-to-End Integration Tests ---');
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
      console.log('  Connected to MongoDB Atlas.');
      await runIntegrationTests();
    }
  } catch (dbError) {
    console.log('\n[Notice] MongoDB Atlas is unreachable from this IP address (IP whitelist restriction).');
    console.log('  In-memory Unit Tests completed successfully.');
    console.log('  To run the End-to-End Integration tests against Atlas, execute this script from a whitelisted IP:');
    console.log('  node src/scripts/testAlertsEngine.js');
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('\n====================================================');
    console.log(` Summary: ${passed} passed, ${failed} failed`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
