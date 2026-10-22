import { DT } from '../core/clock.js';
import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { SimEvent } from '../core/types.js';
import { bearingDeg, vDist, Vec3, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { Environment } from '../model/environment.js';
import { getClutterFactor, getTerrainHeight, hasLineOfSight } from '../model/terrain.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { RcsBucket, Track } from '../model/tracks.js';

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
  events: SimEvent[],
  environment?: Environment,
  ghostRng?: Rng
): void {
  const env: Environment = environment ?? {
    timeOfDay: 'dusk',
    weather: 'clear',
    visibilityKm: 10,
    ewLevel: 'none',
    terrainKind: 'rural',
  };

  const sweepDegPerTick = 360 / RADAR_SWEEP_PERIOD_TICKS;
  const startAzimuth = (currentTick * sweepDegPerTick) % 360;
  const endAzimuth = ((currentTick + 1) * sweepDegPerTick) % 360;
  const origin = vec3(0, 0, 0);
  const mastPos = vec3(0, 0, 15);

  // 1. Process all active actors in deterministic ID order
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor || actor.state !== 'active') continue;

    const bearing = bearingDeg(origin, actor.pos);
    if (!isAngleInSector(bearing, startAzimuth, endAzimuth)) {
      continue;
    }

    const threat = THREAT_LIBRARY[actor.classId];
    const r = vDist(actor.pos, origin);

    // Weather factor on effective range
    const weatherMult = env.weather === 'rain' ? 0.85 : env.weather === 'fog' ? 0.95 : 1.0;
    const rEff = RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(threat.rcsM2 / RADAR_RCS_REF)) * weatherMult;
    const ratio = r / rEff;
    const ratio4 = ratio * ratio * ratio * ratio;

    // Clutter degradation based on AGL
    const c = getClutterFactor(actor.pos.x, actor.pos.y, env.terrainKind);
    const terrainH = getTerrainHeight(actor.pos.x, actor.pos.y, env.terrainKind);
    const agl = actor.pos.z - terrainH;
    let pdClutterMult = 1.0;
    if (agl < 40) {
      pdClutterMult = Math.max(0, 1 - c * (1 - Math.max(0, agl) / 40));
    }

    // EW Pd multiplier
    const ewPdMult = env.ewLevel === 'heavy' ? 0.6 : env.ewLevel === 'light' ? 0.85 : 1.0;
    const pd = Math.min(0.95, Math.max(0, 1 - ratio4)) * pdClutterMult * ewPdMult;

    // Terrain Line-of-Sight masking check (mast at (0, 0, 15) to target)
    const hasLos = hasLineOfSight(mastPos, actor.pos, env.terrainKind, 50);

    const hit = hasLos && radarRng.next() < pd;
    const existingTrack = tracks.find((t) => t.actorId === actor.id && t.state !== 'dropped');

    if (hit) {
      // Gaussian noise via Irwin-Hall, scaled by EW noise multiplier
      const ewNoiseMult = env.ewLevel === 'heavy' ? 2.5 : env.ewLevel === 'light' ? 1.5 : 1.0;
      const sigma = (15 + 0.005 * r) * ewNoiseMult;
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
          totalPlots: 1,
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
        existingTrack.totalPlots = (existingTrack.totalPlots ?? 1) + 1;
        existingTrack.consecutiveMisses = 0;
        existingTrack.rcsBucket = rcsBucket;
        existingTrack.measuredRcs = measuredRcs;

        const dtSec = (currentTick - existingTrack.lastDetectedTick) * DT;
        if (dtSec > 0) {
          const rawVx = (measPos.x - existingTrack.estimatedPos.x) / dtSec;
          const rawVy = (measPos.y - existingTrack.estimatedPos.y) / dtSec;
          const rawVz = (measPos.z - existingTrack.estimatedPos.z) / dtSec;

          // On first velocity calculation (second hit), initialize directly from finite difference
          if (existingTrack.totalPlots === 2) {
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

  // 2. Process missed sweeps for tracks whose actors are no longer active in sector
  for (let i = 0; i < tracks.length; i++) {
    const trk = tracks[i];
    if (!trk || trk.state === 'dropped' || trk.isGhost) continue;

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

  // 3. Ghost tracks generation & lifecycle
  if (ghostRng) {
    const maxGhosts = env.terrainKind === 'urban' ? 2 : 1;

    // Kinematics and sweep processing for active ghosts
    for (let i = 0; i < tracks.length; i++) {
      const trk = tracks[i];
      if (!trk || !trk.isGhost || trk.state === 'dropped') continue;

      trk.estimatedPos.x += trk.estimatedVel.x * DT;
      trk.estimatedPos.y += trk.estimatedVel.y * DT;
      trk.estimatedPos.z += trk.estimatedVel.z * DT;

      const gBearing = bearingDeg(origin, trk.estimatedPos);
      if (isAngleInSector(gBearing, startAzimuth, endAzimuth)) {
        trk.lastDetectedTick = currentTick;
        trk.totalPlots = (trk.totalPlots ?? 1) + 1;
        trk.remainingSweeps = (trk.remainingSweeps ?? 5) - 1;
        trk.quality = Math.max(0, trk.quality - 0.03);

        if (trk.state === 'tentative' && trk.totalPlots >= 2) {
          trk.state = 'confirmed';
          trk.confirmedTick = currentTick;
          events.push({
            tick: currentTick,
            type: 'TRACK_CONFIRMED',
            payload: {
              trackId: trk.trackId,
              rangeM: vDist(trk.estimatedPos, origin),
              bearingDeg: gBearing,
            },
          });
        }

        if (trk.remainingSweeps <= 0 || trk.quality <= 0.05) {
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

    // Spawn new ghost if under limit (evaluated at sweep boundary: currentTick % 40 === 0)
    if (currentTick % 40 === 0) {
      let activeGhostCount = 0;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t && t.isGhost && t.state !== 'dropped') activeGhostCount++;
      }

      const spawnChance =
        env.terrainKind === 'urban' ? 0.75 : env.terrainKind === 'hilly' ? 0.4 : 0.2;

      if (activeGhostCount < maxGhosts && ghostRng.next() < spawnChance) {
        const rGhost = 800 + ghostRng.next() * 2700; // 800 - 3500m
        const bGhostDeg = ghostRng.next() * 360;
        const bGhostRad = bGhostDeg * DEG_TO_RAD;
        const ghostPos = vec3(
          rGhost * dSin(bGhostRad),
          rGhost * dCos(bGhostRad),
          20 + ghostRng.next() * 30
        );
        const ghostSpd = 2 + ghostRng.next() * 4; // 2 - 6 m/s
        const ghostHdgDeg = ghostRng.next() * 360;
        const ghostHdgRad = ghostHdgDeg * DEG_TO_RAD;
        const ghostVel = vec3(ghostSpd * dSin(ghostHdgRad), ghostSpd * dCos(ghostHdgRad), 0);
        const ghostRcs = 0.003 + ghostRng.next() * 0.005;

        const newGhost: Track = {
          trackId: nextTrackIdRef.current++,
          actorId: -nextTrackIdRef.current,
          state: 'tentative',
          isGhost: true,
          estimatedPos: ghostPos,
          estimatedVel: ghostVel,
          lastDetectedTick: currentTick,
          firstSeenTick: currentTick,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          totalPlots: 1,
          remainingSweeps: 3 + Math.floor(ghostRng.next() * 6), // 3 to 8 sweeps
          rcsBucket: computeRcsBucket(ghostRcs),
          measuredRcs: ghostRcs,
          quality: 0.25,
          acked: false,
          engagementStatus: 'none',
          headingChangeRateSmoothed: 0,
          lastSweepChecked: currentTick,
        };
        tracks.push(newGhost);
      }
    }
  }
}
