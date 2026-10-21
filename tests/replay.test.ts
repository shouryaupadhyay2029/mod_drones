import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
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
