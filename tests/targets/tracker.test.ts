import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/sim/core/engine.js';
import { vLen } from '../../src/sim/core/vec.js';

/**
 * Phase 4B Step 0.4 target: tracker p90 speed error at plot age 8 <= 9 m/s.
 * Measured over 30 seeds x {operator, veteran, elite} procedural missions (no operator input),
 * sampled on the tick the track receives its 8th plot, per true class and overall.
 */
const SCENARIOS = ['proc:v1:operator', 'proc:v1:veteran', 'proc:v1:elite'];
const SEEDS = 30;
const TARGET_P90_AGE8 = 9;

function p90(a: number[]): number {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] ?? 0;
}

describe('Phase 4B Step 0.4 tracker target', { timeout: 300000 }, () => {
  it('p90 speed error at plot age 8 <= 9 m/s (per class and overall)', () => {
    const byClass: Record<string, number[]> = {};
    for (const sc of SCENARIOS) {
      for (let s = 1; s <= SEEDS; s++) {
        const engine = new Engine(`speed-age-${s}`, sc);
        const seen = new Set<number>();
        while (!engine.missionState.ended && engine.world.tick < 4800) {
          engine.step();
          for (const t of engine.tracks) {
            if (t.isGhost || t.totalPlots !== 8 || seen.has(t.trackId)) continue;
            seen.add(t.trackId);
            const actor = engine.actors.find((a) => a.id === t.actorId);
            if (!actor) continue;
            (byClass[actor.classId] ??= []).push(Math.abs(vLen(t.estimatedVel) - vLen(actor.vel)));
          }
        }
      }
    }
    const all: number[] = [];
    const table: Record<string, string> = {};
    for (const [cls, errs] of Object.entries(byClass)) {
      all.push(...errs);
      table[cls] = `${p90(errs).toFixed(2)} (n=${errs.length})`;
    }
    table['ALL'] = `${p90(all).toFixed(2)} (n=${all.length})`;
    console.log('Tracker p90 speed error at age 8 (m/s):', table, `target <= ${TARGET_P90_AGE8}`);
    for (const [cls, errs] of Object.entries(byClass)) {
      expect(p90(errs), `class ${cls}`).toBeLessThanOrEqual(TARGET_P90_AGE8);
    }
    expect(p90(all)).toBeLessThanOrEqual(TARGET_P90_AGE8);
  });
});
