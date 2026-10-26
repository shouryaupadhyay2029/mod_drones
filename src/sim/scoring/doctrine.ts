import { SimEvent } from '../core/types.js';
import { Actor } from '../model/actors.js';
import { THREAT_LIBRARY, ThreatClassId } from '../model/threats.js';
import { Track } from '../model/tracks.js';
import { GroundTruthSummary, ScorePenalty } from './basic.js';
import {
  CLASS_EXACT,
  CLASS_FPV_FAMILY,
  CLASS_WRONG,
  CONTACT_CLASSIFICATION_W,
  CONTACT_DETECTION_W,
  CONTACT_ENGAGEMENT_W,
  DETECTION_FULL_SEC,
  DETECTION_ZERO_SEC,
  ENGAGED_UNCLASSIFIED_FIT_MULT,
  GRADE_COMPETENT_MIN,
  GRADE_MARGINAL_MIN,
  GRADE_PROFICIENT_MIN,
  PENALTY_ENGAGED_UNCLASSIFIED,
  ASSET_HIT_CAP_SCORE,
  ENG_FIT_W,
  ENG_LATENCY_W,
  ENG_OUTCOME_W,
  FIT_WRONG_JAMMER_AMBIGUOUS_PENALTY,
  FIT_WRONG_JAMMER_EMITTING_PENALTY,
  FIT_WRONG_JAMMER_SILENT_PENALTY,
  HOSTILE_WEIGHT,
  LATENCY_FULL_SEC,
  LATENCY_ZERO_SEC,
  NEUTRAL_WEIGHT,
  OUTCOME_FULL_RANGE_M,
  OUTCOME_HALF_RANGE_M,
  PENALTY_ASSET_HIT,
  PENALTY_BIRD_ENGAGED,
  PENALTY_CIVILIAN_QUAD_ENGAGED,
  PENALTY_DECOY_ENGAGED,
  PENALTY_FALSE_TRACK,
  ROE_CAP_SCORE,
} from './doctrineConstants.js';

export interface DecisionNode {
  id: string;
  question: string;
  answer: string;
  points: number;
  maxPoints: number;
  cause: string | null;
  note?: string;
}

export interface ContactScoreV2 {
  actorId: number;
  classId: ThreatClassId;
  weight: number;
  observable: boolean;
  d: number; // 0.0 - 1.0
  c: number; // 0.0 - 1.0
  e: number; // 0.0 - 1.0
  contactTotal: number; // 0.0 - 1.0
  totalScore: number; // 0 - 100
  decisionPath: DecisionNode[];
  assessedClass?: ThreatClassId | 'unknown';
  ackLatencySec?: number;
  firstEngagementLatencySec?: number;
  outcome?: number;
  fit?: number;
  latency?: number;
}

export interface UnobservableContact {
  actorId: number;
  classId: ThreatClassId;
  reason: 'unobservable';
  note?: string;
  decisionPath: DecisionNode[];
}

export interface Subscores {
  detection: number; // 0 - 100
  classification: number; // 0 - 100
  engagement: number; // 0 - 100
  discipline: number; // 0 - 100
}

export interface ScoreReportV2 {
  total: number; // 0 - 100
  grade: 'Unsatisfactory' | 'Marginal' | 'Competent' | 'Proficient';
  weightedMean: number; // 0 - 100
  subscores: Subscores;
  perContact: ContactScoreV2[];
  unobservable: UnobservableContact[];
  penalties: ScorePenalty[];
  roeCapApplied: boolean;
  reasons: string[];
  missionDecisionPath: DecisionNode[];
}

function wasClassifiedBeforeEngagement(
  events: readonly SimEvent[],
  engagement: SimEvent,
  track: Track | undefined
): boolean {
  const trackId = engagement.payload?.trackId;
  const trackClassifications = events.filter(
    (event) => event.type === 'TRACK_CLASSIFIED' && event.payload?.trackId === trackId
  );

  if (trackClassifications.length === 0) {
    return track?.classifyTick !== undefined && track.classifyTick <= engagement.tick;
  }

  const engagementIndex = events.indexOf(engagement);
  return engagementIndex >= 0 && events.slice(0, engagementIndex).some(
    (event) => event.type === 'TRACK_CLASSIFIED' && event.payload?.trackId === trackId
  );
}

