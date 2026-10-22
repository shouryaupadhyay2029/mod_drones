import { SimEvent } from '../core/types.js';
import { Actor } from '../model/actors.js';
import { THREAT_LIBRARY, ThreatClassId } from '../model/threats.js';
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

export interface EffectorUse {
  gunBurstsFired: number;
  jammerCycles: number;
  killsPerEffector: {
    gun: number;
    jammer: number;
  };
  wastedEngagements: {
    ghost: number;
    decoy: number;
    neutral: number;
  };
}

export interface ScoreReport {
  total: number;
  weightedMean: number;
  perContact: ContactScore[];
  penalties: ScorePenalty[];
  reasons: string[];
  effectorUse: EffectorUse;
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

  // 1. Calculate generalized contact weights
  const hostiles = actors.filter((a) => THREAT_LIBRARY[a.classId]?.hostile);
  const neutrals = actors.filter((a) => !THREAT_LIBRARY[a.classId]?.hostile);

  const actorWeights = new Map<number, number>();

  if (actors.length > 0) {
    if (hostiles.length === 0) {
      const w = 1.0 / neutrals.length;
      for (const a of neutrals) actorWeights.set(a.id, w);
    } else if (neutrals.length === 0) {
      const w = 1.0 / hostiles.length;
      for (const a of hostiles) actorWeights.set(a.id, w);
    } else {
      let hostileEach: number;
      if (hostiles.length === 1) {
        hostileEach = 0.6;
      } else if (hostiles.length === 2) {
        hostileEach = 0.4;
      } else {
        hostileEach = Math.min(0.4, 0.8 / hostiles.length);
      }

      const totalHostileWeight = hostileEach * hostiles.length;
      const remainingNeutralPool = Math.max(0.1 * neutrals.length, 1.0 - totalHostileWeight);
      const neutralEach = remainingNeutralPool / neutrals.length;

      let sumW = 0;
      for (const a of hostiles) {
        actorWeights.set(a.id, hostileEach);
        sumW += hostileEach;
      }
      for (const a of neutrals) {
        actorWeights.set(a.id, neutralEach);
        sumW += neutralEach;
      }

      // Normalize sum to 1.0
      if (sumW > 0) {
        for (const a of actors) {
          const w = actorWeights.get(a.id) ?? 0;
          actorWeights.set(a.id, w / sumW);
        }
      }
    }
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor) continue;

    const actorTracks = tracks
      .filter((t) => t.actorId === actor.id)
      .slice()
      .sort((a, b) => a.trackId - b.trackId);

    const weight = actorWeights.get(actor.id) ?? 0;
    totalWeight += weight;

    // 1. Detection scoring: best (lowest) ack latency across its tracks
    let detectionScore = 0;
    let latencySec: number | undefined;

    for (let j = 0; j < actorTracks.length; j++) {
      const t = actorTracks[j];
      if (t && t.confirmedTick !== undefined && t.acked && t.ackTick !== undefined) {
        const lat = Math.max(0, (t.ackTick - t.confirmedTick) / 20);
        let score = 0;
        if (lat <= DETECTION_THRESHOLDS.PERFECT_LATENCY_S) {
          score = 1.0;
        } else if (lat <= DETECTION_THRESHOLDS.MAX_LATENCY_S) {
          score =
            1.0 -
            (lat - DETECTION_THRESHOLDS.PERFECT_LATENCY_S) /
              (DETECTION_THRESHOLDS.MAX_LATENCY_S - DETECTION_THRESHOLDS.PERFECT_LATENCY_S);
        } else {
          score = 0;
        }

        if (latencySec === undefined || lat < latencySec) {
          latencySec = lat;
          detectionScore = score;
        }
      }
    }

    // 2. Classification scoring: assessedClass of the track with the latest classifyTick
    let latestClassifiedTrack: Track | undefined;
    for (let j = 0; j < actorTracks.length; j++) {
      const t = actorTracks[j];
      if (t && t.classifyTick !== undefined) {
        if (
          !latestClassifiedTrack ||
          (latestClassifiedTrack.classifyTick !== undefined &&
            t.classifyTick > latestClassifiedTrack.classifyTick)
        ) {
          latestClassifiedTrack = t;
        }
      }
    }
    if (!latestClassifiedTrack) {
      latestClassifiedTrack = actorTracks.find((t) => t.assessedClass !== undefined);
    }

