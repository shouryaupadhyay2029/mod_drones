import { describe, expect, it } from 'vitest';
import { Engine, forkSession, migrateSessionLog, replay, SessionLog } from '../src/sim/index.js';

function recordedSession(): SessionLog {
  const engine = new Engine('fork-fixture', 'sandbox');
  engine.enqueueCommand({ tick: 2, type: 'SPAWN_ENTITY', payload: { x: 100, y: 50, vx: 2, vy: 1 } });
  engine.enqueueCommand({ tick: 8, type: 'SET_VELOCITY', payload: { id: 1, vx: 3, vy: 2 } });
  engine.enqueueCommand({ tick: 12, type: 'SPAWN_ENTITY', payload: { x: 600, y: 400, vx: 4, vy: 3 } });
  engine.stepN(20);
  return engine.getSessionLog();
}

describe('Fork sessions', () => {
  it('captures state before the fork-tick command and drops commands at or after the fork tick', () => {
    const original = recordedSession();
    const fork = forkSession(original, 8, 'parent-1');

    expect(fork.snapshot.tick).toBe(8);
    expect(fork.snapshot.executedCommands.map((command) => command.tick)).toEqual([2]);
    expect(fork.snapshot.pendingCommands).toEqual([]);
    expect(fork.parentLog.commands.map((command) => command.tick)).toEqual([2]);
    expect(fork.parentLog.totalTicks).toBe(8);
    expect(fork.snapshot.forkOf).toEqual({ parentId: 'parent-1', tick: 8 });
  });

  it('replays the preserved history plus equivalent branch commands to the original final hash', () => {
    const original = recordedSession();
    const fork = forkSession(original, 8, 'parent-1');
    const engine = Engine.restore(fork.snapshot);
    for (const command of original.commands.filter((item) => item.tick >= 8)) engine.enqueueCommand(command);
    engine.stepN(original.totalTicks - fork.snapshot.tick);
    const forkLog = engine.getSessionLog();

    expect(replay(forkLog)).toBe(engine.getHash());
    expect(engine.getHash()).toBe(replay(original));
    expect(forkLog.forkOf).toEqual({ parentId: 'parent-1', tick: 8 });
  });

  it('allows a different command to diverge from the original branch', () => {
    const original = recordedSession();
    const fork = forkSession(original, 8, 'parent-1');
    const engine = Engine.restore(fork.snapshot);
    engine.enqueueCommand({ tick: 8, type: 'SET_VELOCITY', payload: { id: 1, vx: -4, vy: 1 } });
    engine.stepN(original.totalTicks - fork.snapshot.tick);
    expect(engine.getHash()).not.toBe(replay(original));
    expect(replay(engine.getSessionLog())).toBe(engine.getHash());
  });

  it('migrates legacy logs without fork metadata to the current version', () => {
    const legacy = { ...recordedSession(), formatVersion: 1 } as Record<string, unknown>;
    delete legacy.forkOf;
    const migrated = migrateSessionLog(legacy);
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.forkOf).toBeUndefined();
    expect(replay(migrated)).toBe(replay(legacy as unknown as SessionLog));
  });
});
