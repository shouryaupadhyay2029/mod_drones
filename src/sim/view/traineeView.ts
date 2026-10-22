import { SimEvent } from '../core/types.js';
import { bearingDeg, vDist, Vec3, vec3, vLen } from '../core/vec.js';
import { EffectorState } from '../model/effectors.js';
import { Environment, TerrainKind, TimeOfDay, Weather } from '../model/environment.js';
import { RfSignature, ThreatClassId } from '../model/threats.js';
import { EngagementStatus, RcsBucket, RfStatus, Track, TrackState } from '../model/tracks.js';
import { EoChannel, EoHint, EoLevel, EoState, EoTurretState } from '../systems/eo.js';
import { RfDetectorState } from '../systems/rf.js';

export interface TraineeEnvironmentView {
  timeOfDay: TimeOfDay;
  weather: Weather;
  visibilityKm: number;
  terrainKind: TerrainKind;
}

export interface TraineeRfLine {
  bearingDeg: number;
  ageS: number;
  signature: RfSignature;
}

export interface TraineeRfView {
  lines: TraineeRfLine[];
}

export interface TraineeEoView {
  state: EoState;
  lockedTrackId?: number;
  channel: EoChannel;
  level: EoLevel;
  hint?: EoHint;
  quality: number;
}

export interface TraineeTrack {
  trackId: number;
  state: TrackState;
  estimatedPosition: Vec3;
  rangeM: number;
  bearingDeg: number;
  altitudeM: number;
  velocityValid: boolean;
  speedMps?: number;
  courseDeg?: number;
  closingRateMps?: number; // negative = approaching asset
  headingChangeRateDegPerS?: number;
  rcsBucket: RcsBucket;
  quality: number;
  acked: boolean;
  assessedClass?: ThreatClassId | 'unknown';
  engagementStatus: EngagementStatus;
  lastPlotTick: number;
  rfStatus?: RfStatus;
  rfSignature?: RfSignature;
}

export interface TraineeEffectorsView {
  jammer: {
    busyUntilTick: number;
  };
  gun: {
    ammo: number;
    busyUntilTick: number;
  };
}

export interface TraineeView {
  tick: number;
  timeS: number;
  radarSweepDeg: number;
  missionState: {
    ended: boolean;
    reason?: 'asset_hit' | 'all_resolved' | 'time_limit';
  };
  environment: TraineeEnvironmentView;
  tracks: TraineeTrack[];
  effectors: TraineeEffectorsView;
  events: readonly SimEvent[];
  rf: TraineeRfView;
  eo: TraineeEoView;
}

export function buildTraineeView(
  tick: number,
  tracks: readonly Track[],
  effectorState: EffectorState,
  missionEnded: boolean,
  missionEndReason: 'asset_hit' | 'all_resolved' | 'time_limit' | undefined,
  allEvents: readonly SimEvent[],
  environment?: Environment,
  rfDetectorState?: RfDetectorState,
  eoTurretState?: EoTurretState
): TraineeView {
  const origin = vec3(0, 0, 0);

  const envView: TraineeEnvironmentView = {
    timeOfDay: environment?.timeOfDay ?? 'dusk',
    weather: environment?.weather ?? 'clear',
    visibilityKm: environment?.visibilityKm ?? 10,
    terrainKind: environment?.terrainKind ?? 'rural',
  };

  const traineeTracks: TraineeTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || t.state === 'dropped') continue;

    const plots = t.totalPlots ?? t.consecutiveHits;
    const velocityValid = plots >= 2;
    const r = vDist(t.estimatedPos, origin);
    const speed = velocityValid ? vLen(t.estimatedVel) : undefined;
    const courseDeg =
      velocityValid && speed !== undefined && speed > 1.0
        ? bearingDeg(origin, vec3(t.estimatedVel.x, t.estimatedVel.y, 0))
        : undefined;
    const closingRate =
      velocityValid && r > 0
        ? (t.estimatedPos.x * t.estimatedVel.x +
            t.estimatedPos.y * t.estimatedVel.y +
            t.estimatedPos.z * t.estimatedVel.z) /
          r
        : undefined;
    const headingChangeRate = velocityValid ? t.headingChangeRateSmoothed : undefined;

    traineeTracks.push({
      trackId: t.trackId,
      state: t.state,
      estimatedPosition: { ...t.estimatedPos },
      rangeM: r,
      bearingDeg: bearingDeg(origin, t.estimatedPos),
      altitudeM: t.estimatedPos.z,
      velocityValid,
      speedMps: speed,
      courseDeg,
      closingRateMps: closingRate,
      headingChangeRateDegPerS: headingChangeRate,
      rcsBucket: t.rcsBucket,
      quality: t.quality,
      acked: t.acked,
      assessedClass: t.assessedClass,
      engagementStatus: t.engagementStatus,
      lastPlotTick: t.lastDetectedTick,
      rfStatus: t.rfStatus ?? 'unknown',
      rfSignature: t.rfSignature,
    });
  }

  // Filter events to exclude ground-truth leakage
  const traineeEvents = allEvents.filter((e) => {
    return (
      e.type === 'TRACK_CONFIRMED' ||
      e.type === 'TRACK_LOST' ||
      e.type === 'ENGAGEMENT_STARTED' ||
      e.type === 'ENGAGEMENT_RESOLVED' ||
      e.type === 'NO_EFFECT' ||
      e.type === 'COMMAND_REJECTED' ||
      e.type === 'ENGAGEMENT_REJECTED' ||
      e.type === 'MISSION_END'
    );
  });

  const rfLines = (rfDetectorState?.lines ?? [])
    .filter((l) => tick - l.tick <= 100)
    .map((l) => ({
      bearingDeg: l.bearingDeg,
      ageS: (tick - l.tick) * 0.05,
      signature: l.signature,
    }));

  return {
    tick,
    timeS: tick / 20,
    radarSweepDeg: (tick % 40) * 9,
    missionState: {
      ended: missionEnded,
      reason: missionEndReason,
    },
    environment: envView,
    tracks: traineeTracks,
    effectors: {
      jammer: {
        busyUntilTick: effectorState.jammer.busyUntilTick,
      },
      gun: {
        ammo: effectorState.gun.ammo,
        busyUntilTick: effectorState.gun.busyUntilTick,
      },
    },
    events: traineeEvents,
    rf: {
      lines: rfLines,
    },
    eo: {
      state: eoTurretState?.state ?? 'idle',
      lockedTrackId: eoTurretState?.lockedTrackId,
      channel: eoTurretState?.channel ?? (envView.timeOfDay === 'night' ? 'ir' : 'tv'),
      level: eoTurretState?.level ?? 'none',
      hint: eoTurretState?.hint,
      quality: eoTurretState?.quality ?? 0,
    },
  };
}
