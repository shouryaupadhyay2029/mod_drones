import { WorldState } from './types.js';

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
    const keys = Object.keys(record).sort();
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

export function stateHash(world: WorldState, rngState: number): string {
  const canonical = canonicalStringify({
    rngState,
    world: {
      tick: world.tick,
      nextEntityId: world.nextEntityId,
      entities: world.entities.map((e) => ({
        id: e.id,
        vx: e.vx,
        vy: e.vy,
        x: e.x,
        y: e.y,
      })),
    },
  });
  return cyrb53(canonical);
}
