// Generic illustrative parameters for training; not real specifications.

/** Weight for each hostile contact in the weighted mean. */
export const HOSTILE_WEIGHT = 4;
/** Weight for each neutral contact (bird, civilian_quad, decoy) in the weighted mean. */
export const NEUTRAL_WEIGHT = 1;

// Detection scoring
/** Full detection credit: acknowledge within this many seconds of confirmation. */
export const DETECTION_FULL_SEC = 3;
/** Zero detection credit: acknowledge later than this many seconds after confirmation. */
export const DETECTION_ZERO_SEC = 20;

// Classification scoring
/** Exact match score. */
export const CLASS_EXACT = 1.0;
/** FPV family credit (fpv_kamikaze / fpv_fiber). */
export const CLASS_FPV_FAMILY = 0.5;
/** Wrong class score. */
export const CLASS_WRONG = 0.0;

// Engagement scoring weights
export const ENG_OUTCOME_W = 0.6;
export const ENG_FIT_W = 0.2;
export const ENG_LATENCY_W = 0.2;

// Outcome distance bands (metres)
/** Full outcome credit: neutralised at or beyond this range. */
export const OUTCOME_FULL_RANGE_M = 400;
/** Half outcome credit: neutralised between HALF and FULL range. */
export const OUTCOME_HALF_RANGE_M = 200;

// Fit penalties (jammer on non-RF target)
export const FIT_WRONG_JAMMER_EMITTING_PENALTY = 0;   // waived (information_limited)
export const FIT_WRONG_JAMMER_AMBIGUOUS_PENALTY = -2;
export const FIT_WRONG_JAMMER_SILENT_PENALTY = -5;

// Latency
/** Full latency credit: engage within this many seconds of classifying hostile. */
export const LATENCY_FULL_SEC = 4;
/** Zero latency credit: engage later than this many seconds. */
export const LATENCY_ZERO_SEC = 15;

// Contact score weights
export const CONTACT_DETECTION_W = 0.20;
export const CONTACT_CLASSIFICATION_W = 0.25;
export const CONTACT_ENGAGEMENT_W = 0.55;

// Mission-level penalties
export const PENALTY_ASSET_HIT = -30;
export const PENALTY_FALSE_TRACK = -5;
export const PENALTY_CIVILIAN_QUAD_ENGAGED = -25;
export const PENALTY_BIRD_ENGAGED = -5;
export const PENALTY_DECOY_ENGAGED = -3;

// ROE cap: if civilian quad was engaged, total cannot exceed this
export const ROE_CAP_SCORE = 60;

// --- Scoring v2.2 additions ---
/** Scoring version stamped on stored sessions and bench tables. */
export const SCORE_VERSION = '2.2';

/** Positive-ID gate: hostile engaged before it was classified multiplies effector fit by this. */
export const ENGAGED_UNCLASSIFIED_FIT_MULT = 0.5;
/** Positive-ID gate: discipline penalty per hostile engaged before classification. */
export const PENALTY_ENGAGED_UNCLASSIFIED = -5;

/** Mission failure cap: if the defended asset was hit, total cannot exceed this. */
export const ASSET_HIT_CAP_SCORE = 50;

// Grade bands (lower bounds, inclusive). Below GRADE_MARGINAL_MIN => Unsatisfactory.
export const GRADE_MARGINAL_MIN = 50;
export const GRADE_COMPETENT_MIN = 70;
export const GRADE_PROFICIENT_MIN = 85;
