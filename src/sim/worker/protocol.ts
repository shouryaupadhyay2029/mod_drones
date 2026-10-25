import { Command, EngineSnapshot, SessionLog } from '../core/types.js';
import { ScoreReport } from '../scoring/basic.js';
import { ScoreReportV2 } from '../scoring/doctrine.js';
import { TraineeView } from '../view/traineeView.js';

export interface MissionSummary {
  total: number;
  grade: ScoreReportV2['grade'];
  subscores: ScoreReportV2['subscores'];
  hostilesTotal: number;
  hostilesNeutralised: number;
  assetHit: boolean;
  durationTicks: number;
}

export interface EnqueueCommandInput {
  tick?: number;
  type: string;
  payload?: Record<string, unknown>;
}

export type WorkerCommand =
  | { type: 'INIT'; payload: { seed: string | number; scenarioId?: string; avoidFingerprints?: string[] } }
  | { type: 'INIT_FROM_FORK'; payload: { log: SessionLog; tick: number; parentId?: string } }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'STEP_N'; payload: { n: number } }
  | { type: 'SET_SPEED'; payload: { multiplier: 1 | 2 | 4 } }
  | { type: 'ENQUEUE'; payload: { command: Command | EnqueueCommandInput } }
  | { type: 'GET_STATE' }
  | { type: 'GET_LOG' }
  | { type: 'SNAPSHOT' }
  | { type: 'RESTORE'; payload: { snapshot: EngineSnapshot } };

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
      type: 'VIEW';
      payload: {
        view: TraineeView;
      };
    }
  | {
      type: 'REPORT';
      payload: {
        score: ScoreReport;
        scoreV2: ScoreReportV2;
        sessionLog: SessionLog;
        hash: string;
        scoreVersion: string;
        summary: MissionSummary;
        fingerprint?: string;
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
