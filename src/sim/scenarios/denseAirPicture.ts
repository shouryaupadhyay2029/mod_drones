// Realistic multi-object tactical airspace simulation
import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export const DENSE_AIR_PICTURE_ENV: Environment = createEnvironment({
  timeOfDay: 'dusk',
  weather: 'clear',
  visibilityKm: 10,
  ewLevel: 'light',
  terrainKind: 'rural',
});

/**
 * Builds a realistic high-density tactical air picture with 13 coordinated air objects:
 * - 4 FPV Kamikaze strike drones (multi-axis ingress: West, North, Northeast, Northwest)
 * - 2 Fiber-optic guided strike drones (jam-resistant kinetic threats)
 * - 1 Fixed-Wing Reconnaissance UAV (high-altitude loitering surveillance)
 * - 2 Decoy targets (electronic lures mimicking hostile radar profiles)
 * - 2 Commercial quadcopters (civilian transit corridors, ROE-protected)
 * - 2 Avian/wildlife clutter tracks (low-RCS wanderers)
 */
export function buildDenseAirPictureSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Avian Wanderer 1: t ~ 5s (100 ticks +- 20), bearing ~ 35 deg, range 2200m
  const bird1Bearing = 35 + (scenarioRng.next() - 0.5) * 20;
  const bird1Range = 2200 + (scenarioRng.next() - 0.5) * 300;
  const bird1Rad = bird1Bearing * DEG_TO_RAD;
  const bird1Pos = vec3(bird1Range * dSin(bird1Rad), bird1Range * dCos(bird1Rad), 75);

  // 2. Avian Wanderer 2: t ~ 15s (300 ticks +- 30), bearing ~ 160 deg, range 2600m
  const bird2Bearing = 160 + (scenarioRng.next() - 0.5) * 20;
  const bird2Range = 2600 + (scenarioRng.next() - 0.5) * 400;
  const bird2Rad = bird2Bearing * DEG_TO_RAD;
  const bird2Pos = vec3(bird2Range * dSin(bird2Rad), bird2Range * dCos(bird2Rad), 90);

  // 3. Commercial Quad 1: t ~ 10s (200 ticks), civilian transit corridor north of asset
  const quad1Y = 1250 + (scenarioRng.next() - 0.5) * 200;
  const quad1Start = vec3(-1400, quad1Y, 85);
  const quad1End = vec3(1400, quad1Y, 85);

  // 4. Commercial Quad 2: t ~ 22s (440 ticks), civilian transit corridor south of asset
  const quad2Y = -1500 + (scenarioRng.next() - 0.5) * 200;
  const quad2Start = vec3(1500, quad2Y, 110);
  const quad2End = vec3(-1500, quad2Y, 110);

  // 5. Fixed-Wing Recon UAV: t ~ 18s (360 ticks), high-altitude loiter (alt 240m), bearing ~ 15 deg, range 4600m
  const reconBearing = 15 + (scenarioRng.next() - 0.5) * 15;
  const reconRange = 4600 + (scenarioRng.next() - 0.5) * 300;
  const reconRad = reconBearing * DEG_TO_RAD;
  const reconStart = vec3(reconRange * dSin(reconRad), reconRange * dCos(reconRad), 240);
  const reconEnd = vec3(1200, 1000, 240);

  // 6. FPV Kamikaze 1 (Primary Ingress - West): t ~ 30s (600 ticks), bearing ~ 280 deg, range 4100m
  const fpv1Bearing = 280 + (scenarioRng.next() - 0.5) * 15;
  const fpv1Rad = fpv1Bearing * DEG_TO_RAD;
  const fpv1Pos = vec3(4100 * dSin(fpv1Rad), 4100 * dCos(fpv1Rad), 65);

  // 7. Decoy 1 (Radar Lure West): t ~ 35s (700 ticks), bearing ~ 295 deg, range 4300m
  const decoy1Bearing = 295 + (scenarioRng.next() - 0.5) * 10;
  const decoy1Rad = decoy1Bearing * DEG_TO_RAD;
  const decoy1Pos = vec3(4300 * dSin(decoy1Rad), 4300 * dCos(decoy1Rad), 70);

  // 8. FPV Kamikaze 2 (Flank Ingress - North): t ~ 45s (900 ticks), bearing ~ 350 deg, range 4200m
  const fpv2Bearing = 350 + (scenarioRng.next() - 0.5) * 15;
  const fpv2Rad = fpv2Bearing * DEG_TO_RAD;
  const fpv2Pos = vec3(4200 * dSin(fpv2Rad), 4200 * dCos(fpv2Rad), 80);

  // 9. Fiber-Optic Drone 1 (Jam-Resistant Strike - Northwest): t ~ 55s (1100 ticks), bearing ~ 315 deg, range 3800m
  const fiber1Bearing = 315 + (scenarioRng.next() - 0.5) * 12;
  const fiber1Rad = fiber1Bearing * DEG_TO_RAD;
  const fiber1Pos = vec3(3800 * dSin(fiber1Rad), 3800 * dCos(fiber1Rad), 55);

  // 10. Decoy 2 (Electronic Decoy - Northeast): t ~ 65s (1300 ticks), bearing ~ 45 deg, range 3900m
  const decoy2Bearing = 45 + (scenarioRng.next() - 0.5) * 15;
  const decoy2Rad = decoy2Bearing * DEG_TO_RAD;
  const decoy2Pos = vec3(3900 * dSin(decoy2Rad), 3900 * dCos(decoy2Rad), 75);

  // 11. FPV Kamikaze 3 (Wave 2 - Northeast): t ~ 75s (1500 ticks), bearing ~ 65 deg, range 4400m
  const fpv3Bearing = 65 + (scenarioRng.next() - 0.5) * 15;
  const fpv3Rad = fpv3Bearing * DEG_TO_RAD;
  const fpv3Pos = vec3(4400 * dSin(fpv3Rad), 4400 * dCos(fpv3Rad), 60);

  // 12. FPV Kamikaze 4 (Wave 2 - South): t ~ 85s (1700 ticks), bearing ~ 190 deg, range 4000m
  const fpv4Bearing = 190 + (scenarioRng.next() - 0.5) * 15;
  const fpv4Rad = fpv4Bearing * DEG_TO_RAD;
  const fpv4Pos = vec3(4000 * dSin(fpv4Rad), 4000 * dCos(fpv4Rad), 70);

  // 13. Fiber-Optic Drone 2 (Wave 2 - Southeast): t ~ 95s (1900 ticks), bearing ~ 135 deg, range 3700m
  const fiber2Bearing = 135 + (scenarioRng.next() - 0.5) * 12;
  const fiber2Rad = fiber2Bearing * DEG_TO_RAD;
  const fiber2Pos = vec3(3700 * dSin(fiber2Rad), 3700 * dCos(fiber2Rad), 50);

  return [
    {
      tick: 100,
      classId: 'bird',
      pos: bird1Pos,
      behaviourType: 'wander',
      speed: 9,
      departTick: 3200,
    },
    {
      tick: 200,
      classId: 'commercial_quad',
      pos: quad1Start,
      behaviourType: 'transit',
      speed: 13,
      transitWaypointB: quad1End,
    },
    {
      tick: 300,
      classId: 'bird',
      pos: bird2Pos,
      behaviourType: 'wander',
      speed: 10,
      departTick: 3600,
    },
    {
      tick: 360,
      classId: 'fixed_wing_recon',
      pos: reconStart,
      behaviourType: 'transit',
      speed: 22,
      transitWaypointB: reconEnd,
    },
    {
      tick: 440,
      classId: 'commercial_quad',
      pos: quad2Start,
      behaviourType: 'transit',
      speed: 12,
      transitWaypointB: quad2End,
    },
    {
      tick: 600,
      classId: 'fpv_kamikaze',
      pos: fpv1Pos,
      behaviourType: 'ingress_direct',
      speed: 32,
      role: 'striker',
    },
    {
      tick: 700,
      classId: 'decoy_drone',
      pos: decoy1Pos,
      behaviourType: 'ingress_direct',
      speed: 30,
      role: 'decoy',
    },
    {
      tick: 900,
      classId: 'fpv_kamikaze',
      pos: fpv2Pos,
      behaviourType: 'ingress_direct',
      speed: 30,
      role: 'striker',
    },
    {
      tick: 1100,
      classId: 'fpv_fiber',
      pos: fiber1Pos,
      behaviourType: 'ingress_direct',
      speed: 28,
      role: 'striker',
    },
    {
      tick: 1300,
      classId: 'decoy_drone',
      pos: decoy2Pos,
      behaviourType: 'ingress_direct',
      speed: 29,
      role: 'decoy',
    },
    {
      tick: 1500,
      classId: 'fpv_kamikaze',
      pos: fpv3Pos,
      behaviourType: 'ingress_direct',
      speed: 33,
      role: 'striker',
    },
    {
      tick: 1700,
      classId: 'fpv_kamikaze',
      pos: fpv4Pos,
      behaviourType: 'ingress_direct',
      speed: 31,
      role: 'striker',
    },
    {
      tick: 1900,
      classId: 'fpv_fiber',
      pos: fiber2Pos,
      behaviourType: 'ingress_direct',
      speed: 27,
      role: 'striker',
    },
  ];
}
