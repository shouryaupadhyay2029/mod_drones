// Generic illustrative parameters for training; not real specifications.

import { Rng } from '../core/rng.js';
import { SimEvent } from '../core/types.js';
import { bearingDeg, vDist, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { Environment, TimeOfDay, Weather } from '../model/environment.js';
import { THREAT_LIBRARY, ThreatClassId } from '../model/threats.js';
import { Track } from '../model/tracks.js';

export type EoChannel = 'tv' | 'ir';
export type EoState = 'idle' | 'slewing' | 'locked';
export type EoLevel = 'none' | 'detect' | 'recognize' | 'identify';
export type EoHint = ThreatClassId | 'multirotor' | 'fixed_wing' | 'bird' | 'object';

export interface EoTurretState {
  state: EoState;
  lockedTrackId?: number;
  currentAzimuthDeg: number;
  channel: EoChannel;
  level: EoLevel;
  hint?: EoHint;
  quality: number;
  effPixels: number;
}

export function createInitialEoState(env?: Environment): EoTurretState {
  const isNight = env?.timeOfDay === 'night';
  return {
    state: 'idle',
    lockedTrackId: undefined,
    currentAzimuthDeg: 0,
    channel: isNight ? 'ir' : 'tv',
    level: 'none',
    hint: undefined,
    quality: 0,
    effPixels: 0,
  };
}

export function handleEoLock(
  eo: EoTurretState,
  trackId: unknown,
  tracks: readonly Track[],
  tick: number,
  events: SimEvent[]
): void {
  if (typeof trackId !== 'number' || !Number.isFinite(trackId)) {
    events.push({
      tick,
      type: 'COMMAND_REJECTED',
      payload: { command: 'EO_LOCK', reason: 'invalid_track_id', trackId },
    });
    return;
  }

  const track = tracks.find((t) => t.trackId === trackId);
  if (!track || track.state === 'dropped') {
    events.push({
      tick,
      type: 'COMMAND_REJECTED',
      payload: { command: 'EO_LOCK', reason: 'unknown_or_dropped_track', trackId },
    });
    return;
  }

  eo.lockedTrackId = track.trackId;
  const targetBearing = bearingDeg(vec3(0, 0, 0), track.estimatedPos);
  let diff = (targetBearing - eo.currentAzimuthDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  if (Math.abs(diff) <= 2) {
    eo.currentAzimuthDeg = targetBearing;
    eo.state = 'locked';
  } else {
    eo.state = 'slewing';
    eo.level = 'none';
    eo.hint = undefined;
    eo.quality = 0;
    eo.effPixels = 0;
  }

  events.push({
    tick,
    type: 'EO_LOCK_ACQUIRED',
    payload: { trackId: track.trackId },
  });
}

export function handleEoRelease(
  eo: EoTurretState,
  tick: number,
  events: SimEvent[]
): void {
  eo.lockedTrackId = undefined;
  eo.state = 'idle';
  eo.level = 'none';
  eo.hint = undefined;
  eo.quality = 0;
  eo.effPixels = 0;

  events.push({
    tick,
    type: 'EO_RELEASED',
    payload: {},
  });
}

export function handleEoChannel(
  eo: EoTurretState,
  channel: unknown,
  tick: number,
  events: SimEvent[]
): void {
  if (channel !== 'tv' && channel !== 'ir') {
    events.push({
      tick,
      type: 'COMMAND_REJECTED',
      payload: { command: 'EO_CHANNEL', reason: 'invalid_channel', channel },
    });
    return;
  }

  eo.channel = channel;
  events.push({
    tick,
    type: 'EO_CHANNEL_CHANGED',
    payload: { channel },
  });
}

export function computeEoEffPixels(
  sizeM: number,
  thermalSignature: number,
  rangeM: number,
  channel: EoChannel,
  timeOfDay: TimeOfDay,
  weather: Weather,
  visibilityKm: number
): number {
  if (rangeM <= 0) return 0;
  const pixels = (sizeM * 30000) / rangeM;
  const light = { day: 1.0, dusk: 0.6, night: 0.05 }[timeOfDay] ?? 1.0;

  if (channel === 'tv') {
    const tau = 1 / (1 + rangeM / (visibilityKm * 1000 * 0.5));
    const contrast = light * tau;
    return pixels * contrast;
  } else {
    let tau = 1 / (1 + rangeM / (visibilityKm * 1000 * 1.5));
    if (weather === 'rain') tau *= 0.8;
    const contrast = thermalSignature * tau * (timeOfDay === 'day' ? 0.8 : 1.0);
    return pixels * contrast;
  }
}

export function computeEoLevel(effPixels: number): EoLevel {
  if (effPixels >= 12) return 'identify';
  if (effPixels >= 6) return 'recognize';
  if (effPixels >= 2.5) return 'detect';
  return 'none';
}

export function runEoSystem(
  currentTick: number,
  eo: EoTurretState,
  tracks: readonly Track[],
  actors: readonly Actor[],
  eoRng: Rng,
  environment?: Environment,
  events?: SimEvent[]
): void {
  const env = environment ?? {
    timeOfDay: 'dusk',
    weather: 'clear',
    visibilityKm: 10,
    ewLevel: 'none',
    terrainKind: 'rural',
  };

  // If idle, nothing to do
  if (eo.state === 'idle' || eo.lockedTrackId === undefined) {
    eo.state = 'idle';
    eo.level = 'none';
    eo.hint = undefined;
    eo.quality = 0;
    eo.effPixels = 0;
    return;
  }

  // 1. Check if locked track exists and has not dropped
  const track = tracks.find((t) => t.trackId === eo.lockedTrackId);
  if (!track || track.state === 'dropped') {
    const lostTrackId = eo.lockedTrackId;
    eo.lockedTrackId = undefined;
    eo.state = 'idle';
    eo.level = 'none';
    eo.hint = undefined;
    eo.quality = 0;
    eo.effPixels = 0;
    events?.push({
      tick: currentTick,
      type: 'EO_LOST',
      payload: { trackId: lostTrackId },
    });
    return;
  }

  // 2. Slew gimbal toward track's estimated bearing (2 deg/tick)
  const targetBearing = bearingDeg(vec3(0, 0, 0), track.estimatedPos);
  let err = (targetBearing - eo.currentAzimuthDeg) % 360;
  if (err > 180) err -= 360;
  if (diffAngleNormalize(err) < -180) err += 360;
  err = diffAngleNormalize(err);

  if (Math.abs(err) <= 2) {
    eo.currentAzimuthDeg = targetBearing;
    eo.state = 'locked';
  } else {
    eo.state = 'slewing';
    const stepDeg = Math.sign(err) * 2;
    eo.currentAzimuthDeg = ((eo.currentAzimuthDeg + stepDeg) % 360 + 360) % 360;
    // No readings while slewing
    eo.level = 'none';
    eo.hint = undefined;
    eo.quality = 0;
    eo.effPixels = 0;
    return;
  }

  // 3. Optics calculations every 10 ticks while locked
  if (currentTick % 10 === 0) {
    // Look up real actor for true range & signatures
    const actor = actors.find((a) => a.id === track.actorId);
    if (!actor || actor.state !== 'active') {
      // Ghost track or inactive actor: no optical signature
      eo.effPixels = 0;
      eo.level = 'none';
      eo.hint = undefined;
      eo.quality = 0;
      return;
    }

    const threat = THREAT_LIBRARY[actor.classId];
    const trueRange = vDist(actor.pos, vec3(0, 0, 0));
    const effPixels = computeEoEffPixels(
      threat.sizeM,
      threat.thermalSignature,
      trueRange,
      eo.channel,
      env.timeOfDay,
      env.weather,
      env.visibilityKm
    );

    eo.effPixels = effPixels;
    const level = computeEoLevel(effPixels);
    eo.level = level;
    eo.quality = Math.min(1.0, effPixels / 12);

    if (level === 'identify') {
      // Correct p = 0.95, else random other class from library
      if (eoRng.next() < 0.95) {
        eo.hint = actor.classId;
      } else {
        const allClasses: ThreatClassId[] = [
          'fpv_kamikaze',
          'fpv_fiber',
          'decoy_drone',
          'commercial_quad',
          'fixed_wing_recon',
          'bird',
        ];
        const others = allClasses.filter((c) => c !== actor.classId);
        const idx = Math.floor(eoRng.next() * others.length);
        eo.hint = others[idx] ?? 'fpv_kamikaze';
      }
    } else if (level === 'recognize') {
      // Correct p = 0.9: 'multirotor' | 'fixed_wing' | 'bird' (quad, FPV, fiber are 'multirotor'; decoy, fixed-wing are 'fixed_wing')
      const trueCategory: 'multirotor' | 'fixed_wing' | 'bird' =
        actor.classId === 'fpv_kamikaze' ||
        actor.classId === 'fpv_fiber' ||
        actor.classId === 'commercial_quad'
          ? 'multirotor'
          : actor.classId === 'fixed_wing_recon' || actor.classId === 'decoy_drone'
          ? 'fixed_wing'
          : 'bird';

      if (eoRng.next() < 0.9) {
        eo.hint = trueCategory;
      } else {
        const categories: Array<'multirotor' | 'fixed_wing' | 'bird'> = [
          'multirotor',
          'fixed_wing',
          'bird',
        ];
        const others = categories.filter((c) => c !== trueCategory);
        const idx = Math.floor(eoRng.next() * others.length);
        eo.hint = others[idx] ?? 'multirotor';
      }
    } else if (level === 'detect') {
      eo.hint = 'object';
    } else {
      eo.hint = undefined;
    }
  }
}

function diffAngleNormalize(diff: number): number {
  let d = diff % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
