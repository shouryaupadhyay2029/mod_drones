import { TICK_RATE } from '../core/clock.js';
import { Engine } from '../core/engine.js';
import { Command } from '../core/types.js';
import { scoreSession } from '../scoring/basic.js';
import { scoreSessionV2 } from '../scoring/doctrine.js';
import { SCORE_VERSION } from '../scoring/doctrineConstants.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { WorkerCommand, WorkerEvent } from './protocol.js';

export interface WorkerRuntimeContext {
  onmessage: ((event: { data: WorkerCommand }) => void) | null;
  postMessage: (message: WorkerEvent) => void;
  setInterval?: (handler: () => void, timeout?: number) => number;
  clearInterval?: (handle?: number) => void;
}

export function attachWorkerHandler(workerScope: WorkerRuntimeContext): void {
  let engine: Engine | null = null;
  let running = false;
  let timerId: number | null = null;
  let speedMultiplier: 1 | 2 | 4 = 1;
  let lastSentViewTick = -999;
  let lastSentEventCount = 0;

  function postCurrentState(): void {
    if (!engine) return;
    workerScope.postMessage({
      type: 'STATE',
      payload: {
        tick: engine.world.tick,
        hash: engine.getHash(),
        entityCount: engine.world.entities.length + engine.actors.length,
        isRunning: running,
      },
    });
  }

  function postViewIfAppropriate(force = false): void {
    if (!engine) return;
    const view = engine.getTraineeView();
    const currentTick = engine.world.tick;
    const hasNewEvent = view.events.length > lastSentEventCount;
    const ticksSinceLast = currentTick - lastSentViewTick;

    if (force || hasNewEvent || ticksSinceLast >= 2) {
      lastSentViewTick = currentTick;
      lastSentEventCount = view.events.length;
      workerScope.postMessage({
        type: 'VIEW',
        payload: { view },
      });
    }
  }

  function handleEndCondition(): void {
    if (!engine || !engine.missionState.ended) return;
    pauseLoop();

    // Post final view
    postViewIfAppropriate(true);

    // Compute ground-truth score inside the worker
    const events = engine.getEvents();
    const assetHit = events.some((event) => event.type === 'ASSET_HIT');
    const score = scoreSession({
      actors: engine.actors,
      tracks: engine.tracks,
      events,
      assetHit,
    });
    const scoreV2 = scoreSessionV2({ actors: engine.actors, tracks: engine.tracks, events, assetHit });
    const sessionLog = engine.getSessionLog();
    const hash = engine.getHash();
    const hostiles = engine.actors.filter((actor) => THREAT_LIBRARY[actor.classId]?.hostile);
    const summary = {
      total: scoreV2.total,
      grade: scoreV2.grade,
      subscores: scoreV2.subscores,
      hostilesTotal: hostiles.length,
      hostilesNeutralised: hostiles.filter((actor) => actor.state === 'neutralized').length,
      assetHit,
      durationTicks: engine.world.tick,
    };

    workerScope.postMessage({
      type: 'REPORT',
      payload: {
        score,
        scoreV2,
        sessionLog,
        hash,
        scoreVersion: SCORE_VERSION,
        summary,
        fingerprint: engine.scenarioFingerprint,
      },
    });
  }

  function stepEngine(n = 1): void {
    if (!engine) return;
    for (let i = 0; i < n; i++) {
      if (engine.missionState.ended) break;
      engine.step();
      postViewIfAppropriate();
    }
    postCurrentState();
    if (engine.missionState.ended) {
      handleEndCondition();
    }
  }

  function handleIntervalTick(): void {
    if (!engine || !running) return;
    stepEngine(speedMultiplier);
  }

  function startLoop(): void {
    if (running) return;
    if (engine && engine.missionState.ended) return;
    running = true;
    if (workerScope.setInterval) {
      const intervalMs = Math.round(1000 / TICK_RATE);
      timerId = workerScope.setInterval(handleIntervalTick, intervalMs);
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
          const scenario = msg.payload.scenarioId ?? 'dawn_intrusion';
          engine = new Engine(msg.payload.seed, scenario, msg.payload.avoidFingerprints ?? []);
          lastSentViewTick = -999;
          lastSentEventCount = 0;
          postCurrentState();
          postViewIfAppropriate(true);
          break;
        }

        case 'START': {
          if (!engine) {
            engine = new Engine(1, 'dawn_intrusion');
          }
          startLoop();
          break;
        }

        case 'PAUSE': {
          pauseLoop();
          break;
        }

        case 'SET_SPEED': {
          speedMultiplier = msg.payload.multiplier;
          break;
        }

        case 'STEP_N': {
          if (!engine) {
            engine = new Engine(1, 'dawn_intrusion');
          }
          stepEngine(msg.payload.n);
          break;
        }

        case 'ENQUEUE': {
          if (engine) {
            const rawCmd = msg.payload.command;
            const targetTick =
              typeof rawCmd.tick === 'number' && !Number.isNaN(rawCmd.tick)
                ? Math.max(rawCmd.tick, engine.world.tick)
                : engine.world.tick;
            const cmd: Command = {
              tick: targetTick,
              type: rawCmd.type,
              payload: rawCmd.payload ? { ...rawCmd.payload } : {},
            };
            engine.enqueueCommand(cmd);
          }
          break;
        }

        case 'GET_STATE': {
          postCurrentState();
          postViewIfAppropriate(true);
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
          engine = Engine.restore(msg.payload.snapshot);
          lastSentViewTick = -999;
          lastSentEventCount = 0;
          postCurrentState();
          postViewIfAppropriate(true);
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
}

if (typeof globalThis !== 'undefined') {
  attachWorkerHandler(globalThis as unknown as WorkerRuntimeContext);
}
