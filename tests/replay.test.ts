import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { Rng } from '../src/sim/core/rng.js';
import { createReplay, buildRadarShadowGrid } from '../src/sim/debrief/replay.js';
import { TerrainMap } from '../src/sim/model/terrain.js';
import { canvasToWorld, worldToCanvas } from '../src/app/aar/mapGeometry.js';
import { replay } from '../src/sim/core/log.js';
import { WorkerCommand, WorkerEvent } from '../src/sim/worker/protocol.js';
import { attachWorkerHandler, WorkerRuntimeContext } from '../src/sim/worker/sim.worker.js';
import { SimClient } from '../src/app/simClient.js';

function createTestWorkerHarness(): Worker {
  let clientOnMessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null;

  const workerContext: WorkerRuntimeContext = {
    onmessage: null,
    postMessage: (msg: WorkerEvent) => {
      queueMicrotask(() => {
        if (clientOnMessage) {
          clientOnMessage({ data: msg } as MessageEvent<WorkerEvent>);
        }
      });
    },
    setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id) => clearInterval(id as unknown as NodeJS.Timeout),
  };

  attachWorkerHandler(workerContext);

  const mockWorker = {
    postMessage: (cmd: WorkerCommand) => {
      queueMicrotask(() => {
        if (workerContext.onmessage) {
          workerContext.onmessage({ data: cmd });
        }
      });
    },
    set onmessage(fn: ((event: MessageEvent<WorkerEvent>) => void) | null) {
      clientOnMessage = fn;
    },
    get onmessage() {
      return clientOnMessage;
    },
    terminate: () => {
      workerContext.onmessage?.({ data: { type: 'PAUSE' } });
    },
  };

  return mockWorker as unknown as Worker;
}

