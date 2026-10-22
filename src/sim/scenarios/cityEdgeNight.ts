import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export const CITY_EDGE_NIGHT_ENV: Environment = createEnvironment({
  timeOfDay: 'night',
  weather: 'rain',
  visibilityKm: 5,
  ewLevel: 'heavy',
  terrainKind: 'urban',
});

/**
 * City Edge Night Scenario:
 * Urban clutter, night, rain, heavy EW interference.
 * 4 contacts:
 * 1. Avian contact wandering at ~1.6 km
 * 2. Hostile fixed_wing_recon: high altitude (300m), speed 25 m/s, transiting at 1.4 km standoff (within soft-kill range)
 * 3. Commercial quad: slow transit/hovering at 80m, speed 8 m/s
 * 4. Hostile FPV: low altitude (35m, in the building clutter), ingress from 045 deg, speed 32 m/s
 */
export function buildCityEdgeNightSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Bird: t ~ 15s (300 +- 80 ticks), range ~ 1.6 km, wander
  const birdTick = Math.max(50, 300 + Math.floor((scenarioRng.next() - 0.5) * 160));
  const birdBearingDeg = 120 + (scenarioRng.next() - 0.5) * 30;
  const birdRangeM = 1600 + (scenarioRng.next() - 0.5) * 300;
  const birdRad = birdBearingDeg * DEG_TO_RAD;
  const birdPos = vec3(birdRangeM * dSin(birdRad), birdRangeM * dCos(birdRad), 50);
  const birdDepartTick = 2400 + Math.floor(scenarioRng.next() * 600);

  // 2. Hostile Fixed-Wing Recon: t ~ 20s (400 +- 100 ticks), altitude 300m, speed 25 m/s
  // Transits standoff passing at ~1350m range (well within 1500m jammer range)
  const reconTick = Math.max(birdTick + 40, 400 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const reconY = 1350 + (scenarioRng.next() - 0.5) * 100;
  const reconStartPos = vec3(-2000, reconY, 300);
  const reconEndPos = vec3(2000, reconY, 300);

  // 3. Commercial Quad: t ~ 40s (800 +- 100 ticks), hovering / slow transit at 80m, speed 8 m/s
  const quadTick = Math.max(reconTick + 40, 800 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const quadY = 1100 + (scenarioRng.next() - 0.5) * 150;
  const quadStartPos = vec3(-900, quadY, 80);
  const quadEndPos = vec3(900, quadY, 80);

  // 4. Hostile FPV: t ~ 60s (1200 +- 100 ticks), low altitude (35m, heavy building clutter), ingress from 045 deg, speed 32 m/s
  const fpvTick = Math.max(quadTick + 40, 1200 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const fpvBearingDeg = 45 + (scenarioRng.next() - 0.5) * 15;
  const fpvRangeM = 3500;
  const fpvRad = fpvBearingDeg * DEG_TO_RAD;
  const fpvPos = vec3(fpvRangeM * dSin(fpvRad), fpvRangeM * dCos(fpvRad), 35);

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
      tick: reconTick,
      classId: 'fixed_wing_recon',
      pos: reconStartPos,
      behaviourType: 'transit',
      speed: 25,
      transitWaypointB: reconEndPos,
    },
    {
      tick: quadTick,
      classId: 'commercial_quad',
      pos: quadStartPos,
      behaviourType: 'transit',
      speed: 8,
      transitWaypointB: quadEndPos,
    },
    {
      tick: fpvTick,
      classId: 'fpv_kamikaze',
      pos: fpvPos,
      behaviourType: 'ingress_direct',
      speed: 32,
    },
  ];
}
