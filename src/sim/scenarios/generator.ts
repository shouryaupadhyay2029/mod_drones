// Generic illustrative parameters for training; not real specifications.

import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { bearingDeg, vec3 } from '../core/vec.js';
import {
  createEnvironment,
  Environment,
  EwLevel,
  TerrainKind,
  TimeOfDay,
  Weather,
} from '../model/environment.js';
import { generateTerrain, TerrainMap } from '../model/terrain.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';
import {
  buildSwarmSpawns,
  SwarmMemberConfig,
  SwarmTactic,
} from './swarm.js';

export const GEN_VERSION = 1;

export type Tier = 'recruit' | 'operator' | 'veteran' | 'elite';
export type Fingerprint = string;

export interface ProceduralScenario {
  scenarioId: string;
  tier: Tier;
  environment: Environment;
  spawns: ScenarioSpawnSchedule[];
  fingerprint: Fingerprint;
  tactic?: SwarmTactic;
  terrain?: TerrainMap;
}

/**
 * FNV-1a 32-bit deterministic hex hash for string.
 */
function fnv1aHex(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Computes scenario fingerprint from tactic, class counts, quantized bearings, and environment.
 */
export function computeFingerprint(
  tactic: string,
  classCounts: Record<string, number>,
  bearings: number[],
  env: Environment
): Fingerprint {
  const countsStr = Object.keys(classCounts)
    .sort()
    .map((k) => `${k}:${classCounts[k]}`)
    .join(';');

  // Quantize bearings to 30 deg bins (0, 30, 60, ... 330)
  const quantized = bearings
    .map((b) => (Math.round((((b % 360) + 360) % 360) / 30) * 30) % 360)
    .sort((a, b) => a - b)
    .join(',');

  const envStr = `${env.terrainKind}_${env.weather}_${env.timeOfDay}_${env.ewLevel}`;
  const rawKey = `v${GEN_VERSION}|${tactic}|${countsStr}|${quantized}|${envStr}`;
  return fnv1aHex(rawKey);
}

/**
 * Procedural scenario generator.
 * Version: GEN_VERSION = 1.
 * Uses rng.fork('gen').
 * Re-rolls up to 8 times to avoid listed fingerprints.
 * All actors resolve by tick <= 4200 if left alone.
 */
export function generateScenario(
  seed: string | number,
  tier: Tier,
  avoid: Fingerprint[] = []
): ProceduralScenario {
  const rootRng = new Rng(seed);
  const genRng = rootRng.fork('gen');

  let bestScenario: ProceduralScenario | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptRng = genRng.fork(`attempt:${attempt}`);
    const scenario = buildSingleScenario(seed, tier, attemptRng);

    if (!avoid.includes(scenario.fingerprint)) {
      return scenario;
    }
    bestScenario = scenario;
  }

  return bestScenario!;
}