describe('Replay Verification & Worker Pipeline', () => {
  // Acceptance Test 5
  it('5. Replay: live runs final hash === replay(sessionLog) hash (Direct Engine)', () => {
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

  // Hardening Step 4 test: Worker / Client pipeline replay (deterministic STEP_N, zero wall-clock sleep)
  it('Worker/Client: session driven THROUGH worker with commands enqueued while running matches replay() hash', async () => {
    const workerHarness = createTestWorkerHarness();
    const client = new SimClient(workerHarness);

    const seed = 'worker-pipeline-session-test';
    client.init(seed);

    const waitForTick = (targetTick: number): Promise<void> =>
      new Promise((resolve) => {
        const unsubscribe = client.onState((state) => {
          if (state.tick >= targetTick) {
            unsubscribe();
            resolve();
          }
        });
      });

    // Step 10 ticks via STEP_N
    client.stepN(10);
    await waitForTick(10);

    // Enqueue commands dynamically for upcoming ticks
    client.enqueue({
      tick: 12,
      type: 'SPAWN_ENTITY',
      payload: { x: 25, y: -40, vx: 1.5, vy: -0.5 },
    });

    client.enqueue({
      tick: 15,
      type: 'SPAWN_ENTITY',
      payload: {}, // RNG position
    });

    // Advance 20 more ticks through STEP_N
    client.stepN(20);
    await waitForTick(30);

    const finalLiveState = client.getLastState();
    expect(finalLiveState.tick).toBe(30);
    expect(finalLiveState.entityCount).toBe(2);

    // Retrieve SessionLog through worker IPC
    const sessionLog = await client.getSessionLog();
    expect(sessionLog.seed).toBe(seed);
    expect(sessionLog.commands.length).toBe(2);
    expect(sessionLog.totalTicks).toBe(finalLiveState.tick);

    // Replay session log in a clean Engine
    const replayHash = replay(sessionLog);

    expect(replayHash).toBe(finalLiveState.hash);

    client.terminate();
  });
});

describe('session review replay', () => {
  it('initializes a fork in the worker paused, accepts replacement commands, and replays its hash', async () => {
    const original = new Engine('worker-fork-fixture', 'sandbox');
    original.enqueueCommand({ tick: 4, type: 'SPAWN_ENTITY', payload: { x: 10, y: 20, vx: 1, vy: 1 } });
    original.enqueueCommand({ tick: 12, type: 'SET_VELOCITY', payload: { id: 1, vx: 1, vy: -2 } });
    original.stepN(40);
    const log = original.getSessionLog();
    const workerHarness = createTestWorkerHarness();
    const client = new SimClient(workerHarness);
    client.initFromFork(log, 10, 'parent-worker');

    const waitForTick = (targetTick: number): Promise<void> => new Promise((resolve) => {
      const unsubscribe = client.onState((state) => {
        if (state.tick >= targetTick) { unsubscribe(); resolve(); }
      });
    });
    await waitForTick(10);
    expect(client.getLastState().isRunning).toBe(false);
    client.enqueue({ tick: 10, type: 'SET_VELOCITY', payload: { id: 1, vx: -3, vy: 2 } });
    client.stepN(20);
    await waitForTick(30);
    const changedLog = await client.getSessionLog();
    expect(changedLog.forkOf).toEqual({ parentId: 'parent-worker', tick: 10 });
    expect(changedLog.commands.some((command) => command.tick >= 10 && command.type === 'SET_VELOCITY')).toBe(true);
    expect(replay(changedLog)).toBe(client.getLastState().hash);
    client.terminate();
  });

  it('seek matches fresh-run hashes for seeded forward and backward target ticks', () => {
    const source = new Engine('aar-seek-fixture', 'dawn_intrusion');
    while (source.world.tick < 240) source.step();
    const review = createReplay(source.getSessionLog());
    const rng = new Rng('aar-seek-ticks');
    const ticks = Array.from({ length: 10 }, () => Math.floor(rng.next() * 241));
    for (const tick of ticks) {
      review.seek(tick);
      const fresh = new Engine('aar-seek-fixture', 'dawn_intrusion');
      while (fresh.world.tick < tick) fresh.step();
      expect(review.hash()).toBe(fresh.getHash());
    }
  });

  it('frame returns detached state that cannot mutate the replay engine', () => {
    const source = new Engine('aar-frame-fixture', 'sandbox');
    source.enqueueCommand({
      tick: 0,
      type: 'DEV_SPAWN_ACTOR',
      payload: { classId: 'fpv_kamikaze', x: 1000, y: 1000, z: 50, speed: 10 },
    });
    for (let tick = 0; tick < 180; tick++) source.step();
    const review = createReplay(source.getSessionLog());
    review.seek(120);
    const before = review.hash();
    const exposed = review.frame();
    expect(exposed.actors.length).toBeGreaterThan(0);
    if (exposed.actors[0]) exposed.actors[0].pos.x += 50000;
    if (exposed.tracks[0]) exposed.tracks[0].estPos.x += 50000;
    if (exposed.events[0]) exposed.events[0].payload.changed = true;
    exposed.effectors.gun.ammo = -1;
    exposed.env.weather = 'fog';
    expect(review.hash()).toBe(before);
    expect(review.frame().env.weather).not.toBe('fog');
  });

  it('provides terrain and reports line-of-sight shadow behind a synthetic ridge', () => {
    const ridge: TerrainMap = {
      heightAt: (x) => x >= 450 && x <= 550 ? 120 : 0,
      clutterAt: () => 0,
    };
    const shadow = buildRadarShadowGrid(ridge, 20, 1000);
    const column = (1000 - shadow.originX) / shadow.step;
    const row = (0 - shadow.originY) / shadow.step;
    expect(shadow.blocked[row * shadow.width + column]).toBe(true);
    const grid = createReplay(new Engine('aar-grid-fixture', 'ridge_runner').getSessionLog()).terrainGrid(1000);
    expect(grid.heights.length).toBe(grid.width * grid.height);
    expect(grid.clutter.length).toBe(grid.heights.length);
  });
});

describe('AAR map coordinate geometry', () => {
  const bounds = { minX: -8000, maxX: 8000, minY: -8000, maxY: 8000, width: 640, height: 640 };

  it('maps world origin to canvas center and round-trips coordinates', () => {
    expect(worldToCanvas({ x: 0, y: 0 }, bounds)).toEqual({ x: 320, y: 320 });
    const world = { x: 3150, y: -2710 };
    const canvas = worldToCanvas(world, bounds);
    expect(canvasToWorld(canvas, bounds).x).toBeCloseTo(world.x);
    expect(canvasToWorld(canvas, bounds).y).toBeCloseTo(world.y);
  });
});
