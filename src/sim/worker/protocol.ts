import { Command, EngineSnapshot, SessionLog } from '../core/types.js';

export type WorkerCommand =
  | { type: 'INIT'; payload: { seed: string | number } }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'STEP_N'; payload: { n: number } }
  | { type: 'ENQUEUE'; payload: { command: Command } }
  | { type: 'GET_STATE' }
  | { type: 'GET_LOG' }
  | { type: 'SNAPSHOT' }
  | { type: 'RESTORE'; payload: { snapshot: EngineSnapshot; seed?: string | number } };

export type WorkerEvent =
  | {
      type: 'STATE';
      payload: {
        tick: number;
        hash: string;
        entityCount: number;
        isRunning: boolean;
      };
    }
  | {
      type: 'LOG';
      payload: {
        sessionLog: SessionLog;
      };
    }
  | {
      type: 'SNAPSHOT';
      payload: {
        snapshot: EngineSnapshot;
      };
    }
  | {
      type: 'ERROR';
      payload: {
        message: string;
      };
    };