export function gradeForScore(total: number): ScoreReportV2['grade'] {
  if (total < GRADE_MARGINAL_MIN) return 'Unsatisfactory';
  if (total < GRADE_COMPETENT_MIN) return 'Marginal';
  if (total < GRADE_PROFICIENT_MIN) return 'Competent';
  return 'Proficient';
}

export function computeDetectionScore(ackLatencySec?: number): number {
  if (ackLatencySec === undefined || ackLatencySec < 0) return 0;
  if (ackLatencySec <= DETECTION_FULL_SEC) return 1.0;
  if (ackLatencySec >= DETECTION_ZERO_SEC) return 0.0;
  return (DETECTION_ZERO_SEC - ackLatencySec) / (DETECTION_ZERO_SEC - DETECTION_FULL_SEC);
}

export function computeClassificationScore(
  assessedClass: ThreatClassId | 'unknown' | undefined,
  trueClass: ThreatClassId
): number {
  if (!assessedClass || assessedClass === 'unknown') return CLASS_WRONG;
  if (assessedClass === trueClass) return CLASS_EXACT;
  if (
    (assessedClass === 'fpv_kamikaze' && trueClass === 'fpv_fiber') ||
    (assessedClass === 'fpv_fiber' && trueClass === 'fpv_kamikaze')
  ) {
    return CLASS_FPV_FAMILY;
  }
  return CLASS_WRONG;
}

export function computeOutcomeScore(
  neutralized: boolean,
  distanceM?: number
): number {
  if (!neutralized || distanceM === undefined) return 0.0;
  if (distanceM >= OUTCOME_FULL_RANGE_M) return 1.0;
  if (distanceM >= OUTCOME_HALF_RANGE_M) return 0.5;
  return 0.0;
}

export function getJammerFitPenalty(rfStatusAtFire?: string): number {
  if (rfStatusAtFire === 'emitting') return FIT_WRONG_JAMMER_EMITTING_PENALTY;
  if (rfStatusAtFire === 'ambiguous') return FIT_WRONG_JAMMER_AMBIGUOUS_PENALTY;
  return FIT_WRONG_JAMMER_SILENT_PENALTY;
}

export function computeEngagementLatencyScore(latencySec?: number): number {
  if (latencySec === undefined || latencySec < 0) return 0.0;
  if (latencySec <= LATENCY_FULL_SEC) return 1.0;
  if (latencySec >= LATENCY_ZERO_SEC) return 0.0;
  return (LATENCY_ZERO_SEC - latencySec) / (LATENCY_ZERO_SEC - LATENCY_FULL_SEC);
}