    const assessedClass = latestClassifiedTrack?.assessedClass;
    let classificationScore = 0;
    if (assessedClass) {
      if (assessedClass === actor.classId) {
        classificationScore = 1.0;
      } else if (
        (assessedClass === 'fpv_kamikaze' && actor.classId === 'fpv_fiber') ||
        (assessedClass === 'fpv_fiber' && actor.classId === 'fpv_kamikaze')
      ) {
        classificationScore = 0.5;
      } else {
        classificationScore = 0;
      }
    }

    // 3. Decision scoring: engagement set = ENGAGEMENT_STARTED events whose trackId belongs to ANY of its tracks
    let decisionScore = 0;
    const engagementsOnActor = events.filter(
      (e) =>
        e.type === 'ENGAGEMENT_STARTED' &&
        actorTracks.some((t) => t.trackId === e.payload?.trackId)
    );
    const firstEngagement = engagementsOnActor[0];
    const engaged = engagementsOnActor.length > 0;

    let engagedWithoutClassification = false;
    if (engaged && firstEngagement) {
      let minClassifyTick: number | undefined;
      for (let j = 0; j < actorTracks.length; j++) {
        const ct = actorTracks[j]?.classifyTick;
        if (ct !== undefined) {
          if (minClassifyTick === undefined || ct < minClassifyTick) {
            minClassifyTick = ct;
          }
        }
      }
      if (minClassifyTick === undefined || firstEngagement.tick < minClassifyTick) {
        engagedWithoutClassification = true;
      }
    }

    const isHostile = THREAT_LIBRARY[actor.classId]?.hostile ?? false;

    if (isHostile) {
      if (actor.state === 'neutralized') {
        const neutralizedDist = actor.neutralizedDistanceToAsset ?? 0;
        if (neutralizedDist >= HOSTILE_STANDOFF_THRESHOLD_M) {
          decisionScore = 1.0;
          reasons.push(
            `Hostile drone (${actor.classId}) neutralized at ${Math.round(neutralizedDist)}m (>400m standoff): 100% decision score`
          );
        } else {
          decisionScore = 0.5;
          reasons.push(
            `Hostile drone (${actor.classId}) neutralized late at ${Math.round(neutralizedDist)}m (<400m standoff): 50% decision score`
          );
        }
      } else {
        decisionScore = 0;
        reasons.push(`Hostile drone (${actor.classId}) was NOT neutralized: 0% decision score`);
      }
    } else {
      // Neutral contact (civilian quad or bird)
      if (engaged) {
        decisionScore = 0;
      } else {
        decisionScore = 1.0;
        reasons.push(
          `Held fire / avoided engaging neutral contact (${actor.classId}): 100% decision score`
        );
      }
    }

