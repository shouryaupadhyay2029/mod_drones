import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { scoreSessionV2 } from '../src/sim/scoring/doctrine.js';
import { SCORE_VERSION } from '../src/sim/scoring/doctrineConstants.js';
import { TraineeView } from '../src/sim/view/traineeView.js';
import { Tier } from '../src/sim/scenarios/generator.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface RunResult {
  scenario: string;
  seed: string;
  bot: string;
  score: number; // scoring v1 (basic.ts)
  scoreV2: number; // scoring v2.x (doctrine.ts)
  outcome: string;
  hits: number;
  falseEngages: number;
  wastedJammers: number;
  ticks: number;
  hash: string;
  detectionScore: number;
  classificationScore: number;
  engagementScore: number;
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

  const v2 = scoreSessionV2({
    actors: engine.actors,
    tracks: engine.tracks,
    events,
    assetHit: hits > 0,
  });

  const contacts = scoreReport.perContact;
  const detectionScore =
    contacts.length > 0
      ? contacts.reduce((sum, c) => sum + c.detectionScore, 0) / contacts.length
      : 1.0;
  const classificationScore =
    contacts.length > 0
      ? contacts.reduce((sum, c) => sum + c.classificationScore, 0) / contacts.length
      : 1.0;
  const engagementScore =
    contacts.length > 0
      ? contacts.reduce((sum, c) => sum + c.decisionScore, 0) / contacts.length
      : 1.0;

  return {
    scenario: scenarioIdOrProc,
    seed,
    bot: botName,
    score: scoreReport.total,
    scoreV2: v2.total,
    outcome: engine.missionState.reason ?? 'running',
    hits,
    falseEngages,
    wastedJammers,
    ticks: engine.world.tick,
    hash: engine.getHash(),
    detectionScore,
    classificationScore,
    engagementScore,
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
    refMeanV2: number;
    refMin: number;
    refMax: number;
    oracleMean: number;
    oraclePctGe90: number;
    assetHitRate: number;
    refWastedJammerMean: number;
    refDetectionMean: number;
    refClassificationMean: number;
    refEngagementMean: number;
  }

  const tierSummaries: TierSummary[] = [];

  for (const tier of tiers) {
    const refScores: number[] = [];
    const refScoresV2: number[] = [];
    const oracleScores: number[] = [];
    const refDets: number[] = [];
    const refClasses: number[] = [];
    const refEngs: number[] = [];
    let refHits = 0;
    let refWastedJammers = 0;

    for (let s = 1; s <= 20; s++) {
      const seed = `bench-${tier}-${s}`;
      const procId = `proc:v1:${tier}`;

      const refRes = runMission(procId, seed, 'referenceOperator', 'standard', referenceOperator);
      refScores.push(refRes.score);
      refScoresV2.push(refRes.scoreV2);
      refDets.push(refRes.detectionScore);
      refClasses.push(refRes.classificationScore);
      refEngs.push(refRes.engagementScore);
      if (refRes.hits > 0) refHits++;
      refWastedJammers += refRes.wastedJammers;

      const oracleRes = runMission(procId, seed, 'oracleOperator', 'oracle');
      oracleScores.push(oracleRes.score);
    }

    const refMean = refScores.reduce((a, b) => a + b, 0) / refScores.length;
    const refMeanV2 = refScoresV2.reduce((a, b) => a + b, 0) / refScoresV2.length;
    const refMin = Math.min(...refScores);
    const refMax = Math.max(...refScores);
    const oracleMean = oracleScores.reduce((a, b) => a + b, 0) / oracleScores.length;
    const oracleGe90 = oracleScores.filter((sc) => sc >= 90).length;
    const oraclePctGe90 = (oracleGe90 / oracleScores.length) * 100;
    const assetHitRate = (refHits / 20) * 100;
    const refWastedJammerMean = refWastedJammers / 20;
    const refDetectionMean = refDets.reduce((a, b) => a + b, 0) / refDets.length;
    const refClassificationMean = refClasses.reduce((a, b) => a + b, 0) / refClasses.length;
    const refEngagementMean = refEngs.reduce((a, b) => a + b, 0) / refEngs.length;

    tierSummaries.push({
      tier,
      refMean,
      refMeanV2,
      refMin,
      refMax,
      oracleMean,
      oraclePctGe90,
      assetHitRate,
      refWastedJammerMean,
      refDetectionMean,
      refClassificationMean,
      refEngagementMean,
    });
  }

  // 3. Determinism Double-Checks (3 scripted scenarios + 4 tiers)
  const scriptedToDoubleCheck = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
  const tiersToDoubleCheck: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
  let detAllPassed = true;
  interface DetCheckRow {
    label: string;
    hash1: string;
    hash2: string;
    score1: number;
    score2: number;
    scoreV2_1: number;
    scoreV2_2: number;
    passed: boolean;
  }
  const detRows: DetCheckRow[] = [];

  for (const sc of scriptedToDoubleCheck) {
    const r1 = runMission(sc, 's1', 'referenceOperator', 'standard', referenceOperator);
    const r2 = runMission(sc, 's1', 'referenceOperator', 'standard', referenceOperator);
    const passed = r1.hash === r2.hash && r1.score === r2.score && r1.scoreV2 === r2.scoreV2;
    if (!passed) detAllPassed = false;
    detRows.push({
      label: `${sc} (s1)`,
      hash1: r1.hash.slice(0, 10),
      hash2: r2.hash.slice(0, 10),
      score1: r1.score,
      score2: r2.score,
      scoreV2_1: r1.scoreV2,
      scoreV2_2: r2.scoreV2,
      passed,
    });
  }

  for (const tier of tiersToDoubleCheck) {
    const procId = `proc:v1:${tier}`;
    const seed = `bench-${tier}-1`;
    const r1 = runMission(procId, seed, 'referenceOperator', 'standard', referenceOperator);
    const r2 = runMission(procId, seed, 'referenceOperator', 'standard', referenceOperator);
    const passed = r1.hash === r2.hash && r1.score === r2.score && r1.scoreV2 === r2.scoreV2;
    if (!passed) detAllPassed = false;
    detRows.push({
      label: `${tier} (${seed})`,
      hash1: r1.hash.slice(0, 10),
      hash2: r2.hash.slice(0, 10),
      score1: r1.score,
      score2: r2.score,
      scoreV2_1: r1.scoreV2,
      scoreV2_2: r2.scoreV2,
      passed,
    });
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
  output += `BENCHMARK REPORT - VAJRA C-UAS SIMULATOR\n`;
  output += `Git Commit: ${gitHash}\n`;
  output += `Scoring Versions: v1 (basic) and v${SCORE_VERSION} (doctrine)\n`;
  output += `Generated: ${new Date().toISOString()}\n`;
  output += `========================================================================================\n\n`;

  output += `1. SCRIPTED SCENARIOS SCORES (v1 and v${SCORE_VERSION}; 3 scenarios x 3 bots x 5 seeds)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Scenario            Bot                   Seed   V1    V2.1  Outcome     Hits  FalseEng  Ticks  Hash\n`;
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
    const v2Str = String(r.scoreV2).padStart(5);
    output += `${sc} ${b} ${sd} ${scStr} ${v2Str}  ${oc} ${h}  ${fe}  ${tk}  ${hs}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n\n`;

  output += `2. PROCEDURAL TIER SCORES (v1 targets/metrics and v${SCORE_VERSION} scores; oracle scored v1; 4 tiers x 20 seeds)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Tier       V1 Mean  V2.1 Mean  Ref Min  Ref Max  V1 Target  Status  Oracle Mean  Oracle >=90%  Asset Hit %\n`;
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
    const rMeanV2 = ts.refMeanV2.toFixed(1).padStart(10);
    const rMin = String(ts.refMin).padStart(8);
    const rMax = String(ts.refMax).padStart(8);
    const tgt = `>=${targets[ts.tier]}`.padStart(10);
    const status = (ts.refMean >= targets[ts.tier] ? 'PASS' : 'FAIL').padStart(7);
    const oMean = ts.oracleMean.toFixed(1).padStart(12);
    const oPct = `${ts.oraclePctGe90.toFixed(1)}%`.padStart(13);
    const ah = `${ts.assetHitRate.toFixed(1)}%`.padStart(12);
    output += `${t} ${rMean} ${rMeanV2} ${rMin} ${rMax} ${tgt} ${status} ${oMean} ${oPct} ${ah}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n\n`;

  output += `3. NUMERIC LOSS BREAKDOWN TABLE (scoring v1, operator, veteran, elite)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Tier       Detection (Score / Loss)   Classification (Score / Loss)   Engagement (Score / Loss)   Asset Hit %\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  for (const ts of tierSummaries) {
    if (ts.tier === 'recruit') continue;
    const t = ts.tier.padEnd(10);
    const detScore = (ts.refDetectionMean * 100).toFixed(1);
    const detLoss = ((1 - ts.refDetectionMean) * 100).toFixed(1);
    const detCol = `${detScore}% / ${detLoss}%`.padStart(26);

    const clsScore = (ts.refClassificationMean * 100).toFixed(1);
    const clsLoss = ((1 - ts.refClassificationMean) * 100).toFixed(1);
    const clsCol = `${clsScore}% / ${clsLoss}%`.padStart(31);

    const engScore = (ts.refEngagementMean * 100).toFixed(1);
    const engLoss = ((1 - ts.refEngagementMean) * 100).toFixed(1);
    const engCol = `${engScore}% / ${engLoss}%`.padStart(27);

    const ah = `${ts.assetHitRate.toFixed(1)}%`.padStart(13);
    output += `${t} ${detCol} ${clsCol} ${engCol} ${ah}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n\n`;

  output += `4. DETERMINISM DOUBLE-CHECKS (v1 and v${SCORE_VERSION}; 3 Scripted Scenarios + 4 Procedural Tiers)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Scenario / Tier Target            Run 1 Hash  Run 2 Hash  V1-1  V1-2  V2.1-1  V2.1-2  Status\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  for (const dr of detRows) {
    const lbl = dr.label.padEnd(33);
    const h1 = dr.hash1.padEnd(11);
    const h2 = dr.hash2.padEnd(11);
    const s1 = String(dr.score1).padStart(7);
    const s2 = String(dr.score2).padStart(8);
    const sv21 = String(dr.scoreV2_1).padStart(7);
    const sv22 = String(dr.scoreV2_2).padStart(7);
    const st = (dr.passed ? 'PASS' : 'FAIL').padStart(8);
    output += `${lbl} ${h1} ${h2} ${s1} ${s2} ${sv21} ${sv22} ${st}\n`;
  }
  output += `----------------------------------------------------------------------------------------\n`;
  output += `Overall Determinism: ${detAllPassed ? 'PASS (100% byte-for-byte state hash match across duplicate runs)' : 'FAIL'}\n\n`;

  output += `5. WASTED JAMMER EVENT COUNTS (not a scored table; RF Ambiguity Evaluation)\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  for (const ts of tierSummaries) {
    output += `${ts.tier.padEnd(10)}: mean wasted jammer (NO_EFFECT) events per run = ${ts.refWastedJammerMean.toFixed(2)}\n`;
  }
  output += `\n`;

  output += `6. PROVENANCE NOTE\n`;
  output += `----------------------------------------------------------------------------------------\n`;
  output += `dawn s2's hash changed vs Phase 2B due to the radar hit fix (consecutive hit tracking was added).\n`;
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
