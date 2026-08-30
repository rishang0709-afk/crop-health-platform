/**
 * riskEngineService.js
 *
 * Rule-based contextual risk engine.
 *
 * Combines:
 *  - AI vision evidence and severity
 *  - Current and forecasted weather conditions
 *  - Crop growth stage susceptibility
 *
 * Rules:
 *  - Deterministic and explainable (AI_RULES.md Section 18, Docs/AI.md Section 17).
 *  - AI confidence routing is strictly separate from risk calculation (Docs/AI.md Section 19).
 *  - When weather is unavailable, factors are renormalized so missing weather does
 *    not artificially deflate risk (Adjustment #3).
 *  - When prediction is 'unknown', returns null with an explanation (Adjustment #5).
 */

'use strict';

const {
  DEFAULT_FACTOR_WEIGHTS,
  NO_WEATHER_FACTOR_WEIGHTS,
  WEATHER_THRESHOLDS,
  GROWTH_STAGE_SUSCEPTIBILITY,
  SEVERITY_LEVEL_WEIGHTS,
} = require('../config/agronomicRules');
const { RISK_LEVELS, RISK_SCORE_THRESHOLDS } = require('../models/RiskAssessment');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resolveRiskLevel(score) {
  if (score <= RISK_SCORE_THRESHOLDS.LOW_MAX) {
    return RISK_LEVELS.LOW;
  }
  if (score <= RISK_SCORE_THRESHOLDS.MEDIUM_MAX) {
    return RISK_LEVELS.MEDIUM;
  }
  if (score <= RISK_SCORE_THRESHOLDS.HIGH_MAX) {
    return RISK_LEVELS.HIGH;
  }
  return RISK_LEVELS.CRITICAL;
}

// ---------------------------------------------------------------------------
// AI Evidence Factor Calculation (0.0 to 1.0)
// ---------------------------------------------------------------------------

function calculateAiEvidenceFactor(prediction, severity, explanations) {
  if (!prediction) {
    return 0.50;
  }

  const confidence = typeof prediction.confidence === 'number'
    ? clamp(prediction.confidence, 0, 1)
    : 0.50;

  if (prediction.type === 'healthy') {
    explanations.push(`Crop is identified as healthy (model confidence: ${Math.round(confidence * 100)}%).`);
    return clamp(0.05 * (1 - confidence), 0.01, 0.10);
  }

  if (prediction.type === 'disease' || prediction.type === 'pest') {
    // Base evidence from confidence (0.0 to 0.70)
    const baseEvidence = confidence * 0.70;

    // Severity bonus (0.0 to 0.30)
    let severityBonus = SEVERITY_LEVEL_WEIGHTS.default;
    if (severity && typeof severity.score === 'number') {
      severityBonus = clamp(severity.score / 100, 0, 1) * 0.30;
      explanations.push(
        `AI detected ${prediction.name || prediction.type} with ${Math.round(confidence * 100)}% confidence and severity score ${severity.score}/100.`
      );
    } else if (severity && severity.level) {
      const lvl = String(severity.level).toLowerCase();
      severityBonus = SEVERITY_LEVEL_WEIGHTS[lvl] || SEVERITY_LEVEL_WEIGHTS.default;
      explanations.push(
        `AI detected ${prediction.name || prediction.type} with ${Math.round(confidence * 100)}% confidence and ${lvl} severity.`
      );
    } else {
      explanations.push(
        `AI detected ${prediction.name || prediction.type} with ${Math.round(confidence * 100)}% confidence.`
      );
    }

    return clamp(baseEvidence + severityBonus, 0.05, 1.0);
  }

  return 0.50;
}

// ---------------------------------------------------------------------------
// Weather Favorability Factor Calculation (0.0 to 1.0)
// ---------------------------------------------------------------------------

