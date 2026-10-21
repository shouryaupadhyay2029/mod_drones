import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3, Vec3 } from '../core/vec.js';
import { Actor, createActor } from '../model/actors.js';

export interface ScenarioSpawnSchedule {
  tick: number;
  classId: 'bird' | 'commercial_quad' | 'fpv_kamikaze';
  pos: Vec3;
  behaviourType: 'wander' | 'transit' | 'ingress_direct';
  speed: number;
  transitWaypointB?: Vec3;
}

export function buildDawnIntrusionSpawns(scenarioRng: Rng): ScenarioSpawnSchedule[] {
  // 1. Bird: t ~ 10s (200 ticks +- 5s), bearing ~ 40 deg +- 15 deg, range ~ 1.8 km (+- 200m)
  const birdTick = Math.max(50, 200 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const birdBearingDeg = 40 + (scenarioRng.next() - 0.5) * 30;
  const birdRangeM = 1800 + (scenarioRng.next() - 0.5) * 400;
  const birdRad = birdBearingDeg * DEG_TO_RAD;
  const birdPos = vec3(birdRangeM * dSin(birdRad), birdRangeM * dCos(birdRad), 80);

  // 2. Commercial Quad: t ~ 20s (400 ticks +- 5s), transit passing ~ 1.2 km from asset
  const quadTick = Math.max(birdTick + 40, 400 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const quadStandoffY = 1200 + (scenarioRng.next() - 0.5) * 200;
  const quadStartPos = vec3(-4000, quadStandoffY, 90);
  const quadEndPos = vec3(4000, quadStandoffY, 90);

  // 3. FPV Kamikaze: t ~ 45s (900 ticks +- 5s), bearing ~ 280 deg +- 15 deg, range 4 km, alt ~ 60m
  const fpvTick = Math.max(quadTick + 40, 900 + Math.floor((scenarioRng.next() - 0.5) * 200));
  const fpvBearingDeg = 280 + (scenarioRng.next() - 0.5) * 30;
  const fpvRangeM = 4000;
  const fpvRad = fpvBearingDeg * DEG_TO_RAD;
  const fpvPos = vec3(fpvRangeM * dSin(fpvRad), fpvRangeM * dCos(fpvRad), 60);

  return [
    {
      tick: birdTick,
      classId: 'bird',
      pos: birdPos,
      behaviourType: 'wander',
      speed: 9,
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
      tick: fpvTick,
      classId: 'fpv_kamikaze',
      pos: fpvPos,
      behaviourType: 'ingress_direct',
      speed: 30,
    },
  ];
}

export function spawnScheduledActor(
  schedule: ScenarioSpawnSchedule,
  nextActorId: number
): Actor {
  if (schedule.behaviourType === 'ingress_direct') {
    return createActor(
      nextActorId,
      schedule.classId,
      schedule.pos,
      { type: 'ingress_direct', targetPos: vec3(0, 0, 0) },
      schedule.speed
    );
  } else if (schedule.behaviourType === 'transit') {
    return createActor(
      nextActorId,
      schedule.classId,
      schedule.pos,
      {
        type: 'transit',
        waypointA: schedule.pos,
        waypointB: schedule.transitWaypointB ?? vec3(4000, 1200, 90),
      },
      schedule.speed
    );
  } else {
    return createActor(
      nextActorId,
      schedule.classId,
      schedule.pos,
      {
        type: 'wander',
        headingDeg: 220,
        pitchDeg: 0,
        speed: schedule.speed,
        lastHeadingChangeTick: schedule.tick,
      },
      schedule.speed
    );
  }
}
