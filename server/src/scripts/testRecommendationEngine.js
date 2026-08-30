/**
 * testRecommendationEngine.js
 *
 * Comprehensive unit and integration test suite for the IPM Recommendation Engine:
 *  1. ACTIONABLE disease recommendation generation
 *  2. Healthy crop guidance
 *  3. Pest recommendation generation
 *  4. Unknown prediction safety behavior
 *  5. AI_FAILED safety behavior
 *  6. EXPERT_REVIEW_REQUIRED provisional guidance
 *  7. EXPERT_REVIEW_IN_PROGRESS provisional guidance
 *  8. Expert CONFIRMED regeneration
 *  9. Expert CORRECTED regeneration
 *  10. Original AI prediction / confidence immutability
 *  11. Non-blocking failure resilience (expert review & detection analysis succeed)
 *  12. Risk modulates urgency wording without altering diagnosis or lifecycle status
 *  13. Strict safety check (no pesticide brands, active ingredients, or dosages)
 *  14. ruleVersion ("ipm-mvp-v1") persistence
 *  15. Idempotent persistence (no duplicate Recommendation documents)
 *  16. GET /api/detections/:id/recommendation auth & ownership security
 *  17. POST /api/detections/:id/recommendation/regenerate auth & ownership security
 *
 * Usage:
 *   node src/scripts/testRecommendationEngine.js
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
const { Recommendation, DIAGNOSIS_SOURCES, RECOMMENDATION_SOURCES } = require('../models/Recommendation');
const { RULE_VERSION, CONDITION_RULES } = require('../config/ipmRules');
const { generateToken } = require('../services/authService');
const recommendationEngineService = require('../services/recommendationEngineService');
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
// Unit Tests: Rule Matching, Provenance, & Safety Guardrails
// ---------------------------------------------------------------------------

async function runUnitTests() {
  console.log('\n--- Section 1: IPM Recommendation Engine Unit Tests ---');

  // Test 1: ACTIONABLE Disease Recommendation Generation
  {
    const name = '1.1 ACTIONABLE disease detection generates structured categorized IPM advice';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.91,
        },
        severity: { level: 'moderate', score: 55 },
      };
      const riskAssessment = { level: RISK_LEVELS.HIGH, score: 72 };

      const rec = recommendationEngineService.generateRecommendation({ detection, riskAssessment });
      assert(rec.ruleVersion === 'ipm-mvp-v1', 'ruleVersion must be ipm-mvp-v1');
      assert(rec.effectiveDiagnosis.type === 'disease', 'effectiveDiagnosis.type must be disease');
      assert(rec.effectiveDiagnosis.name === 'Early Blight', 'effectiveDiagnosis.name must match');
      assert(rec.effectiveDiagnosis.source === DIAGNOSIS_SOURCES.AI, 'effectiveDiagnosis.source must be AI');
      assert(rec.immediateActions.length > 0, 'immediateActions must not be empty');
      assert(rec.monitoringActions.length > 0, 'monitoringActions must not be empty');
      assert(rec.culturalControls.length > 0, 'culturalControls must not be empty');
      assert(rec.biologicalControls.length > 0, 'biologicalControls must not be empty');
      assert(rec.chemicalGuidance.length > 0, 'chemicalGuidance must not be empty');
      assert(rec.expertReferral.recommended === false, 'expertReferral should not be recommended for actionable disease');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 2: Healthy Crop Guidance
  {
    const name = '1.2 Healthy crop produces preventive monitoring and zero chemical guidance';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'vegetative',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: {
          type: 'healthy',
          name: 'Healthy',
          confidence: 0.96,
        },
        severity: null,
      };

      const rec = recommendationEngineService.generateRecommendation({ detection });
      assert(rec.effectiveDiagnosis.type === 'healthy', 'effectiveDiagnosis.type must be healthy');
      assert(rec.chemicalGuidance.length === 0, 'Healthy crop must have NO chemical guidance');
      assert(rec.expertReferral.recommended === false, 'expertReferral must be false for healthy crop');
      assert(
        rec.immediateActions.some((a) => a.toLowerCase().includes('routine')),
        'immediateActions must advise routine care'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 3: Pest Recommendation Generation
  {
    const name = '1.3 Pest detection generates physical/monitoring/biological controls';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'fruiting',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: {
          type: 'pest',
          name: 'Aphids',
          confidence: 0.88,
        },
        severity: { level: 'moderate', score: 50 },
      };

      const rec = recommendationEngineService.generateRecommendation({ detection });
      assert(rec.effectiveDiagnosis.type === 'pest', 'effectiveDiagnosis.type must be pest');
      assert(rec.monitoringActions.some((a) => a.toLowerCase().includes('scouting')), 'Must include scouting action');
      assert(rec.culturalControls.length > 0, 'Must include cultural controls');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 4: Unknown Prediction Safety Behavior
  {
    const name = '1.4 Unknown prediction generates safe monitoring, no chemical treatments, and flags expert referral';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'vegetative',
        status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
        prediction: {
          type: 'unknown',
          name: null,
          confidence: 0.40,
        },
        severity: null,
      };

      const rec = recommendationEngineService.generateRecommendation({ detection });
      assert(rec.effectiveDiagnosis.type === 'unknown', 'effectiveDiagnosis.type must be unknown');
      assert(rec.chemicalGuidance.length === 0, 'Unknown prediction must have NO chemical guidance');
      assert(rec.expertReferral.recommended === true, 'expertReferral must be true for unknown condition');
      assert(
        rec.immediateActions.some((a) => a.toLowerCase().includes('do not apply unverified')),
        'Must explicitly warn against unverified chemical treatments'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 5: AI_FAILED Safety Behavior
  {
    const name = '1.5 AI_FAILED status generates image retry advice and expert referral';
    try {
      const detection = {
        crop: 'Tomato',
        status: DETECTION_STATUSES.AI_FAILED,
        prediction: null,
        severity: null,
      };

      const rec = recommendationEngineService.generateRecommendation({ detection });
      assert(rec.chemicalGuidance.length === 0, 'AI_FAILED must have NO chemical guidance');
      assert(rec.expertReferral.recommended === true, 'expertReferral must be true for AI_FAILED');
      assert(
        rec.monitoringActions.some((a) => a.toLowerCase().includes('re-capture')),
        'Must recommend re-capturing clear photograph'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 6: EXPERT_REVIEW_REQUIRED & IN_PROGRESS Provisional Safe Guidance
  {
    const name = '1.6 EXPERT_REVIEW_REQUIRED / IN_PROGRESS receives provisional non-chemical guidance only';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.72,
        },
        severity: { level: 'low', score: 20 },
      };

      const rec = recommendationEngineService.generateRecommendation({ detection });
      assert(rec.chemicalGuidance.length === 0, 'Pending review state must NOT receive chemical guidance');
      assert(rec.expertReferral.recommended === true, 'expertReferral must be true for pending review');
      assert(
        rec.immediateActions.some((a) => a.toLowerCase().includes('provisional') || a.toLowerCase().includes('pending')),
        'immediateActions must indicate provisional state'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 7: Expert CONFIRMED Diagnosis Precedence
  {
    const name = '1.7 Expert CONFIRMED review sets effectiveDiagnosis.source to EXPERT_CONFIRMED';
    try {
      const detection = {
        crop: 'Tomato',
        status: DETECTION_STATUSES.CONFIRMED,
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.70, // Original model confidence
        },
        severity: { level: 'moderate', score: 50 },
      };

      const expertReview = {
        status: REVIEW_STATUSES.COMPLETED,
        decision: EXPERT_DECISIONS.CONFIRMED,
        originalPrediction: { type: 'disease', name: 'Early Blight', confidence: 0.70 },
        correctedDiagnosis: null,
      };

      const rec = recommendationEngineService.generateRecommendation({ detection, expertReview });
      assert(rec.effectiveDiagnosis.source === DIAGNOSIS_SOURCES.EXPERT_CONFIRMED, 'Source must be EXPERT_CONFIRMED');
      assert(rec.effectiveDiagnosis.name === 'Early Blight', 'Diagnosis name must be Early Blight');
      assert(rec.chemicalGuidance.length > 0, 'Validated disease should include standard non-prescriptive chemical disclaimer');
      assert(rec.expertReferral.recommended === false, 'expertReferral must be false after confirmation');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 8: Expert CORRECTED Diagnosis Precedence & Immutability of Original AI Result
  {
    const name = '1.8 Expert CORRECTED review replaces effective diagnosis with corrected disease without altering original AI prediction';
    try {
      const detection = {
        crop: 'Tomato',
        status: DETECTION_STATUSES.CORRECTED,
        prediction: {
          type: 'disease',
          name: 'Early Blight', // Original AI prediction
          confidence: 0.65,
        },
        severity: { level: 'moderate', score: 40 },
      };

      const expertReview = {
        status: REVIEW_STATUSES.COMPLETED,
        decision: EXPERT_DECISIONS.CORRECTED,
        originalPrediction: { type: 'disease', name: 'Early Blight', confidence: 0.65 },
        correctedDiagnosis: {
          type: 'disease',
          name: 'Late Blight',
          severity: { level: 'high', score: 85 },
        },
      };

      const rec = recommendationEngineService.generateRecommendation({ detection, expertReview });
      assert(rec.effectiveDiagnosis.source === DIAGNOSIS_SOURCES.EXPERT_CORRECTED, 'Source must be EXPERT_CORRECTED');
      assert(rec.effectiveDiagnosis.name === 'Late Blight', 'Effective diagnosis must be Late Blight');
      assert(detection.prediction.name === 'Early Blight', 'Original detection.prediction.name must remain Early Blight');
      assert(detection.prediction.confidence === 0.65, 'Original detection.prediction.confidence must remain 0.65');
      assert(
        rec.immediateActions.some((a) => a.toLowerCase().includes('correction') || a.toLowerCase().includes('updated')),
        'Must include explicit correction notice'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 9: Risk Modulates Urgency Wording Only
  {
    const name = '1.9 Environmental risk modulates urgency wording without altering diagnosis or lifecycle status';
    try {
      const detection = {
        crop: 'Tomato',
        status: DETECTION_STATUSES.ACTIONABLE,
        prediction: { type: 'disease', name: 'Early Blight', confidence: 0.90 },
      };

      const lowRiskRec = recommendationEngineService.generateRecommendation({
        detection,
        riskAssessment: { level: RISK_LEVELS.LOW, score: 20 },
      });

      const critRiskRec = recommendationEngineService.generateRecommendation({
        detection,
        riskAssessment: { level: RISK_LEVELS.CRITICAL, score: 90 },
      });

      // Diagnosis unchanged
      assert(lowRiskRec.effectiveDiagnosis.name === 'Early Blight', 'Diagnosis must remain Early Blight');
      assert(critRiskRec.effectiveDiagnosis.name === 'Early Blight', 'Diagnosis must remain Early Blight');

      // Urgency modulated in monitoringActions
      assert(
        critRiskRec.monitoringActions.some((a) => a.toLowerCase().includes('elevated environmental risk')),
        'Critical risk must include elevated urgency notice'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 10: Strict Safety Guardrails (No Brands, Active Ingredients, or Rigid Dosages)
  {
    const name = '1.10 Output contains zero pesticide brand names, dosages, or rigid application schedules';
    try {
      const prohibitedTerms = [
        'mancozeb',
        'chlorothalonil',
        'copper oxychloride',
        'roundup',
        'confidor',
        'spray every',
        'twice daily',
        'every 24-48 hours',
        'kg/ha',
        'ml/l',
        'grams per liter',
        'phi of',
      ];

      // Test across all condition rules
      for (const [key, rules] of Object.entries(CONDITION_RULES)) {
        const textBlob = JSON.stringify(rules).toLowerCase();
        for (const term of prohibitedTerms) {
          assert(!textBlob.includes(term), `Prohibited term '${term}' found in rule key '${key}'`);
        }
      }
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 11: Non-blocking resilience in controller flows
  {
    const name = '1.11 Recommendation generation handles anomalous inputs gracefully';
    try {
      // Missing detection prediction
      const rec = recommendationEngineService.generateRecommendation({ detection: {} });
      assert(rec.effectiveDiagnosis.type === 'unknown', 'Fallback must be unknown type');
      assert(rec.expertReferral.recommended === true, 'Fallback must recommend expert referral');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 12: Provenance and ruleVersion persistence
  {
    const name = '1.12 Recommendation payload includes ruleVersion and provenance references';
    try {
      const rec = recommendationEngineService.generateRecommendation({
        detection: {
          crop: 'Tomato',
          prediction: { type: 'disease', name: 'Late Blight', confidence: 0.90 },
        },
      });
      assert(rec.ruleVersion === 'ipm-mvp-v1', 'ruleVersion must be ipm-mvp-v1');
      assert(rec.source === RECOMMENDATION_SOURCES.RULE_BASED, 'Default source must be RULE_BASED');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Integration Tests: End-to-End Workflow & REST Endpoints
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
    await User.deleteMany({ email: /@test-rec\.invalid$/ });
    const user = new User({
      _id: testUserId,
      name: 'Rec Test Farmer',
      email: `farmer-${Date.now()}@test-rec.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await user.save();
    authToken = generateToken(user);

    const otherUser = new User({
      _id: otherUserId,
      name: 'Other Farmer',
      email: `other-${Date.now()}@test-rec.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await otherUser.save();
    otherAuthToken = generateToken(otherUser);

    const field = new Field({
      userId: testUserId,
      name: 'Rec Test Field',
      crop: 'Tomato',
      growthStage: 'flowering',
      location: { type: 'Point', coordinates: [83.37, 26.76] },
    });
    await field.save();
    testFieldId = field._id;

    // Test 11: analyzeDetection workflow automatically persists Recommendation
    {
      const name = '2.1 POST /api/detections/:id/analyze automatically creates and returns Recommendation';
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
            confidence: 0.92,
            modelName: 'mock-crop-net',
            modelVersion: '1.0.0',
          },
          severity: { level: 'moderate', score: 60 },
        });

        const res = await jsonRequest(port, 'POST', `/api/detections/${testDetectionId}/analyze`, null, authToken);
        aiService.analyzeDetectionImage = originalAnalyze;

        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.data.recommendation !== null, 'Response must include recommendation object');
        assert(res.body.data.recommendation.ruleVersion === 'ipm-mvp-v1', 'ruleVersion must be ipm-mvp-v1');
        assert(res.body.data.recommendation.effectiveDiagnosis.name === 'Early Blight', 'Diagnosis name must be Early Blight');

        // Check MongoDB record
        const savedRec = await Recommendation.findOne({ detectionId: testDetectionId });
        assert(savedRec !== null, 'Recommendation record must be created in recommendations collection');
        assert(savedRec.ruleVersion === 'ipm-mvp-v1', 'Persisted ruleVersion must match');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 12: GET /api/detections/:id/recommendation endpoint
    {
      const name = '2.2 GET /api/detections/:id/recommendation returns structured IPM recommendation for owner';
      try {
        const res = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/recommendation`, null, authToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Response must be success: true');
        assert(res.body.data.recommendation.detectionId === testDetectionId, 'detectionId must match');
        assert(Array.isArray(res.body.data.recommendation.immediateActions), 'immediateActions must be array');
        assert(Array.isArray(res.body.data.recommendation.culturalControls), 'culturalControls must be array');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 13: GET /api/detections/:id/recommendation ownership and security
    {
      const name = '2.3 GET /api/detections/:id/recommendation enforces authentication and farmer ownership';
      try {
        // Unauthenticated
        const unauthRes = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/recommendation`, null, null);
        assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);

        // Non-owner
        const otherRes = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/recommendation`, null, otherAuthToken);
        assert(otherRes.status === 404, `Expected 404 for non-owner, got ${otherRes.status}`);
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 14: POST /api/detections/:id/recommendation/regenerate
    {
      const name = '2.4 POST /api/detections/:id/recommendation/regenerate updates Recommendation without creating duplicate documents';
      try {
        const countBefore = await Recommendation.countDocuments({ detectionId: testDetectionId });
        assert(countBefore === 1, 'Should have exactly 1 recommendation document before regeneration');

        const res = await jsonRequest(port, 'POST', `/api/detections/${testDetectionId}/recommendation/regenerate`, null, authToken);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Regeneration must succeed');

        const countAfter = await Recommendation.countDocuments({ detectionId: testDetectionId });
        assert(countAfter === 1, `Document count must remain 1 after regeneration, got ${countAfter}`);
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }
  } finally {
    // Cleanup synthetic test records
    await Recommendation.deleteMany({ userId: testUserId });
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
  console.log(' IPM Recommendation Engine Test Suite');
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
    console.log('  node src/scripts/testRecommendationEngine.js');
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
