/**
 * testDetectionUnit.js
 *
 * Unit tests for detectionValidator and detectionController logic
 * with multipart image upload integration.
 */

'use strict';

const mongoose = require('mongoose');
const {
  validateCreateDetectionInput,
  validateGetDetectionsQuery,
  parseAndValidateSymptoms,
  parseAndValidateLocation,
  isValidObjectId,
} = require('../validators/detectionValidator');
const { Detection, DETECTION_STATUSES } = require('../models/Detection');
const {
  createDetection,
  getDetections,
  getDetection,
} = require('../controllers/detectionController');
const { Field } = require('../models/Field');
const imageStorageService = require('../services/imageStorageService');

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

async function runUnitTests() {
  console.log('\n========================================');
  console.log(' Detection Unit & Logic Tests');
  console.log('========================================\n');

  const validObjectId = new mongoose.Types.ObjectId().toString();
  const anotherObjectId = new mongoose.Types.ObjectId().toString();

  // 1. Validator: Rejects client-supplied userId
  {
    const name = '1. Validator rejects client-supplied userId';
    const { errors } = validateCreateDetectionInput({
      body: { userId: validObjectId, fieldId: validObjectId },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.some((e) => e.includes('userId must not be supplied'))) {
      pass(name);
    } else {
      fail(name, `Expected userId error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 2. Validator: Rejects client-supplied owner
  {
    const name = '2. Validator rejects client-supplied owner';
    const { errors } = validateCreateDetectionInput({
      body: { owner: validObjectId, fieldId: validObjectId },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.some((e) => e.includes('owner must not be supplied'))) {
      pass(name);
    } else {
      fail(name, `Expected owner error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 3. Validator: Rejects invalid fieldId
  {
    const name = '3. Validator rejects invalid fieldId';
    const { errors } = validateCreateDetectionInput({
      body: { fieldId: 'invalid-id' },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.some((e) => e.includes('fieldId must be a valid ObjectId'))) {
      pass(name);
    } else {
      fail(name, `Expected fieldId error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 4. Validator: Rejects missing image file
  {
    const name = '4. Validator rejects missing image file';
    const { errors } = validateCreateDetectionInput({
      body: { fieldId: validObjectId },
      file: null,
    });
    if (errors.some((e) => e.includes('Image file is required'))) {
      pass(name);
    } else {
      fail(name, `Expected file error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 5. Validator: Rejects invalid coordinates in location JSON
  {
    const name = '5. Validator rejects invalid coordinates (longitude > 180)';
    const { errors } = validateCreateDetectionInput({
      body: {
        fieldId: validObjectId,
        location: '{"type":"Point","coordinates":[200,26.76]}',
      },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.some((e) => e.includes('longitude must be between -180 and 180'))) {
      pass(name);
    } else {
      fail(name, `Expected longitude error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 6. Validator: Rejects invalid symptoms JSON
  {
    const name = '6. Validator rejects invalid symptoms JSON';
    const { errors } = validateCreateDetectionInput({
      body: {
        fieldId: validObjectId,
        symptoms: '["unclosed json',
      },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.some((e) => e.includes('symptoms must be a valid JSON array'))) {
      pass(name);
    } else {
      fail(name, `Expected symptoms error, got: ${JSON.stringify(errors)}`);
    }
  }

  // 7. Validator: Accepts valid multipart input
  {
    const name = '7. Validator accepts valid complete input';
    const { errors, parsedData } = validateCreateDetectionInput({
      body: {
        fieldId: validObjectId,
        crop: 'Tomato',
        growthStage: 'flowering',
        symptoms: '["yellowing", "brown spots"]',
        location: '{"type":"Point","coordinates":[83.37,26.76]}',
      },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    });
    if (errors.length === 0 && parsedData.symptoms.length === 2 && parsedData.location.coordinates[0] === 83.37) {
      pass(name);
    } else {
      fail(name, `Expected valid input, got errors: ${JSON.stringify(errors)}`);
    }
  }

  // 8. Controller createDetection: rejects if Field does not belong to user
  {
    const name = '8. Controller createDetection rejects if Field not owned by farmer';
    const origFindOne = Field.findOne;
    Field.findOne = async () => null; // Simulate field not found / not owned

    const req = {
      user: { _id: new mongoose.Types.ObjectId(validObjectId) },
      body: { fieldId: anotherObjectId },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(b) { responseBody = b; },
    };

    await createDetection(req, res, (e) => { throw e; });
    Field.findOne = origFindOne;

    if (statusCode === 404 && responseBody.error.code === 'FIELD_NOT_FOUND') {
      pass(name);
    } else {
      fail(name, `Expected 404 FIELD_NOT_FOUND, got ${statusCode}: ${JSON.stringify(responseBody)}`);
    }
  }

  // 9. Controller createDetection: initial status is CREATED and prediction/severity are null
  {
    const name = '9. Controller createDetection sets CREATED status, null prediction/severity, derives from Field';
    const origFindOne = Field.findOne;
    const origUpload = imageStorageService.uploadDetectionImage;
    const origSave = Detection.prototype.save;

    const mockField = {
      _id: new mongoose.Types.ObjectId(validObjectId),
      userId: new mongoose.Types.ObjectId(validObjectId),
      crop: 'Tomato',
      growthStage: 'flowering',
      location: { type: 'Point', coordinates: [83.37, 26.76] },
    };

    Field.findOne = async () => mockField;
    imageStorageService.uploadDetectionImage = async () => ({
      url: 'https://res.cloudinary.com/demo/image/upload/v12345/sample.jpg',
      storageKey: 'crop-health/detections/sample_1',
      uploadedAt: new Date(),
    });

    Detection.prototype.save = async function () { return this; };

    const req = {
      user: { _id: mockField.userId },
      body: {
        fieldId: validObjectId,
        // omit crop, growthStage, location to test fallback derivation
      },
      file: { mimetype: 'image/jpeg', buffer: Buffer.from('img') },
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(b) { responseBody = b; },
    };

    await createDetection(req, res, (e) => { throw e; });
    Field.findOne = origFindOne;
    imageStorageService.uploadDetectionImage = origUpload;
    Detection.prototype.save = origSave;

    if (
      statusCode === 201 &&
      responseBody.success === true &&
      responseBody.data.detection.status === 'CREATED' &&
      responseBody.data.detection.prediction === null &&
      responseBody.data.detection.severity === null &&
      responseBody.data.detection.crop === 'Tomato' &&
      responseBody.data.detection.growthStage === 'flowering' &&
      responseBody.data.detection.location.coordinates[0] === 83.37 &&
      responseBody.data.detection.image.storageKey === 'crop-health/detections/sample_1'
    ) {
      pass(name);
    } else {
      fail(name, `Unexpected response: ${statusCode}, ${JSON.stringify(responseBody)}`);
    }
  }

  // 10. Controller getDetection: returns 404 for another user's detection
  {
    const name = '10. Controller getDetection returns 404 for unowned detection';
    const origFindOne = Detection.findOne;
    Detection.findOne = async () => null;

    const req = {
      user: { _id: new mongoose.Types.ObjectId(validObjectId) },
      params: { id: anotherObjectId },
    };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(c) { statusCode = c; return this; },
      json(b) { responseBody = b; },
    };

    await getDetection(req, res, (e) => { throw e; });
    Detection.findOne = origFindOne;

    if (statusCode === 404 && responseBody.error.code === 'NOT_FOUND') {
      pass(name);
    } else {
      fail(name, `Expected 404 NOT_FOUND, got ${statusCode}: ${JSON.stringify(responseBody)}`);
    }
  }

  // 11. Controller getDetections: filters by userId and query filters
  {
    const name = '11. Controller getDetections filters by authenticated userId and status';
    const origFind = Detection.find;
    let capturedFilter = null;

    Detection.find = function (filter) {
      capturedFilter = filter;
      return {
        sort: async () => [
          {
            _id: new mongoose.Types.ObjectId(validObjectId),
            userId: new mongoose.Types.ObjectId(validObjectId),
            fieldId: new mongoose.Types.ObjectId(validObjectId),
            image: { url: 'https://example.com/1.jpg', uploadedAt: new Date() },
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
          },
        ],
      };
    };

    const req = {
      user: { _id: new mongoose.Types.ObjectId(validObjectId) },
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
      responseBody.data.detections.length === 1 &&
      capturedFilter.userId.toString() === validObjectId &&
      capturedFilter.status === 'CREATED' &&
      capturedFilter.crop === 'Tomato'
    ) {
      pass(name);
    } else {
      fail(name, `Query filter check failed: ${JSON.stringify(capturedFilter)}, ${JSON.stringify(responseBody)}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log(` Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

runUnitTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
