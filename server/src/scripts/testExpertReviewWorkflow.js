/**
 * testExpertReviewWorkflow.js
 *
 * Automated integration test suite for the Expert Review Workflow:
 *  - Queue retrieval with oldest-first ordering and crop filtering
 *  - Atomic & transactional review claiming with race condition prevention
 *  - Confirm diagnosis workflow with AI prediction immutability
 *  - Correct diagnosis workflow with separate correctedDiagnosis storage
 *  - Role-based authorization (expert/admin vs farmer)
 *  - Ownership locking (only claiming expert can complete)
 *  - Support for unknown predictions (name: null)
 *  - Review retrieval permissions (expert vs owning farmer vs non-owning farmer)
 *  - Real MongoDB Atlas integration and cleanup
 *
 * Usage:
 *   node src/scripts/testExpertReviewWorkflow.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { User } = require('../models/User');
const { Field } = require('../models/Field');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const {
  ExpertReview,
  REVIEW_STATUSES,
  EXPERT_DECISIONS,
} = require('../models/ExpertReview');
const { generateToken } = require('../services/authService');
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
  console.log(' Expert Review Workflow Integration Tests');
  console.log('========================================\n');

  let server;
  let port;

  // Track created entities for thorough cleanup
  const testUserIds = [];
  const testFieldIds = [];
  const testDetectionIds = [];
  const testReviewIds = [];

  try {
    // 1. Connect to MongoDB Atlas
    await connectDatabase();
    console.log('  Connected to MongoDB Atlas for live test execution.');

    // 2. Start HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        console.log(`  Test server listening on port ${port}.\n`);
        resolve();
      });
    });

    // 3. Register Synthetic Test Users
    const suffix = Date.now();

    // Farmer A
    const farmerA = new User({
      name: `Farmer A ${suffix}`,
      email: `farmer_a_${suffix}@test.invalid`,
      passwordHash: 'synthetic_hash',
      role: 'farmer',
      language: 'en',
    });
    await farmerA.save();
    testUserIds.push(farmerA._id);
    const tokenFarmerA = generateToken(farmerA);

    // Farmer B
    const farmerB = new User({
      name: `Farmer B ${suffix}`,
      email: `farmer_b_${suffix}@test.invalid`,
      passwordHash: 'synthetic_hash',
      role: 'farmer',
      language: 'en',
    });
    await farmerB.save();
    testUserIds.push(farmerB._id);
    const tokenFarmerB = generateToken(farmerB);

    // Expert 1
    const expert1 = new User({
      name: `Dr. Expert One ${suffix}`,
      email: `expert_1_${suffix}@test.invalid`,
      passwordHash: 'synthetic_hash',
      role: 'expert',
      language: 'en',
    });
    await expert1.save();
    testUserIds.push(expert1._id);
    const tokenExpert1 = generateToken(expert1);

    // Expert 2
    const expert2 = new User({
      name: `Dr. Expert Two ${suffix}`,
      email: `expert_2_${suffix}@test.invalid`,
      passwordHash: 'synthetic_hash',
      role: 'expert',
      language: 'en',
    });
    await expert2.save();
    testUserIds.push(expert2._id);
    const tokenExpert2 = generateToken(expert2);

    // 4. Create Synthetic Field
    const fieldA = new Field({
      userId: farmerA._id,
      name: 'North Tomato Field',
      crop: 'Tomato',
      area: { value: 2.5, unit: 'acres' },
      location: { type: 'Point', coordinates: [83.37, 26.76] },
    });
    await fieldA.save();
    testFieldIds.push(fieldA._id);

    // Helper to seed detections
    async function createTestDetection({
      crop = 'Tomato',
      status = DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
      prediction = {
        type: 'disease',
        name: 'Early Blight',
        confidence: 0.65,
        modelName: 'mock-crop-health-model',
        modelVersion: '0.1.0',
      },
      severity = { level: 'moderate', score: 60 },
      createdAt = new Date(),
    } = {}) {
      const doc = new Detection({
        userId: farmerA._id,
        fieldId: fieldA._id,
        image: {
          url: 'https://res.cloudinary.com/synthetic/image/upload/sample_leaf.png',
          storageKey: 'crop-health/detections/sample_leaf',
          uploadedAt: new Date(),
        },
        crop,
        growthStage: 'flowering',
        symptoms: ['leaf spots'],
        prediction,
        severity,
        status,
        location: { type: 'Point', coordinates: [83.37, 26.76] },
        weatherSnapshot: null,
        createdAt,
      });
      await doc.save();
      testDetectionIds.push(doc._id);
      return doc;
    }

    console.log('--- Authorization Tests ---');

    // -------------------------------------------------------------------------
    // Test 1: Farmer cannot access review queue (403)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 1: Farmer cannot access review queue (403)';
      const res = await jsonRequest(port, 'GET', '/api/expert-reviews/queue', null, tokenFarmerA);
      if (res.status === 403 && res.body.error.code === 'FORBIDDEN') {
        pass(name);
      } else {
        fail(name, `Expected 403 FORBIDDEN, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 2: Unauthenticated request to queue is rejected (401)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 2: Unauthenticated request to queue rejected (401)';
      const res = await jsonRequest(port, 'GET', '/api/expert-reviews/queue');
      if (res.status === 401 && res.body.error.code === 'AUTHENTICATION_REQUIRED') {
        pass(name);
      } else {
        fail(name, `Expected 401, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 3: Expert can access review queue (200)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 3: Expert can access review queue (200)';
      const res = await jsonRequest(port, 'GET', '/api/expert-reviews/queue', null, tokenExpert1);
      if (res.status === 200 && res.body.success === true && Array.isArray(res.body.data.detections)) {
        pass(name);
      } else {
        fail(name, `Expected 200 with detections array, got ${res.status}`);
      }
    }

    console.log('\n--- Queue Content & Filtering Tests ---');

    // -------------------------------------------------------------------------
    // Test 4: Queue contains only EXPERT_REVIEW_REQUIRED detections, ordered oldest first
    // -------------------------------------------------------------------------
    const olderTime = new Date(Date.now() - 60000);
    const newerTime = new Date(Date.now() - 10000);

    const detOld = await createTestDetection({ crop: 'Tomato', status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED, createdAt: olderTime });
    const detNew = await createTestDetection({ crop: 'Potato', status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED, createdAt: newerTime });
    const detActionable = await createTestDetection({ crop: 'Tomato', status: DETECTION_STATUSES.ACTIONABLE });
    const detFailed = await createTestDetection({ crop: 'Tomato', status: DETECTION_STATUSES.AI_FAILED });

    {
      const name = 'Test 4: Queue filters out ACTIONABLE/AI_FAILED and orders oldest first';
      const res = await jsonRequest(port, 'GET', '/api/expert-reviews/queue', null, tokenExpert1);
      const ids = res.body.data.detections.map((d) => d.id);

      const containsOld = ids.includes(detOld._id.toString());
      const containsNew = ids.includes(detNew._id.toString());
      const containsActionable = ids.includes(detActionable._id.toString());
      const containsFailed = ids.includes(detFailed._id.toString());

      const oldIndex = ids.indexOf(detOld._id.toString());
      const newIndex = ids.indexOf(detNew._id.toString());

      if (containsOld && containsNew && !containsActionable && !containsFailed && oldIndex < newIndex) {
        pass(name);
      } else {
        fail(name, `Queue contents or ordering unexpected: ids=${JSON.stringify(ids)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 5: Crop filter on queue works
    // -------------------------------------------------------------------------
    {
      const name = 'Test 5: Crop filter on queue returns only matching crop';
      const res = await jsonRequest(port, 'GET', '/api/expert-reviews/queue?crop=Potato', null, tokenExpert1);
      const detections = res.body.data.detections;
      const allPotato = detections.length > 0 && detections.every((d) => d.crop.toLowerCase() === 'potato');
      if (res.status === 200 && allPotato) {
        pass(name);
      } else {
        fail(name, `Crop filter failed: ${JSON.stringify(detections)}`);
      }
    }

    console.log('\n--- Review Claim Tests ---');

    // -------------------------------------------------------------------------
    // Test 6: Expert claims available detection
    // -------------------------------------------------------------------------
    let claimedDetId = detOld._id.toString();
    {
      const name = 'Test 6: Expert claims available detection (201)';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${claimedDetId}/claim`, {}, tokenExpert1);

      if (
        res.status === 201 &&
        res.body.success === true &&
        res.body.data.detection.status === 'EXPERT_REVIEW_IN_PROGRESS' &&
        res.body.data.review.status === 'IN_PROGRESS' &&
        res.body.data.review.expertId === expert1._id.toString()
      ) {
        testReviewIds.push(res.body.data.review.id);
        pass(name);
      } else {
        fail(name, `Expected 201 claimed review, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 7: Claim creates ExpertReview in DB and binds to expert
    // -------------------------------------------------------------------------
    {
      const name = 'Test 7: ExpertReview persisted with snapshot and correct expertId';
      const review = await ExpertReview.findOne({ detectionId: claimedDetId });
      if (
        review &&
        review.status === 'IN_PROGRESS' &&
        review.expertId.toString() === expert1._id.toString() &&
        review.originalPrediction.name === 'Early Blight' &&
        review.originalPrediction.confidence === 0.65
      ) {
        pass(name);
      } else {
        fail(name, `Review record not as expected: ${JSON.stringify(review)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 8: Concurrent claims / second claim on claimed detection returns 409
    // -------------------------------------------------------------------------
    {
      const name = 'Test 8: Second claim on already claimed detection returns 409';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${claimedDetId}/claim`, {}, tokenExpert2);
      if (res.status === 409 && res.body.error.code === 'REVIEW_IN_PROGRESS') {
        pass(name);
      } else {
        fail(name, `Expected 409 REVIEW_IN_PROGRESS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 9: ACTIONABLE detection cannot be claimed (409)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 9: ACTIONABLE detection cannot be claimed (409)';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${detActionable._id}/claim`, {}, tokenExpert1);
      if (res.status === 409 && res.body.error.code === 'INVALID_DETECTION_STATUS') {
        pass(name);
      } else {
        fail(name, `Expected 409 INVALID_DETECTION_STATUS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 10: AI_FAILED detection cannot be claimed (409)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 10: AI_FAILED detection cannot be claimed (409)';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${detFailed._id}/claim`, {}, tokenExpert1);
      if (res.status === 409 && res.body.error.code === 'INVALID_DETECTION_STATUS') {
        pass(name);
      } else {
        fail(name, `Expected 409 INVALID_DETECTION_STATUS, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 11: Unknown prediction (name = null) can be claimed successfully
    // -------------------------------------------------------------------------
    const detUnknown = await createTestDetection({
      crop: 'ExoticFruit',
      status: DETECTION_STATUSES.EXPERT_REVIEW_REQUIRED,
      prediction: {
        type: 'unknown',
        name: null,
        confidence: 0.42,
        modelName: 'mock-crop-health-model',
        modelVersion: '0.1.0',
      },
      severity: null,
    });
    {
      const name = 'Test 11: Unknown prediction with name = null can be claimed successfully';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${detUnknown._id}/claim`, {}, tokenExpert1);
      if (
        res.status === 201 &&
        res.body.data.review.originalPrediction.type === 'unknown' &&
        res.body.data.review.originalPrediction.name === null
      ) {
        testReviewIds.push(res.body.data.review.id);
        pass(name);
      } else {
        fail(name, `Expected 201 for unknown prediction claim, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    console.log('\n--- Confirm Decision Tests ---');

    // -------------------------------------------------------------------------
    // Test 12: Non-claiming expert cannot confirm review (403)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 12: Non-claiming expert cannot confirm review (403)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${claimedDetId}/confirm`,
        { comment: 'Looks good' },
        tokenExpert2
      );
      if (res.status === 403 && res.body.error.code === 'FORBIDDEN') {
        pass(name);
      } else {
        fail(name, `Expected 403 FORBIDDEN, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 13: Farmer cannot confirm review (403)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 13: Farmer cannot confirm review (403)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${claimedDetId}/confirm`,
        { comment: 'Farmer trying to confirm' },
        tokenFarmerA
      );
      if (res.status === 403 && res.body.error.code === 'FORBIDDEN') {
        pass(name);
      } else {
        fail(name, `Expected 403 FORBIDDEN, got ${res.status}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 14: Claiming expert confirms review (200)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 14: Claiming expert confirms review (200)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${claimedDetId}/confirm`,
        { comment: 'Confirmed early blight symptoms on lower foliage.' },
        tokenExpert1
      );

      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.status === 'CONFIRMED' &&
        res.body.data.review.decision === 'CONFIRMED' &&
        res.body.data.review.status === 'COMPLETED' &&
        res.body.data.review.completedAt !== null
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 CONFIRMED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 15: Original AI prediction and severity remain unchanged after confirm
    // -------------------------------------------------------------------------
    {
      const name = 'Test 15: Original AI prediction and severity remain unchanged after confirm';
      const doc = await Detection.findById(claimedDetId);
      if (
        doc &&
        doc.status === 'CONFIRMED' &&
        doc.prediction.name === 'Early Blight' &&
        doc.prediction.confidence === 0.65 &&
        doc.prediction.modelName === 'mock-crop-health-model' &&
        doc.severity.level === 'moderate'
      ) {
        pass(name);
      } else {
        fail(name, `Detection fields modified: ${JSON.stringify(doc)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 16: Completed review cannot be confirmed or corrected again (409)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 16: Completed review cannot be completed again (409)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${claimedDetId}/confirm`,
        { comment: 'Trying again' },
        tokenExpert1
      );
      if (res.status === 409 && res.body.error.code === 'REVIEW_ALREADY_COMPLETED') {
        pass(name);
      } else {
        fail(name, `Expected 409 REVIEW_ALREADY_COMPLETED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 17: Claiming completed detection fails (409)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 17: Claiming completed detection fails (409)';
      const res = await jsonRequest(port, 'POST', `/api/expert-reviews/${claimedDetId}/claim`, {}, tokenExpert1);
      if (res.status === 409 && res.body.error.code === 'REVIEW_ALREADY_COMPLETED') {
        pass(name);
      } else {
        fail(name, `Expected 409 REVIEW_ALREADY_COMPLETED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    console.log('\n--- Correct Decision Tests ---');

    // -------------------------------------------------------------------------
    // Test 18: Claiming expert corrects diagnosis with new disease/pest details
    // -------------------------------------------------------------------------
    // Claim detNew by expert2
    const claimNewRes = await jsonRequest(port, 'POST', `/api/expert-reviews/${detNew._id}/claim`, {}, tokenExpert2);
    testReviewIds.push(claimNewRes.body.data.review.id);

    {
      const name = 'Test 18: Claiming expert corrects diagnosis (200)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${detNew._id}/correct`,
        {
          correctedDiagnosis: {
            name: 'Late Blight',
            type: 'disease',
            severity: { level: 'high', score: 85 },
          },
          comment: 'Symptoms show water-soaked dark lesions characteristic of Late Blight.',
          requiresLabDiagnosis: false,
        },
        tokenExpert2
      );

      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.status === 'CORRECTED' &&
        res.body.data.review.decision === 'CORRECTED' &&
        res.body.data.review.status === 'COMPLETED' &&
        res.body.data.review.correctedDiagnosis.name === 'Late Blight' &&
        res.body.data.review.correctedDiagnosis.severity.level === 'high'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 CORRECTED, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 19: Original AI prediction remains unchanged after correct
    // -------------------------------------------------------------------------
    {
      const name = 'Test 19: Original AI prediction remains unchanged after correct';
      const doc = await Detection.findById(detNew._id);
      if (
        doc &&
        doc.status === 'CORRECTED' &&
        doc.prediction.name === 'Early Blight' && // Original AI name preserved
        doc.prediction.confidence === 0.65
      ) {
        pass(name);
      } else {
        fail(name, `Detection AI prediction modified: ${JSON.stringify(doc)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 20: Invalid correction payload (missing name) rejected (400)
    // -------------------------------------------------------------------------
    {
      const name = 'Test 20: Invalid correction payload (missing name) rejected (400)';
      const res = await jsonRequest(
        port,
        'POST',
        `/api/expert-reviews/${detUnknown._id}/correct`,
        {
          correctedDiagnosis: { type: 'disease' }, // Missing name
        },
        tokenExpert1
      );
      if (res.status === 400 && res.body.error.code === 'VALIDATION_ERROR') {
        pass(name);
      } else {
        fail(name, `Expected 400 VALIDATION_ERROR, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    console.log('\n--- Review Retrieval Tests ---');

    // -------------------------------------------------------------------------
    // Test 21: Expert can get review details
    // -------------------------------------------------------------------------
    {
      const name = 'Test 21: Expert can get review details (200)';
      const res = await jsonRequest(port, 'GET', `/api/expert-reviews/${detNew._id}`, null, tokenExpert1);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection &&
        res.body.data.review &&
        res.body.data.review.decision === 'CORRECTED' &&
        res.body.data.review.correctedDiagnosis.name === 'Late Blight'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 with review details, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 22: Owning farmer can get review details for own detection
    // -------------------------------------------------------------------------
    {
      const name = 'Test 22: Owning farmer can get review details for own detection (200)';
      const res = await jsonRequest(port, 'GET', `/api/expert-reviews/${detNew._id}`, null, tokenFarmerA);
      if (
        res.status === 200 &&
        res.body.success === true &&
        res.body.data.detection.id === detNew._id.toString() &&
        res.body.data.review.decision === 'CORRECTED'
      ) {
        pass(name);
      } else {
        fail(name, `Expected 200 for owning farmer, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }

    // -------------------------------------------------------------------------
    // Test 23: Non-owning farmer cannot get review details for another farmer's detection (404)
    // -------------------------------------------------------------------------
    {
      const name = "Test 23: Non-owning farmer cannot get another farmer's review details (404)";
      const res = await jsonRequest(port, 'GET', `/api/expert-reviews/${detNew._id}`, null, tokenFarmerB);
      if (res.status === 404) {
        pass(name);
      } else {
        fail(name, `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
    }
  } catch (err) {
    console.error('Fatal error during test run:', err);
    failed++;
  } finally {
    // Teardown & Synthetic Data Cleanup
    console.log('\n--- Cleanup ---');
    try {
      if (testReviewIds.length > 0) {
        const res = await ExpertReview.deleteMany({ _id: { $in: testReviewIds } });
        console.log(`  Deleted ${res.deletedCount} test expert review(s)`);
      }
      if (testDetectionIds.length > 0) {
        const res = await Detection.deleteMany({ _id: { $in: testDetectionIds } });
        console.log(`  Deleted ${res.deletedCount} test detection(s)`);
      }
      if (testFieldIds.length > 0) {
        const res = await Field.deleteMany({ _id: { $in: testFieldIds } });
        console.log(`  Deleted ${res.deletedCount} test field(s)`);
      }
      if (testUserIds.length > 0) {
        const res = await User.deleteMany({ _id: { $in: testUserIds } });
        console.log(`  Deleted ${res.deletedCount} test user(s)`);
      }
    } catch (cleanupErr) {
      console.error('  Cleanup error:', cleanupErr.message);
    }

    if (server) {
      await new Promise((r) => server.close(r));
      console.log('  Test server stopped.');
    }

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
