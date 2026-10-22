import { DT } from '../core/clock.js';
import { Rng } from '../core/rng.js';
import { bearingDeg, vDist, Vec3, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { RcsBucket, Track } from '../model/tracks.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { SimEvent } from '../core/types.js';

export const RADAR_MAX_RANGE_M = 6000;
export const RADAR_RCS_REF = 0.01;
export const RADAR_SWEEP_PERIOD_TICKS = 40; // 2 seconds per 360 rotation

export function isAngleInSector(angle: number, start: number, end: number): boolean {
  if (start < end) {
    return angle >= start && angle < end;
  } else if (start > end) {
    return angle >= start || angle < end;
  }
  return false;
}

function irwinHall(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += rng.next();
  }
  return sum - 6;
}

export function computeRcsBucket(measuredRcs: number): RcsBucket {
  if (measuredRcs < 0.004) return 'tiny';
  if (measuredRcs < 0.03) return 'small';
  return 'medium';
}

export function runRadarSystem(
  currentTick: number,
  actors: readonly Actor[],
  tracks: Track[],
  nextTrackIdRef: { current: number },
  radarRng: Rng,
  events: SimEvent[]
): void {
  const sweepDegPerTick = 360 / RADAR_SWEEP_PERIOD_TICKS;
  const startAzimuth = (currentTick * sweepDegPerTick) % 360;
  const endAzimuth = ((currentTick + 1) * sweepDegPerTick) % 360;
  const origin = vec3(0, 0, 0);

  // Process all active actors in deterministic ID order
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor || actor.state !== 'active') continue;

    const bearing = bearingDeg(origin, actor.pos);
    if (!isAngleInSector(bearing, startAzimuth, endAzimuth)) {
      continue;
    }

    const threat = THREAT_LIBRARY[actor.classId];
    const r = vDist(actor.pos, origin);

    // 4th-root radar equation scaling using only Math.sqrt
    const rEff = RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(threat.rcsM2 / RADAR_RCS_REF));
    const ratio = r / rEff;
    const ratio4 = ratio * ratio * ratio * ratio;
    const pd = Math.min(0.95, Math.max(0, 1 - ratio4));

    const hit = radarRng.next() < pd;
    const existingTrack = tracks.find((t) => t.actorId === actor.id && t.state !== 'dropped');

    if (hit) {
      // Gaussian noise via Irwin-Hall
      const sigma = 15 + 0.005 * r;
      const noiseX = sigma * irwinHall(radarRng);
      const noiseY = sigma * irwinHall(radarRng);
      const noiseZ = sigma * irwinHall(radarRng);

      const measPos: Vec3 = {
        x: actor.pos.x + noiseX,
        y: actor.pos.y + noiseY,
        z: actor.pos.z + noiseZ,
      };

      // Multiplicative +-25% uniform on measured amplitude
      const ampMult = 0.75 + 0.5 * radarRng.next();
      const measuredRcs = threat.rcsM2 * ampMult;
      const rcsBucket = computeRcsBucket(measuredRcs);

      if (!existingTrack) {
        // First detection => tentative track
        const newTrack: Track = {
          trackId: nextTrackIdRef.current++,
          actorId: actor.id,
          state: 'tentative',
          estimatedPos: measPos,
          estimatedVel: vec3(0, 0, 0),
          lastDetectedTick: currentTick,
          firstSeenTick: currentTick,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          rcsBucket,
          measuredRcs,
          quality: 0.3,
          acked: false,
          engagementStatus: 'none',
          headingChangeRateSmoothed: 0,
          lastSweepChecked: currentTick,
        };
        tracks.push(newTrack);
      } else {
        // Consecutive hit
        existingTrack.consecutiveHits++;
        existingTrack.consecutiveMisses = 0;
        existingTrack.rcsBucket = rcsBucket;
        existingTrack.measuredRcs = measuredRcs;

        const dtSec = (currentTick - existingTrack.lastDetectedTick) * DT;
        if (dtSec > 0) {
          const rawVx = (measPos.x - existingTrack.estimatedPos.x) / dtSec;
          const rawVy = (measPos.y - existingTrack.estimatedPos.y) / dtSec;
          const rawVz = (measPos.z - existingTrack.estimatedPos.z) / dtSec;

          // On first velocity calculation (second hit), initialize directly from finite difference
          if (existingTrack.consecutiveHits === 2) {
            existingTrack.estimatedVel = { x: rawVx, y: rawVy, z: rawVz };
          } else {
            // Exponential smoothing (alpha = 0.4)
            existingTrack.estimatedVel = {
              x: 0.4 * rawVx + 0.6 * existingTrack.estimatedVel.x,
              y: 0.4 * rawVy + 0.6 * existingTrack.estimatedVel.y,
              z: 0.4 * rawVz + 0.6 * existingTrack.estimatedVel.z,
            };
          }

          // Heading change rate tracking
          const rawHeading = bearingDeg(vec3(0, 0, 0), {
            x: existingTrack.estimatedVel.x,
            y: existingTrack.estimatedVel.y,
            z: 0,
          });
          if (existingTrack.previousHeadingDeg !== undefined) {
            let diff = Math.abs(rawHeading - existingTrack.previousHeadingDeg);
            if (diff > 180) diff = 360 - diff;
            const rate = diff / dtSec;
            existingTrack.headingChangeRateSmoothed =
              0.3 * rate + 0.7 * existingTrack.headingChangeRateSmoothed;
          }
          existingTrack.previousHeadingDeg = rawHeading;
        }

        existingTrack.estimatedPos = measPos;
        existingTrack.lastDetectedTick = currentTick;
        existingTrack.quality = Math.min(1.0, existingTrack.quality + 0.2);

        // Check confirmation: second hit within 4 sweeps (160 ticks)
        if (
          existingTrack.state === 'tentative' &&
          currentTick - existingTrack.firstSeenTick <= 160
        ) {
          existingTrack.state = 'confirmed';
          existingTrack.confirmedTick = currentTick;
          events.push({
            tick: currentTick,
            type: 'TRACK_CONFIRMED',
            payload: {
              trackId: existingTrack.trackId,
              rangeM: r,
              bearingDeg: bearing,
            },
          });
        }
      }
    } else {
      // Missed detection on swept actor
      if (existingTrack) {
        existingTrack.consecutiveMisses++;
        existingTrack.consecutiveHits = 0;
        existingTrack.quality = Math.max(0.0, existingTrack.quality - 0.15);

        // 5 consecutive missed sweeps => dropped
        if (existingTrack.consecutiveMisses >= 5) {
          existingTrack.state = 'dropped';
          existingTrack.lostTick = currentTick;
          events.push({
            tick: currentTick,
            type: 'TRACK_LOST',
            payload: {
              trackId: existingTrack.trackId,
            },
          });
        }
      }
    }
  }

  // Process missed sweeps for tracks whose actors are no longer active in sector
  for (let i = 0; i < tracks.length; i++) {
    const trk = tracks[i];
    if (!trk || trk.state === 'dropped') continue;

    if (trk.lastDetectedTick === currentTick) continue;

    const trkActor = actors.find((a) => a.id === trk.actorId);
    if (trkActor && trkActor.state === 'active') continue;

    const trackBearing = bearingDeg(origin, trk.estimatedPos);
    if (isAngleInSector(trackBearing, startAzimuth, endAzimuth)) {
      trk.consecutiveMisses++;
      trk.consecutiveHits = 0;
      trk.quality = Math.max(0.0, trk.quality - 0.15);

      if (trk.consecutiveMisses >= 5) {
        trk.state = 'dropped';
        trk.lostTick = currentTick;
        events.push({
          tick: currentTick,
          type: 'TRACK_LOST',
          payload: {
            trackId: trk.trackId,
          },
        });
      }
    }
  }
}
