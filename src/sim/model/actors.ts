import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { bearingDeg, vDist2D, Vec3, vec3, vNormalize, vScale } from '../core/vec.js';
import { THREAT_LIBRARY, ThreatClassId } from './threats.js';

export type ActorState = 'active' | 'neutralized' | 'left_area' | 'impacted';

export type ActorBehaviour =
  | { type: 'ingress_direct'; targetPos?: Vec3 }
  | { type: 'transit'; waypointA: Vec3; waypointB: Vec3 }
  | { type: 'wander'; headingDeg: number; pitchDeg: number; speed: number; lastHeadingChangeTick: number }
  | { type: 'depart'; headingDeg?: number }
  | { type: 'neutralized' };

export interface Actor {
  id: number;
  classId: ThreatClassId;
  pos: Vec3;
  vel: Vec3;
  state: ActorState;
  behaviour: ActorBehaviour;
  speed: number;
  departTick?: number;
  neutralizedTick?: number;
  neutralizedDistanceToAsset?: number;
  groupId?: number | string;
  role?: 'striker' | 'decoy';
}

export function createActor(
  id: number,
  classId: ThreatClassId,
  pos: Vec3,
  behaviour: ActorBehaviour,
  speed?: number
): Actor {
  const threatClass = THREAT_LIBRARY[classId];
  const chosenSpeed = speed ?? (threatClass.speedRangeMps[0] + threatClass.speedRangeMps[1]) / 2;

  let initialVel = vec3(0, 0, 0);
  if (behaviour.type === 'ingress_direct') {
    const targetPos = behaviour.targetPos ?? vec3(0, 0, pos.z);
    const toAsset = vec3(targetPos.x - pos.x, targetPos.y - pos.y, targetPos.z - pos.z);
    initialVel = vScale(vNormalize(toAsset), chosenSpeed);
  } else if (behaviour.type === 'transit') {
    const toB = {
      x: behaviour.waypointB.x - behaviour.waypointA.x,
      y: behaviour.waypointB.y - behaviour.waypointA.y,
      z: behaviour.waypointB.z - behaviour.waypointA.z,
    };
    initialVel = vScale(vNormalize(toB), chosenSpeed);
  } else if (behaviour.type === 'wander') {
    const hRad = behaviour.headingDeg * DEG_TO_RAD;
    const pRad = behaviour.pitchDeg * DEG_TO_RAD;
    initialVel = {
      x: chosenSpeed * dSin(hRad) * dCos(pRad),
      y: chosenSpeed * dCos(hRad) * dCos(pRad),
      z: chosenSpeed * dSin(pRad),
    };
  } else if (behaviour.type === 'depart') {
    const distFromOrigin = vDist2D(pos, vec3(0, 0, 0));
    const outDir =
      distFromOrigin > 0 ? vNormalize(vec3(pos.x, pos.y, 0)) : vec3(0, 1, 0);
    initialVel = vScale(outDir, chosenSpeed);
  }

  return {
    id,
    classId,
    pos: { ...pos },
    vel: initialVel,
    state: 'active',
    behaviour,
    speed: chosenSpeed,
  };
}

