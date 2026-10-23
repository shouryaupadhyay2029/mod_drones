import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export const CITY_EDGE_NIGHT_ENV: Environment = createEnvironment({
  timeOfDay: 'night',
  weather: 'rain',
  visibilityKm: 3,
  ewLevel: 'light',
  terrainKind: 'urban',
});

/**
 * City Edge Night Scenario:
 * Urban terrain, night, rain, light EW.
 * 5 real contacts + radar ghost tracks:
 * 1. Avian contact 1 wandering at ~1.8 km with seeded departure
 * 2. Hostile FPV 1 from ~330 deg at ~3.8 km, z ~50 m (clutter-degraded)
 * 3. Commercial Quad in slow transit at ~1.4 km standoff
 * 4. Avian contact 2 wandering at ~1.6 km with seeded departure
 * 5. Hostile FPV 2 at ~t=90s from ~120 deg, z ~60 m
 */
export function buildCityEdgeNightSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Bird 1: t ~ 10s (200 +- 60 ticks), range ~ 1.8 km
  const bird1Tick = Math.max(50, 200 + Math.floor((scenarioRng.next() - 0.5) * 120));
  const bird1BearingDeg = 60 + (scenarioRng.next() - 0.5) * 20;
  const bird1RangeM = 1800 + (scenarioRng.next() - 0.5) * 300;
  const bird1Rad = bird1BearingDeg * DEG_TO_RAD;
  const bird1Pos = vec3(bird1RangeM * dSin(bird1Rad), bird1RangeM * dCos(bird1Rad), 65);
  const bird1DepartTick = 2200 + Math.floor(scenarioRng.next() * 500);

  // 2. Hostile FPV 1: t ~ 25s (500 +- 60 ticks), from ~330 deg, range 3800m, z 50m (clutter-degraded), speed 26 m/s
  const fpv1Tick = Math.max(bird1Tick + 40, 500 + Math.floor((scenarioRng.next() - 0.5) * 120));
  const fpv1BearingDeg = 330 + (scenarioRng.next() - 0.5) * 12;
  const fpv1RangeM = 3800;
  const fpv1Rad = fpv1BearingDeg * DEG_TO_RAD;
  const fpv1Pos = vec3(fpv1RangeM * dSin(fpv1Rad), fpv1RangeM * dCos(fpv1Rad), 50);

  // 3. Commercial Quad: t ~ 40s (800 +- 80 ticks), transit at 1.4 km standoff, speed 14 m/s
  const quadTick = Math.max(fpv1Tick + 40, 800 + Math.floor((scenarioRng.next() - 0.5) * 160));
  const quadY = 1400 + (scenarioRng.next() - 0.5) * 150;
  const quadStartX = -900 + (scenarioRng.next() - 0.5) * 160;
  const quadEndX = 900 + (scenarioRng.next() - 0.5) * 160;
  const quadStartPos = vec3(quadStartX, quadY, 70);
  const quadEndPos = vec3(quadEndX, quadY, 70);

  // 4. Bird 2: t ~ 60s (1200 +- 80 ticks), range ~ 1.6 km
  const bird2Tick = Math.max(quadTick + 40, 1200 + Math.floor((scenarioRng.next() - 0.5) * 160));
  const bird2BearingDeg = 240 + (scenarioRng.next() - 0.5) * 20;
  const bird2RangeM = 1600 + (scenarioRng.next() - 0.5) * 250;
  const bird2Rad = bird2BearingDeg * DEG_TO_RAD;
  const bird2Pos = vec3(bird2RangeM * dSin(bird2Rad), bird2RangeM * dCos(bird2Rad), 55);
  const bird2DepartTick = 2600 + Math.floor(scenarioRng.next() * 500);

  // 5. Hostile FPV 2: t ~ 75s (1500 +- 60 ticks), from ~120 deg, range 3000m, z 60m, speed 28 m/s
  const fpv2Tick = Math.max(bird2Tick + 40, 1500 + Math.floor((scenarioRng.next() - 0.5) * 120));
  const fpv2BearingDeg = 120 + (scenarioRng.next() - 0.5) * 12;
  const fpv2RangeM = 3000;
  const fpv2Rad = fpv2BearingDeg * DEG_TO_RAD;
  const fpv2Pos = vec3(fpv2RangeM * dSin(fpv2Rad), fpv2RangeM * dCos(fpv2Rad), 60);

  return [
    {
      tick: bird1Tick,
      classId: 'bird',
      pos: bird1Pos,
      behaviourType: 'wander',
      speed: 8,
      departTick: bird1DepartTick,
    },
    {
      tick: fpv1Tick,
      classId: 'fpv_kamikaze',
      pos: fpv1Pos,
      behaviourType: 'ingress_direct',
      speed: 26,
    },
    {
      tick: quadTick,
      classId: 'commercial_quad',
      pos: quadStartPos,
      behaviourType: 'transit',
      speed: 14,
      transitWaypointB: quadEndPos,
    },
    {
      tick: bird2Tick,
      classId: 'bird',
      pos: bird2Pos,
      behaviourType: 'wander',
      speed: 9,
      departTick: bird2DepartTick,
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
