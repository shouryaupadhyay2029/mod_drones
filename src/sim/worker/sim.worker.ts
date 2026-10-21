import { TICK_RATE } from '../core/clock.js';
import { Engine } from '../core/engine.js';
import { WorkerCommand, WorkerEvent } from './protocol.js';

interface WorkerRuntimeContext {
  onmessage: ((event: { data: WorkerCommand }) => void) | null;
  postMessage: (message: WorkerEvent) => void;
  setInterval?: (handler: () => void, timeout?: number) => number;
  clearInterval?: (handle?: number) => void;
}

const workerScope = globalThis as unknown as WorkerRuntimeContext;

let engine: Engine | null = null;
let running = false;
let timerId: number | null = null;

function postCurrentState(): void {
  if (!engine) return;
  workerScope.postMessage({
    type: 'STATE',
    payload: {
      tick: engine.world.tick,
      hash: engine.getHash(),
      entityCount: engine.world.entities.length,
      isRunning: running,
    },
  });
}

function handleTick(): void {
  if (!engine || !running) return;
  engine.step();
  postCurrentState();
}

function startLoop(): void {
  if (running) return;
  running = true;
  if (workerScope.setInterval) {
    const intervalMs = Math.round(1000 / TICK_RATE);
    timerId = workerScope.setInterval(handleTick, intervalMs);
  }
  postCurrentState();
}

function pauseLoop(): void {
  running = false;
  if (timerId !== null && workerScope.clearInterval) {
    workerScope.clearInterval(timerId);
    timerId = null;
  }
  postCurrentState();
}

workerScope.onmessage = (event: { data: WorkerCommand }) => {
  const msg = event.data;
  if (!msg) return;

  try {
    switch (msg.type) {
      case 'INIT': {
        pauseLoop();
        engine = new Engine(msg.payload.seed);
        postCurrentState();
        break;
      }

      case 'START': {
        if (!engine) {
          engine = new Engine(1);
        }
        startLoop();
        break;
      }

      case 'PAUSE': {
        pauseLoop();
        break;
      }

      case 'STEP_N': {
        if (!engine) {
          engine = new Engine(1);
        }
        engine.stepN(msg.payload.n);
        postCurrentState();
        break;
      }

      case 'ENQUEUE': {
        if (engine) {
          engine.enqueueCommand(msg.payload.command);
        }
        break;
      }

      case 'GET_STATE': {
        postCurrentState();
        break;
      }

      case 'GET_LOG': {
        if (engine) {
          workerScope.postMessage({
            type: 'LOG',
            payload: {
              sessionLog: engine.getSessionLog(),
            },
          });
        }
        break;
      }

      case 'SNAPSHOT': {
        if (engine) {
          workerScope.postMessage({
            type: 'SNAPSHOT',
            payload: {
              snapshot: engine.snapshot(),
            },
          });
        }
        break;
      }

      case 'RESTORE': {
        pauseLoop();
        engine = Engine.restore(msg.payload.snapshot, msg.payload.seed);
        postCurrentState();
        break;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    workerScope.postMessage({
      type: 'ERROR',
      payload: { message },
    });
  }
};