    if (engagedWithoutClassification) {
      decisionScore *= 0.5;
      reasons.push(
        `Contact ${actor.classId} engaged without prior classification: decision score halved`
      );
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
      assessedClass,
      engagedWithoutClassification,
    });

    weightedSum += contactTotal * weight;
  }

  // Calculate penalties
  // Penalty 1: Engaged civilian quad (per actor)
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (actor && actor.classId === 'commercial_quad') {
      const actorTracks = tracks.filter((t) => t.actorId === actor.id);
      const engagedEvt = events.find(
        (e) =>
          e.type === 'ENGAGEMENT_STARTED' &&
          actorTracks.some((t) => t.trackId === e.payload?.trackId)
      );
      if (engagedEvt) {
        const penMsg = `Engaged civilian quad at ${formatTickTime(engagedEvt.tick)}: -${PENALTIES.ENGAGE_CIVILIAN_QUAD}`;
        penalties.push({ reason: penMsg, points: PENALTIES.ENGAGE_CIVILIAN_QUAD });
        reasons.push(penMsg);
      }
    }
  }

  // Penalty: Engaged decoy (per actor)
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (actor && actor.classId === 'decoy_drone') {
      const actorTracks = tracks.filter((t) => t.actorId === actor.id);
      const engagedEvt = events.find(
        (e) =>
          e.type === 'ENGAGEMENT_STARTED' &&
          actorTracks.some((t) => t.trackId === e.payload?.trackId)
      );
      if (engagedEvt) {
        const penMsg = `Engaged decoy at ${formatTickTime(engagedEvt.tick)}: -${PENALTIES.ENGAGE_DECOY}`;
        penalties.push({ reason: penMsg, points: PENALTIES.ENGAGE_DECOY });
        reasons.push(penMsg);
      }
    }
  }

  // Penalty 2: Engaged bird (per actor)
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (actor && actor.classId === 'bird') {
      const actorTracks = tracks.filter((t) => t.actorId === actor.id);
      const engagedEvt = events.find(
        (e) =>
          e.type === 'ENGAGEMENT_STARTED' &&
          actorTracks.some((t) => t.trackId === e.payload?.trackId)
      );
      if (engagedEvt) {
        const penMsg = `Engaged bird at ${formatTickTime(engagedEvt.tick)}: -${PENALTIES.ENGAGE_BIRD}`;
        penalties.push({ reason: penMsg, points: PENALTIES.ENGAGE_BIRD });
        reasons.push(penMsg);
      }
    }
  }

  // Penalty 3: Engaged radar ghost track (-5 per ghost track)
  for (let i = 0; i < tracks.length; i++) {
    const trk = tracks[i];
    if (trk && trk.isGhost) {
      const engagedEvt = events.find(
        (e) => e.type === 'ENGAGEMENT_STARTED' && e.payload?.trackId === trk.trackId
      );
      if (engagedEvt) {
        const penMsg = `Engaged false track at ${formatTickTime(engagedEvt.tick)}: -5`;
        penalties.push({ reason: penMsg, points: 5 });
        reasons.push(penMsg);
      }
    }
  }

  // Penalty 4: Wasted jammer on non-RF target
  const noEffectEvents = events.filter((e) => e.type === 'NO_EFFECT');
  for (let i = 0; i < noEffectEvents.length; i++) {
    const evt = noEffectEvents[i];
    if (evt) {
      const penMsg = `Wasted jammer on non-RF target at ${formatTickTime(evt.tick)}: -${PENALTIES.WASTED_JAMMER_NON_RF}`;
      penalties.push({ reason: penMsg, points: PENALTIES.WASTED_JAMMER_NON_RF });
      reasons.push(penMsg);
    }
  }

  // Penalty 5: Asset was hit
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

  // Effector use accounting
  let gunBurstsFired = 0;
  let jammerCycles = 0;
  const killsPerEffector = { gun: 0, jammer: 0 };
  const wastedEngagements = { ghost: 0, decoy: 0, neutral: 0 };

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e) continue;

    if (e.type === 'ENGAGEMENT_STARTED') {
      const effector = e.payload?.effector;
      if (effector === 'gun') {
        gunBurstsFired++;
      } else if (effector === 'jammer') {
        jammerCycles++;
      }

      const trackId = e.payload?.trackId;
      const trk = tracks.find((t) => t.trackId === trackId);
      if (trk?.isGhost) {
        wastedEngagements.ghost++;
      } else {
        const act = actors.find((a) => a.id === trk?.actorId);
        if (act?.classId === 'decoy_drone') {
          wastedEngagements.decoy++;
        } else if (act?.classId === 'commercial_quad' || act?.classId === 'bird') {
          wastedEngagements.neutral++;
        } else if (!act) {
          wastedEngagements.ghost++;
        }
      }
    } else if (e.type === 'ENGAGEMENT_RESOLVED') {
      if (e.payload?.result === 'hit') {
        const effector = e.payload?.effector;
        const trackId = e.payload?.trackId;
        const trk = tracks.find((t) => t.trackId === trackId);
        const act = actors.find((a) => a.id === trk?.actorId);
        if (act && THREAT_LIBRARY[act.classId]?.hostile) {
          if (effector === 'gun') killsPerEffector.gun++;
          if (effector === 'jammer') killsPerEffector.jammer++;
        }
      }
    }
  }

  const effectorUse: EffectorUse = {
    gunBurstsFired,
    jammerCycles,
    killsPerEffector,
    wastedEngagements,
  };

  return {
    total,
    weightedMean: Math.round(rawWeightedMean * 10) / 10,
    perContact,
    penalties,
    reasons,
    effectorUse,
  };
}
