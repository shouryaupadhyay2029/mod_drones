import { Entity, WorldState } from './types.js';

export function createInitialWorld(): WorldState {
  return {
    tick: 0,
    entities: [],
    nextEntityId: 1,
  };
}

export function cloneWorld(world: WorldState): WorldState {
  return {
    tick: world.tick,
    nextEntityId: world.nextEntityId,
    entities: world.entities.map((e) => ({ ...e })),
  };
}

export function stepWorldKinematics(world: WorldState, dt: number): void {
  for (let i = 0; i < world.entities.length; i++) {
    const entity = world.entities[i];
    if (entity) {
      entity.x += entity.vx * dt;
      entity.y += entity.vy * dt;
    }
  }
}

export function spawnEntity(
  world: WorldState,
  x: number,
  y: number,
  vx: number,
  vy: number
): Entity {
  const entity: Entity = {
    id: world.nextEntityId++,
    x,
    y,
    vx,
    vy,
  };
  world.entities.push(entity);
  return entity;
}

export function setEntityVelocity(
  world: WorldState,
  id: number,
  vx: number,
  vy: number
): Entity | undefined {
  const entity = world.entities.find((e) => e.id === id);
  if (entity) {
    entity.vx = vx;
    entity.vy = vy;
    return entity;
  }
  return undefined;
}
