import { Command, EngineSnapshot, SessionLog } from '../sim/core/types.js';
import { WorkerCommand, WorkerEvent } from '../sim/worker/protocol.js';

export interface SimStateUpdate {
  tick: number;
  hash: string;
  entityCount: number;
  isRunning: boolean;
}

export class SimClient {
  private worker: Worker | null = null;
  private stateListeners: Set<(state: SimStateUpdate) => void> = new Set();
  private pendingLogResolvers: Array<(log: SessionLog) => void> = [];
  private pendingSnapshotResolvers: Array<(snapshot: EngineSnapshot) => void> = [];
  private lastState: SimStateUpdate = {
    tick: 0,
    hash: '',
    entityCount: 0,
    isRunning: false,
  };

  constructor(customWorker?: Worker) {
    if (customWorker) {
      this.worker = customWorker;
    } else if (typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('../sim/worker/sim.worker.ts', import.meta.url), {
        type: 'module',
      });
    }

    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
        this.handleWorkerMessage(event.data);
      };
    }
  }

  private handleWorkerMessage(msg: WorkerEvent): void {
    if (!msg) return;

    switch (msg.type) {
      case 'STATE': {
        this.lastState = msg.payload;
        for (const listener of this.stateListeners) {
          listener(this.lastState);
        }
        break;
      }

      case 'LOG': {
        const resolver = this.pendingLogResolvers.shift();
        if (resolver) {
          resolver(msg.payload.sessionLog);
        }
        break;
      }

      case 'SNAPSHOT': {
        const resolver = this.pendingSnapshotResolvers.shift();
        if (resolver) {
          resolver(msg.payload.snapshot);
        }
        break;
      }

      case 'ERROR': {
        console.error('[SimClient] Worker Error:', msg.payload.message);
        break;
      }
    }
  }

  private send(cmd: WorkerCommand): void {
    this.worker?.postMessage(cmd);
  }

  public init(seed: string | number, scenarioId = 'sandbox'): void {
    this.send({ type: 'INIT', payload: { seed, scenarioId } });
  }

  public start(): void {
    this.send({ type: 'START' });
  }

  public pause(): void {
    this.send({ type: 'PAUSE' });
  }

  public stepN(n: number): void {
    this.send({ type: 'STEP_N', payload: { n } });
  }

  public enqueue(command: Command): void {
    this.send({ type: 'ENQUEUE', payload: { command } });
  }

  public requestState(): void {
    this.send({ type: 'GET_STATE' });
  }

  public getSessionLog(): Promise<SessionLog> {
    return new Promise((resolve) => {
      this.pendingLogResolvers.push(resolve);
      this.send({ type: 'GET_LOG' });
    });
  }

  public snapshot(): Promise<EngineSnapshot> {
    return new Promise((resolve) => {
      this.pendingSnapshotResolvers.push(resolve);
      this.send({ type: 'SNAPSHOT' });
    });
  }

  public restore(snapshot: EngineSnapshot): void {
    this.send({ type: 'RESTORE', payload: { snapshot } });
  }

  public onState(listener: (state: SimStateUpdate) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.lastState);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public getLastState(): SimStateUpdate {
    return this.lastState;
  }

  public terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.stateListeners.clear();
  }
}
