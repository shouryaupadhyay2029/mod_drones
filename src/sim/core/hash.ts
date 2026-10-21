import { WorldState } from './types.js';
import { Actor } from '../model/actors.js';
import { Track } from '../model/tracks.js';
import { EffectorState } from '../model/effectors.js';

export function roundFloat(n: number): number {
  if (Number.isInteger(n)) {
    return n;
  }
  const rounded = Math.round(n * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function canonicalStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj === 'number') {
    return String(roundFloat(obj));
  }
  if (typeof obj === 'boolean' || typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`);
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(obj);
}

export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c64e6d ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(14, '0');
}

export interface StateHashPayload {
  world: WorldState;
  rngMainState: number;
  forkStates?: Record<string, number>;
  actors?: readonly Actor[];
  tracks?: readonly Track[];
  effectorState?: EffectorState;
}

export function stateHash(payloadOrWorld: WorldState | StateHashPayload, rngState?: number): string {
  let canonicalPayload: unknown;

  if ('entities' in payloadOrWorld && typeof rngState === 'number') {
    // Phase 0 signature compatibility: stateHash(world, rngState)
    canonicalPayload = {
      rngState,
      world: {
        tick: payloadOrWorld.tick,
        nextEntityId: payloadOrWorld.nextEntityId,
        entities: payloadOrWorld.entities.map((e) => ({
          id: e.id,
          vx: e.vx,
          vy: e.vy,
          x: e.x,
          y: e.y,
        })),
      },
    };
  } else {
    const full = payloadOrWorld as StateHashPayload;
    canonicalPayload = {
      world: {
        tick: full.world.tick,
        nextEntityId: full.world.nextEntityId,
        entities: full.world.entities.map((e) => ({
          id: e.id,
          vx: e.vx,
          vy: e.vy,
          x: e.x,
          y: e.y,
        })),
      },
      rngMainState: full.rngMainState,
      forkStates: full.forkStates || {},
      actors: (full.actors || []).map((a) => ({
        id: a.id,
        classId: a.classId,
        pos: a.pos,
        vel: a.vel,
        state: a.state,
        speed: a.speed,
      })),
      tracks: (full.tracks || []).map((t) => ({
        trackId: t.trackId,
        state: t.state,
        estimatedPos: t.estimatedPos,
        estimatedVel: t.estimatedVel,
        consecutiveHits: t.consecutiveHits,
        consecutiveMisses: t.consecutiveMisses,
        rcsBucket: t.rcsBucket,
        acked: t.acked,
        assessedClass: t.assessedClass,
        engagementStatus: t.engagementStatus,
      })),
      effectorState: full.effectorState,
    };
  }

  return cyrb53(canonicalStringify(canonicalPayload));
}
