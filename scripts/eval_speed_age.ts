// Phase 4B 0.4: p90 tracker speed error per true class at plot ages 3, 5, 8.
// Usage: npx tsx scripts/eval_speed_age.ts [label]
import { Engine } from '../src/sim/core/engine.js';
import { vLen } from '../src/sim/core/vec.js';

const AGES = [3, 5, 8];
const SCENARIOS = ['proc:v1:operator', 'proc:v1:veteran', 'proc:v1:elite'];
const SEEDS = 30;

const samples: Record<string, Record<number, number[]>> = {};

for (const sc of SCENARIOS) {
  for (let s = 1; s <= SEEDS; s++) {
    const engine = new Engine(`speed-age-${s}`, sc);
    const seen = new Set<string>();
    while (!engine.missionState.ended && engine.world.tick < 4800) {
      engine.step();
      for (const t of engine.tracks) {
        if (t.isGhost) continue;
        const plots = t.totalPlots ?? 1;
        if (!AGES.includes(plots)) continue;
        const key = `${t.trackId}:${plots}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const actor = engine.actors.find((a) => a.id === t.actorId);
        if (!actor) continue;
        const err = Math.abs(vLen(t.estimatedVel) - vLen(actor.vel));
        const byClass = (samples[actor.classId] ??= {});
        (byClass[plots] ??= []).push(err);
      }
    }
  }
}

function pct(arr: number[], p: number): number {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
}

const label = process.argv[2] ?? 'run';
console.log(`SPEED ERROR p90 (m/s) by class and plot age [${label}] scenarios=${SCENARIOS.join(',')} seeds=${SEEDS}`);
const rows: Record<string, Record<string, string>> = {};
const all: Record<number, number[]> = {};
for (const [cls, byAge] of Object.entries(samples)) {
  rows[cls] = {};
  for (const age of AGES) {
    const arr = byAge[age] ?? [];
    (all[age] ??= []).push(...arr);
    rows[cls]![`age${age} p90 (n)`] = arr.length ? `${pct(arr, 0.9).toFixed(2)} (${arr.length})` : '-';
  }
}
rows['ALL'] = {};
for (const age of AGES) {
  const arr = all[age] ?? [];
  rows['ALL']![`age${age} p90 (n)`] = arr.length ? `${pct(arr, 0.9).toFixed(2)} (${arr.length})` : '-';
}
console.table(rows);
