/**
 * aiService.js
 *
 * Service for communicating with the standalone FastAPI AI service.
 *
 * Responsibilities:
 *  - Validate AI_SERVICE_URL configuration without hardcoding fallback URLs.
 *  - Securely fetch crop image from Detection.image.url with timeout and size limits.
 *  - Send multipart/form-data request to FastAPI POST /predict with timeout.
 *  - Strictly validate and normalize the prediction and severity response schema.
 *
 * Security & Reliability:
 *  - Protocol enforcement: only http: and https: URLs are permitted.
 *  - Timeouts enforced via AbortController to prevent hanging sockets.
 *  - Size limits enforced (10 MB maximum) on downloaded images.
 *  - Never trusts untyped or malformed responses from upstream AI.
 */

'use strict';

const PREDICTION_TYPES = new Set(['disease', 'pest', 'healthy', 'unknown']);
const SEVERITY_LEVELS = new Set(['low', 'moderate', 'high', 'critical']);
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10000; // 10 seconds
const DEFAULT_PREDICT_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Custom error class for AI service operations.
 */
class AiServiceError extends Error {
  constructor(code, message, statusCode = 502, details = null) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Validate and retrieve the configured AI service base URL.
 *
 * @returns {string} Clean base URL (without trailing slash)
 * @throws {AiServiceError} If AI_SERVICE_URL is missing or malformed
 */
function getAiServiceUrl() {
  const rawUrl = process.env.AI_SERVICE_URL;

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new AiServiceError(
      'AI_SERVICE_NOT_CONFIGURED',
      'AI_SERVICE_URL is not configured in the environment.',
      503
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AiServiceError(
      'AI_SERVICE_CONFIG_INVALID',
      `AI_SERVICE_URL '${rawUrl}' is not a valid URL.`,
      500
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AiServiceError(
      'AI_SERVICE_CONFIG_INVALID',
      `AI_SERVICE_URL must use HTTP or HTTPS protocol, got '${parsed.protocol}'.`,
      500
    );
  }

  return rawUrl.trim().replace(/\/+$/, '');
}

/**
 * Download image binary data from a URL with timeout and size enforcement.
 *
 * @param {string} imageUrl
 * @param {object} options
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImageBuffer(imageUrl, options = {}) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new AiServiceError('INVALID_IMAGE_URL', 'Image URL is missing or invalid.', 400);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new AiServiceError('INVALID_IMAGE_URL', `Malformed image URL: ${imageUrl}`, 400);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new AiServiceError(
      'INVALID_IMAGE_URL_PROTOCOL',
      `Image URL must use http: or https:, got '${parsedUrl.protocol}'.`,
      400
    );
  }

  const timeoutMs = options.downloadTimeoutMs || DEFAULT_DOWNLOAD_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,*/*' },
    });

    if (!response.ok) {
      throw new AiServiceError(
        'IMAGE_DOWNLOAD_FAILED',
        `Failed to download image: upstream server returned HTTP ${response.status}`,
        502
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      throw new AiServiceError(
        'IMAGE_TOO_LARGE',
        `Downloaded image exceeds the maximum limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`,
        400
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new AiServiceError('EMPTY_IMAGE', 'Downloaded image file is empty (0 bytes).', 400);
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new AiServiceError(
        'IMAGE_TOO_LARGE',
        `Downloaded image exceeds the maximum limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`,
        400
      );
    }

    return buffer;
  } catch (err) {
    if (err instanceof AiServiceError) throw err;

    if (err.name === 'AbortError') {
      throw new AiServiceError(
        'IMAGE_DOWNLOAD_TIMEOUT',
        `Image download timed out after ${timeoutMs}ms.`,
        504
      );
    }

    throw new AiServiceError(
      'IMAGE_DOWNLOAD_FAILED',
      `Image download failed: ${err.message}`,
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send image and crop context to FastAPI POST /predict endpoint.
 *
 * @param {Buffer} imageBuffer
 * @param {object} context - { crop, growthStage, symptoms }
 * @param {object} options
 * @returns {Promise<object>} Raw parsed JSON response from FastAPI
 */
async function callFastApiPredict(imageBuffer, context = {}, options = {}) {
  const baseUrl = getAiServiceUrl();
  const endpoint = `${baseUrl}/predict`;

  const formData = new FormData();
  formData.append(
    'image',
    new Blob([imageBuffer], { type: 'image/jpeg' }),
    'crop_image.jpg'
  );

  if (context.crop && typeof context.crop === 'string' && context.crop.trim()) {
    formData.append('crop', context.crop.trim());
  }

  if (context.growthStage && typeof context.growthStage === 'string' && context.growthStage.trim()) {
    formData.append('growthStage', context.growthStage.trim());
  }

  if (Array.isArray(context.symptoms) && context.symptoms.length > 0) {
    formData.append('symptoms', context.symptoms.join(', '));
  } else if (typeof context.symptoms === 'string' && context.symptoms.trim()) {
    formData.append('symptoms', context.symptoms.trim());
  }

  const timeoutMs = options.predictTimeoutMs || DEFAULT_PREDICT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      // Ignore text read error
    }

    let parsedJson = null;
    if (bodyText) {
      try {
        parsedJson = JSON.parse(bodyText);
      } catch {
        // Body is not JSON
      }
    }

    if (!response.ok) {
      const errorMsg =
        (parsedJson && parsedJson.error && parsedJson.error.message) ||
        (parsedJson && parsedJson.detail) ||
        `FastAPI AI service responded with HTTP ${response.status}`;

      throw new AiServiceError(
        'AI_SERVICE_ERROR',
        `AI prediction service error: ${errorMsg}`,
        502,
        parsedJson
      );
    }

    if (!parsedJson || typeof parsedJson !== 'object') {
      throw new AiServiceError(
        'INVALID_AI_RESPONSE',
        'AI prediction service returned a non-JSON response.',
        502
      );
    }

    return parsedJson;
  } catch (err) {
    if (err instanceof AiServiceError) throw err;

    if (err.name === 'AbortError') {
      throw new AiServiceError(
        'AI_SERVICE_TIMEOUT',
        `AI service prediction request timed out after ${timeoutMs}ms.`,
        504
      );
    }

    throw new AiServiceError(
      'AI_SERVICE_UNAVAILABLE',
      `Unable to reach AI prediction service at ${endpoint}: ${err.message}`,
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate and normalize the prediction response according to Docs/AI.md.
 *
 * @param {object} data - Parsed JSON response from FastAPI
 * @returns {{ prediction: object, severity: object|null }} Normalized prediction & severity
 * @throws {AiServiceError} If schema validation fails
 */
function validateAndNormalizeAiResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new AiServiceError('INVALID_AI_RESPONSE', 'AI response must be an object.', 502);
  }

  if (data.success !== true) {
    const msg = (data.error && data.error.message) || 'AI service indicated unsuccessful prediction.';
    throw new AiServiceError('AI_SERVICE_FAILED', msg, 502);
  }

  const { prediction, model } = data;

  if (!prediction || typeof prediction !== 'object') {
    throw new AiServiceError('INVALID_AI_RESPONSE', 'Missing prediction object in AI response.', 502);
  }

  if (!PREDICTION_TYPES.has(prediction.type)) {
    throw new AiServiceError(
      'INVALID_AI_RESPONSE',
      `Invalid prediction.type '${prediction.type}'. Must be one of: ${Array.from(PREDICTION_TYPES).join(', ')}.`,
      502
    );
  }

  if (
    typeof prediction.confidence !== 'number' ||
    isNaN(prediction.confidence) ||
    prediction.confidence < 0 ||
    prediction.confidence > 1
  ) {
    throw new AiServiceError(
      'INVALID_AI_RESPONSE',
      `Invalid prediction.confidence '${prediction.confidence}'. Must be a number between 0 and 1.`,
      502
    );
  }

  if (prediction.name !== null && prediction.name !== undefined && typeof prediction.name !== 'string') {
    throw new AiServiceError(
      'INVALID_AI_RESPONSE',
      'prediction.name must be a string or null.',
      502
    );
  }

  let normalizedSeverity = null;
  if (prediction.severity !== null && prediction.severity !== undefined) {
    if (typeof prediction.severity !== 'object') {
      throw new AiServiceError('INVALID_AI_RESPONSE', 'prediction.severity must be an object or null.', 502);
    }

    const { level, score } = prediction.severity;
    if (level !== null && level !== undefined && !SEVERITY_LEVELS.has(level)) {
      throw new AiServiceError(
        'INVALID_AI_RESPONSE',
        `Invalid severity.level '${level}'. Must be one of: ${Array.from(SEVERITY_LEVELS).join(', ')}.`,
        502
      );
    }

    if (score !== null && score !== undefined) {
      if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 100) {
        throw new AiServiceError(
          'INVALID_AI_RESPONSE',
          `Invalid severity.score '${score}'. Must be a number between 0 and 100.`,
          502
        );
      }
    }

    normalizedSeverity = {
      level: level ?? null,
      score: score ?? null,
    };
  }

  if (!model || typeof model !== 'object') {
    throw new AiServiceError('INVALID_AI_RESPONSE', 'Missing model metadata in AI response.', 502);
  }

  if (!model.name || typeof model.name !== 'string' || !model.name.trim()) {
    throw new AiServiceError('INVALID_AI_RESPONSE', 'model.name must be a non-empty string.', 502);
  }

  if (!model.version || typeof model.version !== 'string' || !model.version.trim()) {
    throw new AiServiceError('INVALID_AI_RESPONSE', 'model.version must be a non-empty string.', 502);
  }

  return {
    prediction: {
      type: prediction.type,
      name: prediction.name ? prediction.name.trim() : null,
      confidence: prediction.confidence,
      modelName: model.name.trim(),
      modelVersion: model.version.trim(),
    },
    severity: normalizedSeverity,
  };
}

/**
 * High-level orchestration function to download image, call FastAPI, and validate prediction.
 *
 * @param {string} imageUrl - Stored image URL
 * @param {object} context - { crop, growthStage, symptoms }
 * @param {object} options - { downloadTimeoutMs, predictTimeoutMs }
 * @returns {Promise<{ prediction: object, severity: object|null }>}
 */
async function analyzeDetectionImage(imageUrl, context = {}, options = {}) {
  const imageBuffer = await downloadImageBuffer(imageUrl, options);
  const rawResponse = await callFastApiPredict(imageBuffer, context, options);
  return validateAndNormalizeAiResponse(rawResponse);
}

module.exports = {
  AiServiceError,
  getAiServiceUrl,
  downloadImageBuffer,
  callFastApiPredict,
  validateAndNormalizeAiResponse,
  analyzeDetectionImage,
};
