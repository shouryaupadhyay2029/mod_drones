import { describe, expect, it } from 'vitest';
import { runForkDemo } from '../scripts/fork-demo-core.js';
import { replay } from '../src/sim/index.js';

describe('real-engine Phase 5.1 fork demo', () => {
  it('forks Dawn Intrusion s1 100 ticks before a neutral engagement with empty and HOLD_FIRE branches', () => {
    const demo = runForkDemo();

    expect(demo.parent.sessionLog.scenarioId).toBe('dawn_intrusion');
    expect(demo.parent.sessionLog.seed).toBe('s1');
    expect(demo.firstNeutralEngagement.classId).toBe('commercial_quad');
    expect(demo.firstNeutralEngagement.tick - demo.forkTick).toBe(100);
    expect(demo.parent.sessionLog.commands).toContainEqual(demo.scriptedNeutralEngagementCommand);

    expect(demo.noCommandFork.sessionLog.commands.every((command) => command.tick < demo.forkTick)).toBe(true);
    expect(demo.holdFireFork.sessionLog.commands.filter((command) => command.tick >= demo.forkTick)).toEqual([
      { tick: demo.forkTick, type: 'HOLD_FIRE', payload: { trackId: demo.firstNeutralEngagement.trackId } },
    ]);
    expect(demo.noCommandFork.hash).toBe(replay(demo.noCommandFork.sessionLog));
    expect(demo.holdFireFork.hash).toBe(replay(demo.holdFireFork.sessionLog));
    expect(demo.comparison.perContact.find((contact) => contact.actorId === demo.firstNeutralEngagement.actorId)?.outcomeA).toBe('n/a (neutral)');
  }, 120000);
});
