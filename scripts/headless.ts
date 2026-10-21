import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { TraineeView } from '../src/sim/view/traineeView.js';

interface RunResult {
  seed: string;
  bot: string;
  score: number;
  outcome: string;
  assetHit: string;
  ticks: number;
  hash: string;
}

function runMission(
  seed: string,
  botName: string,
  botFn: (view: TraineeView) => Command[]
): RunResult {
  const engine = new Engine(seed, 'dawn_intrusion');

  while (!engine.missionState.ended && engine.world.tick < 4800) {
    const view = engine.getTraineeView();
    const commands = botFn(view);
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd) {
        engine.enqueueCommand(cmd);
      }
    }
    engine.step();
  }

  const scoreReport = scoreSession({
    actors: engine.actors,
    tracks: engine.tracks,
    events: engine.getEvents(),
    assetHit: engine.getEvents().some((e) => e.type === 'ASSET_HIT'),
  });

  return {
    seed,
    bot: botName,
    score: scoreReport.total,
    outcome: engine.missionState.reason ?? 'running',
    assetHit: engine.getEvents().some((e) => e.type === 'ASSET_HIT') ? 'YES' : 'NO',
    ticks: engine.world.tick,
    hash: engine.getHash(),
  };
}

function main() {
  const seeds = ['s1', 's2', 's3', 's4', 's5'];
  const bots = [
    { name: 'referenceOperator', fn: referenceOperator },
    { name: 'idleOperator', fn: idleOperator },
    { name: 'triggerHappyOperator', fn: triggerHappyOperator },
  ];

  const results: RunResult[] = [];

  for (let s = 0; s < seeds.length; s++) {
    const seed = seeds[s]!;
    for (let b = 0; b < bots.length; b++) {
      const bot = bots[b]!;
      results.push(runMission(seed, bot.name, bot.fn));
    }
  }

  console.log('\n=== DAWN INTRUSION HEADLESS EVALUATION ===\n');
  console.log(
    '| Seed | Bot                  | Score | Outcome      | Asset Hit? | Ticks | Final State Hash |'
  );
  console.log(
    '|------|----------------------|-------|--------------|------------|-------|------------------|'
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const padSeed = r.seed.padEnd(4);
    const padBot = r.bot.padEnd(20);
    const padScore = String(r.score).padStart(5);
    const padOutcome = r.outcome.padEnd(12);
    const padHit = r.assetHit.padEnd(10);
    const padTicks = String(r.ticks).padStart(5);
    const hash = r.hash;
    console.log(
      `| ${padSeed} | ${padBot} | ${padScore} | ${padOutcome} | ${padHit} | ${padTicks} | ${hash} |`
    );
  }

  // Reproducibility check: run seed 's1' + referenceOperator twice
  console.log('\n--- DETERMINISM DOUBLE-CHECK (Seed: s1 + referenceOperator) ---');
  const run1 = runMission('s1', 'referenceOperator', referenceOperator);
  const run2 = runMission('s1', 'referenceOperator', referenceOperator);

  console.log(`Run 1 Hash: ${run1.hash}`);
  console.log(`Run 2 Hash: ${run2.hash}`);
  console.log(`Hashes Match: ${run1.hash === run2.hash ? 'PASS (IDENTICAL)' : 'FAIL'}\n`);

  console.log(`Run 1 Hash: ${run1.hash}`);
  console.log(`Run 2 Hash: ${run2.hash}`);
  console.log(`Hashes Match: ${run1.hash === run2.hash ? 'PASS (IDENTICAL)' : 'FAIL'}\n`);
}

main();
