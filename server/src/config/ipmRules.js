/**
 * ipmRules.js
 *
 * Centralized catalog of conservative Integrated Pest Management (IPM) rules,
 * category-level biological guidance, non-prescriptive chemical disclaimers,
 * and growth-stage / risk-level urgency modulators.
 *
 * IMPORTANT AGRONOMIC DISCLAIMER:
 * All rules and actions defined in this file represent conservative MVP assumptions
 * pending formal validation by licensed agricultural experts and local extension authorities.
 *
 * SAFETY RULES:
 * - NO pesticide brand names or commercial formulations.
 * - NO specific active ingredients, chemical classes, dosages, concentrations, spray intervals, or PHI values.
 * - NO specific microorganism strains or biological agent species names.
 * - NO speculative chemical treatments for unknown conditions or pending reviews.
 * - Always defer to locally approved agricultural guidance and registered product labels.
 */

'use strict';

const RULE_VERSION = 'ipm-mvp-v1';

// ---------------------------------------------------------------------------
// Standard Disclaimers & Safety Guidance
// ---------------------------------------------------------------------------

const CHEMICAL_SAFETY_DISCLAIMER =
  'If chemical intervention is considered, consult local agricultural extension authorities and strictly follow approved, registered product label instructions.';

const GENERAL_BIOLOGICAL_GUIDANCE =
  'Consider locally approved biological-control options appropriate for the diagnosed condition after consulting agricultural guidance.';

// ---------------------------------------------------------------------------
// Condition-Specific IPM Guidance (Conservative MVP Ruleset)
// ---------------------------------------------------------------------------

const CONDITION_RULES = {
  // Tomato - Early Blight
  'early blight': {
    immediateActions: [
      'Remove severely affected lower foliage only where appropriate and safe to reduce local spore load.',
      'Avoid working among wet plants to prevent spreading pathogen spores to healthy foliage.',
    ],
    monitoringActions: [
      'Increase scouting frequency and closely monitor adjacent plants for spreading concentric leaf spots.',
    ],
    culturalControls: [
      'Reduce unnecessary leaf wetness where appropriate by using ground-level watering methods.',
      'Improve canopy airflow where agronomically appropriate through proper plant spacing.',
    ],
    biologicalControls: [
      GENERAL_BIOLOGICAL_GUIDANCE,
    ],
    chemicalGuidance: [
      CHEMICAL_SAFETY_DISCLAIMER,
    ],
  },

  // Tomato - Late Blight
  'late blight': {
    immediateActions: [
      'Promptly remove and safely destroy severely infected plants or tissues away from the field boundary.',
      'Avoid overhead watering that keeps leaf surfaces wet.',
    ],
    monitoringActions: [
      'Increase scouting frequency, checking leaf margins and stems closely during humid or rainy weather.',
    ],
    culturalControls: [
      'Reduce unnecessary leaf wetness where appropriate.',
      'Ensure adequate field drainage and improve air circulation through the crop canopy.',
    ],
    biologicalControls: [
      GENERAL_BIOLOGICAL_GUIDANCE,
    ],
    chemicalGuidance: [
      CHEMICAL_SAFETY_DISCLAIMER,
    ],
  },

  // Powdery Mildew
  'powdery mildew': {
    immediateActions: [
      'Prune severely infected shaded leaves where appropriate and safe to improve light penetration.',
    ],
    monitoringActions: [
      'Increase scouting frequency, checking older leaves and sheltered canopy areas for white powdery patches.',
    ],
    culturalControls: [
      'Improve canopy airflow where agronomically appropriate.',
      'Avoid excess nitrogen fertilization that promotes overly dense, susceptible vegetative growth.',
    ],
    biologicalControls: [
      GENERAL_BIOLOGICAL_GUIDANCE,
    ],
    chemicalGuidance: [
      CHEMICAL_SAFETY_DISCLAIMER,
    ],
  },

  // Generic Disease Fallback
  'generic_disease': {
    immediateActions: [
      'Remove severely affected plant material only where appropriate and safe to reduce local spread.',
      'Sanitize pruning tools between plants to avoid mechanical transmission.',
    ],
    monitoringActions: [
      'Increase scouting frequency and closely monitor adjacent plants for spreading symptoms.',
    ],
    culturalControls: [
      'Reduce unnecessary leaf wetness where appropriate.',
      'Improve canopy airflow where agronomically appropriate.',
    ],
    biologicalControls: [
      GENERAL_BIOLOGICAL_GUIDANCE,
    ],
    chemicalGuidance: [
      CHEMICAL_SAFETY_DISCLAIMER,
    ],
  },

  // Generic Pest Infestation
  'generic_pest': {
    immediateActions: [
      'Physically remove or isolate heavily infested plant parts where appropriate and practical.',
      'Consider physical barriers or mechanical exclusion where suitable for the crop setup.',
    ],
    monitoringActions: [
      'Increase scouting frequency, checking shoot tips and undersides of leaves for pest activity.',
    ],
    culturalControls: [
      'Maintain field hygiene by managing weeds that may serve as alternate pest hosts.',
      'Support natural beneficial insect habitats around field borders where feasible.',
    ],
    biologicalControls: [
      GENERAL_BIOLOGICAL_GUIDANCE,
    ],
    chemicalGuidance: [
      CHEMICAL_SAFETY_DISCLAIMER,
    ],
  },

  // Healthy Crop
  'healthy': {
    immediateActions: [
      'Maintain routine crop care; no disease or pest management interventions are required.',
    ],
    monitoringActions: [
      'Continue regular routine scouting for early signs of pest or disease entry.',
    ],
    culturalControls: [
      'Maintain balanced irrigation, proper nutrient management, and standard weed control.',
    ],
    biologicalControls: [],
    chemicalGuidance: [],
  },

  // Unknown Prediction
  'unknown': {
    immediateActions: [
      'Do not apply unverified chemical treatments or prune excessively without an identified cause.',
    ],
    monitoringActions: [
      'Monitor the symptomatic area closely to observe whether patterns spread or change.',
    ],
    culturalControls: [
      'Ensure general field hygiene and avoid waterlogging around roots.',
    ],
    biologicalControls: [],
    chemicalGuidance: [],
  },

  // Analysis Failed
  'ai_failed': {
    immediateActions: [
      'No immediate treatment actions recommended.',
    ],
    monitoringActions: [
      'Re-capture a clear, focused photograph in natural daylight for re-analysis.',
    ],
    culturalControls: [
      'Maintain standard routine crop maintenance.',
    ],
    biologicalControls: [],
    chemicalGuidance: [],
  },

  // Pending Expert Review (Provisional Safe State)
  'provisional_review': {
    immediateActions: [
      'Implement safe, non-chemical cultural sanitation only while human expert review is pending.',
      'Avoid applying condition-specific chemical products until expert validation is complete.',
    ],
    monitoringActions: [
      'Closely monitor symptomatic plants and note any rapid progression.',
    ],
    culturalControls: [
      'Reduce unnecessary leaf wetness where appropriate and improve canopy ventilation.',
    ],
    biologicalControls: [],
    chemicalGuidance: [],
  },
};

