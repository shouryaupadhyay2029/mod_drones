import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';

describe('Snapshot & Restore Integrity', () => {
  // Acceptance Test 6
  it('6. Snapshot: snapshot at tick 300, JSON round-trip, restore, run to tick 1000 => same hash as uninterrupted run', () => {
    const seed = 'snapshot-integrity-seed';
    const commands: Command[] = [
      { tick: 50, type: 'SPAWN_ENTITY', payload: { x: 0, y: 0, vx: 1, vy: 1 } },
      { tick: 150, type: 'SPAWN_ENTITY', payload: {} },
      { tick: 400, type: 'SET_VELOCITY', payload: { id: 1, vx: 5, vy: -2 } },
      { tick: 700, type: 'SPAWN_ENTITY', payload: { x: -20, y: 80, vx: 0.1, vy: 0.2 } },
    ];

    // 1. Uninterrupted run to tick 1000
    const engineUninterrupted = new Engine(seed);
    for (const cmd of commands) {
      engineUninterrupted.enqueueCommand(cmd);
    }
    engineUninterrupted.stepN(1000);
    const expectedFinalHash = engineUninterrupted.getHash();

    // 2. Interrupted run: snapshot at tick 300, JSON round-trip, restore, continue to 1000
    const engineInterrupted = new Engine(seed);
    for (const cmd of commands) {
      engineInterrupted.enqueueCommand(cmd);
    }
    engineInterrupted.stepN(300);

    const rawSnapshot = engineInterrupted.snapshot();
    const jsonSerialized = JSON.stringify(rawSnapshot);
    const restoredSnapshot = JSON.parse(jsonSerialized);

    const restoredEngine = Engine.restore(restoredSnapshot);
    expect(restoredEngine.world.tick).toBe(300);
    expect(restoredEngine.getHash()).toBe(engineInterrupted.getHash());

    // Advance remaining 700 ticks
    restoredEngine.stepN(700);
    expect(restoredEngine.world.tick).toBe(1000);

    expect(restoredEngine.getHash()).toBe(expectedFinalHash);
  });
});
