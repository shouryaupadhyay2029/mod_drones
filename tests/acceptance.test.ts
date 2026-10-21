import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { replay } from '../src/sim/core/log.js';
import { Rng } from '../src/sim/core/rng.js';
import { Command } from '../src/sim/core/types.js';
import { execSync } from 'node:child_process';

describe('Phase 0 Acceptance Tests', () => {
  // Acceptance Test 1
  it('1. RNG: same seed gives identical 1000-value sequence; different seeds differ', () => {
    const seed = 'tactical-seed-42';
    const rng1 = new Rng(seed);
    const rng2 = new Rng(seed);
    const rngDiff = new Rng('different-seed-99');

    const seq1: number[] = [];
    const seq2: number[] = [];
    const seqDiff: number[] = [];

    for (let i = 0; i < 1000; i++) {
      seq1.push(rng1.next());
      seq2.push(rng2.next());
      seqDiff.push(rngDiff.next());
    }

    expect(seq1).toEqual(seq2);
    expect(seq1).not.toEqual(seqDiff);
  });

  // Acceptance Test 2
  it('2. RNG fork: fork("a") and fork("b") differ; forking does not change the parents next values', () => {
    const seed = 'parent-seed-xyz';

    // Baseline: parent without forking
    const baselineParent = new Rng(seed);
    for (let i = 0; i < 20; i++) baselineParent.next();
    const baselineNext100: number[] = [];
    for (let i = 0; i < 100; i++) {
      baselineNext100.push(baselineParent.next());
    }

    // Test parent: fork midway
    const parent = new Rng(seed);
    for (let i = 0; i < 20; i++) parent.next();

    const forkA = parent.fork('a');
    const forkB = parent.fork('b');

    // Forking must NOT consume or disturb parent's sequence
    const parentNext100: number[] = [];
    for (let i = 0; i < 100; i++) {
      parentNext100.push(parent.next());
    }
    expect(parentNext100).toEqual(baselineNext100);

    // fork("a") and fork("b") must differ
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 50; i++) {
      seqA.push(forkA.next());
      seqB.push(forkB.next());
    }
    expect(seqA).not.toEqual(seqB);
  });

  // Acceptance Test 3
  it('3. Engine: same seed + same commands, 10,000 ticks => identical final hash on two runs', () => {
    const seed = 'marathon-seed-10k';
    const commands: Command[] = [
      { tick: 10, type: 'SPAWN_ENTITY', payload: { x: 10, y: 20, vx: 1.5, vy: -0.5 } },
      { tick: 50, type: 'SET_VELOCITY', payload: { id: 1, vx: 2.0, vy: 1.0 } },
      { tick: 200, type: 'SPAWN_ENTITY', payload: {} }, // draws from RNG
      { tick: 500, type: 'SPAWN_ENTITY', payload: { x: -50, y: 75, vx: 0.2, vy: 0.8 } },
      { tick: 1000, type: 'SET_VELOCITY', payload: { id: 2, vx: -1.2, vy: 3.4 } },
      { tick: 5000, type: 'SPAWN_ENTITY', payload: {} },
    ];

    const run = () => {
      const engine = new Engine(seed);
      for (const cmd of commands) {
        engine.enqueueCommand(cmd);
      }
      engine.stepN(10000);
      return engine.getHash();
    };

    const hash1 = run();
    const hash2 = run();

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  // Acceptance Test 4
  it('4. Engine: different seed => different hash (RNG-dependent spawn)', () => {
    // Spawn commands with no x/y draw random positions from the engine RNG
    const commands: Command[] = [
      { tick: 0, type: 'SPAWN_ENTITY', payload: {} },
      { tick: 5, type: 'SPAWN_ENTITY', payload: {} },
    ];

    const engineA = new Engine('alpha');
    const engineB = new Engine('beta');

    for (const cmd of commands) {
      engineA.enqueueCommand(cmd);
      engineB.enqueueCommand(cmd);
    }

    engineA.stepN(20);
    engineB.stepN(20);

    const hashA = engineA.getHash();
    const hashB = engineB.getHash();

    expect(hashA).not.toBe(hashB);
    // Entity coordinates drawn from RNG must differ
    expect(engineA.world.entities[0]?.x).not.toBe(engineB.world.entities[0]?.x);
  });

  // Acceptance Test 5
  it('5. Replay: live runs final hash === replay(sessionLog) hash', () => {
    const seed = 'replay-validation-seed';
    const engine = new Engine(seed);

    engine.enqueueCommand({
      tick: 5,
      type: 'SPAWN_ENTITY',
      payload: { x: 100, y: -50, vx: 2, vy: 1 },
    });
    engine.enqueueCommand({
      tick: 15,
      type: 'SPAWN_ENTITY',
      payload: {}, // RNG position
    });
    engine.enqueueCommand({
      tick: 30,
      type: 'SET_VELOCITY',
      payload: { id: 1, vx: -0.5, vy: 4.2 },
    });

    engine.stepN(150);

    const liveHash = engine.getHash();
    const log = engine.getSessionLog('scenario-replay-check');
    const replayHash = replay(log);

    expect(replayHash).toBe(liveHash);
  });

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

    const restoredEngine = Engine.restore(restoredSnapshot, seed);
    expect(restoredEngine.world.tick).toBe(300);
    expect(restoredEngine.getHash()).toBe(engineInterrupted.getHash());

    // Advance remaining 700 ticks
    restoredEngine.stepN(700);
    expect(restoredEngine.world.tick).toBe(1000);

    expect(restoredEngine.getHash()).toBe(expectedFinalHash);
  });

  // Acceptance Test 7
  it('7. Commands scheduled for a future tick are applied exactly on that tick', () => {
    const engine = new Engine('future-timing-seed');

    engine.enqueueCommand({
      tick: 25,
      type: 'SPAWN_ENTITY',
      payload: { x: 50, y: 50, vx: 0, vy: 0 },
    });

    // Advance to tick 25
    engine.stepN(25);
    expect(engine.world.tick).toBe(25);
    expect(engine.world.entities.length).toBe(0);

    // Step once on tick 25 (advancing from tick 25 to 26)
    engine.step();
    expect(engine.world.tick).toBe(26);
    expect(engine.world.entities.length).toBe(1);
    expect(engine.world.entities[0]?.id).toBe(1);

    const events = engine.getEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.tick).toBe(25); // Applied on tick 25
    expect(events[0]?.type).toBe('ENTITY_SPAWNED');
  });

  // Acceptance Test 8
  it('8. src/sim has no DOM dependency: npm run typecheck:sim passes with no DOM lib', () => {
    // Run tsc -p tsconfig.sim.json --noEmit
    const output = execSync('npm run typecheck:sim', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(output).toContain('typecheck:sim');
  });
});
