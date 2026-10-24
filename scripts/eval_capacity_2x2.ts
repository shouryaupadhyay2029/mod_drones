import { generateScenario } from '../src/sim/scenarios/generator.js';
import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { capacityCheck } from './test_capacity_model.js';

async function main() {
  console.log('Evaluating 100 unconstrained veteran seeds...');
  let tp = 0; // ratio > 0.8 && score < 90
  let fp = 0; // ratio > 0.8 && score >= 90
  let fn = 0; // ratio <= 0.8 && score < 90
  let tn = 0; // ratio <= 0.8 && score >= 90

  const results: Array<{ seed: string; ratio: number; score: number }> = [];

  for (let s = 1; s <= 100; s++) {
    const seed = `eval-vet-${s}`;
    const sc = generateScenario(seed, 'veteran');
    const ratio = capacityCheck(sc.spawns);

    const e = new Engine(seed, `proc:v1:veteran`);
    while (!e.missionState.ended) {
      const cmds = oracleStep(e.getTraineeView(), e);
      for (const c of cmds) e.enqueueCommand(c);
      e.step();
    }
    const scoreReport = scoreSession(e.getEvents(), {
      actors: e.actors,
      tracks: e.tracks,
      events: e.getEvents(),
      assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
    });
    const score = scoreReport.total;
    results.push({ seed, ratio, score });

    if (ratio > 0.8) {
      if (score < 90) tp++;
      else fp++;
    } else {
      if (score < 90) fn++;
      else tn++;
    }

    if (s % 20 === 0) {
      console.log(`Progress: ${s}/100 seeds complete`);
    }
  }

  console.log('=== 2x2 CAPACITY RATIO PREDICTION TABLE (100 Veteran Seeds) ===');
  console.log('| Metric                    | Oracle Score < 90 | Oracle Score >= 90 |');
  console.log(`| Capacity Ratio > 0.8      | ${tp} (TP)            | ${fp} (FP)             |`);
  console.log(`| Capacity Ratio <= 0.8     | ${fn} (FN)            | ${tn} (TN)             |`);
  console.log('===============================================================');
}

main();
