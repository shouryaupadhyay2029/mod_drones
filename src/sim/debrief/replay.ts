import { Engine } from '../core/engine.js';
import { Rng } from '../core/rng.js';
import { SessionLog, SimEvent } from '../core/types.js';
import { Vec3, vec3 } from '../core/vec.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { ActorState } from '../model/actors.js';
import { generateTerrain, hasLineOfSight, TerrainMap } from '../model/terrain.js';
import { THREAT_LIBRARY, ThreatClassId } from '../model/threats.js';
import { TrackState, Track } from '../model/tracks.js';
import { EffectorState } from '../model/effectors.js';

export interface TerrainGrid {
  step: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  heights: number[];
  clutter: number[];
}

export interface RadarShadowGrid {
  step: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  blocked: boolean[];
}

export interface ReplayFrame {
  tick: number;
  actors: Array<{ id: number; classId: ThreatClassId; role: 'hostile' | 'neutral'; pos: Vec3; state: ActorState }>;
  tracks: Array<{
    trackId: number;
    actorId: number | null;
    estPos: Vec3;
    state: TrackState;
    assessedClass: ThreatClassId | 'unknown' | null;
    isGhost: boolean;
  }>;
  trails: Array<{ actorId: number; points: Vec3[] }>;
  effectors: EffectorState;
  events: SimEvent[];
  env: Environment;
}

const WORLD_MIN_M = -8000;
const WORLD_MAX_M = 8000;
const SNAPSHOT_INTERVAL_TICKS = 100;

function cloneEvents(events: readonly SimEvent[]): SimEvent[] {
  return events.map((event) => ({ ...event, payload: { ...event.payload } }));
}

function cloneEffectors(effectors: EffectorState): EffectorState {
  return {
    jammer: {
      busyUntilTick: effectors.jammer.busyUntilTick,
      currentEngagement: effectors.jammer.currentEngagement ? { ...effectors.jammer.currentEngagement } : undefined,
    },
    gun: {
      ammo: effectors.gun.ammo,
      busyUntilTick: effectors.gun.busyUntilTick,
      currentEngagement: effectors.gun.currentEngagement ? { ...effectors.gun.currentEngagement } : undefined,
    },
  };
}

function sampleGrid(step: number, sample: (x: number, y: number) => number): { width: number; height: number; values: number[] } {
  if (!Number.isFinite(step) || step <= 0) throw new Error('Grid step must be a positive finite number');
  const count = Math.floor((WORLD_MAX_M - WORLD_MIN_M) / step) + 1;
  const values = new Array<number>(count * count);
  for (let row = 0; row < count; row++) {
    const y = WORLD_MIN_M + row * step;
    for (let col = 0; col < count; col++) {
      values[row * count + col] = sample(WORLD_MIN_M + col * step, y);
    }
  }
  return { width: count, height: count, values };
}

export function buildRadarShadowGrid(terrain: TerrainMap, altitudeAgl: number, step = 100): RadarShadowGrid {
  if (!Number.isFinite(altitudeAgl) || altitudeAgl < 0) throw new Error('Altitude AGL must be a non-negative finite number');
  const grid = sampleGrid(step, (x, y) => {
    const targetGround = terrain.heightAt(x, y);
    const target = vec3(x, y, targetGround + altitudeAgl);
    const radar = vec3(0, 0, terrain.heightAt(0, 0) + 15);
    return hasLineOfSight(radar, target, terrain, 50) ? 0 : 1;
  });
  return {
    step,
    originX: WORLD_MIN_M,
    originY: WORLD_MIN_M,
    width: grid.width,
    height: grid.height,
    blocked: grid.values.map((value) => value === 1),
  };
}

export function createReplay(log: SessionLog): {
  totalTicks: number;
  seek(tick: number): ReplayFrame;
  frame(): ReplayFrame;
  terrainGrid(step?: number): TerrainGrid;
  radarShadow(altitudeAgl: number, step?: number): RadarShadowGrid;
  hash(): string;
} {
  const totalTicks = Math.max(0, Math.floor(log.totalTicks));
  let engine = new Engine(log.seed, log.scenarioId, log.generatorAvoid ?? [], log.options);
  for (const command of log.commands) {
    engine.enqueueCommand({ tick: command.tick, type: command.type, payload: { ...command.payload } });
  }

  const snapshots = new Map<number, ReturnType<Engine['snapshot']>>([[0, engine.snapshot()]]);
  const actorHistory = new Map<number, Array<{ tick: number; pos: Vec3 }>>();
  const recordPositions = () => {
    for (const actor of engine.actors) {
      const points = actorHistory.get(actor.id) ?? [];
      points.push({ tick: engine.world.tick, pos: { ...actor.pos } });
      actorHistory.set(actor.id, points);
    }
  };
  const environment = createEnvironment(engine.world.environment);
  const terrain = engine.terrain ?? generateTerrain(environment.terrainKind, new Rng(`${log.seed}:aar-terrain`));

  const frame = (): ReplayFrame => ({
    tick: engine.world.tick,
    actors: engine.actors.map((actor) => ({
      id: actor.id,
      classId: actor.classId,
      role: THREAT_LIBRARY[actor.classId]?.hostile ? 'hostile' : 'neutral',
      pos: { ...actor.pos },
      state: actor.state,
    })),
    tracks: engine.tracks.map((track: Track) => ({
      trackId: track.trackId,
      actorId: track.isGhost ? null : (engine.actors.some((actor) => actor.id === track.actorId) ? track.actorId : null),
      estPos: { ...track.estimatedPos },
      state: track.state,
      assessedClass: track.assessedClass ?? null,
      isGhost: track.isGhost ?? false,
    })),
    trails: [...actorHistory.entries()].map(([actorId, points]) => ({
      actorId,
      points: points.filter((point) => point.tick <= engine.world.tick).map((point) => ({ ...point.pos })),
    })),
    effectors: cloneEffectors(engine.effectorState),
    events: cloneEvents(engine.getEvents().filter((event) => event.tick <= engine.world.tick)),
    env: { ...createEnvironment(engine.world.environment) },
  });

  const seek = (requestedTick: number): ReplayFrame => {
    const targetTick = Math.max(0, Math.min(totalTicks, Math.floor(requestedTick)));
    if (targetTick < engine.world.tick) {
      let restoreTick = 0;
      for (const cachedTick of snapshots.keys()) {
        if (cachedTick <= targetTick && cachedTick > restoreTick) restoreTick = cachedTick;
      }
      const snapshot = snapshots.get(restoreTick);
      if (snapshot) engine = Engine.restore(snapshot);
    }
    while (engine.world.tick < targetTick) {
      engine.step();
      recordPositions();
      if (engine.world.tick % SNAPSHOT_INTERVAL_TICKS === 0 && !snapshots.has(engine.world.tick)) {
        snapshots.set(engine.world.tick, engine.snapshot());
      }
    }
    return frame();
  };

  return {
    totalTicks,
    seek,
    frame,
    terrainGrid(step = 100) {
      const grid = sampleGrid(step, (x, y) => terrain.heightAt(x, y));
      const clutter = sampleGrid(step, (x, y) => terrain.clutterAt(x, y));
      return { step, originX: WORLD_MIN_M, originY: WORLD_MIN_M, width: grid.width, height: grid.height, heights: grid.values, clutter: clutter.values };
    },
    radarShadow(altitudeAgl, step = 100) {
      return buildRadarShadowGrid(terrain, altitudeAgl, step);
    },
    hash() {
      return engine.getHash();
    },
  };
}
