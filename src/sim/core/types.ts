import { Actor } from '../model/actors.js';
import { EffectorState, EffectorType } from '../model/effectors.js';
import { Environment } from '../model/environment.js';
import { RfSignature, ThreatClassId } from '../model/threats.js';
import { Track } from '../model/tracks.js';

export interface Entity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface WorldState {
  tick: number;
  entities: Entity[];
  nextEntityId: number;
  environment?: Environment;
}

export interface AckTrackPayload {
  trackId: number;
}

export interface ClassifyTrackPayload {
  trackId: number;
  assessedClass: ThreatClassId | 'unknown';
}

export interface EngageTrackPayload {
  trackId: number;
  effector: EffectorType;
}

export interface HoldFirePayload {
  trackId: number;
}

export interface SpawnEntityPayload {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface SetVelocityPayload {
  id: number;
  vx: number;
  vy: number;
}

export interface DevSpawnActorPayload {
  classId: ThreatClassId;
  x: number;
  y: number;
  z: number;
  speed?: number;
  behaviourType?: 'ingress_direct' | 'transit' | 'wander';
}

export interface CommandInput {
  tick?: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface Command {
  tick: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface SimEvent {
  tick: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface SessionLog {
  formatVersion: number;
  seed: string | number;
  scenarioId?: string;
  commands: Command[];
  totalTicks: number;
  generatorAvoid?: string[];
  forkOf?: { parentId: string; tick: number };
  options?: { assetHitEndsMission: boolean; missionEndWhenAllResolved: boolean; inventory: { gunAmmo: number; missiles: number }; ewLevel?: 'none' | 'light' | 'heavy' };
}

export interface RngTreeState {
  main: number;
  forks: Record<string, number>;
}

export interface MissionState {
  ended: boolean;
  assetHitCount?: number;
  reason?: 'asset_hit' | 'all_resolved' | 'time_limit';
}

export interface EngineSnapshot {
  formatVersion: number;
  seed: string | number;
  scenarioId?: string;
  tick: number;
  world: WorldState;
  rngStates: RngTreeState;
  pendingCommands: Command[];
  executedCommands: Command[];
  eventLog: SimEvent[];
  actors: Actor[];
  tracks: Track[];
  effectorState: EffectorState;
  missionState: MissionState;
  nextActorId: number;
  nextTrackId: number;
  generatorAvoid?: string[];
  forkOf?: { parentId: string; tick: number };
  options?: { assetHitEndsMission: boolean; missionEndWhenAllResolved: boolean; inventory: { gunAmmo: number; missiles: number }; ewLevel?: 'none' | 'light' | 'heavy' };
  rfState?: {
    lines: Array<{ tick: number; bearingDeg: number; signature: RfSignature }>;
  };
  eoState?: {
    state: 'idle' | 'slewing' | 'locked';
    lockedTrackId?: number;
    currentAzimuthDeg: number;
    channel: 'tv' | 'ir';
    level: 'none' | 'detect' | 'recognize' | 'identify';
    hint?: ThreatClassId | 'multirotor' | 'fixed_wing' | 'bird' | 'object';
    quality: number;
    effPixels: number;
  };
}
