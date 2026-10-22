import { SimEvent } from '../core/types.js';
import { bearingDeg, vDist, Vec3, vec3, vLen } from '../core/vec.js';
import { EffectorState } from '../model/effectors.js';
import { ThreatClassId } from '../model/threats.js';
import { EngagementStatus, RcsBucket, Track, TrackState } from '../model/tracks.js';

export interface TraineeTrack {
  trackId: number;
  state: TrackState;
  estimatedPosition: Vec3;
  rangeM: number;
  bearingDeg: number;
  altitudeM: number;
  speedMps: number;
  courseDeg?: number;
  closingRateMps: number; // negative = approaching asset
  headingChangeRateDegPerS: number;
  rcsBucket: RcsBucket;
  quality: number;
  acked: boolean;
  assessedClass?: ThreatClassId | 'unknown';
  engagementStatus: EngagementStatus;
  lastPlotTick: number;
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
  tracks: TraineeTrack[];
  effectors: TraineeEffectorsView;
  events: readonly SimEvent[];
}

export function buildTraineeView(
  tick: number,
  tracks: readonly Track[],
  effectorState: EffectorState,
  missionEnded: boolean,
  missionEndReason: 'asset_hit' | 'all_resolved' | 'time_limit' | undefined,
  allEvents: readonly SimEvent[]
): TraineeView {
  const origin = vec3(0, 0, 0);

  const traineeTracks: TraineeTrack[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || t.state === 'dropped') continue;

    const r = vDist(t.estimatedPos, origin);
    const speed = vLen(t.estimatedVel);
    const courseDeg =
      speed > 1.0 ? bearingDeg(origin, vec3(t.estimatedVel.x, t.estimatedVel.y, 0)) : undefined;
    // closing rate = (r . v) / |r|: negative if approaching
    const closingRate =
      r > 0
        ? (t.estimatedPos.x * t.estimatedVel.x +
            t.estimatedPos.y * t.estimatedVel.y +
            t.estimatedPos.z * t.estimatedVel.z) /
          r
        : 0;

    traineeTracks.push({
      trackId: t.trackId,
      state: t.state,
      estimatedPosition: { ...t.estimatedPos },
      rangeM: r,
      bearingDeg: bearingDeg(origin, t.estimatedPos),
      altitudeM: t.estimatedPos.z,
      speedMps: speed,
      courseDeg,
      closingRateMps: closingRate,
      headingChangeRateDegPerS: t.headingChangeRateSmoothed,
      rcsBucket: t.rcsBucket,
      quality: t.quality,
      acked: t.acked,
      assessedClass: t.assessedClass,
      engagementStatus: t.engagementStatus,
      lastPlotTick: t.lastDetectedTick,
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

  return {
    tick,
    timeS: tick / 20,
    radarSweepDeg: (tick % 40) * 9,
    missionState: {
      ended: missionEnded,
      reason: missionEndReason,
    },
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
  };
}
