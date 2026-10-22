import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { TraineeView } from '../src/sim/view/traineeView.js';

interface RunResult {
  scenario: string;
  seed: string;
  bot: string;
  score: number;
  outcome: string;
  hits: number;
  falseEngages: number;
  ticks: number;
  hash: string;
}

function runMission(
  scenarioId: string,
  seed: string,
  botName: string,
  botFn: (view: TraineeView) => Command[]
): RunResult {
  const engine = new Engine(seed, scenarioId);

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

  const events = engine.getEvents();
  const hits = events.filter((e) => e.type === 'ASSET_HIT').length;

  const falseEngages = events.filter((e) => {
    if (e.type !== 'ENGAGEMENT_STARTED') return false;
    const tid = e.payload?.trackId;
    const trk = engine.tracks.find((t) => t.trackId === tid);
    if (!trk) return false;
    if (trk.isGhost) return true;
    const actor = engine.actors.find((a) => a.id === trk.actorId);
    return actor ? !THREAT_LIBRARY[actor.classId]?.hostile : false;
  }).length;

  const scoreReport = scoreSession({
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit: hits > 0,
  });

  return {
    scenario: scenarioId,
    seed,
    bot: botName,
    score: scoreReport.total,
    outcome: engine.missionState.reason ?? 'running',
    hits,
    falseEngages,
    ticks: engine.world.tick,
    hash: engine.getHash(),
  };
}

function parseArgs(): { scenario: string } {
  const args = process.argv.slice(2);
  let scenario = 'all';
  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      scenario = arg.split('=')[1] ?? 'all';
    }
  }
  return { scenario };
}

function main() {
  const { scenario } = parseArgs();
  const allScenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
  const scenariosToRun = scenario === 'all' ? allScenarios : [scenario];

  const seeds = ['s1', 's2', 's3', 's4', 's5'];
  const bots = [
    { name: 'referenceOperator', fn: referenceOperator },
    { name: 'idleOperator', fn: idleOperator },
    { name: 'triggerHappyOperator', fn: triggerHappyOperator },
  ];

  const results: RunResult[] = [];

  for (const sc of scenariosToRun) {
    for (const seed of seeds) {
      for (const bot of bots) {
        results.push(runMission(sc, seed, bot.name, bot.fn));
      }
    }
  }

  console.log('\n=== HEADLESS EVALUATION REPORT ===\n');
  console.log(
    '| Scenario          | Seed | Bot                  | Score | Outcome      | Hits | FalseEng | Ticks | Final State Hash |'
  );
  console.log(
    '|-------------------|------|----------------------|-------|--------------|------|----------|-------|------------------|'
  );

  for (const r of results) {
    const padSc = r.scenario.padEnd(17);
    const padSeed = r.seed.padEnd(4);
    const padBot = r.bot.padEnd(20);
    const padScore = String(r.score).padStart(5);
    const padOutcome = r.outcome.padEnd(12);
    const padHits = String(r.hits).padStart(4);
    const padFE = String(r.falseEngages).padStart(8);
    const padTicks = String(r.ticks).padStart(5);
    const hash = r.hash;
    console.log(
      `| ${padSc} | ${padSeed} | ${padBot} | ${padScore} | ${padOutcome} | ${padHits} | ${padFE} | ${padTicks} | ${hash} |`
    );
  }

  // Reproducibility double-check
  console.log('\n--- DETERMINISM DOUBLE-CHECK (Seed: s1 + referenceOperator) ---');
  let determinismPass = true;
  for (const sc of scenariosToRun) {
    const run1 = runMission(sc, 's1', 'referenceOperator', referenceOperator);
    const run2 = runMission(sc, 's1', 'referenceOperator', referenceOperator);
    const match = run1.hash === run2.hash;
    console.log(`Scenario [${sc}]: Hash 1 = ${run1.hash}, Hash 2 = ${run2.hash} -> ${match ? 'PASS' : 'FAIL'}`);
    if (!match) determinismPass = false;
  }

  // Assertions check
  let assertionsPass = true;
  const assertionErrors: string[] = [];

  for (const sc of scenariosToRun) {
    for (const seed of seeds) {
      const refResult = results.find((r) => r.scenario === sc && r.seed === seed && r.bot === 'referenceOperator');
      const idleResult = results.find((r) => r.scenario === sc && r.seed === seed && r.bot === 'idleOperator');
      const trigResult = results.find((r) => r.scenario === sc && r.seed === seed && r.bot === 'triggerHappyOperator');

      if (refResult && refResult.score < 75) {
        assertionErrors.push(`[${sc}/${seed}] referenceOperator score ${refResult.score} < 75`);
        assertionsPass = false;
      }
      if (idleResult && idleResult.score > 30) {
        assertionErrors.push(`[${sc}/${seed}] idleOperator score ${idleResult.score} > 30`);
        assertionsPass = false;
      }
      if (refResult && trigResult && trigResult.score >= refResult.score) {
        assertionErrors.push(`[${sc}/${seed}] triggerHappyOperator score ${trigResult.score} >= reference ${refResult.score}`);
        assertionsPass = false;
      }
    }
  }

  if (!determinismPass) {
    console.error('\nERROR: Determinism double-check failed!');
    process.exit(1);
  }

  if (!assertionsPass) {
    console.error('\nERROR: Benchmark assertion checks failed:');
    for (const err of assertionErrors) {
      console.error(' - ' + err);
    }
    process.exit(1);
  }

  console.log('\nALL BENCHMARK & DETERMINISM CHECKS PASSED SUCCESSFULLY!\n');
}

main();
