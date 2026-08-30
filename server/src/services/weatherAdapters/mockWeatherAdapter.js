/**
 * mockWeatherAdapter.js
 *
 * Deterministic in-memory weather adapter for testing and offline development.
 */

'use strict';

let customMockData = null;
let shouldFail = false;
let simulatedDelayMs = 0;

/**
 * Reset mock adapter to default state.
 */
function resetMock() {
  customMockData = null;
  shouldFail = false;
  simulatedDelayMs = 0;
}

/**
 * Set custom mock data for a test scenario.
 */
function setMockData(data) {
  customMockData = data;
}

/**
 * Configure whether the mock adapter should simulate a service failure.
 */
function setSimulateFailure(fail) {
  shouldFail = fail;
}

/**
 * Set a simulated response delay in milliseconds.
 */
function setSimulatedDelay(ms) {
  simulatedDelayMs = ms;
}

/**
 * Fetch mock weather snapshot.
 *
 * @param {object} coords - { longitude, latitude }
 * @returns {Promise<object>} Normalized weather snapshot
 */
async function fetchWeather({ longitude, latitude }) {
  if (simulatedDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));
  }

  if (shouldFail) {
    const error = new Error('Simulated weather service failure');
    error.code = 'WEATHER_SERVICE_ERROR';
    throw error;
  }

  if (customMockData) {
    return {
      temperature: customMockData.temperature ?? 25.0,
      humidity: customMockData.humidity ?? 80,
      rainfall: customMockData.rainfall ?? 5.0,
      windSpeed: customMockData.windSpeed ?? 12.0,
      forecast: {
        next24hRainProbability: customMockData.forecast?.next24hRainProbability ?? 65,
      },
      capturedAt: customMockData.capturedAt ? new Date(customMockData.capturedAt) : new Date(),
    };
  }

  // Default deterministic weather conditions (warm, humid, mild rainfall)
  return {
    temperature: 26.5,
    humidity: 82,
    rainfall: 8.5,
    windSpeed: 14.0,
    forecast: {
      next24hRainProbability: 70,
    },
    capturedAt: new Date(),
  };
}

module.exports = {
  name: 'mock',
  fetchWeather,
  setMockData,
  setSimulateFailure,
  setSimulatedDelay,
  resetMock,
};
