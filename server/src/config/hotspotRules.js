/**
 * hotspotRules.js
 *
 * Configurable rules for the Regional Hotspot Detection engine.
 *
 * IMPORTANT MVP ASSUMPTIONS:
 * All threshold values below are operational MVP assumptions pending
 * epidemiological validation. They do not represent scientifically
 * validated disease-spread constants.
 */

'use strict';

module.exports = {
  // Grid resolution in degrees (0.05 degrees is approximately 5x5 km at equator).
  // This is a simple geographic approximation, susceptible to boundary splits,
  // not an exact geographic radius.
  GRID_RESOLUTION: 0.05,

  // Maximum age of a detection in days to be considered part of an active hotspot.
  TIME_WINDOW_DAYS: 14,

  // Minimum actionable reports in a grid cell required to form a hotspot.
  MIN_REPORTS: 3,

  // Minimum distinct fields required in a grid cell to qualify as a hotspot.
  MIN_DISTINCT_FIELDS: 2,

  // Minimum distinct farmers (userIds) required in a grid cell to qualify.
  MIN_DISTINCT_FARMERS: 2,

  // Severity thresholds mapping contribution count and average risk score
  // to the canonical architectural risk levels: MEDIUM, HIGH, CRITICAL.
  // LOW and sub-threshold groups are not considered active hotspots.
  SEVERITY_THRESHOLDS: {
    CRITICAL: { minContributions: 10, minRiskScore: 65 },
    HIGH: { minContributions: 5, minRiskScore: 35 },
    MEDIUM: { minContributions: 3, minRiskScore: 0 }
  }
};