function buildSingleScenario(
  _seed: string | number,
  tier: Tier,
  rng: Rng
): ProceduralScenario {
  let env: Environment;
  let tactic: SwarmTactic | undefined;
  let numStrikers = 1;
  let numDecoys = 0;
  let maxFiberShare = 0;
  let numCivilians = 1;
  let numBirds = 1;

  switch (tier) {
    case 'recruit': {
      // 1 striker, 0 decoys, 0 fiber, 1 civilian, 1 bird
      // Environment: rural, clear, day, ew 0
      numStrikers = 1;
      numDecoys = 0;
      maxFiberShare = 0;
      numCivilians = 1;
      numBirds = 1;
      env = createEnvironment({
        terrainKind: 'rural',
        weather: 'clear',
        timeOfDay: 'day',
        ewLevel: 'none',
      });
      tactic = undefined;
      break;
    }

    case 'operator': {
      // 2-3 strikers, 0-1 decoys, 0 fiber, 1 civilian, 1 bird
      // Environment: rural/hilly, clear/haze, day/dusk, ew 0-1
      numStrikers = 2 + Math.floor(rng.next() * 2); // 2 or 3
      numDecoys = rng.next() < 0.5 ? 0 : 1;
      maxFiberShare = 0;
      numCivilians = 1;
      numBirds = 1;

      const terrainKind: TerrainKind = rng.next() < 0.5 ? 'rural' : 'hilly';
      const weather: Weather = rng.next() < 0.5 ? 'clear' : 'haze';
      const timeOfDay: TimeOfDay = rng.next() < 0.5 ? 'day' : 'dusk';
      const ewLevel: EwLevel = rng.next() < 0.5 ? 'none' : 'light';
      env = createEnvironment({ terrainKind, weather, timeOfDay, ewLevel });

      const tactics: SwarmTactic[] = ['saturation', 'split'];
      tactic = tactics[Math.floor(rng.next() * tactics.length)];
      break;
    }

    case 'veteran': {
      // 4-8 strikers, 1-3 decoys, <= 15% fiber share, 1-2 civilians, 1-2 birds
      // Environment: any, ew 0-1; tactics saturation/split/decoy_screen
      numStrikers = 4 + Math.floor(rng.next() * 5); // 4 to 8
      numDecoys = 1 + Math.floor(rng.next() * 3); // 1 to 3
      maxFiberShare = 0.15;
      numCivilians = 1 + Math.floor(rng.next() * 2); // 1 or 2
      numBirds = 1 + Math.floor(rng.next() * 2); // 1 or 2

      const terrains: TerrainKind[] = ['rural', 'hilly', 'urban'];
      const weathers: Weather[] = ['clear', 'haze', 'fog', 'rain'];
      const times: TimeOfDay[] = ['day', 'dusk', 'night'];
      const ews: EwLevel[] = ['none', 'light'];

      env = createEnvironment({
        terrainKind: terrains[Math.floor(rng.next() * terrains.length)]!,
        weather: weathers[Math.floor(rng.next() * weathers.length)]!,
        timeOfDay: times[Math.floor(rng.next() * times.length)]!,
        ewLevel: ews[Math.floor(rng.next() * ews.length)]!,
      });

      const tactics: SwarmTactic[] = ['saturation', 'split', 'decoy_screen'];
      tactic = tactics[Math.floor(rng.next() * tactics.length)];
      break;
    }

    case 'elite': {
      // 8-16 strikers, 3-6 decoys, <= 35% fiber share, 2-3 civilians, 2 birds
      // Environment: any, ew 1-2, night/rain/urban allowed; one pop-up striker wave after t=150 s
      numStrikers = 8 + Math.floor(rng.next() * 9); // 8 to 16
      numDecoys = 3 + Math.floor(rng.next() * 4); // 3 to 6
      maxFiberShare = 0.35;
      numCivilians = 2 + Math.floor(rng.next() * 2); // 2 or 3
      numBirds = 2;

      const terrains: TerrainKind[] = ['rural', 'hilly', 'urban'];
      const weathers: Weather[] = ['clear', 'haze', 'fog', 'rain'];
      const times: TimeOfDay[] = ['day', 'dusk', 'night'];
      const ews: EwLevel[] = ['light', 'heavy'];

      env = createEnvironment({
        terrainKind: terrains[Math.floor(rng.next() * terrains.length)]!,
        weather: weathers[Math.floor(rng.next() * weathers.length)]!,
        timeOfDay: times[Math.floor(rng.next() * times.length)]!,
        ewLevel: ews[Math.floor(rng.next() * ews.length)]!,
      });

      const tactics: SwarmTactic[] = ['saturation', 'split', 'decoy_screen'];
      tactic = tactics[Math.floor(rng.next() * tactics.length)];
      break;
    }
  }

  const terrain = generateTerrain(env.terrainKind, rng.fork('proc-terrain'));

  // Calculate fiber striker count
  const maxFiberCount = Math.floor(numStrikers * maxFiberShare);
  const fiberCount = maxFiberCount > 0 ? 1 + Math.floor(rng.next() * maxFiberCount) : 0;
  const standardStrikerCount = numStrikers - fiberCount;

  // Build striker configs
  const strikerConfigs: SwarmMemberConfig[] = [];
  for (let i = 0; i < standardStrikerCount; i++) {
    strikerConfigs.push({
      classId: 'fpv_kamikaze',
      role: 'striker',
      speed: 24 + rng.next() * 6, // 24-30 m/s
    });
  }
  for (let i = 0; i < fiberCount; i++) {
    strikerConfigs.push({
      classId: 'fpv_fiber',
      role: 'striker',
      speed: 22 + rng.next() * 6, // 22-28 m/s
    });
  }

  // Build decoy configs
  const decoyConfigs: SwarmMemberConfig[] = [];
  for (let i = 0; i < numDecoys; i++) {
    decoyConfigs.push({
      classId: 'decoy_drone',
      role: 'decoy',
      speed: 22 + rng.next() * 6, // 22-28 m/s
    });
  }

  const baseBearingDeg = Math.floor(rng.next() * 360);
  const startTick = 200 + Math.floor(rng.next() * 200); // t = 10-20 s

  const spawns: ScenarioSpawnSchedule[] = [];
  const recordedBearings: number[] = [];

  // 1. Build Swarm / Inbound Threats
  if (tactic) {
    const swarmSpawns = buildSwarmSpawns(
      {
        tactic,
        strikers: strikerConfigs,
        decoys: decoyConfigs,
        baseBearingDeg,
        startTick,
        terrain,
      },
      rng.fork('swarm')
    );
    for (const s of swarmSpawns) {
      spawns.push(s);
      const b = bearingDeg(vec3(0, 0, 0), s.pos);
      recordedBearings.push(b);
    }
  } else {
    // Single recruit striker
    for (const s of strikerConfigs) {
      const bRad = baseBearingDeg * DEG_TO_RAD;
      const range = 4200;
      const posX = range * dSin(bRad);
      const posY = range * dCos(bRad);
      const posZ = Math.max(50, terrain.heightAt(posX, posY) + 25);
      spawns.push({
        tick: startTick,
        classId: s.classId,
        pos: vec3(posX, posY, posZ),
        behaviourType: 'ingress_direct',
        speed: s.speed,
        groupId: 'recruit-striker',
        role: s.role,
      });
      recordedBearings.push(baseBearingDeg);
    }
  }

  // 2. Elite Tier: Pop-up striker wave after t=150s (tick 3000)
  if (tier === 'elite') {
    const popUpTick = 3000 + Math.floor(rng.next() * 100);
    const popUpBearingDeg = (baseBearingDeg + 90 + rng.next() * 180) % 360;
    const popUpRad = popUpBearingDeg * DEG_TO_RAD;
    // Close pop-up range 1000 - 1300 m at 26 m/s -> impacts in ~45s (tick 3900 <= 4200)
    const popUpRange = 1000 + rng.next() * 300;
    const px = popUpRange * dSin(popUpRad);
    const py = popUpRange * dCos(popUpRad);
    const pz = Math.max(40, terrain.heightAt(px, py) + 20);

    spawns.push({
      tick: popUpTick,
      classId: 'fpv_kamikaze',
      pos: vec3(px, py, pz),
      behaviourType: 'ingress_direct',
      speed: 26,
      groupId: 'elite-popup',
      role: 'striker',
    });
    recordedBearings.push(popUpBearingDeg);
  }

  // 3. Civilian Quads: Transit across airspace at standoff
  for (let c = 0; c < numCivilians; c++) {
    const civTick = startTick + 100 + c * 250;
    const standoffY = (c % 2 === 0 ? 1 : -1) * (1200 + rng.next() * 300);
    const startX = -850;
    const endX = 850;
    const startPos = vec3(startX, standoffY, 70);
    const endPos = vec3(endX, standoffY, 70);

    spawns.push({
      tick: civTick,
      classId: 'commercial_quad',
      pos: startPos,
      behaviourType: 'transit',
      speed: 13,
      transitWaypointB: endPos,
    });
    recordedBearings.push(standoffY > 0 ? 0 : 180);
  }

  // 4. Birds: Avian clutter wandering with departTick
  for (let b = 0; b < numBirds; b++) {
    const birdTick = 100 + b * 200 + Math.floor(rng.next() * 100);
    const birdBearing = (b * 150 + rng.next() * 60) % 360;
    const bRad = birdBearing * DEG_TO_RAD;
    const bRange = 1400 + rng.next() * 400;
    const bx = bRange * dSin(bRad);
    const by = bRange * dCos(bRad);
    const bz = Math.max(40, terrain.heightAt(bx, by) + 30);
    const birdDepartTick = 2400 + b * 400 + Math.floor(rng.next() * 300);

    spawns.push({
      tick: birdTick,
      classId: 'bird',
      pos: vec3(bx, by, bz),
      behaviourType: 'wander',
      speed: 8,
      departTick: birdDepartTick,
    });
    recordedBearings.push(birdBearing);
  }

  // Sort all spawns by tick order
  spawns.sort((a, b) => a.tick - b.tick);

  // Compute class counts
  const classCounts: Record<string, number> = {};
  for (const s of spawns) {
    classCounts[s.classId] = (classCounts[s.classId] ?? 0) + 1;
  }

  const fingerprint = computeFingerprint(
    tactic ?? 'direct',
    classCounts,
    recordedBearings,
    env
  );

  return {
    scenarioId: `proc:v1:${tier}`,
    tier,
    environment: env,
    spawns,
    fingerprint,
    tactic,
    terrain,
  };
}