export function updateActorBehaviour(
  actor: Actor,
  dt: number,
  currentTick: number,
  actorRng: Rng,
  onAssetHit: (actor: Actor) => void,
  onDecoyImpact?: (actor: Actor) => void
): void {
  if (actor.state !== 'active') {
    actor.vel = vec3(0, 0, 0);
    return;
  }

  // At departTick the bird becomes state 'left_area' immediately (exits coverage)
  if (actor.departTick !== undefined && currentTick >= actor.departTick) {
    actor.state = 'left_area';
    actor.vel = vec3(0, 0, 0);
    return;
  }

  switch (actor.behaviour.type) {
    case 'ingress_direct': {
      const assetPos = actor.behaviour.targetPos ?? vec3(0, 0, actor.pos.z);
      const toAsset = {
        x: assetPos.x - actor.pos.x,
        y: assetPos.y - actor.pos.y,
        z: assetPos.z - actor.pos.z,
      };
      const dist2D = vDist2D(actor.pos, vec3(0, 0, 0));

      if (dist2D <= 25) {
        actor.state = 'impacted';
        actor.vel = vec3(0, 0, 0);
        if (actor.classId === 'decoy_drone' || actor.role === 'decoy') {
          onDecoyImpact?.(actor);
        } else {
          onAssetHit(actor);
        }
        return;
      }

      actor.vel = vScale(vNormalize(toAsset), actor.speed);
      actor.pos.x += actor.vel.x * dt;
      actor.pos.y += actor.vel.y * dt;
      actor.pos.z += actor.vel.z * dt;
      break;
    }

    case 'transit': {
      actor.pos.x += actor.vel.x * dt;
      actor.pos.y += actor.vel.y * dt;
      actor.pos.z += actor.vel.z * dt;

      // Leaves area at 8 km from origin or upon completing transit past waypoint B
      const distFromOrigin = vDist2D(actor.pos, vec3(0, 0, 0));
      const distFromStart = vDist2D(actor.pos, actor.behaviour.waypointA);
      const totalDist = vDist2D(actor.behaviour.waypointB, actor.behaviour.waypointA);

      if (distFromOrigin >= 8000 || (totalDist > 0 && distFromStart >= totalDist)) {
        actor.state = 'left_area';
        actor.vel = vec3(0, 0, 0);
      }
      break;
    }

    case 'wander': {
      const b = actor.behaviour;
      // Heading change drawn from actor rng each ~1s (20 ticks)
      if (currentTick - b.lastHeadingChangeTick >= 20) {
        b.lastHeadingChangeTick = currentTick;

        const distFromOrigin = vDist2D(actor.pos, vec3(0, 0, 0));
        if (distFromOrigin >= 7000) {
          // Steer back towards origin
          b.headingDeg = bearingDeg(actor.pos, vec3(0, 0, 0));
        } else {
          // Small random turn in [-30, 30] deg
          const turn = (actorRng.next() - 0.5) * 60;
          b.headingDeg = (b.headingDeg + turn + 360) % 360;
        }

        // Slight altitude adjustment [-10, 10] deg pitch
        b.pitchDeg = (actorRng.next() - 0.5) * 10;
        if (actor.pos.z < 20) b.pitchDeg = Math.abs(b.pitchDeg);
        if (actor.pos.z > 140) b.pitchDeg = -Math.abs(b.pitchDeg);

        const hRad = b.headingDeg * DEG_TO_RAD;
        const pRad = b.pitchDeg * DEG_TO_RAD;
        actor.vel = {
          x: actor.speed * dSin(hRad) * dCos(pRad),
          y: actor.speed * dCos(hRad) * dCos(pRad),
          z: actor.speed * dSin(pRad),
        };
      }

      actor.pos.x += actor.vel.x * dt;
      actor.pos.y += actor.vel.y * dt;
      actor.pos.z += actor.vel.z * dt;

      if (vDist2D(actor.pos, vec3(0, 0, 0)) >= 8000) {
        actor.state = 'left_area';
        actor.vel = vec3(0, 0, 0);
      }
      break;
    }

    case 'depart': {
      // Natural departure at class speed
      const distFromOrigin = vDist2D(actor.pos, vec3(0, 0, 0));
      if (distFromOrigin >= 8000) {
        actor.state = 'left_area';
        actor.vel = vec3(0, 0, 0);
        return;
      }

      const outDir =
        distFromOrigin > 0
          ? vNormalize(vec3(actor.pos.x, actor.pos.y, 0))
          : vec3(0, 1, 0);
      actor.vel = vScale(outDir, actor.speed);

      actor.pos.x += actor.vel.x * dt;
      actor.pos.y += actor.vel.y * dt;
      actor.pos.z += actor.vel.z * dt;

      if (vDist2D(actor.pos, vec3(0, 0, 0)) >= 8000) {
        actor.state = 'left_area';
        actor.vel = vec3(0, 0, 0);
      }
      break;
    }

    case 'neutralized': {
      actor.vel = vec3(0, 0, 0);
      break;
    }
  }
}
