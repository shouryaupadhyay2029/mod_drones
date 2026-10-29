import { describe, expect, it } from 'vitest';
import { CommanderSession, generateRaid, heuristicCommander, oracleCommander, passiveCommander, scoreRaid } from '../../src/sim/index.js';
import { CommanderCommand, CommanderView, RaidPlan } from '../../src/sim/commander/types.js';

type Policy = (view: CommanderView, raid: RaidPlan) => CommanderCommand[];
const policies: Array<{ name: string; policy: Policy }> = [
  { name: 'oracleCommander', policy: (view, raid) => oracleCommander(view, raid) },
  { name: 'heuristicCommander', policy: (view) => heuristicCommander(view) },
  { name: 'passiveCommander', policy: (view) => passiveCommander(view) },
];

function run(raid: RaidPlan, policy: Policy): ReturnType<typeof scoreRaid> {
  const session = new CommanderSession(raid);
  while (!session.isComplete() && session.tick < 4800) session.step(policy(session.view(), raid));
  return scoreRaid(session);
}

describe('calibration target: commander ordering on generated raids', () => {
  it('oracle >= passive on >= 90% of operator and veteran raids; heuristic > passive on >= 80%; oracle >= heuristic on >= 90%', { timeout: 240_000 }, () => {
    const tiers = ['recruit', 'operator', 'veteran'] as const;
    const NUM_SEEDS = 10;
    const results: Record<string, { oracleAtLeastPassive: number; oracleAtLeastHeuristic: number; heuristicBeatsPassive: number; examples: number[][] }> = {};

    for (const tier of tiers) {
      let oracleAtLeastPassive = 0;
      let oracleAtLeastHeuristic = 0;
      let heuristicBeatsPassive = 0;
      const examples: number[][] = [];

      for (let seed = 1; seed <= NUM_SEEDS; seed++) {
        const raid = generateRaid(`commander-target-${tier}-${seed}`, tier);
        const scores = Object.fromEntries(policies.map(({ name, policy }) => [name, run(raid, policy).total])) as Record<string, number>;
        if (seed <= 5) examples.push([scores.oracleCommander!, scores.heuristicCommander!, scores.passiveCommander!]);
        if (scores.oracleCommander! >= scores.passiveCommander!) oracleAtLeastPassive++;
        if (scores.oracleCommander! >= scores.heuristicCommander!) oracleAtLeastHeuristic++;
        if (tier === 'recruit' ? scores.heuristicCommander! >= scores.passiveCommander! : scores.heuristicCommander! > scores.passiveCommander!) {
          heuristicBeatsPassive++;
        }
      }

      results[tier] = { oracleAtLeastPassive, oracleAtLeastHeuristic, heuristicBeatsPassive, examples };
    }

    console.log(`Commander ordering successes / ${NUM_SEEDS}`, JSON.stringify(results, null, 2));

    for (const tier of tiers) {
      const counts = results[tier]!;
      // oracle >= heuristic on >= 90% (>= 9 of 10)
      expect(counts.oracleAtLeastHeuristic, `${tier} oracle >= heuristic`).toBeGreaterThanOrEqual(Math.ceil(NUM_SEEDS * 0.90));
      // heuristic > passive on >= 80% (>= 8 of 10)
      expect(counts.heuristicBeatsPassive, `${tier} heuristic vs passive`).toBeGreaterThanOrEqual(Math.ceil(NUM_SEEDS * 0.80));
      // oracle >= passive on >= 90% of operator and veteran raids
      if (tier === 'operator' || tier === 'veteran') {
        expect(counts.oracleAtLeastPassive, `${tier} oracle >= passive`).toBeGreaterThanOrEqual(Math.ceil(NUM_SEEDS * 0.90));
      }
    }
  });
});
