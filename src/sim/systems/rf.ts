// Generic illustrative parameters for training; not real specifications.

import { Rng } from '../core/rng.js';
import { bearingDeg, vDist, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { Environment } from '../model/environment.js';
import { hasLineOfSight, TerrainMap } from '../model/terrain.js';
import { RfSignature, THREAT_LIBRARY } from '../model/threats.js';
import { Track } from '../model/tracks.js';

export interface RfLine {
  tick: number;
  bearingDeg: number;
  signature: RfSignature;
}

export interface RfDetectorState {
  lines: RfLine[];
}

export function createInitialRfState(): RfDetectorState {
  return { lines: [] };
}

/**
 * Standard 12-sample Irwin-Hall unit Gaussian noise generator (mean 0, variance 1).
 */
export function irwinHallUnit(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += rng.next();
  }
  return sum - 6;
}

/**
 * Computes shortest angular distance between two bearings in degrees (0 - 180).
 */
export function angleDiffDeg(a: number, b: number): number {
  let diff = (a - b) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return Math.abs(diff);
}

/**
 * Computes RF detector effective range R_rf based on EW level and urban terrain.
 * R_rf = 4500 m * [1, 0.85, 0.65][ew] * (urban ? 0.8 : 1)
 */
export function computeRfEffectiveRange(env: Environment): number {
  const ewIndex = env.ewLevel === 'heavy' ? 2 : env.ewLevel === 'light' ? 1 : 0;
  const ewMult = [1.0, 0.85, 0.65][ewIndex]!;
  const urbanMult = env.terrainKind === 'urban' ? 0.8 : 1.0;
  return 4500 * ewMult * urbanMult;
}

/**
 * Computes line-of-bearing noise standard deviation sigma (in degrees).
 * sigma = 4 deg * (urban ? 1.5 : 1) * [1, 1.3, 1.8][ew]
 */
export function computeRfBearingNoiseSigma(env: Environment): number {
  const ewIndex = env.ewLevel === 'heavy' ? 2 : env.ewLevel === 'light' ? 1 : 0;
  const ewNoiseMult = [1.0, 1.3, 1.8][ewIndex]!;
  const urbanNoiseMult = env.terrainKind === 'urban' ? 1.5 : 1.0;
  return 4.0 * urbanNoiseMult * ewNoiseMult;
}

/**
 * Associates radar tracks with RF bearing lines.
 *
 * Rules:
 * - A radar track gets rfStatus 'emitting' + rfSignature if a line within +/-10 deg
 *   of the track bearing arrived in the last 3 s (60 ticks).
 * - 'silent' only if the track is older than 6 s (120 ticks), its estimated range <= 0.8 * current R_rf,
 *   LOS is clear, and no line matched.
 * - Otherwise 'unknown'.
 * Ghosts and birds therefore become 'silent'.
 */
export function associateRfWithTracks(
  currentTick: number,
  tracks: Track[],
  rfLines: readonly RfLine[],
  rRf: number,
  terrain: TerrainMap
): void {
  const mastPos = vec3(0, 0, 15);
  const origin = vec3(0, 0, 0);

  // Consider lines from the last 3 s (60 ticks)
  const recentLines = rfLines.filter((l) => currentTick - l.tick <= 60);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (!track || track.state === 'dropped') continue;

    const trkBearing = bearingDeg(origin, track.estimatedPos);

    // Look for matching line within +/- 10 deg
    let matchedLine: RfLine | undefined;
    for (let j = recentLines.length - 1; j >= 0; j--) {
      const line = recentLines[j]!;
      if (angleDiffDeg(line.bearingDeg, trkBearing) <= 10) {
        matchedLine = line;
        break;
      }
    }

    if (matchedLine) {
      track.rfStatus = 'emitting';
      track.rfSignature = matchedLine.signature;
    } else {
      // Check for 'silent' conditions:
      // 1. Track older than 6 s (120 ticks)
      const trackAgeTicks = currentTick - track.firstSeenTick;
      const isOlderThan6s = trackAgeTicks > 120;

      // 2. Estimated range <= 0.8 * current R_rf
      const estRange = vDist(track.estimatedPos, origin);
      const isWithinRange = estRange <= 0.8 * rRf;

      // 3. Clear line of sight
      const hasLos = hasLineOfSight(mastPos, track.estimatedPos, terrain, 50);

      if (isOlderThan6s && isWithinRange && hasLos) {
        track.rfStatus = 'silent';
        track.rfSignature = undefined;
      } else {
        track.rfStatus = 'unknown';
        track.rfSignature = undefined;
      }
    }
  }
}

/**
 * Runs the passive RF detector system.
 * Evaluated every 10 ticks.
 */
export function runRfSystem(
  currentTick: number,
  actors: readonly Actor[],
  tracks: Track[],
  rfState: RfDetectorState,
  rfRng: Rng,
  environment?: Environment,
  terrain?: TerrainMap
): void {
  const env: Environment = environment ?? {
    timeOfDay: 'dusk',
    weather: 'clear',
    visibilityKm: 10,
    ewLevel: 'none',
    terrainKind: 'rural',
  };
  const activeTerrain = terrain ?? { heightAt: () => 0, clutterAt: () => 0.05 };
  const origin = vec3(0, 0, 0);
  const mastPos = vec3(0, 0, 15);
  const rRf = computeRfEffectiveRange(env);
  const sigma = computeRfBearingNoiseSigma(env);
  const ewIndex = env.ewLevel === 'heavy' ? 2 : env.ewLevel === 'light' ? 1 : 0;
  const pSig = [0.9, 0.8, 0.65][ewIndex]!;

  // 1. Detection pass: every 10 ticks for each active rfControlled actor in deterministic ID order
  if (currentTick % 10 === 0) {
    const activeRfActors = actors
      .filter((a) => a.state === 'active' && THREAT_LIBRARY[a.classId]?.rfControlled)
      .sort((a, b) => a.id - b.id);

    for (let i = 0; i < activeRfActors.length; i++) {
      const actor = activeRfActors[i]!;
      const r = vDist(actor.pos, origin);

      if (r <= rRf && hasLineOfSight(mastPos, actor.pos, activeTerrain, 50)) {
        if (rfRng.next() < 0.9) {
          const truthBearing = bearingDeg(origin, actor.pos);
          const noise = sigma * irwinHallUnit(rfRng);
          const measuredBearing = ((truthBearing + noise) % 360 + 360) % 360;

          const trueSig = THREAT_LIBRARY[actor.classId].rfSignature;
          const signature: RfSignature = rfRng.next() < pSig ? trueSig : 'unknown_link';

          rfState.lines.push({
            tick: currentTick,
            bearingDeg: measuredBearing,
            signature,
          });
        }
      }
    }
  }

  // Prune lines older than 5 s (100 ticks)
  rfState.lines = rfState.lines.filter((l) => currentTick - l.tick <= 100);

  // 2. Track Association pass: update track rfStatus and rfSignature
  associateRfWithTracks(currentTick, tracks, rfState.lines, rRf, activeTerrain);
}
