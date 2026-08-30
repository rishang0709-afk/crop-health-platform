/**
 * weatherService.js
 *
 * Weather service orchestrator responsible for:
 *  - Provider selection (Open-Meteo, Mock)
 *  - Geospatial coordinate caching (30-minute TTL per ~1.1km grid cell)
 *  - Coordinate boundary validation
 *  - Strict request timeout enforcement
 *  - Graceful degradation returning null when external providers fail
 *
 * Specification: Docs/ARCHITECTURE.md Section 6, Docs/DATABASE.md Section 22
 */

'use strict';

const openMeteoAdapter = require('./weatherAdapters/openMeteoAdapter');
const mockWeatherAdapter = require('./weatherAdapters/mockWeatherAdapter');

// ---------------------------------------------------------------------------
// Adapters Registry
// ---------------------------------------------------------------------------

const ADAPTERS = {
  'open-meteo': openMeteoAdapter,
  mock: mockWeatherAdapter,
};

// ---------------------------------------------------------------------------
// In-Memory Geospatial Cache
// ---------------------------------------------------------------------------

/**
 * Cache store: Map of coordinateKey -> { data, expiresAt }
 * Key format: "lng.toFixed(2),lat.toFixed(2)" (~1.1 km spatial grid)
 */
const weatherCache = new Map();

/**
 * Generate a cache key from coordinates rounded to 2 decimal places.
 */
function getCacheKey(longitude, latitude) {
  return `${Number(longitude).toFixed(2)},${Number(latitude).toFixed(2)}`;
}

/**
 * Clear expired entries from the in-memory cache.
 */
function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of weatherCache.entries()) {
    if (now > entry.expiresAt) {
      weatherCache.delete(key);
    }
  }
}

/**
 * Clear entire weather cache (useful for test isolation).
 */
function clearCache() {
  weatherCache.clear();
}

/**
 * Get the current number of cached weather entries.
 */
function getCacheSize() {
  evictExpired();
  return weatherCache.size;
}

// ---------------------------------------------------------------------------
// Provider Resolution
// ---------------------------------------------------------------------------

let activeProviderOverride = null;

function getActiveAdapter() {
  if (activeProviderOverride && ADAPTERS[activeProviderOverride]) {
    return ADAPTERS[activeProviderOverride];
  }

  const configuredProvider = (process.env.WEATHER_PROVIDER || 'mock').trim().toLowerCase();
  return ADAPTERS[configuredProvider] || mockWeatherAdapter;
}

function setActiveProvider(name) {
  if (name && ADAPTERS[name]) {
    activeProviderOverride = name;
  } else if (name === null) {
    activeProviderOverride = null;
  }
}

function getActiveProviderName() {
  const adapter = getActiveAdapter();
  return adapter.name;
}

// ---------------------------------------------------------------------------
// Core Weather Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve a normalized weather snapshot for the given geographical coordinates.
 *
 * @param {object} coords - { longitude, latitude }
 * @param {object} [options] - { forceRefresh: boolean }
 * @returns {Promise<object|null>} Normalized weather snapshot or null on failure/invalid input
 */
async function getWeatherSnapshot(coords, options = {}) {
  // 1. Validate coordinates
  if (!coords || typeof coords !== 'object') {
    return null;
  }

  const lng = Number(coords.longitude ?? coords[0]);
  const lat = Number(coords.latitude ?? coords[1]);

  if (isNaN(lng) || isNaN(lat)) {
    return null;
  }

  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null;
  }

  const cacheKey = getCacheKey(lng, lat);
  const now = Date.now();

  // 2. Check cache (unless forceRefresh is requested)
  if (!options.forceRefresh) {
    const cached = weatherCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.data;
    }
  }

  // 3. Resolve adapter and timeouts
  const adapter = getActiveAdapter();
  const timeoutMs = parseInt(process.env.WEATHER_TIMEOUT_MS, 10) || 5000;
  const ttlMinutes = parseInt(process.env.WEATHER_CACHE_TTL_MINUTES, 10) || 30;
  const ttlMs = ttlMinutes * 60 * 1000;

  try {
    // 4. Fetch from provider with strict timeout
    const fetchPromise = adapter.fetchWeather({ longitude: lng, latitude: lat }, timeoutMs);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`Weather request timed out after ${timeoutMs}ms`);
        err.code = 'WEATHER_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    // 5. Store in cache
    weatherCache.set(cacheKey, {
      data: snapshot,
      expiresAt: now + ttlMs,
    });

    return snapshot;
  } catch (error) {
    // Failure handling (AI_RULES.md Section 16 & adjustment #3):
    // Never throw; log warning and gracefully return null so detection flow proceeds.
    console.warn(`Weather service warning [${adapter.name}]: ${error.message}`);
    return null;
  }
}

module.exports = {
  getWeatherSnapshot,
  clearCache,
  getCacheSize,
  getActiveProviderName,
  setActiveProvider,
  mockAdapter: mockWeatherAdapter,
  openMeteoAdapter,
};