function calculateWeatherFactor(weather, explanations) {
  if (!weather || typeof weather !== 'object') {
    explanations.push('Weather data temporarily unavailable — risk calculated from crop stage and AI diagnosis alone.');
    return null;
  }

  let weatherScore = 0.10; // Baseline ambient favorability

  const { humidity, temperature, rainfall, forecast } = weather;
  const t = WEATHER_THRESHOLDS;

  // 1. Relative Humidity Evaluation
  if (typeof humidity === 'number') {
    if (humidity >= t.humidity.criticalThreshold) {
      weatherScore += 0.40;
      explanations.push(`High relative humidity (${humidity}%) promotes foliar pathogen spread.`);
    } else if (humidity >= t.humidity.highThreshold) {
      weatherScore += 0.25;
      explanations.push(`Elevated relative humidity (${humidity}%) increases leaf surface moisture.`);
    } else if (humidity < t.humidity.moderateThreshold) {
      weatherScore += 0.05;
      explanations.push(`Low atmospheric humidity (${humidity}%) is less conducive to foliar disease spread.`);
    } else {
      weatherScore += 0.15;
    }
  }

  // 2. Temperature Evaluation
  if (typeof temperature === 'number') {
    if (temperature >= t.temperature.optimalMin && temperature <= t.temperature.optimalMax) {
      weatherScore += 0.25;
      explanations.push(`Ambient temperature (${temperature}°C) is within the active development range for crop pathogens.`);
    } else if (temperature < 12 || temperature > 38) {
      weatherScore += 0.05;
      explanations.push(`Ambient temperature (${temperature}°C) is outside typical pathogen multiplication range.`);
    } else {
      weatherScore += 0.15;
    }
  }

  // 3. Rainfall / Precipitation Evaluation
  if (typeof rainfall === 'number') {
    if (rainfall >= t.rainfall.heavyThreshold) {
      weatherScore += 0.30;
      explanations.push(`Recent precipitation (${rainfall}mm) creates prolonged leaf wetness.`);
    } else if (rainfall >= t.rainfall.moderateThreshold) {
      weatherScore += 0.20;
      explanations.push(`Recent rainfall (${rainfall}mm) contributes to leaf surface moisture.`);
    }
  }

  // 4. Short-Range Rain Forecast Evaluation
  if (forecast && typeof forecast.next24hRainProbability === 'number') {
    if (forecast.next24hRainProbability >= t.rainProbability.highThreshold) {
      weatherScore += 0.15;
      explanations.push(`Upcoming rain forecast (${forecast.next24hRainProbability}% probability in 24h) indicates elevated disease spread risk.`);
    }
  }

  return clamp(weatherScore, 0.05, 1.0);
}

// ---------------------------------------------------------------------------
// Crop Growth Stage Susceptibility Factor (0.0 to 1.0)
// ---------------------------------------------------------------------------

function calculateCropStageFactor(crop, growthStage, explanations) {
  const normalizedStage = growthStage ? String(growthStage).trim().toLowerCase() : null;

  const stageScore = normalizedStage && GROWTH_STAGE_SUSCEPTIBILITY[normalizedStage] !== undefined
    ? GROWTH_STAGE_SUSCEPTIBILITY[normalizedStage]
    : GROWTH_STAGE_SUSCEPTIBILITY.default;

  if (normalizedStage) {
    if (stageScore >= 0.80) {
      explanations.push(`Crop in '${normalizedStage}' stage has elevated vulnerability to damage and yield loss.`);
    } else if (stageScore <= 0.40) {
      explanations.push(`Crop in '${normalizedStage}' stage has reduced vulnerability.`);
    } else {
      explanations.push(`Crop in '${normalizedStage}' stage has moderate susceptibility.`);
    }
  }

  return stageScore;
}

// ---------------------------------------------------------------------------
// Main Risk Assessment Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate contextual crop-health risk based on AI evidence, weather conditions,
 * and crop stage susceptibility.
 *
 * @param {object} detection - Detection document (must include prediction, severity, crop, growthStage)
 * @param {object|null} weatherSnapshot - Normalized weather snapshot or null
 * @returns {object|null} Structured risk assessment object, or null if prediction is unknown
 */
function calculateRisk(detection, weatherSnapshot = null) {
  if (!detection || !detection.prediction) {
    return null;
  }

  // Adjustment #5: Unknown predictions cannot produce a valid contextual disease risk assessment
  if (detection.prediction.type === 'unknown') {
    return null;
  }

  const explanations = [];

  // 1. Calculate individual factor sub-scores
  const aiEvidence = calculateAiEvidenceFactor(detection.prediction, detection.severity, explanations);
  const weatherRisk = calculateWeatherFactor(weatherSnapshot, explanations);
  const cropStageRisk = calculateCropStageFactor(detection.crop, detection.growthStage, explanations);

  // 2. Select factor weights and renormalize if weather is missing (Adjustment #3)
  let rawScore = 0;
  if (weatherRisk !== null) {
    const w = DEFAULT_FACTOR_WEIGHTS;
    rawScore = (w.aiEvidence * aiEvidence + w.weatherRisk * weatherRisk + w.cropStageRisk * cropStageRisk) * 100;
  } else {
    const w = NO_WEATHER_FACTOR_WEIGHTS;
    rawScore = (w.aiEvidence * aiEvidence + w.cropStageRisk * cropStageRisk) * 100;
  }

  // 3. Special rule for confirmed healthy crops (cannot be high/critical risk)
  if (detection.prediction.type === 'healthy') {
    rawScore = Math.min(rawScore, 20);
  }

  const score = Math.round(clamp(rawScore, 0, 100));
  const level = resolveRiskLevel(score);

  return {
    score,
    level,
    factors: {
      aiEvidence: Number(aiEvidence.toFixed(2)),
      weatherRisk: weatherRisk !== null ? Number(weatherRisk.toFixed(2)) : null,
      cropStageRisk: Number(cropStageRisk.toFixed(2)),
      nearbyReportsRisk: 0,
      historicalRisk: 0,
    },
    explanation: explanations,
    weatherSnapshot: weatherSnapshot || null,
  };
}

module.exports = {
  calculateRisk,
  calculateAiEvidenceFactor,
  calculateWeatherFactor,
  calculateCropStageFactor,
  resolveRiskLevel,
};
