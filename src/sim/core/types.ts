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
}

export interface Command {
  tick: number;
  type: string;
  payload: Record<string, unknown>;
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
}

export interface EngineSnapshot {
  world: WorldState;
  rngState: number;
  pendingCommands: Command[];
  eventCount: number;
}
