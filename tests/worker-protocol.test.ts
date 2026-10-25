import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  referenceOperator,
  TraineeView,
  WorkerCommand,
  WorkerEvent,
  rescoreSession,
} from '../src/sim/index.js';
import { attachWorkerHandler, WorkerRuntimeContext } from '../src/sim/worker/sim.worker.js';
import { deleteAllData, listSessions } from '../src/app/storage/db.js';
import { persistMissionReport } from '../src/app/storage/sessionPersistence.js';

describe('Worker Protocol & Headless Pipeline Verification (no wall-clock sleeps)', { timeout: 30000 }, () => {
  it('drives Dawn Intrusion through the worker, then auto-saves a replayable session', async () => {
    let workerOnMessage: ((event: { data: WorkerCommand }) => void) | null = null;
    const postedEvents: WorkerEvent[] = [];

    const mockContext: WorkerRuntimeContext = {
      get onmessage() {
        return workerOnMessage;
      },
      set onmessage(fn) {
        workerOnMessage = fn;
      },
      postMessage: (event: WorkerEvent) => {
        postedEvents.push(event);
      },
    };

    // Attach handler
    attachWorkerHandler(mockContext);
    expect(workerOnMessage).toBeDefined();

    function sendCommand(cmd: WorkerCommand): void {
      if (workerOnMessage) {
        workerOnMessage({ data: cmd });
      }
    }

    // 1. Initialize worker with seed 's1' and scenario 'dawn_intrusion'
    sendCommand({
      type: 'INIT',
      payload: { seed: 's1', scenarioId: 'dawn_intrusion' },
    });

    let latestView: TraineeView | null = null;
    let finalReport: Extract<WorkerEvent, { type: 'REPORT' }>['payload'] | null = null;

    // Run synchronous step loop (no real timers)
    let maxSteps = 4800;
    while (maxSteps-- > 0 && !finalReport) {
      // Find latest posted view
      for (let i = postedEvents.length - 1; i >= 0; i--) {
        const evt = postedEvents[i];
        if (evt?.type === 'VIEW') {
          latestView = evt.payload.view;
          break;
        } else if (evt?.type === 'REPORT') {
          finalReport = evt.payload;
          break;
        }
      }

      if (finalReport) break;

      if (latestView) {
        // Assert ground-truth leakage prevention on every single view
        const serialized = JSON.stringify(latestView);
        expect(serialized).not.toContain('"hostile"');
        expect(serialized).not.toContain('"actorId"');
        expect(serialized).not.toContain('"truthClass"');
        expect(serialized).not.toContain('"actors"');

        // Let referenceOperator generate commands
        const commands = referenceOperator(latestView);
        for (let c = 0; c < commands.length; c++) {
          const cmd = commands[c];
          if (cmd) {
            sendCommand({
              type: 'ENQUEUE',
              payload: { command: cmd },
            });
          }
        }
      }

      // Step 1 tick deterministically
      sendCommand({
        type: 'STEP_N',
        payload: { n: 1 },
      });

      // Check if report was posted
      const lastEvent = postedEvents[postedEvents.length - 1];
      if (lastEvent?.type === 'REPORT') {
        finalReport = lastEvent.payload;
        break;
      }
    }

    // Verify that the mission concluded and delivered final report
    expect(finalReport).not.toBeNull();
    expect(finalReport?.score).toBeDefined();
    expect(finalReport?.sessionLog).toBeDefined();

    // Verify score matches headless runner for seed 's1' (= 100)
    expect(finalReport?.score.total).toBe(100);
    expect(finalReport?.score.perContact.length).toBe(3);
    expect(finalReport?.score.penalties.length).toBe(0);

    await deleteAllData();
    await persistMissionReport(finalReport!, 1000);
    const [saved] = await listSessions();
    expect(saved?.hash).toBe(finalReport?.hash);
    expect(saved?.scoreVersion).toBe('2.1');
    expect(rescoreSession(saved!.sessionLog).hash).toBe(saved?.hash);
  });
});
