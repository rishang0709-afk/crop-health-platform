/**
 * agronomicRules.js
 *
 * Configurable parameters, factor weights, and environmental thresholds
 * for the Contextual Risk Engine.
 *
 * IMPORTANT:
 * All threshold values and factor weights in this file represent MVP rule assumptions.
 * They are isolated here so that agricultural experts and extension officers can
 * validate and tune them against empirical crop pathology data without modifying
 * the core risk calculation engine.
 */

'use strict';

// ---------------------------------------------------------------------------
// Factor Weights (must sum to 1.00 when all factors are available)
// ---------------------------------------------------------------------------

const DEFAULT_FACTOR_WEIGHTS = {
  aiEvidence: 0.50,     // Weight given to AI vision prediction + severity
  weatherRisk: 0.30,    // Weight given to environmental/weather favorability
  cropStageRisk: 0.20,  // Weight given to crop growth stage susceptibility
};

/**
 * Renormalize factor weights when weather data is unavailable.
 * Ensures the composite risk score is not artificially deflated by missing weather.
 */
const NO_WEATHER_FACTOR_WEIGHTS = {
  aiEvidence: 0.70,     // 0.50 / (0.50 + 0.20)
  weatherRisk: 0.00,
  cropStageRisk: 0.30,  // 0.20 / (0.50 + 0.20)
};

// ---------------------------------------------------------------------------
// Environmental / Weather Thresholds (MVP Assumptions)
// ---------------------------------------------------------------------------

const WEATHER_THRESHOLDS = {
  // Relative humidity thresholds (% RH)
  humidity: {
    criticalThreshold: 80,    // RH >= 80% creates high fungal sporulation risk
    highThreshold: 70,        // RH >= 70% creates elevated moisture risk
    moderateThreshold: 60,    // RH >= 60% creates moderate risk
  },

  // Temperature ranges in Celsius (°C)
  temperature: {
    // Warm-moist range typical for common foliar fungal/bacterial spread
    optimalMin: 18,
    optimalMax: 30,
  },

  // Precipitation thresholds (mm)
  rainfall: {
    heavyThreshold: 10,       // >= 10 mm creates prolonged leaf wetness
    moderateThreshold: 2,     // >= 2 mm creates leaf wetness
  },

  // Rain probability in next 24 hours (%)
  rainProbability: {
    highThreshold: 60,        // >= 60% indicates impending rain risk
  },
};

// ---------------------------------------------------------------------------
// Crop Stage Susceptibility Weights (0.0 to 1.0)
// ---------------------------------------------------------------------------

/**
 * Vulnerability weighting by crop growth stage.
 * Flowering, fruiting, and seedling stages are generally more sensitive to yield loss.
 */
const GROWTH_STAGE_SUSCEPTIBILITY = {
  seedling: 0.80,
  vegetative: 0.60,
  flowering: 0.85,
  fruiting: 0.80,
  harvest: 0.30,
  mature: 0.30,
  default: 0.50,
};

// ---------------------------------------------------------------------------
// Severity Level Weights (0.0 to 1.0)
// ---------------------------------------------------------------------------

const SEVERITY_LEVEL_WEIGHTS = {
  critical: 0.30,
  high: 0.25,
  moderate: 0.15,
  low: 0.05,
  default: 0.15,
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  DEFAULT_FACTOR_WEIGHTS,
  NO_WEATHER_FACTOR_WEIGHTS,
  WEATHER_THRESHOLDS,
  GROWTH_STAGE_SUSCEPTIBILITY,
  SEVERITY_LEVEL_WEIGHTS,
};
