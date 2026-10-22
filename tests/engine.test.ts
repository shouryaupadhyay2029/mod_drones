import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { Command } from '../src/sim/core/types.js';
import { execSync } from 'node:child_process';

describe('Engine Core, Timing & Invariance', { timeout: 20000 }, () => {
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

    // Step once on tick 25 (advances tick to 26)
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
    const output = execSync('npm run typecheck:sim', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(output).toContain('typecheck:sim');
  });

  // Hardening Step 5 verification: Past-tick clamping
  it('Command tick stamping: enqueued past-tick commands are clamped to current tick and recorded', () => {
    const engine = new Engine('stamping-test');

    // Run engine to tick 30
    engine.stepN(30);
    expect(engine.world.tick).toBe(30);

    // Enqueue a command with a past tick (e.g. tick 10)
    engine.enqueueCommand({
      tick: 10,
      type: 'SPAWN_ENTITY',
      payload: { x: 10, y: 20, vx: 0, vy: 0 },
    });

    // Also enqueue a command with an invalid/NaN tick
    engine.enqueueCommand({
      tick: NaN,
      type: 'SPAWN_ENTITY',
      payload: { x: 30, y: 40, vx: 0, vy: 0 },
    });

    const pending = engine.getPendingCommands();
    expect(pending[0]?.tick).toBe(30);
    expect(pending[1]?.tick).toBe(30);

    // Execute tick 30
    engine.step();
    expect(engine.world.tick).toBe(31);
    expect(engine.world.entities.length).toBe(2);

    const log = engine.getSessionLog();
    expect(log.commands[0]?.tick).toBe(30);
    expect(log.commands[1]?.tick).toBe(30);
  });

  it('9. Command without tick is stamped to the current tick and recorded with it in SessionLog', () => {
    const engine = new Engine('optional-tick-seed');
    engine.stepN(42);
    expect(engine.world.tick).toBe(42);

    // Enqueue command with NO tick specified
    engine.enqueueCommand({
      type: 'SPAWN_ENTITY',
      payload: { x: 55, y: 66, vx: 0, vy: 0 },
    });

    const pending = engine.getPendingCommands();
    expect(pending[0]?.tick).toBe(42);

    engine.step();
    expect(engine.world.tick).toBe(43);

    const log = engine.getSessionLog();
    expect(log.commands.length).toBe(1);
    expect(log.commands[0]?.tick).toBe(42);
    expect(log.commands[0]?.type).toBe('SPAWN_ENTITY');
  });
});
