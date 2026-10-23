import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Tier } from '../src/sim/scenarios/generator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';

const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];

for (const tier of tiers) {
  let passCount = 0;
  const scores: number[] = [];
  const failures: Array<{ seed: string; score: number; hits: number; reasons: string[] }> = [];

  for (let s = 1; s <= 30; s++) {
    const seed = `solv-${tier}-${s}`;
    const e = new Engine(seed, `proc:v1:${tier}`);
    while (!e.missionState.ended && e.world.tick < 4800) {
      const cmds = oracleStep(e.getTraineeView(), e);
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    const rep = scoreSession({
      actors: e.actors,
      tracks: e.tracks,
      events: e.getEvents(),
      assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
    });

    scores.push(rep.total);
    if (rep.total >= 90) {
      passCount++;
    } else {
      const hits = e.getEvents().filter((ev) => ev.type === 'ASSET_HIT').length;
      failures.push({ seed, score: rep.total, hits, reasons: rep.reasons });
    }
  }

  const pct = ((passCount / 30) * 100).toFixed(1);
  const mean = (scores.reduce((a, b) => a + b, 0) / 30).toFixed(1);
  console.log(`\n================ Tier: ${tier.toUpperCase()} ================`);
  console.log(`Runs >= 90: ${passCount}/30 (${pct}%), Mean Score: ${mean}`);

  // Histogram in 10-point buckets: [0-9, 10-19, ..., 90-100]
  const buckets: Record<string, number> = {
    '0-49': 0,
    '50-59': 0,
    '60-69': 0,
    '70-79': 0,
    '80-89': 0,
    '90-100': 0,
  };
  for (const sc of scores) {
    if (sc >= 90) buckets['90-100']++;
    else if (sc >= 80) buckets['80-89']++;
    else if (sc >= 70) buckets['70-79']++;
    else if (sc >= 60) buckets['60-69']++;
    else if (sc >= 50) buckets['50-59']++;
    else buckets['0-49']++;
  }
  console.log('Histogram:', JSON.stringify(buckets));
  if (failures.length > 0) {
    console.log(`Failures count: ${failures.length}`);
    for (const f of failures.slice(0, 5)) {
      console.log(`  ${f.seed}: score=${f.score}, hits=${f.hits}`);
    }
  }
}
