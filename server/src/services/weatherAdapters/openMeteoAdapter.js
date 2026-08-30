/**
 * openMeteoAdapter.js
 *
 * Open-Meteo weather API adapter.
 * Open-Meteo provides accurate open meteorological data without requiring an API key.
 *
 * API Documentation: https://open-meteo.com/en/docs
 */

'use strict';

const https = require('https');
const http = require('http');

/**
 * Perform an HTTP/HTTPS GET request and return parsed JSON.
 */
function httpGetJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let rawData = '';

      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`Open-Meteo API returned HTTP status ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.body = rawData;
          return reject(error);
        }

        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (jsonErr) {
          reject(new Error(`Failed to parse Open-Meteo JSON response: ${jsonErr.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const timeoutError = new Error(`Open-Meteo request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'WEATHER_TIMEOUT';
      reject(timeoutError);
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Normalize raw Open-Meteo JSON payload into the standard weather snapshot schema.
 *
 * @param {object} raw - Parsed Open-Meteo API response
 * @returns {object} Normalized weather snapshot
 */
function normalizeOpenMeteoPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      temperature: null,
      humidity: null,
      rainfall: 0,
      windSpeed: 0,
      forecast: { next24hRainProbability: null },
      capturedAt: new Date(),
    };
  }

  const current = raw.current || {};
  const hourly = raw.hourly || {};

  const temperature = typeof current.temperature_2m === 'number' ? current.temperature_2m : null;
  const humidity = typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null;
  const rainfall = typeof current.precipitation === 'number' ? Math.max(0, current.precipitation) : 0;
  const windSpeed = typeof current.wind_speed_10m === 'number' ? Math.max(0, current.wind_speed_10m) : 0;

  let next24hRainProbability = null;
  if (Array.isArray(hourly.precipitation_probability) && hourly.precipitation_probability.length > 0) {
    const validProbs = hourly.precipitation_probability.filter((p) => typeof p === 'number');
    if (validProbs.length > 0) {
      next24hRainProbability = Math.max(...validProbs);
    }
  }

  return {
    temperature,
    humidity,
    rainfall,
    windSpeed,
    forecast: {
      next24hRainProbability,
    },
    capturedAt: new Date(),
  };
}

/**
 * Fetch live weather from Open-Meteo for given coordinates and normalize
 * into the standard weather snapshot schema.
 *
 * @param {object} coords - { longitude, latitude }
 * @param {number} timeoutMs - Max timeout in milliseconds
 * @returns {Promise<object>} Normalized weather snapshot
 */
async function fetchWeather({ longitude, latitude }, timeoutMs = 5000) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m` +
    `&hourly=precipitation_probability&forecast_days=1`;

  const raw = await httpGetJson(url, timeoutMs);
  return normalizeOpenMeteoPayload(raw);
}

module.exports = {
  name: 'open-meteo',
  fetchWeather,
  normalizeOpenMeteoPayload,
};