export function scoreSessionV2(
  summaryOrEvents: GroundTruthSummary | readonly SimEvent[],
  maybeSummary?: GroundTruthSummary
): ScoreReportV2 {
  let actors: readonly Actor[] = [];
  let tracks: readonly Track[] = [];
  let events: readonly SimEvent[] = [];
  let assetHit = false;

  if (maybeSummary) {
    actors = maybeSummary.actors || [];
    tracks = maybeSummary.tracks || [];
    events = Array.isArray(summaryOrEvents) ? summaryOrEvents : maybeSummary.events || [];
    assetHit = maybeSummary.assetHit ?? events.some((e) => e.type === 'ASSET_HIT');
  } else {
    const s = summaryOrEvents as GroundTruthSummary;
    actors = s.actors || [];
    tracks = s.tracks || [];
    events = s.events || [];
    assetHit = s.assetHit ?? events.some((e) => e.type === 'ASSET_HIT');
  }

  const penalties: ScorePenalty[] = [];
  const reasons: string[] = [];
  const missionDecisionPath: DecisionNode[] = [];
  const perContact: ContactScoreV2[] = [];
  const unobservable: UnobservableContact[] = [];

  let roeCapApplied = false;

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor) continue;

    const actorTracks = tracks.filter((t) => t.actorId === actor.id);
    const confirmedTracks = actorTracks.filter(
      (t) => t.state === 'confirmed' || t.confirmedTick !== undefined
    );

    // Observability condition: actor is observable if any track for it reached 'confirmed'
    const isObservable = confirmedTracks.length > 0;
    if (!isObservable) {
      unobservable.push({
        actorId: actor.id,
        classId: actor.classId,
        reason: 'unobservable',
        note: 'Contact never reached confirmed radar track state',
        decisionPath: [{
          id: 'observability',
          question: 'Did the contact produce a confirmed track?',
          answer: 'No confirmed track was produced',
          points: 0,
          maxPoints: 0,
          cause: 'unobservable',
        }],
      });
      continue;
    }

    const isHostile = THREAT_LIBRARY[actor.classId]?.hostile ?? false;
    const weight = isHostile ? HOSTILE_WEIGHT : NEUTRAL_WEIGHT;

    // 1. Detection D: Best (lowest latency) acknowledgement across confirmed tracks
    let bestD = 0;
    let minAckLatencySec: number | undefined;

    for (const t of confirmedTracks) {
      if (t.confirmedTick !== undefined && t.acked && t.ackTick !== undefined) {
        const lat = Math.max(0, (t.ackTick - t.confirmedTick) / 20);
        const dScore = computeDetectionScore(lat);
        if (minAckLatencySec === undefined || lat < minAckLatencySec) {
          minAckLatencySec = lat;
          bestD = dScore;
        }
      }
    }

    // 2. Classification C: latest classified track or any classified track
    let latestClassifiedTrack: Track | undefined;
    for (const t of actorTracks) {
      if (t.classifyTick !== undefined) {
        if (!latestClassifiedTrack || (latestClassifiedTrack.classifyTick !== undefined && t.classifyTick > latestClassifiedTrack.classifyTick)) {
          latestClassifiedTrack = t;
        }
      }
    }
    if (!latestClassifiedTrack) {
      latestClassifiedTrack = actorTracks.find((t) => t.assessedClass !== undefined);
    }
    const assessedClass = latestClassifiedTrack?.assessedClass;
    const cScore = computeClassificationScore(assessedClass, actor.classId);

    // 3. Engagement E & Decision Path Nodes
    const decisionPath: DecisionNode[] = [];
    let eScore = 0;
    let outcomeVal = 0;
    let fitVal = 0;
    let latencyVal = 0;
    let engLatencySec: number | undefined;

    const actorEngagements = events.filter(
      (e) =>
        e.type === 'ENGAGEMENT_STARTED' &&
        actorTracks.some((t) => t.trackId === e.payload?.trackId)
    );
    const firstEngagement = actorEngagements[0];
    const isEngaged = actorEngagements.length > 0;
    const trackForEngagement = (engagement: SimEvent): Track | undefined =>
      actorTracks.find((track) => track.trackId === engagement.payload?.trackId);
    const engagementEffector = firstEngagement?.payload?.effector;
    const engagementTrack = firstEngagement ? trackForEngagement(firstEngagement) ?? actorTracks[0] : undefined;
    const isRfControlled = THREAT_LIBRARY[actor.classId]?.rfControlled ?? false;
    const informationLimited =
      engagementEffector === 'jammer' && !isRfControlled &&
      (engagementTrack?.rfStatus === 'emitting' || engagementTrack?.rfStatus === 'ambiguous');
    const unclassifiedEngagements = isHostile
      ? actorEngagements.filter(
          (engagement) =>
            !wasClassifiedBeforeEngagement(events, engagement, trackForEngagement(engagement))
        )
      : [];

    for (let i = 0; i < unclassifiedEngagements.length; i++) {
      const penaltyPoints = Math.abs(PENALTY_ENGAGED_UNCLASSIFIED);
      const reason = `Engaged hostile (${actor.classId}) before it was classified: -${penaltyPoints}`;
      penalties.push({ reason, points: penaltyPoints });
    }
    const firstEngagementUnclassified =
      firstEngagement !== undefined && unclassifiedEngagements.includes(firstEngagement);

    // Detection Node
    decisionPath.push({
      id: 'detection',
      question: 'Was track detected and acknowledged promptly?',
      answer:
        minAckLatencySec !== undefined
          ? `Acknowledged in ${minAckLatencySec.toFixed(1)}s`
          : 'Never acknowledged',
      points: Math.round(bestD * 20 * 10) / 10,
      maxPoints: 20,
      cause: minAckLatencySec === undefined || minAckLatencySec > DETECTION_FULL_SEC ? 'detection_delay' : null,
      note: minAckLatencySec !== undefined ? `Latency: ${minAckLatencySec.toFixed(1)}s` : 'Unacknowledged',
    });

    if (isHostile) {
      // Classification Node
      decisionPath.push({
        id: 'classification',
        question: 'Was threat accurately classified?',
        answer: assessedClass ? `Classified as ${assessedClass}` : 'Unclassified',
        points: Math.round(cScore * 25 * 10) / 10,
        maxPoints: 25,
        cause: cScore < 1 ? 'misclassification' : null,
        note: `True: ${actor.classId}, Assessed: ${assessedClass ?? 'none'}`,
      });

      // Outcome
      const isNeutralized = actor.state === 'neutralized';
      const neutralizedDist = actor.neutralizedDistanceToAsset;
      outcomeVal = computeOutcomeScore(isNeutralized, neutralizedDist);

      decisionPath.push({
        id: 'outcome',
        question: 'Was threat neutralised before standoff range?',
        answer: isNeutralized
          ? `Neutralised at ${Math.round(neutralizedDist ?? 0)}m`
          : actor.state === 'impacted'
            ? 'Reached asset'
            : 'Threat was not neutralised',
        points: Math.round(outcomeVal * 33 * 10) / 10,
        maxPoints: 33,
        cause: isNeutralized ? null : 'missed_threat',
        note: isNeutralized ? `Distance: ${Math.round(neutralizedDist ?? 0)}m` : 'Missed',
      });

      // Fit
      if (isEngaged && firstEngagement) {
        const effector = engagementEffector as string;
        const engagedTrack = engagementTrack;

        if (effector === 'jammer') {
          if (isRfControlled) {
            fitVal = 1.0;
          } else {
            fitVal = 0.0;
            const rfStatusAtFire = (engagedTrack?.rfStatus ?? 'unknown') as string;
            const penalty = getJammerFitPenalty(rfStatusAtFire);
            if (penalty < 0) {
              const pts = Math.abs(penalty);
              penalties.push({
                reason: `Jammer deployed against non-RF threat (${actor.classId}) with rfStatus '${rfStatusAtFire}': -${pts}`,
                points: pts,
              });
            }
          }
        } else if (effector === 'gun') {
          // Check range
          const rangeM = (firstEngagement.payload?.rangeM as number | undefined) ??
            (engagedTrack
              ? Math.sqrt(
                  engagedTrack.estimatedPos.x * engagedTrack.estimatedPos.x +
                    engagedTrack.estimatedPos.y * engagedTrack.estimatedPos.y
                )
              : 0);
          if (rangeM <= 1000) {
            if (!isRfControlled) {
              fitVal = 1.0; // kinetic weapon against non-RF threat is optimal
            } else {
              // Gun against RF target: 0.8 if jammer was free, 1.0 if jammer was busy
              const recentJammerEvt = events.some(
                (e) =>
                  e.type === 'ENGAGEMENT_STARTED' &&
                  e.payload?.effector === 'jammer' &&
                  Math.abs(e.tick - firstEngagement.tick) < 40
              );
              fitVal = recentJammerEvt ? 1.0 : 0.8;
            }
          } else {
            fitVal = 0.0; // out of gun range
          }
        } else {
          fitVal = 0.5;
        }

        if (firstEngagementUnclassified) {
          fitVal *= ENGAGED_UNCLASSIFIED_FIT_MULT;
        }
      } else {
        fitVal = 0.0;
      }

      decisionPath.push({
        id: 'effector_fit',
        question: 'Appropriate effector choice for target signature?',
        answer: isEngaged
          ? `Engaged with ${String(firstEngagement?.payload?.effector ?? 'effector')}`
          : 'Not engaged',
        points: Math.round(fitVal * 11 * 10) / 10,
        maxPoints: 11,
        cause: firstEngagementUnclassified
          ? 'engaged_unclassified'
          : informationLimited
            ? 'information_limited'
            : isEngaged && fitVal === 0
              ? 'wrong_effector'
              : null,
        note: isEngaged
          ? firstEngagementUnclassified
            ? `Effector: ${firstEngagement?.payload?.effector} (fit x${ENGAGED_UNCLASSIFIED_FIT_MULT}: engaged before classification)`
            : `Effector: ${firstEngagement?.payload?.effector}`
          : 'None',
      });

      // Latency
      if (isEngaged && firstEngagement) {
        const rangeTick = events.find(
          (event) => event.type === 'TRACK_IN_RANGE' &&
            event.payload?.trackId === firstEngagement.payload?.trackId &&
            event.payload?.effector === firstEngagement.payload?.effector
        )?.tick;
        const classifiedTick = latestClassifiedTrack?.classifyTick ?? confirmedTracks[0]?.confirmedTick;
        const referenceTick = Math.max(classifiedTick ?? firstEngagement.tick, rangeTick ?? classifiedTick ?? firstEngagement.tick);
        engLatencySec = Math.max(0, (firstEngagement.tick - referenceTick) / 20);
        latencyVal = computeEngagementLatencyScore(engLatencySec);
      } else {
        latencyVal = 0.0;
      }

      decisionPath.push({
        id: 'engagement_latency',
        question: 'Engagement dispatched promptly upon classification/confirmation?',
        answer:
          engLatencySec !== undefined
            ? `Engaged within ${engLatencySec.toFixed(1)}s`
            : 'Never engaged',
        points: Math.round(latencyVal * 11 * 10) / 10,
        maxPoints: 11,
        cause: engLatencySec !== undefined && engLatencySec > LATENCY_FULL_SEC ? 'late_engagement' : null,
        note: engLatencySec !== undefined ? `Latency: ${engLatencySec.toFixed(1)}s` : 'None',
      });

      eScore = ENG_OUTCOME_W * outcomeVal + ENG_FIT_W * fitVal + ENG_LATENCY_W * latencyVal;
    } else {
      // Neutral contact
      decisionPath.push({
        id: 'classification',
        question: 'Was contact identified as neutral/civilian?',
        answer: assessedClass ? `Classified as ${assessedClass}` : 'Unclassified',
        points: Math.round(cScore * 25 * 10) / 10,
        maxPoints: 25,
        cause: cScore < 1 ? 'misclassification' : null,
        note: `True: ${actor.classId}, Assessed: ${assessedClass ?? 'none'}`,
      });

      if (!isEngaged) {
        eScore = 1.0;
        decisionPath.push({
          id: 'rules_of_engagement',
          question: 'Was fire held against neutral/civilian contact?',
          answer: 'Fire held (no engagement)',
          points: 55,
          maxPoints: 55,
          cause: null,
          note: 'Complied with ROE',
        });
      } else {
        eScore = 0.0;
        let penPoints = 0;
        if (actor.classId === 'commercial_quad') {
          penPoints = Math.abs(PENALTY_CIVILIAN_QUAD_ENGAGED);
          penalties.push({
            reason: `Engaged civilian quadcopter: -${penPoints}`,
            points: penPoints,
          });
          roeCapApplied = true;
        } else if (actor.classId === 'bird') {
          penPoints = Math.abs(PENALTY_BIRD_ENGAGED);
          penalties.push({
            reason: `Engaged wildlife (bird): -${penPoints}`,
            points: penPoints,
          });
        } else if (actor.classId === 'decoy_drone') {
          penPoints = Math.abs(PENALTY_DECOY_ENGAGED);
          penalties.push({
            reason: `Engaged decoy drone: -${penPoints}`,
            points: penPoints,
          });
        }

        decisionPath.push({
          id: 'rules_of_engagement',
          question: 'Was fire held against neutral/civilian contact?',
          answer: `Engaged ${actor.classId}`,
          points: 0,
          maxPoints: 55,
          cause: 'engaged_neutral',
          note: `Violated ROE (-${penPoints} pts)`,
        });
      }
    }

    const contactTotal =
      CONTACT_DETECTION_W * bestD +
      CONTACT_CLASSIFICATION_W * cScore +
      CONTACT_ENGAGEMENT_W * eScore;

    perContact.push({
      actorId: actor.id,
      classId: actor.classId,
      weight,
      observable: true,
      d: Math.round(bestD * 1000) / 1000,
      c: Math.round(cScore * 1000) / 1000,
      e: Math.round(eScore * 1000) / 1000,
      contactTotal: Math.round(contactTotal * 1000) / 1000,
      totalScore: Math.round(contactTotal * 100),
      decisionPath,
      assessedClass,
      ackLatencySec: minAckLatencySec,
      firstEngagementLatencySec: engLatencySec,
      outcome: outcomeVal,
      fit: fitVal,
      latency: latencyVal,
    });
  }

  // Mission-level Penalties
  if (assetHit) {
    const penPts = Math.abs(PENALTY_ASSET_HIT);
    penalties.push({
      reason: `Defended asset was hit: -${penPts}`,
      points: penPts,
    });
  }

  // False track engagements (-5 per ghost track engaged)
  for (const trk of tracks) {
    if (trk.isGhost) {
      const ghostEngagement = events.find(
        (e) => e.type === 'ENGAGEMENT_STARTED' && e.payload?.trackId === trk.trackId
      );
      if (ghostEngagement) {
        const penPts = Math.abs(PENALTY_FALSE_TRACK);
        penalties.push({
          reason: `Engaged radar ghost track ${trk.trackId}: -${penPts}`,
          points: penPts,
        });
        missionDecisionPath.push({
          id: 'false_track_engagement',
          question: 'Was fire directed at a false radar track?',
          answer: `Ghost track ${trk.trackId} engaged with ${String(ghostEngagement.payload?.effector ?? 'effector')}`,
          points: 0,
          maxPoints: 0,
          cause: 'false_track_engaged',
        });
      }
    }
  }

  // Weighted Mean Calculation across observable contacts
  let weightedSum = 0;
  let totalWeight = 0;
  let weightedD = 0;
  let weightedC = 0;
  let weightedE = 0;

  for (const c of perContact) {
    weightedSum += c.contactTotal * c.weight;
    weightedD += c.d * c.weight;
    weightedC += c.c * c.weight;
    weightedE += c.e * c.weight;
    totalWeight += c.weight;
  }

  const rawWeightedMean = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const detectionSubscore = totalWeight > 0 ? (weightedD / totalWeight) * 100 : 100;
  const classificationSubscore = totalWeight > 0 ? (weightedC / totalWeight) * 100 : 100;
  const engagementSubscore = totalWeight > 0 ? (weightedE / totalWeight) * 100 : 100;

  let sumPenaltyPoints = 0;
  for (const p of penalties) {
    sumPenaltyPoints += p.points;
    reasons.push(p.reason);
  }

  const disciplineSubscore = Math.max(0, Math.min(100, 100 - sumPenaltyPoints));

  let total = Math.max(0, Math.min(100, Math.round(rawWeightedMean - sumPenaltyPoints)));
  if (roeCapApplied && total > ROE_CAP_SCORE) {
    total = ROE_CAP_SCORE;
    reasons.push(`ROE Cap applied: score capped at ${ROE_CAP_SCORE} due to civilian contact engagement`);
  }
  if (assetHit && total > ASSET_HIT_CAP_SCORE) {
    total = ASSET_HIT_CAP_SCORE;
    reasons.push(`Mission failure cap applied: score capped at ${ASSET_HIT_CAP_SCORE} after asset hit`);
  }

  return {
    total,
    grade: gradeForScore(total),
    weightedMean: Math.round(rawWeightedMean * 10) / 10,
    subscores: {
      detection: Math.round(detectionSubscore * 10) / 10,
      classification: Math.round(classificationSubscore * 10) / 10,
      engagement: Math.round(engagementSubscore * 10) / 10,
      discipline: Math.round(disciplineSubscore * 10) / 10,
    },
    perContact,
    unobservable,
    penalties,
    roeCapApplied,
    reasons,
    missionDecisionPath,
  };
}
