import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { Engine } from '../src/sim/core/engine.js';

const bots = { referenceOperator, idleOperator, triggerHappyOperator };

describe('single-site defaults retain the committed Phase 4C benchmark hashes', () => {
  it('matches all 45 scripted scenario/bot/seed hashes in docs/benchmarks/019fdb1.txt', { timeout: 120_000 }, () => {
    const report = readFileSync('docs/benchmarks/019fdb1.txt', 'utf8');
    const rows = report.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^(dawn_intrusion|ridge_runner|city_edge_night)\s+(referenceOperator|idleOperator|triggerHappyOperator)\s+(s[1-5])\s+\d+\s+\d+\s+\S+\s+\d+\s+\d+\s+\d+\s+([a-f\d]{10})\s*$/);
      return match ? [{ scenario: match[1]!, bot: match[2]! as keyof typeof bots, seed: match[3]!, expected: match[4]! }] : [];
    });
    expect(rows).toHaveLength(45);
    for (const row of rows) {
      const engine = new Engine(row.seed, row.scenario);
      const bot = bots[row.bot];
      while (!engine.missionState.ended && engine.world.tick < 4800) {
        for (const command of bot(engine.getTraineeView())) engine.enqueueCommand(command);
        engine.step();
      }
      expect(engine.getHash().slice(0, 10), `${row.scenario}/${row.bot}/${row.seed}`).toBe(row.expected);
    }
  });
});