// ---------------------------------------------------------------------------
// Urgency & Environmental Risk Modulators
// ---------------------------------------------------------------------------

const RISK_URGENCY_MODULATORS = {
  CRITICAL: 'Elevated environmental risk indicates weather conditions highly conducive to disease progression. Increase scouting frequency and avoid practices that prolong leaf wetness.',
  HIGH: 'High environmental risk indicates conditions favorable for pathogen spread. Closely inspect adjacent plots and ensure optimal field drainage.',
  MEDIUM: 'Moderate environmental risk. Maintain regular scouting and standard preventative cultural practices.',
  LOW: 'Low environmental risk. Weather conditions are not currently favorable for rapid disease spread.',
};

// ---------------------------------------------------------------------------
// Growth Stage Sensitivity Notes
// ---------------------------------------------------------------------------

const GROWTH_STAGE_NOTES = {
  flowering: 'Crop is in flowering stage; prioritize non-disruptive cultural and biological methods to protect flower retention and yield potential.',
  fruiting: 'Crop is in fruiting stage; ensure adequate field hygiene to protect developing fruit from foliar and fruit-rot pathogens.',
  seedling: 'Crop is in seedling stage; monitor young plants closely for damping-off or early systemic damage.',
  vegetative: 'Crop is in vegetative stage; focus on canopy structure and balanced nutrient management.',
  harvest: 'Crop is in harvest/mature stage; observe all applicable safety intervals for any field interventions.',
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  RULE_VERSION,
  CHEMICAL_SAFETY_DISCLAIMER,
  GENERAL_BIOLOGICAL_GUIDANCE,
  CONDITION_RULES,
  RISK_URGENCY_MODULATORS,
  GROWTH_STAGE_NOTES,
};
