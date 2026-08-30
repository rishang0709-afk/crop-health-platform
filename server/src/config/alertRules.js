/**
 * alertRules.js
 *
 * Centralized catalog of alert evaluation rules, canonical event keys,
 * and user-facing alert message templates.
 *
 * IMPORTANT DESIGN RULES:
 * - Alerts communicate WHAT happened, WHY attention is needed, and WHERE to review guidance.
 * - Alerts MUST NOT contain treatment/management instructions (no pruning, irrigation,
 *   sanitation, biological, or chemical guidance). Treatment instructions belong exclusively
 *   to the IPM Recommendation Engine.
 * - When a diagnosis is pending human expert review, alert wording is strictly provisional
 *   and does NOT present uncertain AI predictions as confirmed.
 */

'use strict';

// ---------------------------------------------------------------------------
// Canonical Alert Types & Severities (Docs/DATABASE.md Section 13)
// ---------------------------------------------------------------------------

const ALERT_TYPES = Object.freeze({
  EARLY_WARNING: 'EARLY_WARNING',
  HIGH_RISK: 'HIGH_RISK',
  EXPERT_REVIEW: 'EXPERT_REVIEW',
  SYSTEM: 'SYSTEM',
  HOTSPOT: 'HOTSPOT',     // Reserved for future milestone
  FOLLOW_UP: 'FOLLOW_UP', // Reserved for future milestone
});

const ALERT_SEVERITIES = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

// ---------------------------------------------------------------------------
// Event Key Generator
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic deduplication key for an alert event.
 * Format: "{detectionId}:{alertType}:{eventQualifier}"
 */
function generateDedupKey(detectionId, alertType, eventQualifier) {
  return `${detectionId}:${alertType}:${eventQualifier}`;
}

// ---------------------------------------------------------------------------
// Message Templates (Strictly Free of Treatment Instructions)
// ---------------------------------------------------------------------------

const ALERT_TEMPLATES = {
  // Environmental Risk: CRITICAL
  EARLY_WARNING_CRITICAL: {
    type: ALERT_TYPES.EARLY_WARNING,
    severity: ALERT_SEVERITIES.CRITICAL,
    eventQualifier: 'CRITICAL',
    title: (crop) => `Critical Crop Risk: ${crop || 'Field Plot'}`,
    message: () =>
      'Weather conditions and crop growth stage indicate critical environmental risk for rapid disease spread. Check your field and review the latest risk assessment and IPM guidance.',
  },

  // Environmental Risk: HIGH
  EARLY_WARNING_HIGH: {
    type: ALERT_TYPES.EARLY_WARNING,
    severity: ALERT_SEVERITIES.HIGH,
    eventQualifier: 'HIGH',
    title: (crop) => `Elevated Crop Risk: ${crop || 'Field Plot'}`,
    message: () =>
      'High environmental favorability detected for this plot. Increase scouting frequency and review the latest risk assessment and IPM recommendations.',
  },

  // Environmental Risk while Pending Expert Review (Provisional Wording)
  EARLY_WARNING_PENDING_REVIEW: {
    type: ALERT_TYPES.EARLY_WARNING,
    severity: ALERT_SEVERITIES.HIGH,
    eventQualifier: 'PENDING_REVIEW',
    title: (crop) => `Elevated Crop Risk: ${crop || 'Field Plot'} (Pending Review)`,
    message: () =>
      'Elevated environmental risk detected for this field while diagnosis awaits human expert verification. Review provisional IPM guidance.',
  },

  // High Observed Symptom Severity on Actionable Detection
  HIGH_RISK_SEVERE: {
    type: ALERT_TYPES.HIGH_RISK,
    severity: ALERT_SEVERITIES.HIGH,
    eventQualifier: 'HIGH',
    title: (crop, diagnosisName) =>
      diagnosisName ? `Severe ${diagnosisName} Symptoms: ${crop || 'Crop'}` : `Severe Symptoms Detected: ${crop || 'Crop'}`,
    message: (crop, diagnosisName) =>
      diagnosisName
        ? `Severe symptoms of ${diagnosisName} were detected on your crop. Review the detailed IPM management plan.`
        : 'Severe crop damage symptoms were detected on your crop. Review the detailed IPM management plan.',
  },

  // Pending Expert Review Required
  EXPERT_REVIEW_REQUIRED: {
    type: ALERT_TYPES.EXPERT_REVIEW,
    severity: ALERT_SEVERITIES.MEDIUM,
    eventQualifier: 'REQUIRED',
    title: (crop) => `Expert Review Requested: ${crop || 'Crop'}`,
    message: () =>
      'AI diagnostic confidence is below review threshold. Your detection has been queued for human expert verification.',
  },

  // Expert Review Completed: CONFIRMED
  EXPERT_REVIEW_CONFIRMED: {
    type: ALERT_TYPES.EXPERT_REVIEW,
    severity: ALERT_SEVERITIES.MEDIUM,
    eventQualifier: 'CONFIRMED',
    title: (crop, diagnosisName) =>
      diagnosisName ? `Diagnosis Confirmed by Expert: ${diagnosisName}` : `Expert Review Completed: ${crop || 'Crop'}`,
    message: (crop, diagnosisName) =>
      diagnosisName
        ? `An agronomist has confirmed the diagnosis for this detection as ${diagnosisName}. Updated IPM guidance is available.`
        : 'An agronomist has confirmed the diagnosis for this detection. Updated IPM guidance is available.',
  },

  // Expert Review Completed: CORRECTED
  EXPERT_REVIEW_CORRECTED: {
    type: ALERT_TYPES.EXPERT_REVIEW,
    severity: ALERT_SEVERITIES.HIGH,
    eventQualifier: 'CORRECTED',
    title: (crop, diagnosisName) =>
      diagnosisName ? `Diagnosis Corrected by Expert: ${diagnosisName}` : `Diagnosis Updated by Expert: ${crop || 'Crop'}`,
    message: (crop, diagnosisName) =>
      diagnosisName
        ? `An agronomist has reviewed this detection and updated the diagnosis to ${diagnosisName}. Review the updated IPM management plan.`
        : 'An agronomist has reviewed this detection and updated the diagnosis. Review the updated IPM management plan.',
  },

  // AI Analysis Failed
  SYSTEM_AI_FAILED: {
    type: ALERT_TYPES.SYSTEM,
    severity: ALERT_SEVERITIES.MEDIUM,
    eventQualifier: 'AI_FAILED',
    title: (crop) => `Image Analysis Inconclusive: ${crop || 'Crop'}`,
    message: () =>
      'The AI could not reliably analyze the submitted photo. Please re-capture a clear, focused photograph in natural daylight.',
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  ALERT_TYPES,
  ALERT_SEVERITIES,
  generateDedupKey,
  ALERT_TEMPLATES,
};
