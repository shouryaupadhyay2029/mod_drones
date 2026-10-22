import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export const RIDGE_RUNNER_ENV: Environment = createEnvironment({
  timeOfDay: 'dusk',
  weather: 'fog',
  visibilityKm: 2,
  ewLevel: 'light',
  terrainKind: 'hilly',
});

/**
 * Ridge Runner Scenario:
 * Hilly terrain, fog, light EW.
 * 4 contacts:
 * 1. Avian contact wandering at ~1.8 km
 * 2. Hostile FPV 1 ingress from ~285 deg (behind 80m ridge), masked until clearing ridge at ~1.8 km
 * 3. Commercial Quad in transit corridor at 1.5 km standoff
 * 4. Hostile FPV 2 ingress from ~200 deg (unmasked open approach)
 */
export function buildRidgeRunnerSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Bird: t ~ 10s (200 +- 100 ticks), range ~ 1.8 km, wander
  const birdTick = Math.max(50, 200 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const birdBearingDeg = 45 + (scenarioRng.next() - 0.5) * 30;
  const birdRangeM = 1800 + (scenarioRng.next() - 0.5) * 400;
  const birdRad = birdBearingDeg * DEG_TO_RAD;
  const birdPos = vec3(birdRangeM * dSin(birdRad), birdRangeM * dCos(birdRad), 85);
  const birdDepartTick = 2400 + Math.floor(scenarioRng.next() * 600);

  // 2. Hostile FPV 1: t ~ 30s (600 +- 60 ticks), ingress from ~ 285 deg behind ridge, speed 30 m/s
  // Ridge is at 2.1-2.4 km along ~285 deg with height >= 80m. FPV spawns at 3500m, alt 70m (masked by ridge)
  const fpv1Tick = Math.max(birdTick + 40, 600 + Math.floor((scenarioRng.next() - 0.5) * 120));
  const fpv1BearingDeg = 285 + (scenarioRng.next() - 0.5) * 10;
  const fpv1RangeM = 3500;
  const fpv1Rad = fpv1BearingDeg * DEG_TO_RAD;
  const fpv1Pos = vec3(fpv1RangeM * dSin(fpv1Rad), fpv1RangeM * dCos(fpv1Rad), 70);

  // 3. Commercial Quad: t ~ 50s (1000 +- 100 ticks), transit corridor at 1.5 km range, speed 12 m/s
  const quadTick = Math.max(fpv1Tick + 40, 1000 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const quadY = 1500 + (scenarioRng.next() - 0.5) * 200;
  const quadStartPos = vec3(-1200, quadY, 90);
  const quadEndPos = vec3(1200, quadY, 90);

  // 4. Hostile FPV 2: t ~ 75s (1500 +- 100 ticks), ingress from ~ 200 deg (unmasked), speed 28 m/s
  const fpv2Tick = Math.max(quadTick + 40, 1500 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const fpv2BearingDeg = 200 + (scenarioRng.next() - 0.5) * 15;
  const fpv2RangeM = 3800;
  const fpv2Rad = fpv2BearingDeg * DEG_TO_RAD;
  const fpv2Pos = vec3(fpv2RangeM * dSin(fpv2Rad), fpv2RangeM * dCos(fpv2Rad), 60);

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
