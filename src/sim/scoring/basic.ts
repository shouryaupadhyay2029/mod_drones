import { SimEvent } from '../core/types.js';
import { Actor } from '../model/actors.js';
import { ThreatClassId } from '../model/threats.js';
import { Track } from '../model/tracks.js';
import {
  DETECTION_THRESHOLDS,
  HOSTILE_STANDOFF_THRESHOLD_M,
  PENALTIES,
  SCORING_WEIGHTS,
} from './constants.js';

export interface GroundTruthSummary {
  actors: readonly Actor[];
  tracks: readonly Track[];
  events: readonly SimEvent[];
  assetHit?: boolean;
}

export interface ContactScore {
  actorId: number;
  classId: ThreatClassId;
  detectionScore: number;
  classificationScore: number;
  decisionScore: number;
  contactTotal: number;
  ackLatencySec?: number;
  assessedClass?: ThreatClassId | 'unknown';
  engagedWithoutClassification: boolean;
}

export interface ScorePenalty {
  reason: string;
  points: number;
}

export interface ScoreReport {
  total: number;
  weightedMean: number;
  perContact: ContactScore[];
  penalties: ScorePenalty[];
  reasons: string[];
}

function formatTickTime(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function scoreSession(
  eventsOrSummary: readonly SimEvent[] | GroundTruthSummary,
  truthArg?: GroundTruthSummary
): ScoreReport {
  let actors: readonly Actor[] = [];
  let tracks: readonly Track[] = [];
  let events: readonly SimEvent[] = [];
  let assetHit = false;

  if (truthArg) {
    actors = truthArg.actors;
    tracks = truthArg.tracks;
    events = Array.isArray(eventsOrSummary) ? eventsOrSummary : truthArg.events;
    assetHit = truthArg.assetHit ?? events.some((e) => e.type === 'ASSET_HIT');
  } else {
    const summary = eventsOrSummary as GroundTruthSummary;
    actors = summary.actors || [];
    tracks = summary.tracks || [];
    events = summary.events || [];
    assetHit = summary.assetHit ?? events.some((e) => e.type === 'ASSET_HIT');
  }

  const reasons: string[] = [];
  const penalties: ScorePenalty[] = [];
  const perContact: ContactScore[] = [];

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor) continue;

    const track = tracks.find((t) => t.actorId === actor.id);
    const weight =
      actor.classId === 'fpv_kamikaze'
        ? SCORING_WEIGHTS.HOSTILE_CONTACT_WEIGHT
        : SCORING_WEIGHTS.NEUTRAL_CONTACT_WEIGHT;
    totalWeight += weight;

    // 1. Detection scoring
    let detectionScore = 0;
    let latencySec: number | undefined;

    if (track && track.confirmedTick !== undefined) {
      if (track.acked && track.ackTick !== undefined) {
        latencySec = Math.max(0, (track.ackTick - track.confirmedTick) / 20);
        if (latencySec <= DETECTION_THRESHOLDS.PERFECT_LATENCY_S) {
          detectionScore = 1.0;
        } else if (latencySec <= DETECTION_THRESHOLDS.MAX_LATENCY_S) {
          detectionScore =
            1.0 -
            (latencySec - DETECTION_THRESHOLDS.PERFECT_LATENCY_S) /
              (DETECTION_THRESHOLDS.MAX_LATENCY_S - DETECTION_THRESHOLDS.PERFECT_LATENCY_S);
        } else {
          detectionScore = 0;
        }
      } else {
        detectionScore = 0;
      }
    }

    // 2. Classification scoring
    let classificationScore = 0;
    if (track && track.assessedClass) {
      if (track.assessedClass === actor.classId) {
        classificationScore = 1.0;
      } else {
        classificationScore = 0;
      }
    }

    // 3. Decision scoring
    let decisionScore = 0;
    const engagementsOnTrack = events.filter(
      (e) => e.type === 'ENGAGEMENT_STARTED' && e.payload?.trackId === track?.trackId
    );
    const firstEngagement = engagementsOnTrack[0];
    const engaged = engagementsOnTrack.length > 0;

    let engagedWithoutClassification = false;
    if (engaged && firstEngagement) {
      if (track?.classifyTick === undefined || firstEngagement.tick < track.classifyTick) {
        engagedWithoutClassification = true;
      }
    }

    if (actor.classId === 'fpv_kamikaze') {
      if (actor.state === 'neutralized') {
        const neutralizedDist = actor.neutralizedDistanceToAsset ?? 0;
        if (neutralizedDist >= HOSTILE_STANDOFF_THRESHOLD_M) {
          decisionScore = 1.0;
          reasons.push(
            `Hostile drone neutralized at ${Math.round(neutralizedDist)}m (>400m standoff): 100% decision score`
          );
        } else {
          decisionScore = 0.5;
          reasons.push(
            `Hostile drone neutralized late at ${Math.round(neutralizedDist)}m (<400m standoff): 50% decision score`
          );
        }
      } else {
        decisionScore = 0;
        reasons.push(`Hostile drone was NOT neutralized: 0% decision score`);
      }
    } else {
      // Neutral contact (civilian quad or bird)
      if (engaged) {
        decisionScore = 0;
      } else {
        decisionScore = 1.0;
        reasons.push(`Held fire / avoided engaging neutral contact (${actor.classId}): 100% decision score`);
      }
    }

    if (engagedWithoutClassification) {
      decisionScore *= 0.5;
      reasons.push(`Contact ${actor.classId} engaged without prior classification: decision score halved`);
    }

    const contactTotal =
      SCORING_WEIGHTS.DETECTION * detectionScore +
      SCORING_WEIGHTS.CLASSIFICATION * classificationScore +
      SCORING_WEIGHTS.DECISION * decisionScore;

    perContact.push({
      actorId: actor.id,
      classId: actor.classId,
      detectionScore,
      classificationScore,
      decisionScore,
      contactTotal,
      ackLatencySec: latencySec,
      assessedClass: track?.assessedClass,
      engagedWithoutClassification,
    });

    weightedSum += contactTotal * weight;
  }

  // Calculate penalties
  // Penalty 1: Engaged civilian quad
  const quadActor = actors.find((a) => a.classId === 'commercial_quad');
  const quadTrack = tracks.find((t) => t.actorId === quadActor?.id);
  const quadEngagedEvent = events.find(
    (e) => e.type === 'ENGAGEMENT_STARTED' && e.payload?.trackId === quadTrack?.trackId
  );
  if (quadEngagedEvent) {
    const penMsg = `Engaged civilian quad at ${formatTickTime(quadEngagedEvent.tick)}: -${PENALTIES.ENGAGE_CIVILIAN_QUAD}`;
    penalties.push({ reason: penMsg, points: PENALTIES.ENGAGE_CIVILIAN_QUAD });
    reasons.push(penMsg);
  }

  // Penalty 2: Engaged bird
  const birdActor = actors.find((a) => a.classId === 'bird');
  const birdTrack = tracks.find((t) => t.actorId === birdActor?.id);
  const birdEngagedEvent = events.find(
    (e) => e.type === 'ENGAGEMENT_STARTED' && e.payload?.trackId === birdTrack?.trackId
  );
  if (birdEngagedEvent) {
    const penMsg = `Engaged bird at ${formatTickTime(birdEngagedEvent.tick)}: -${PENALTIES.ENGAGE_BIRD}`;
    penalties.push({ reason: penMsg, points: PENALTIES.ENGAGE_BIRD });
    reasons.push(penMsg);
  }

  // Penalty 3: Wasted jammer on non-RF target
  const noEffectEvents = events.filter((e) => e.type === 'NO_EFFECT');
  for (let i = 0; i < noEffectEvents.length; i++) {
    const evt = noEffectEvents[i];
    if (evt) {
      const penMsg = `Wasted jammer on non-RF target at ${formatTickTime(evt.tick)}: -${PENALTIES.WASTED_JAMMER_NON_RF}`;
      penalties.push({ reason: penMsg, points: PENALTIES.WASTED_JAMMER_NON_RF });
      reasons.push(penMsg);
    }
  }

  // Penalty 4: Asset was hit
  if (assetHit) {
    const penMsg = `Asset was hit: -${PENALTIES.ASSET_HIT}`;
    penalties.push({ reason: penMsg, points: PENALTIES.ASSET_HIT });
    reasons.push(penMsg);
  }

  const rawWeightedMean = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  let totalPenaltyPoints = 0;
  for (let i = 0; i < penalties.length; i++) {
    const p = penalties[i];
    if (p) totalPenaltyPoints += p.points;
  }

  const total = Math.max(0, Math.min(100, Math.round(rawWeightedMean - totalPenaltyPoints)));

  return {
    total,
    weightedMean: Math.round(rawWeightedMean * 10) / 10,
    perContact,
    penalties,
    reasons,
  };
}
