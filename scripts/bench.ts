import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { TraineeView } from '../src/sim/view/traineeView.js';
import { Tier } from '../src/sim/scenarios/generator.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface RunResult {
  scenario: string;
  seed: string;
  bot: string;
  score: number;
  outcome: string;
  hits: number;
  falseEngages: number;
  wastedJammers: number;
  ticks: number;
  hash: string;
}

function runMission(
  scenarioIdOrProc: string,
  seed: string,
  botName: string,
  botType: 'standard' | 'oracle',
  botFn?: (view: TraineeView) => Command[]
): RunResult {
  const engine = new Engine(seed, scenarioIdOrProc);

  while (!engine.missionState.ended && engine.world.tick < 4800) {
    const view = engine.getTraineeView();
    let commands: Command[] = [];
    if (botType === 'oracle') {
      commands = oracleStep(view, engine);
    } else if (botFn) {
      commands = botFn(view);
    }

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

  const wastedJammers = events.filter((e) => e.type === 'NO_EFFECT').length;

  const scoreReport = scoreSession({
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit: hits > 0,
  });

  return {
    scenario: scenarioIdOrProc,
    seed,
    bot: botName,
    score: scoreReport.total,
    outcome: engine.missionState.reason ?? 'running',
    hits,
    falseEngages,
    wastedJammers,
    ticks: engine.world.tick,
    hash: engine.getHash(),
  };
}

async function main() {
  console.log('Running benchmark suite...');

  // 1. Scripted Table: 3 scenarios x 3 bots x 5 seeds
  const scriptedScenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
  const scriptedSeeds = ['s1', 's2', 's3', 's4', 's5'];
  const scriptedBots = [
    { name: 'referenceOperator', fn: referenceOperator },
    { name: 'idleOperator', fn: idleOperator },
    { name: 'triggerHappyOperator', fn: triggerHappyOperator },
  ];

  const scriptedResults: RunResult[] = [];
  for (const sc of scriptedScenarios) {
    for (const b of scriptedBots) {
      for (const s of scriptedSeeds) {
        const res = runMission(sc, s, b.name, 'standard', b.fn);
        scriptedResults.push(res);
      }
    }
  }

  // 2. Tier Table: 4 tiers x 20 seeds (referenceOperator and oracleOperator)
  const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
  interface TierSummary {
    tier: Tier;
    refMean: number;
    refMin: number;
    refMax: number;
    oracleMean: number;
    oraclePctGe90: number;
    assetHitRate: number;
    refWastedJammerMean: number;
  }

  const tierSummaries: TierSummary[] = [];

  for (const tier of tiers) {
    const refScores: number[] = [];
    const oracleScores: number[] = [];
    let refHits = 0;
    let refWastedJammers = 0;

    for (let s = 1; s <= 20; s++) {
      const seed = `bench-${tier}-${s}`;
      const procId = `proc:v1:${tier}`;

      const refRes = runMission(procId, seed, 'referenceOperator', 'standard', referenceOperator);
      refScores.push(refRes.score);
      if (refRes.hits > 0) refHits++;
      refWastedJammers += refRes.wastedJammers;

      const oracleRes = runMission(procId, seed, 'oracleOperator', 'oracle');
      oracleScores.push(oracleRes.score);
    }

    const refMean = refScores.reduce((a, b) => a + b, 0) / refScores.length;
    const refMin = Math.min(...refScores);
    const refMax = Math.max(...refScores);
    const oracleMean = oracleScores.reduce((a, b) => a + b, 0) / oracleScores.length;
    const oracleGe90 = oracleScores.filter((sc) => sc >= 90).length;
    const oraclePctGe90 = (oracleGe90 / oracleScores.length) * 100;
    const assetHitRate = (refHits / 20) * 100;
    const refWastedJammerMean = refWastedJammers / 20;

    tierSummaries.push({
      tier,
      refMean,
      refMin,
      refMax,
      oracleMean,
      oraclePctGe90,
      assetHitRate,
      refWastedJammerMean,
    });
  }

  // 3. Determinism Double-Checks
  const detSeeds = ['s1', 's2', 's3'];
  let detPassed = true;
  for (const s of detSeeds) {
    const r1 = runMission('dawn_intrusion', s, 'referenceOperator', 'standard', referenceOperator);
    const r2 = runMission('dawn_intrusion', s, 'referenceOperator', 'standard', referenceOperator);
    if (r1.hash !== r2.hash || r1.score !== r2.score) {
      detPassed = false;
    }
  }

  // Git short hash
  let gitHash = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    gitHash = 'HEAD';
  }

  // Build report string
  let output = '';
  output += `========================================================================================\n`;
  output += `BENCHMARK REPORT — VAJRA C-UAS SIMULATOR\n`;
  output += `Git Commit: ${gitHash}\n`;
  output += `Generated: ${new Date().toISOString()}\n`;
  output += `========================================================================================\n\n`;

  output += `1. SCRIPTED SCENARIOS BENCHMARK TABLE (3 scenarios x 3 bots x 5 seeds)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Scenario            Bot                   Seed   Score  Outcome     Hits  FalseEng  Ticks  Hash\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  for (const r of scriptedResults) {
    const sc = r.scenario.padEnd(19);
    const b = r.bot.padEnd(21);
    const sd = r.seed.padEnd(6);
    const scStr = String(r.score).padStart(5);
    const oc = r.outcome.padEnd(11);
    const h = String(r.hits).padStart(4);
    const fe = String(r.falseEngages).padStart(8);
    const tk = String(r.ticks).padStart(6);
    const hs = r.hash.slice(0, 10);
    output += `${sc} ${b} ${sd} ${scStr}  ${oc} ${h}  ${fe}  ${tk}  ${hs}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n\n`;

  output += `2. PROCEDURAL TIERS BENCHMARK TABLE (4 tiers x 20 seeds)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Tier       Ref Mean  Ref Min  Ref Max  Target   Status  Oracle Mean  Oracle >=90%  Asset Hit %\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  const targets: Record<Tier, number> = {
    recruit: 95,
    operator: 80,
    veteran: 55,
    elite: 35,
  };
  for (const ts of tierSummaries) {
    const t = ts.tier.padEnd(10);
    const rMean = ts.refMean.toFixed(1).padStart(8);
    const rMin = String(ts.refMin).padStart(8);
    const rMax = String(ts.refMax).padStart(8);
    const tgt = `>=${targets[ts.tier]}`.padStart(8);
    const status = (ts.refMean >= targets[ts.tier] ? 'PASS' : 'FAIL').padStart(7);
    const oMean = ts.oracleMean.toFixed(1).padStart(12);
    const oPct = `${ts.oraclePctGe90.toFixed(1)}%`.padStart(13);
    const ah = `${ts.assetHitRate.toFixed(1)}%`.padStart(12);
    output += `${t} ${rMean} ${rMin} ${rMax} ${tgt} ${status} ${oMean} ${oPct} ${ah}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n\n`;

  output += `3. DETERMINISM DOUBLE-CHECKS\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Identical re-runs on seeds s1, s2, s3 (dawn_intrusion): ${detPassed ? 'PASS (100% byte-for-byte state hash match)' : 'FAIL'}\n\n`;

  output += `4. WASTED JAMMER PENALTIES PER RUN (RF Ambiguity Evaluation)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  for (const ts of tierSummaries) {
    output += `${ts.tier.padEnd(10)}: mean wasted jammer (NO_EFFECT) events per run = ${ts.refWastedJammerMean.toFixed(2)}\n`;
  }
  output += `\n`;

  output += `5. PROVENANCE NOTE: PHASE 3A TABLE 1\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Phase 3A Table 1 dawn_intrusion rows were hand-made in documentation and did not match\n`;
  output += `the real simulation engine output for seeds s1-s5. Specifically, seeds s1, s2, s3, and s4\n`;
  output += `match the real Phase 2B engine baseline, while seed s5 diverged due to hand editing.\n`;
  output += `All future benchmark reports must reference committed machine-generated bench files.\n`;
  output += `----------------------------------------------------------------------------------------\n`;

  // Write to docs/benchmarks/<git-short-hash>.txt
  const outDir = path.resolve('docs/benchmarks');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filePath = path.join(outDir, `${gitHash}.txt`);
  fs.writeFileSync(filePath, output, 'utf-8');
  console.log(`Benchmark successfully written to: ${filePath}`);
  console.log(output);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
