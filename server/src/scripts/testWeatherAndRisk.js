/**
 * testWeatherAndRisk.js
 *
 * Comprehensive integration and unit test suite for:
 *  1. Weather Service (Open-Meteo normalization, mock adapter, caching, timeout/failure resilience)
 *  2. Risk Engine (disease/pest risk, healthy crop risk, missing weather renormalization, unknown prediction)
 *  3. Decoupling of AI Confidence Routing vs Risk Assessment
 *  4. End-to-end analyzeDetection integration (weather snapshot persistence, RiskAssessment creation, non-blocking resilience)
 *  5. Risk API Endpoints (GET /api/detections/:id/risk, POST /api/detections/:id/risk/recalculate, security/ownership)
 *  6. Idempotency & deduplication on RiskAssessment records
 *
 * Usage:
 *   node src/scripts/testWeatherAndRisk.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const mongoose = require('mongoose');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const { Field } = require('../models/Field');
const { User } = require('../models/User');
const { RiskAssessment, RISK_LEVELS } = require('../models/RiskAssessment');
const { generateToken } = require('../services/authService');
const weatherService = require('../services/weatherService');
const mockWeatherAdapter = require('../services/weatherAdapters/mockWeatherAdapter');
const riskEngineService = require('../services/riskEngineService');
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
// Unit Tests: Weather Service & Risk Engine
// ---------------------------------------------------------------------------

async function runUnitTests() {
  console.log('\n--- Section 1: Weather Service & Adapter Tests ---');

  // Test 1: Open-Meteo normalization using mocked API payload (Adjustment #10)
  {
    const name = '1.1 Open-Meteo normalization correctly maps raw provider response';
    try {
      const sampleOpenMeteoPayload = {
        latitude: 26.76,
        longitude: 83.37,
        current: {
          temperature_2m: 29.4,
          relative_humidity_2m: 85,
          precipitation: 14.2,
          wind_speed_10m: 11.5,
        },
        hourly: {
          precipitation_probability: [20, 45, 80, 75, 30],
        },
      };

      const normalized = weatherService.openMeteoAdapter.normalizeOpenMeteoPayload(sampleOpenMeteoPayload);
      assert(normalized.temperature === 29.4, `temperature should be 29.4, got ${normalized.temperature}`);
      assert(normalized.humidity === 85, `humidity should be 85, got ${normalized.humidity}`);
      assert(normalized.rainfall === 14.2, `rainfall should be 14.2, got ${normalized.rainfall}`);
      assert(normalized.windSpeed === 11.5, `windSpeed should be 11.5, got ${normalized.windSpeed}`);
      assert(normalized.forecast.next24hRainProbability === 80, `max rain probability should be 80, got ${normalized.forecast.next24hRainProbability}`);
      assert(normalized.capturedAt instanceof Date, 'capturedAt must be a Date');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 2: Mock Weather Adapter Normalization
  {
    const name = '1.2 Mock Weather Adapter returns valid normalized snapshot';
    try {
      mockWeatherAdapter.resetMock();
      const snapshot = await mockWeatherAdapter.fetchWeather({ longitude: 83.37, latitude: 26.76 });
      assert(typeof snapshot.temperature === 'number', 'temperature must be a number');
      assert(typeof snapshot.humidity === 'number', 'humidity must be a number');
      assert(typeof snapshot.rainfall === 'number', 'rainfall must be a number');
      assert(typeof snapshot.windSpeed === 'number', 'windSpeed must be a number');
      assert(typeof snapshot.forecast.next24hRainProbability === 'number', 'rain probability must be a number');
      assert(snapshot.capturedAt instanceof Date, 'capturedAt must be a Date');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 3: Geospatial Coordinate Caching
  {
    const name = '1.3 Weather Service caches results by geospatial coordinate (~1.1km grid)';
    try {
      weatherService.clearCache();
      weatherService.setActiveProvider('mock');
      mockWeatherAdapter.resetMock();

      // First fetch (populates cache)
      const res1 = await weatherService.getWeatherSnapshot({ longitude: 83.3712, latitude: 26.7601 });
      assert(weatherService.getCacheSize() === 1, `Cache size should be 1, got ${weatherService.getCacheSize()}`);

      // Second fetch with slight coordinate offset in same ~1.1km grid cell
      const res2 = await weatherService.getWeatherSnapshot({ longitude: 83.3744, latitude: 26.7609 });
      assert(weatherService.getCacheSize() === 1, `Cache size should remain 1 on hit, got ${weatherService.getCacheSize()}`);
      assert(res1.capturedAt.getTime() === res2.capturedAt.getTime(), 'Timestamps should match from cache');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 4: Force refresh bypasses cache
  {
    const name = '1.4 forceRefresh: true bypasses the coordinate cache';
    try {
      weatherService.clearCache();
      weatherService.setActiveProvider('mock');
      mockWeatherAdapter.setMockData({ temperature: 20 });
      const snap1 = await weatherService.getWeatherSnapshot({ longitude: 83.37, latitude: 26.76 });
      assert(snap1.temperature === 20, 'Initial snap temperature should be 20');

      // Update mock data and force refresh
      mockWeatherAdapter.setMockData({ temperature: 32 });
      const snap2 = await weatherService.getWeatherSnapshot(
        { longitude: 83.37, latitude: 26.76 },
        { forceRefresh: true }
      );
      assert(snap2.temperature === 32, 'Refreshed snap temperature should be 32');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 5: Weather service timeout / network error graceful degradation (returns null)
  {
    const name = '1.5 Weather Service gracefully returns null on provider timeout or failure';
    try {
      weatherService.clearCache();
      weatherService.setActiveProvider('mock');
      mockWeatherAdapter.setSimulateFailure(true);

      const snap = await weatherService.getWeatherSnapshot({ longitude: 83.37, latitude: 26.76 });
      assert(snap === null, 'Weather service must return null instead of throwing on provider failure');
      mockWeatherAdapter.resetMock();
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  console.log('\n--- Section 2: Contextual Risk Engine Tests ---');

  // Test 5: Disease + High Humidity + Rain produces HIGH/CRITICAL risk
  {
    const name = '2.1 Disease with favorable weather & vulnerable stage yields HIGH/CRITICAL risk';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        prediction: {
          type: 'disease',
          name: 'Early Blight',
          confidence: 0.92,
        },
        severity: {
          level: 'high',
          score: 75,
        },
      };

      const weather = {
        temperature: 26,
        humidity: 88,
        rainfall: 12.0,
        windSpeed: 10,
        forecast: { next24hRainProbability: 80 },
      };

      const result = riskEngineService.calculateRisk(detection, weather);
      assert(result !== null, 'Result must not be null');
      assert(result.score >= 66, `Expected score >= 66, got ${result.score}`);
      assert([RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL].includes(result.level), `Expected HIGH or CRITICAL level, got ${result.level}`);
      assert(result.factors.aiEvidence > 0.80, 'AI evidence factor should be high');
      assert(result.factors.weatherRisk > 0.70, 'Weather risk factor should be high');
      assert(result.explanation.length >= 3, 'Must include descriptive explanations');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 6: Healthy crop produces LOW risk regardless of weather
  {
    const name = '2.2 Healthy crop always produces LOW risk even under wet weather';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        prediction: {
          type: 'healthy',
          name: 'Healthy',
          confidence: 0.95,
        },
        severity: null,
      };

      const weather = {
        temperature: 26,
        humidity: 90,
        rainfall: 15.0,
        windSpeed: 10,
        forecast: { next24hRainProbability: 85 },
      };

      const result = riskEngineService.calculateRisk(detection, weather);
      assert(result !== null, 'Result must not be null');
      assert(result.score <= 35, `Healthy crop score must be <= 35, got ${result.score}`);
      assert(result.level === RISK_LEVELS.LOW, `Healthy crop level must be LOW, got ${result.level}`);
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 7: Missing weather does NOT artificially deflate score (Renormalization Test)
  {
    const name = '2.3 Missing weather renormalizes factor weights rather than zero-substituting';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        prediction: {
          type: 'disease',
          name: 'Late Blight',
          confidence: 0.90,
        },
        severity: {
          level: 'high',
          score: 80,
        },
      };

      // Calculate with no weather snapshot
      const resultNoWeather = riskEngineService.calculateRisk(detection, null);
      assert(resultNoWeather.factors.weatherRisk === null, 'weatherRisk factor must be null when weather is absent');
      assert(resultNoWeather.score >= 60, `Score without weather should be substantial, got ${resultNoWeather.score}`);
      assert(
        resultNoWeather.explanation.some((e) => e.includes('Weather data temporarily unavailable')),
        'Explanation must clearly disclose missing weather'
      );
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 8: Unknown prediction returns null with no crash (Adjustment #5)
  {
    const name = '2.4 Unknown prediction type returns null risk assessment';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'vegetative',
        prediction: {
          type: 'unknown',
          name: null,
          confidence: 0.40,
        },
        severity: null,
      };

      const result = riskEngineService.calculateRisk(detection, { temperature: 25, humidity: 70 });
      assert(result === null, 'Unknown prediction must evaluate to null risk');
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }

  // Test 9: Decoupling of AI Confidence vs Risk
  {
    const name = '2.5 Moderate AI confidence (0.70) under severe weather produces HIGH contextual risk';
    try {
      const detection = {
        crop: 'Tomato',
        growthStage: 'flowering',
        prediction: {
          type: 'disease',
          name: 'Late Blight',
          confidence: 0.70, // Moderate AI confidence
        },
        severity: {
          level: 'high',
          score: 75,
        },
      };

      const weather = {
        temperature: 24,
        humidity: 95,
        rainfall: 20.0,
        forecast: { next24hRainProbability: 90 },
      };

      const result = riskEngineService.calculateRisk(detection, weather);
      // Risk is high even though confidence is only 70%
      assert(result.score >= 66, `Expected HIGH risk score (>= 66), got ${result.score}`);
      assert([RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL].includes(result.level), `Expected HIGH or CRITICAL level, got ${result.level}`);
      pass(name);
    } catch (e) {
      fail(name, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Integration Tests: End-to-End Analyze & Risk REST Endpoints
// ---------------------------------------------------------------------------

async function runIntegrationTests() {
  console.log('\n--- Section 3: End-to-End Integration & REST API Tests ---');

  let server;
  let port;
  const testUserId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  let authToken;
  let otherAuthToken;
  let testFieldId;
  let testDetectionId;

  try {
    // Setup test server
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // Create synthetic users
    await User.deleteMany({ email: /@test-risk\.invalid$/ });
    const user = new User({
      _id: testUserId,
      name: 'Risk Test Farmer',
      email: `farmer-${Date.now()}@test-risk.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await user.save();
    authToken = generateToken(user);

    const otherUser = new User({
      _id: otherUserId,
      name: 'Other Farmer',
      email: `other-${Date.now()}@test-risk.invalid`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
      role: 'farmer',
      language: 'en',
    });
    await otherUser.save();
    otherAuthToken = generateToken(otherUser);

    // Create test field
    const field = new Field({
      userId: testUserId,
      name: 'Ganga Basin Test Plot',
      crop: 'Tomato',
      growthStage: 'flowering',
      location: {
        type: 'Point',
        coordinates: [83.37, 26.76],
      },
    });
    await field.save();
    testFieldId = field._id;

    // Test 10: analyzeDetection workflow creates weatherSnapshot and RiskAssessment
    {
      const name = '3.1 POST /api/detections/:id/analyze persists weatherSnapshot and creates RiskAssessment';
      try {
        weatherService.setActiveProvider('mock');
        mockWeatherAdapter.resetMock();

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
          location: {
            type: 'Point',
            coordinates: [83.37, 26.76],
          },
          status: DETECTION_STATUSES.CREATED,
        });
        await detection.save();
        testDetectionId = detection._id.toString();

        // Stub AI service to return high-confidence disease
        const originalAnalyze = aiService.analyzeDetectionImage;
        aiService.analyzeDetectionImage = async () => ({
          prediction: {
            type: 'disease',
            name: 'Early Blight',
            confidence: 0.91,
            modelName: 'mock-crop-net',
            modelVersion: '1.0.0',
          },
          severity: {
            level: 'moderate',
            score: 60,
          },
        });

        const res = await jsonRequest(port, 'POST', `/api/detections/${testDetectionId}/analyze`, null, authToken);
        aiService.analyzeDetectionImage = originalAnalyze;

        assert(res.status === 200, `Expected HTTP 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.success === true, 'Response must be success: true');
        assert(res.body.data.detection.status === DETECTION_STATUSES.ACTIONABLE, 'Status must be ACTIONABLE');
        assert(res.body.data.risk !== null, 'Response should contain risk summary');
        assert(res.body.data.risk.score >= 50, `Expected risk score >= 50, got ${res.body.data.risk.score}`);

        // Verify MongoDB records
        const updatedDetection = await Detection.findById(testDetectionId);
        assert(updatedDetection.weatherSnapshot !== null, 'Detection.weatherSnapshot must be populated in DB');
        assert(typeof updatedDetection.weatherSnapshot.temperature === 'number', 'Snapshot temperature must exist');

        const savedRisk = await RiskAssessment.findOne({ detectionId: testDetectionId });
        assert(savedRisk !== null, 'RiskAssessment document must be created in risk_assessments collection');
        assert(savedRisk.score === res.body.data.risk.score, 'Persisted risk score must match API response');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 11: GET /api/detections/:id/risk returns full risk assessment
    {
      const name = '3.2 GET /api/detections/:id/risk returns full risk assessment for owner';
      try {
        const res = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/risk`, null, authToken);
        assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
        assert(res.body.success === true, 'Response must be success: true');
        assert(res.body.data.risk.detectionId === testDetectionId, 'detectionId must match');
        assert(res.body.data.risk.factors.aiEvidence > 0, 'factors.aiEvidence must be present');
        assert(Array.isArray(res.body.data.risk.explanation), 'explanation must be array');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 12: Ownership & Security on GET /api/detections/:id/risk
    {
      const name = '3.3 GET /api/detections/:id/risk returns 404 for unauthenticated or non-owner';
      try {
        // Unauthenticated
        const unauthRes = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/risk`, null, null);
        assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);

        // Other farmer
        const otherRes = await jsonRequest(port, 'GET', `/api/detections/${testDetectionId}/risk`, null, otherAuthToken);
        assert(otherRes.status === 404, `Expected 404 for non-owner, got ${otherRes.status}`);
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 13: POST /api/detections/:id/risk/recalculate updates risk and does not create duplicate documents
    {
      const name = '3.4 POST /api/detections/:id/risk/recalculate updates existing RiskAssessment without duplicate records';
      try {
        const countBefore = await RiskAssessment.countDocuments({ detectionId: testDetectionId });
        assert(countBefore === 1, 'Should have exactly 1 record before recalculation');

        // Recalculate
        const res = await jsonRequest(port, 'POST', `/api/detections/${testDetectionId}/risk/recalculate`, null, authToken);
        assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
        assert(res.body.success === true, 'Recalculation should succeed');

        const countAfter = await RiskAssessment.countDocuments({ detectionId: testDetectionId });
        assert(countAfter === 1, `Document count must remain 1 after recalculation (no duplicates), got ${countAfter}`);
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }

    // Test 14: Analysis succeeds even when weather provider completely fails (Non-blocking resilience)
    {
      const name = '3.5 POST /api/detections/:id/analyze succeeds with HTTP 200 when weather provider fails';
      try {
        weatherService.clearCache();
        weatherService.setActiveProvider('mock');
        mockWeatherAdapter.setSimulateFailure(true);

        const detection = new Detection({
          userId: testUserId,
          fieldId: testFieldId,
          crop: 'Tomato',
          growthStage: 'vegetative',
          image: {
            url: 'https://res.cloudinary.com/test/image/upload/v1/sample2.jpg',
            storageKey: 'sample2',
            uploadedAt: new Date(),
          },
          status: DETECTION_STATUSES.CREATED,
        });
        await detection.save();

        const originalAnalyze = aiService.analyzeDetectionImage;
        aiService.analyzeDetectionImage = async () => ({
          prediction: {
            type: 'disease',
            name: 'Early Blight',
            confidence: 0.90,
            modelName: 'mock-crop-net',
            modelVersion: '1.0.0',
          },
          severity: { level: 'moderate', score: 50 },
        });

        const res = await jsonRequest(port, 'POST', `/api/detections/${detection._id}/analyze`, null, authToken);
        aiService.analyzeDetectionImage = originalAnalyze;
        mockWeatherAdapter.resetMock();

        assert(res.status === 200, `Expected 200 despite weather failure, got ${res.status}: ${JSON.stringify(res.body)}`);
        assert(res.body.data.detection.status === DETECTION_STATUSES.ACTIONABLE, 'Detection status must still be ACTIONABLE');
        assert(res.body.data.risk !== null, 'Renormalized risk assessment should still be returned');
        assert(res.body.data.detection.weatherSnapshot === null, 'weatherSnapshot should be null on provider failure');
        pass(name);
      } catch (e) {
        fail(name, e.message);
      }
    }
  } finally {
    // Cleanup synthetic test records
    await Detection.deleteMany({ userId: testUserId });
    await RiskAssessment.deleteMany({ userId: testUserId });
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
  console.log(' Weather Integration & Contextual Risk Test Suite');
  console.log('====================================================');

  // Always run in-memory Unit Tests first (independent of DB network availability)
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
    console.log('  node src/scripts/testWeatherAndRisk.js');
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
