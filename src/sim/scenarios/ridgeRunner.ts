import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { TerrainFeature } from '../model/terrain.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export const RIDGE_RUNNER_ENV: Environment = createEnvironment({
  timeOfDay: 'day',
  weather: 'haze',
  visibilityKm: 5,
  ewLevel: 'none',
  terrainKind: 'hilly',
});

export const RIDGE_RUNNER_FEATURES: TerrainFeature[] = [
  {
    kind: 'ridge',
    bearingDeg: 210,
    rangeM: 3000,
    lengthM: 4000,
    widthM: 400,
    heightM: 140,
  },
];

/**
 * Ridge Runner Scenario:
 * Hilly terrain, day, haze, ew 0.
 * Ridge feature on bearing ~210 deg, range 3 km, length 4 km, width 400 m, height 140 m.
 * 4 contacts:
 * 1. Avian contact wandering at ~1.8 km
 * 2. Hostile FPV 1 from ~210 deg at ~5.5 km, z ~70 m (masked until it passes the ridge)
 * 3. Commercial Quad in transit at ~1.5 km
 * 4. Hostile FPV 2 from ~100 deg, z ~180 m (unmasked)
 */
export function buildRidgeRunnerSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Bird: t ~ 10s (200 +- 80 ticks), range ~ 1.8 km, wander
  const birdTick = Math.max(50, 200 + Math.floor((scenarioRng.next() - 0.5) * 160));
  const birdBearingDeg = 45 + (scenarioRng.next() - 0.5) * 30;
  const birdRangeM = 1800 + (scenarioRng.next() - 0.5) * 300;
  const birdRad = birdBearingDeg * DEG_TO_RAD;
  const birdPos = vec3(birdRangeM * dSin(birdRad), birdRangeM * dCos(birdRad), 85);
  const birdDepartTick = 2400 + Math.floor(scenarioRng.next() * 600);

  // 2. Hostile FPV 1: t ~ 20s (400 ticks +- 50), from ~210 deg, range 5500m, z 70m, speed 30 m/s
  // Masked by 140m ridge at range 3000m until it passes the ridge (~t = 103s / tick 2060)
  const fpv1Tick = Math.max(birdTick + 40, 400 + Math.floor((scenarioRng.next() - 0.5) * 100));
  const fpv1BearingDeg = 210 + (scenarioRng.next() - 0.5) * 8;
  const fpv1RangeM = 5500;
  const fpv1Rad = fpv1BearingDeg * DEG_TO_RAD;
  const fpv1Pos = vec3(fpv1RangeM * dSin(fpv1Rad), fpv1RangeM * dCos(fpv1Rad), 70);

  // 3. Commercial Quad: t ~ 45s (900 ticks +- 100), transit at ~1.5 km, speed 12 m/s
  const quadTick = Math.max(fpv1Tick + 40, 900 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const quadY = 1500 + (scenarioRng.next() - 0.5) * 200;
  const quadStartPos = vec3(-1500, quadY, 90);
  const quadEndPos = vec3(1500, quadY, 90);

  // 4. Hostile FPV 2: t ~ 60s (1200 ticks +- 100), from ~100 deg, range 4000m, z 180m (unmasked), speed 28 m/s
  const fpv2Tick = Math.max(quadTick + 40, 1200 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const fpv2BearingDeg = 100 + (scenarioRng.next() - 0.5) * 12;
  const fpv2RangeM = 4000;
  const fpv2Rad = fpv2BearingDeg * DEG_TO_RAD;
  const fpv2Pos = vec3(fpv2RangeM * dSin(fpv2Rad), fpv2RangeM * dCos(fpv2Rad), 180);

  return [
    {
      tick: birdTick,
      classId: 'bird',
      pos: birdPos,
      behaviourType: 'wander',
      speed: 9,
      departTick: birdDepartTick,
    },
    {
      tick: fpv1Tick,
      classId: 'fpv_kamikaze',
      pos: fpv1Pos,
      behaviourType: 'ingress_direct',
      speed: 30,
    },
    {
      tick: quadTick,
      classId: 'commercial_quad',
      pos: quadStartPos,
      behaviourType: 'transit',
      speed: 12,
      transitWaypointB: quadEndPos,
    },
    {
      tick: fpv2Tick,
      classId: 'fpv_kamikaze',
      pos: fpv2Pos,
      behaviourType: 'ingress_direct',
      speed: 28,
    },
  ];
}
