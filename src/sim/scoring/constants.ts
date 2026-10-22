// Scoring constants for Phase 1A v0 basic evaluation
// Structure will be replaced in Phase 4 by doctrinal decision tree

export const SCORING_WEIGHTS = {
  DETECTION: 0.2,
  CLASSIFICATION: 0.3,
  DECISION: 0.5,
  HOSTILE_CONTACT_WEIGHT: 3,
  NEUTRAL_CONTACT_WEIGHT: 1,
} as const;

export const DETECTION_THRESHOLDS = {
  PERFECT_LATENCY_S: 3.0,
  MAX_LATENCY_S: 20.0,
} as const;

export const PENALTIES = {
  ENGAGE_CIVILIAN_QUAD: 25,
  ENGAGE_BIRD: 5,
  ENGAGE_DECOY: 3,
  WASTED_JAMMER_NON_RF: 5,
  ASSET_HIT: 30,
} as const;

export const HOSTILE_STANDOFF_THRESHOLD_M = 400;
