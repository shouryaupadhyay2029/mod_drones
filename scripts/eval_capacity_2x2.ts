import { Rng } from '../src/sim/core/rng.js';
import { Engine } from '../src/sim/core/engine.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { capacityCheck } from '../src/sim/scenarios/capacity.js';
import { buildSingleScenario } from '../src/sim/scenarios/generator.js';

async function main() {
  console.log('Evaluating 100 unconstrained veteran seeds...');
  let tp = 0; // ratio > 0.8 && score < 90
  let fp = 0; // ratio > 0.8 && score >= 90
  let fn = 0; // ratio <= 0.8 && score < 90
  let tn = 0; // ratio <= 0.8 && score >= 90

  const results: Array<{ seed: string; ratio: number; warning: number; score: number }> = [];

  for (let s = 1; s <= 100; s++) {
    const seed = `eval-vet-${s}`;
    const rootRng = new Rng(seed);
    const sc = buildSingleScenario(seed, 'veteran', rootRng.fork('gen').fork('attempt:0'));
    const check = capacityCheck(sc.spawns, sc.terrain, sc.environment);
    const ratio = check.capacityRatio;
    const warning = check.minWarningSec;

    const e = new Engine(seed, `proc:unconstrained:veteran`);
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
    results.push({ seed, ratio, warning, score });

    if (ratio > 0.8) {
      if (score < 90) tp++;
      else fp++;
    } else {
      if (score < 90) fn++;
      else tn++;
    }

    if (s % 20 === 0) {
      console.log(`Progress: ${s}/100 seeds complete (Current: TP=${tp}, FP=${fp}, FN=${fn}, TN=${tn})`);
    }
  }

  console.log('=== 2x2 CAPACITY RATIO PREDICTION TABLE (100 Unconstrained Veteran Seeds) ===');
  console.log('| Metric                    | Oracle Score < 90 | Oracle Score >= 90 |');
  console.log(`| Capacity Ratio > 0.8      | ${tp.toString().padEnd(17)} | ${fp.toString().padEnd(18)} |`);
  console.log(`| Capacity Ratio <= 0.8     | ${fn.toString().padEnd(17)} | ${tn.toString().padEnd(18)} |`);
  console.log('============================================================================');

  const accuracy = ((tp + tn) / 100) * 100;
  const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  console.log(`Accuracy: ${accuracy.toFixed(1)}%, Precision: ${precision.toFixed(1)}%, Recall: ${recall.toFixed(1)}%`);
}

main();
