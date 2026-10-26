import { describe, expect, it } from 'vitest';
import { CommanderSession, generateRaid, heuristicCommander, missileHappyCommander, oracleCommander, passiveCommander, scoreRaid } from '../../src/sim/index.js';
import { CommanderCommand, CommanderView, RaidPlan } from '../../src/sim/commander/types.js';

type Policy = (view: CommanderView, raid: RaidPlan) => CommanderCommand[];
const policies: Array<{ name: string; policy: Policy }> = [
  { name: 'oracleCommander', policy: (view, raid) => oracleCommander(view, raid) },
  { name: 'heuristicCommander', policy: (view) => heuristicCommander(view) },
  { name: 'missileHappyCommander', policy: (view) => missileHappyCommander(view) },
  { name: 'passiveCommander', policy: (view) => passiveCommander(view) },
];

function run(raid: RaidPlan, policy: Policy): ReturnType<typeof scoreRaid> {
  const session = new CommanderSession(raid);
  while (!session.isComplete() && session.tick < 4800) session.step(policy(session.view(), raid));
  return scoreRaid(session);
}

describe('calibration target: commander ordering on generated raids', () => {
  it('oracle >= heuristic > missile-happy and heuristic > passive on at least 80% of 30 raids per tier', { timeout: 600_000 }, () => {
    const tiers = ['recruit', 'operator', 'veteran'] as const;
    const results: Record<string, { oracleAtLeastHeuristic: number; heuristicBeatsMissileHappy: number; heuristicBeatsPassive: number; examples: number[][] }> = {};
    for (const tier of tiers) {
      let oracleAtLeastHeuristic = 0;
      let heuristicBeatsMissile = 0;
      let heuristicBeatsPassive = 0;
      const examples: number[][] = [];
      for (let seed = 1; seed <= 30; seed++) {
        const raid = generateRaid(`commander-target-${tier}-${seed}`, tier);
        const scores = Object.fromEntries(policies.map(({ name, policy }) => [name, run(raid, policy).total])) as Record<string, number>;
        if (seed <= 5) examples.push([scores.oracleCommander!, scores.heuristicCommander!, scores.missileHappyCommander!, scores.passiveCommander!]);
        if (scores.oracleCommander! >= scores.heuristicCommander!) oracleAtLeastHeuristic++;
        if (scores.heuristicCommander! > scores.missileHappyCommander!) heuristicBeatsMissile++;
        if (scores.heuristicCommander! > scores.passiveCommander!) heuristicBeatsPassive++;
      }
      results[tier] = { oracleAtLeastHeuristic, heuristicBeatsMissileHappy: heuristicBeatsMissile, heuristicBeatsPassive, examples };
    }
    console.log('Commander ordering successes / 30', results);
    for (const tier of tiers) {
      const counts = results[tier]!;
      expect(counts.oracleAtLeastHeuristic, `${tier} oracle >= heuristic`).toBeGreaterThanOrEqual(24);
      expect(counts.heuristicBeatsMissileHappy, `${tier} heuristic > missile-happy`).toBeGreaterThanOrEqual(24);
      expect(counts.heuristicBeatsPassive, `${tier} heuristic > passive`).toBeGreaterThanOrEqual(24);
    }
  });
});
