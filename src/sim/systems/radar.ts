import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { SimEvent } from '../core/types.js';
import { bearingDeg, vDist, Vec3, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { Environment } from '../model/environment.js';
import {
  generateTerrain,
  hasLineOfSight,
  TerrainMap,
} from '../model/terrain.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { RcsBucket, Track } from '../model/tracks.js';

export const RADAR_MAX_RANGE_M = 5000;
export const RADAR_RCS_REF = 0.01;
export const RADAR_SWEEP_PERIOD_TICKS = 40;

const DT = 0.05; // 20 Hz fixed timestep

/** Number of most recent plots used by the least-squares velocity fit. */
export const PLOT_FIT_WINDOW = 5;
/** Minimum plots needed before the least-squares fit replaces the finite difference. */
export const PLOT_FIT_MIN_PLOTS = 3;

/**
 * Least-squares straight-line velocity fit over the given plots:
 * v = sum((t - tMean) * (p - pMean)) / sum((t - tMean)^2), per axis. Plain arithmetic only.
 */
export function fitVelocityLeastSquares(
  plots: ReadonlyArray<{ tick: number; pos: Vec3 }>
): Vec3 {
  const n = plots.length;
  let tMean = 0;
  let xMean = 0;
  let yMean = 0;
  let zMean = 0;
  for (let i = 0; i < n; i++) {
    const p = plots[i]!;
    tMean += p.tick * DT;
    xMean += p.pos.x;
    yMean += p.pos.y;
    zMean += p.pos.z;
  }
  tMean /= n;
  xMean /= n;
  yMean /= n;
  zMean /= n;
  let sTT = 0;
  let sTX = 0;
  let sTY = 0;
  let sTZ = 0;
  for (let i = 0; i < n; i++) {
    const p = plots[i]!;
    const dt = p.tick * DT - tMean;
    sTT += dt * dt;
    sTX += dt * (p.pos.x - xMean);
    sTY += dt * (p.pos.y - yMean);
    sTZ += dt * (p.pos.z - zMean);
  }
  if (sTT <= 0) return vec3(0, 0, 0);
  return { x: sTX / sTT, y: sTY / sTT, z: sTZ / sTT };
}

/**
 * Standard 3-sample Irwin-Hall approximation for zero-mean unit-variance Gaussian noise.
 */
function irwinHall(rng: Rng): number {
  return rng.next() + rng.next() + rng.next() - 1.5;
}

/**
 * Checks whether an azimuth angle is within a given angular sector [start, end)
 * wrapping properly across 360 degrees.
 */
function isAngleInSector(angle: number, start: number, end: number): boolean {
  let span = (end - start) % 360;
  if (span <= 0) span += 360;
  let diff = (angle - start) % 360;
  if (diff < 0) diff += 360;
  return diff >= 0 && diff < span;
}

function computeRcsBucket(measuredRcs: number): RcsBucket {
  if (measuredRcs < 0.005) return 'tiny';
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
  ghostRng?: Rng,
  terrainMap?: TerrainMap
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

  const terrain = terrainMap ?? generateTerrain(env.terrainKind, radarRng.fork('terrain-fallback'));

  // 1. Process all active actors in deterministic ID order
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    if (!actor || actor.state !== 'active') continue;

    const bearing = bearingDeg(origin, actor.pos);
    if (!isAngleInSector(bearing, startAzimuth, endAzimuth)) {
      continue;
    }

    const existingTrack = tracks.find((t) => t.actorId === actor.id && t.state !== 'dropped');
    // Sector test is half-open [start, end) with 360 wrap; rotation period is 40 ticks (2.0s).
    // A target cannot receive two plots on consecutive ticks or less than 1.9s apart.
    if (existingTrack && currentTick - existingTrack.lastDetectedTick < 38) {
      continue;
    }

    const threat = THREAT_LIBRARY[actor.classId];
    const r = vDist(actor.pos, origin);

    // Weather factor on effective range: clear 1.0, haze 0.97, rain 0.85, fog 0.95
    const weatherMult =
      env.weather === 'clear' ? 1.0 :
      env.weather === 'haze' ? 0.97 :
      env.weather === 'fog' ? 0.95 :
      env.weather === 'rain' ? 0.85 : 1.0;

    const rEff = RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(threat.rcsM2 / RADAR_RCS_REF)) * weatherMult;
    const ratio = r / rEff;
    const ratio4 = ratio * ratio * ratio * ratio;

    // Clutter: pd *= 1 - clutterAt(x,y) * lowFactor, lowFactor = 1 for AGL <= 50, linear to 0 at 150
    const terrainH = terrain.heightAt(actor.pos.x, actor.pos.y);
    const clutter = terrain.clutterAt(actor.pos.x, actor.pos.y);
    const agl = Math.max(0, actor.pos.z - terrainH);
    let lowFactor = 0;
    if (agl <= 50) {
      lowFactor = 1;
    } else if (agl < 150) {
      lowFactor = (150 - agl) / 100;
    }
    const pdClutterMult = Math.max(0, 1 - clutter * lowFactor);

    // EW Pd multiplier: [1.0, 0.92, 0.8]
    const ewPdMult =
      env.ewLevel === 'heavy' ? 0.8 :
      env.ewLevel === 'light' ? 0.92 : 1.0;

    const basePd = Math.min(0.95, Math.max(0, 1 - ratio4));
    const pd = basePd * pdClutterMult * ewPdMult;

    // Terrain Line-of-Sight masking check (mast at (0, 0, 15) to target)
    // Blocked if terrain height at any sample exceeds ray height - 5 m
    const hasLos = hasLineOfSight(mastPos, actor.pos, terrain, 50);

    const hit = hasLos && radarRng.next() < pd;

    if (hit) {
      // Gaussian noise via Irwin-Hall, scaled by EW noise multiplier [1, 1.5, 2.5]
      const ewNoiseMult =
        env.ewLevel === 'heavy' ? 2.5 :
        env.ewLevel === 'light' ? 1.5 : 1.0;
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
          plotHistory: [{ tick: currentTick, pos: measPos }],
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

          // Keep the last <= PLOT_FIT_WINDOW raw plots (immutable update: snapshots share arrays).
          const history = [
            ...(existingTrack.plotHistory ?? []).slice(-(PLOT_FIT_WINDOW - 1)),
            { tick: currentTick, pos: measPos },
          ];
          existingTrack.plotHistory = history;

          if (history.length >= PLOT_FIT_MIN_PLOTS) {
            // Least-squares velocity fit over the last <= 5 plots (>= 3 plots available)
            existingTrack.estimatedVel = fitVelocityLeastSquares(history);
          } else {
            // Second hit: initialize directly from finite difference
            existingTrack.estimatedVel = { x: rawVx, y: rawVy, z: rawVz };
          }

          // Heading turn rate smoothing
          const currentCourseDeg = bearingDeg(vec3(0, 0, 0), existingTrack.estimatedVel);
          if (existingTrack.previousHeadingDeg !== undefined) {
            let diff = currentCourseDeg - existingTrack.previousHeadingDeg;
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            const instantaneousTurnRate = Math.abs(diff) / dtSec;
            existingTrack.headingChangeRateSmoothed =
              0.3 * instantaneousTurnRate + 0.7 * existingTrack.headingChangeRateSmoothed;
          }
          existingTrack.previousHeadingDeg = currentCourseDeg;
        }

        existingTrack.estimatedPos = measPos;
        existingTrack.lastDetectedTick = currentTick;
        existingTrack.quality = Math.min(1.0, existingTrack.quality + 0.15);

        // Track Promotion: tentative -> confirmed on 2 consecutive hits
        if (existingTrack.state === 'tentative' && existingTrack.consecutiveHits >= 2) {
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
    } else if (existingTrack) {
      // Missed detection on active sweep
      existingTrack.consecutiveMisses++;
      existingTrack.consecutiveHits = 0;
      existingTrack.quality = Math.max(0.0, existingTrack.quality - 0.15);

      // Track Drop: after 5 consecutive missed sweeps
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

  // 2. Check for dropped tracks when actor has departed / neutralized
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
    // Process existing active ghosts sweeping through sector
    for (let i = 0; i < tracks.length; i++) {
      const trk = tracks[i];
      if (!trk || !trk.isGhost || trk.state === 'dropped') continue;

      trk.estimatedPos.x += trk.estimatedVel.x * DT;
      trk.estimatedPos.y += trk.estimatedVel.y * DT;
      trk.estimatedPos.z += trk.estimatedVel.z * DT;

      if (trk.lastDetectedTick !== undefined && currentTick - trk.lastDetectedTick < 38) {
        continue;
      }

      const gBearing = bearingDeg(origin, trk.estimatedPos);
      if (isAngleInSector(gBearing, startAzimuth, endAzimuth)) {
        trk.ghostRotationsSeen = (trk.ghostRotationsSeen ?? 0) + 1;
        const maxRotations = trk.ghostRemainingRotations ?? (trk.ghostWillConfirm ? 6 : 2);

        // Quality decay for confirmed ghosts: decays 0.25 -> 0.1 over up to 6 rotations
        if (trk.ghostWillConfirm || trk.state === 'confirmed') {
          trk.quality = Math.max(0.1, 0.25 - ((trk.ghostRotationsSeen - 1) / 5) * 0.15);
        }

        // Re-plotted on later sweeps with probability 0.6 while lifespan active
        if (trk.ghostRotationsSeen <= maxRotations && ghostRng.next() < 0.6) {
          // Position jitter +-60m
          const jitterX = (ghostRng.next() - 0.5) * 120;
          const jitterY = (ghostRng.next() - 0.5) * 120;
          trk.estimatedPos.x += jitterX;
          trk.estimatedPos.y += jitterY;
          trk.lastDetectedTick = currentTick;
          trk.totalPlots = (trk.totalPlots ?? 1) + 1;
          trk.consecutiveHits++;
          trk.consecutiveMisses = 0;

          if (trk.ghostWillConfirm && trk.state === 'tentative' && trk.totalPlots >= 2) {
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
        } else {
          // Missed detection on this sweep
          trk.consecutiveMisses++;
          trk.consecutiveHits = 0;
          if (!trk.ghostWillConfirm && trk.state !== 'confirmed') {
            trk.quality = Math.max(0.0, trk.quality - 0.05);
          }

          // Tentative and confirmed ghosts drop after 2 missed rotations after their last plot
          if (trk.consecutiveMisses >= 2) {
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

    // Ghost rates per MINUTE: ew 0 -> 0, ew 1 -> 4, ew 2 -> 12, urban +3
    // Evaluated per sweep (every 10 ticks): check with p = ratePerMin / 120
    if (currentTick % 10 === 0) {
      const ewRatePerMin =
        env.ewLevel === 'heavy' ? 12 : env.ewLevel === 'light' ? 4 : 0;
      const urbanRatePerMin = env.terrainKind === 'urban' ? 3 : 0;
      const ratePerMin = ewRatePerMin + urbanRatePerMin;
      const p = ratePerMin / 120;

      if (p > 0 && ghostRng.next() < p) {
        const bGhostDeg = (startAzimuth + ghostRng.next() * sweepDegPerTick) % 360;
        const bGhostRad = bGhostDeg * DEG_TO_RAD;
        const rGhost = 800 + ghostRng.next() * (5500 - 800);
        const zGhost = 20 + ghostRng.next() * (150 - 20);

        const ghostPos = vec3(
          rGhost * dSin(bGhostRad),
          rGhost * dCos(bGhostRad),
          zGhost
        );

        const ghostSpd = 2 + ghostRng.next() * 4; // slow 2-6 m/s
        const ghostHdgDeg = ghostRng.next() * 360;
        const ghostHdgRad = ghostHdgDeg * DEG_TO_RAD;
        const ghostVel = vec3(ghostSpd * dSin(ghostHdgRad), ghostSpd * dCos(ghostHdgRad), 0);
        const ghostRcs = 0.003 + ghostRng.next() * 0.005;

        // Confirmation probability: 10% at ew 1, 30% at ew 2
        // Confirmed ghosts live up to 6 rotations, quality decaying 0.25 -> 0.1
        const confirmProb =
          env.ewLevel === 'heavy' ? 0.3 : env.ewLevel === 'light' ? 0.1 : 0.0;
        const willConfirm = ghostRng.next() < confirmProb;
        const maxRotations = willConfirm ? 6 : (1 + Math.floor(ghostRng.next() * 2));

        const newGhost: Track = {
          trackId: nextTrackIdRef.current++,
          actorId: -nextTrackIdRef.current,
          state: 'tentative',
          isGhost: true,
          ghostRemainingRotations: maxRotations,
          ghostWillConfirm: willConfirm,
          ghostRotationsSeen: 0,
          estimatedPos: ghostPos,
          estimatedVel: ghostVel,
          lastDetectedTick: currentTick,
          firstSeenTick: currentTick,
          consecutiveHits: 1,
          consecutiveMisses: 0,
          totalPlots: 1,
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
