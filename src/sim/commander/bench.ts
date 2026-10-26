// Deterministic commander benchmark runner, kept separate from the single-site baselines.
import { CommanderSession } from './session.js';
import { generateRaid } from './generateRaid.js';
import { heuristicCommander, missileHappyCommander, oracleCommander, passiveCommander } from './bots.js';
import { scoreRaid } from './scoreRaid.js';
import { CommanderCommand, CommanderTier, CommanderView, RaidPlan, RaidScoreReport } from './types.js';

export interface CommanderBenchmarkRow {
  tier: CommanderTier;
  commander: 'passiveCommander' | 'heuristicCommander' | 'missileHappyCommander' | 'oracleCommander';
  seed: string;
  total: number;
  assetPreservation: number;
  cer: number;
  hits: number;
  hash: string;
}

type CommanderPolicy = (view: CommanderView, raid: RaidPlan) => CommanderCommand[];
const POLICIES: Array<{ name: CommanderBenchmarkRow['commander']; run: CommanderPolicy }> = [
  { name: 'passiveCommander', run: () => passiveCommander() },
  { name: 'heuristicCommander', run: (view) => heuristicCommander(view) },
  { name: 'missileHappyCommander', run: (view) => missileHappyCommander(view) },
  { name: 'oracleCommander', run: (view, raid) => oracleCommander(view, raid) },
];

export function runCommanderScenario(raid: RaidPlan, runPolicy: CommanderPolicy): { report: RaidScoreReport; hash: string } {
  const session = new CommanderSession(raid);
  while (!session.isComplete() && session.tick < 4800) session.step(runPolicy(session.view(), raid));
  return { report: scoreRaid(session), hash: session.getHash() };
}

export function runCommanderBenchmark(seedsPerTier = 20, tiers: readonly CommanderTier[] = ['recruit', 'operator', 'veteran']): CommanderBenchmarkRow[] {
  const rows: CommanderBenchmarkRow[] = [];
  for (const tier of tiers) {
    for (let seedIndex = 1; seedIndex <= seedsPerTier; seedIndex++) {
      const seed = `raid-bench-${tier}-${seedIndex}`;
      const raid = generateRaid(seed, tier);
      for (const policy of POLICIES) {
        const result = runCommanderScenario(raid, policy.run);
        rows.push({ tier, commander: policy.name, seed, total: result.report.total, assetPreservation: result.report.subscores.assetPreservation, cer: result.report.costLedger.cer, hits: result.report.sites.reduce((sum, site) => sum + site.hits, 0), hash: result.hash });
      }
    }
  }
  return rows;
}
