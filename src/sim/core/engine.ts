import { DT } from './clock.js';
import { stateHash } from './hash.js';
import { Rng } from './rng.js';
import {
  Command,
  EngineSnapshot,
  Entity,
  SessionLog,
  SetVelocityPayload,
  SimEvent,
  SpawnEntityPayload,
  WorldState,
} from './types.js';
import { cloneWorld, createInitialWorld, setEntityVelocity, spawnEntity, stepWorldKinematics } from './world.js';
import { LOG_FORMAT_VERSION } from '../../shared/version.js';

export class Engine {
  public world: WorldState;
  public rng: Rng;
  public readonly seed: string | number;
  private pendingCommands: Command[] = [];
  private executedCommands: Command[] = [];
  private events: SimEvent[] = [];

  constructor(seed: string | number) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.world = createInitialWorld();
  }

  public enqueueCommand(command: Command): void {
    const cmd: Command = {
      tick: Math.max(command.tick, this.world.tick),
      type: command.type,
      payload: { ...command.payload },
    };
    this.pendingCommands.push(cmd);
    // Keep pending commands sorted stably by scheduled tick
    this.pendingCommands.sort((a, b) => a.tick - b.tick);
  }

  public step(): void {
    const currentTick = this.world.tick;

    // 1. Extract commands scheduled for current tick
    const currentTickCommands: Command[] = [];
    const remainingCommands: Command[] = [];

    for (let i = 0; i < this.pendingCommands.length; i++) {
      const cmd = this.pendingCommands[i];
      if (cmd && cmd.tick <= currentTick) {
        currentTickCommands.push(cmd);
      } else if (cmd) {
        remainingCommands.push(cmd);
      }
    }
    this.pendingCommands = remainingCommands;

    // 2. Apply commands in deterministic order
    for (let i = 0; i < currentTickCommands.length; i++) {
      const cmd = currentTickCommands[i];
      if (!cmd) continue;
      this.applyCommand(cmd);
      this.executedCommands.push(cmd);
    }

    // 3. Advance entity kinematics
    stepWorldKinematics(this.world, DT);

    // 4. Advance tick counter
    this.world.tick++;
  }

  public stepN(n: number): void {
    for (let i = 0; i < n; i++) {
      this.step();
    }
  }

  private applyCommand(command: Command): void {
    const tick = this.world.tick;
    switch (command.type) {
      case 'SPAWN_ENTITY': {
        const payload = command.payload as SpawnEntityPayload;
        // If x or y is undefined, draw random position from engine RNG
        const x = payload.x !== undefined ? payload.x : this.rng.int(-100, 100);
        const y = payload.y !== undefined ? payload.y : this.rng.int(-100, 100);
        const vx = payload.vx !== undefined ? payload.vx : 0;
        const vy = payload.vy !== undefined ? payload.vy : 0;

        const entity: Entity = spawnEntity(this.world, x, y, vx, vy);
        this.events.push({
          tick,
          type: 'ENTITY_SPAWNED',
          payload: {
            id: entity.id,
            x: entity.x,
            y: entity.y,
            vx: entity.vx,
            vy: entity.vy,
          },
        });
        break;
      }

      case 'SET_VELOCITY': {
        const payload = command.payload as unknown as SetVelocityPayload;
        const updated = setEntityVelocity(this.world, payload.id, payload.vx, payload.vy);
        if (updated) {
          this.events.push({
            tick,
            type: 'VELOCITY_SET',
            payload: {
              id: updated.id,
              vx: updated.vx,
              vy: updated.vy,
            },
          });
        }
        break;
      }

      default: {
        this.events.push({
          tick,
          type: 'UNKNOWN_COMMAND',
          payload: {
            commandType: command.type,
          },
        });
        break;
      }
    }
  }

  public getHash(): string {
    return stateHash(this.world, this.rng.getState());
  }

  public getEvents(): readonly SimEvent[] {
    return this.events;
  }

  public getExecutedCommands(): readonly Command[] {
    return this.executedCommands;
  }

  public getPendingCommands(): readonly Command[] {
    return this.pendingCommands;
  }

  public getSessionLog(scenarioId?: string): SessionLog {
    return {
      formatVersion: LOG_FORMAT_VERSION,
      seed: this.seed,
      scenarioId,
      commands: this.executedCommands.map((c) => ({
        tick: c.tick,
        type: c.type,
        payload: { ...c.payload },
      })),
      totalTicks: this.world.tick,
    };
  }

  public snapshot(): EngineSnapshot {
    return {
      world: cloneWorld(this.world),
      rngState: this.rng.getState(),
      pendingCommands: this.pendingCommands.map((c) => ({
        tick: c.tick,
        type: c.type,
        payload: { ...c.payload },
      })),
      eventCount: this.events.length,
    };
  }

  public static restore(snapshot: EngineSnapshot, seed: string | number = 0): Engine {
    const engine = new Engine(seed);
    engine.world = cloneWorld(snapshot.world);
    engine.rng.setState(snapshot.rngState);
    engine.pendingCommands = snapshot.pendingCommands.map((c) => ({
      tick: c.tick,
      type: c.type,
      payload: { ...c.payload },
    }));
    return engine;
  }
}
