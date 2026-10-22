import { LOG_FORMAT_VERSION } from '../../shared/version.js';
import { Actor, createActor, updateActorBehaviour } from '../model/actors.js';
import {
  createInitialEffectorState,
  EffectorState,
} from '../model/effectors.js';
import { generateTerrain, TerrainMap } from '../model/terrain.js';
import { Track } from '../model/tracks.js';
import {
  SCENARIOS,
  ScenarioSpawnSchedule,
  spawnScheduledActor,
} from '../scenarios/index.js';
import { runEngagementSystem, tryEngageTrack } from '../systems/engagement.js';
import { runRadarSystem } from '../systems/radar.js';
import { buildTraineeView, TraineeView } from '../view/traineeView.js';
import { DT } from './clock.js';
import { stateHash } from './hash.js';
import { Rng } from './rng.js';
import {
  AckTrackPayload,
  ClassifyTrackPayload,
  Command,
  CommandInput,
  DevSpawnActorPayload,
  EngageTrackPayload,
  EngineSnapshot,
  Entity,
  HoldFirePayload,
  MissionState,
  SessionLog,
  SetVelocityPayload,
  SimEvent,
  SpawnEntityPayload,
  WorldState,
} from './types.js';
import {
  cloneWorld,
  createInitialWorld,
  setEntityVelocity,
  spawnEntity,
  stepWorldKinematics,
} from './world.js';

export class Engine {
  public world: WorldState;
  public rng: Rng;
  public readonly seed: string | number;
  public readonly scenarioId: string;

  public actors: Actor[] = [];
  public tracks: Track[] = [];
  public effectorState: EffectorState;
  public missionState: MissionState = { ended: false };
  public terrain?: TerrainMap;

  private nextActorId = 1;
  private nextTrackId = 1;
  private scheduledSpawns: ScenarioSpawnSchedule[] = [];

  private pendingCommands: Command[] = [];
  private executedCommands: Command[] = [];
  private events: SimEvent[] = [];

  constructor(seed: string | number, scenarioId = 'sandbox') {
    this.seed = seed;
    this.scenarioId = scenarioId;
    this.rng = new Rng(seed);
    this.effectorState = createInitialEffectorState();

    if (scenarioId === 'sandbox' || scenarioId === 'scenario-replay-check') {
      this.world = createInitialWorld();
      this.scheduledSpawns = [];
    } else {
      const def = SCENARIOS[scenarioId] ?? SCENARIOS['dawn_intrusion']!;
      this.world = createInitialWorld(def.environment);
      const scenarioRng = this.rng.fork('scenario');
      this.scheduledSpawns = def.buildSpawns(scenarioRng);
      const terrainRng = this.rng.fork('terrain');
      this.terrain = generateTerrain(def.environment.terrainKind, terrainRng, def.terrainFeatures ?? []);
    }
  }

  public enqueueCommand(command: Command | CommandInput): void {
    const targetTick =
      typeof command.tick === 'number' && !Number.isNaN(command.tick)
        ? Math.max(command.tick, this.world.tick)
        : this.world.tick;

    const cmd: Command = {
      tick: targetTick,
      type: command.type,
      payload: { ...command.payload },
    };
    this.pendingCommands.push(cmd);
    this.pendingCommands.sort((a, b) => a.tick - b.tick);
  }

  public step(): void {
    const currentTick = this.world.tick;

    // 1. applyCommands
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

    for (let i = 0; i < currentTickCommands.length; i++) {
      const cmd = currentTickCommands[i];
      if (!cmd) continue;
      this.applyCommand(cmd);
      this.executedCommands.push(cmd);
    }

    // 2. behaviour
    this.runBehaviourSystem(currentTick);

    // 3. radar
    const isMissionScenario =
      this.scenarioId === 'dawn_intrusion' ||
      this.scenarioId === 'ridge_runner' ||
      this.scenarioId === 'city_edge_night';

    const trackRef = { current: this.nextTrackId };
    runRadarSystem(
      currentTick,
      this.actors,
      this.tracks,
      trackRef,
      this.rng.fork('radar'),
      this.events,
      this.world.environment,
      isMissionScenario ? this.rng.fork('radar-ghost') : undefined,
      this.terrain
    );
    this.nextTrackId = trackRef.current;

    // 4. engagement
    runEngagementSystem(
      currentTick,
      this.actors,
      this.tracks,
      this.effectorState,
      this.rng.fork('effector'),
      this.events
    );

    // 5. missionRules
    this.runMissionRules(currentTick);

    // Advance tick counter
    this.world.tick++;
  }

  public stepN(n: number): void {
    for (let i = 0; i < n; i++) {
      this.step();
    }
  }

  private runBehaviourSystem(currentTick: number): void {
    // Check scheduled scenario spawns
    for (let i = 0; i < this.scheduledSpawns.length; i++) {
      const spawn = this.scheduledSpawns[i];
      if (spawn && spawn.tick === currentTick) {
        const actor = spawnScheduledActor(spawn, this.nextActorId++);
        this.actors.push(actor);
        this.events.push({
          tick: currentTick,
          type: 'SCENARIO_ACTOR_SPAWNED',
          payload: { actorId: actor.id, classId: actor.classId },
        });
      }
    }

    // Update behaviour of all actors
    for (let i = 0; i < this.actors.length; i++) {
      const actor = this.actors[i];
      if (!actor) continue;

      const actorRng = this.rng.fork(`actor:${actor.id}`);
      updateActorBehaviour(actor, DT, currentTick, actorRng, (hitActor) => {
        this.events.push({
          tick: currentTick,
          type: 'ASSET_HIT',
          payload: { actorId: hitActor.id, classId: hitActor.classId },
        });
      });
    }

    // Update Phase 0 placeholder entities (for System Check backwards-compat)
    stepWorldKinematics(this.world, DT);
  }

  private runMissionRules(currentTick: number): void {
    if (this.missionState.ended) return;

    // Rule A: Asset was hit
    const assetHit = this.events.some((e) => e.type === 'ASSET_HIT');
    if (assetHit) {
      this.missionState.ended = true;
      this.missionState.reason = 'asset_hit';
      this.events.push({
        tick: currentTick,
        type: 'MISSION_END',
        payload: { reason: 'asset_hit' },
      });
      return;
    }

    // Rule B: All actors resolved
    if (this.actors.length > 0) {
      const allSpawned =
        this.scheduledSpawns.length === 0 ||
        this.scheduledSpawns.every((s) => s.tick <= currentTick);
      if (allSpawned) {
        const allResolved = this.actors.every(
          (a) =>
            a.state === 'neutralized' ||
            a.state === 'impacted' ||
            a.state === 'left_area'
        );

        if (allResolved) {
          this.missionState.ended = true;
          this.missionState.reason = 'all_resolved';
          this.events.push({
            tick: currentTick,
            type: 'MISSION_END',
            payload: { reason: 'all_resolved' },
          });
          return;
        }
      }
    }

    // Rule C: Tick limit 4800 (4 minutes)
    if (currentTick >= 4799) {
      this.missionState.ended = true;
      this.missionState.reason = 'time_limit';
      this.events.push({
        tick: currentTick,
        type: 'MISSION_END',
        payload: { reason: 'time_limit' },
      });
    }
  }

  private applyCommand(command: Command): void {
    const tick = this.world.tick;

    switch (command.type) {
      case 'ACK_TRACK': {
        const payload = command.payload as unknown as AckTrackPayload;
        const track = this.tracks.find((t) => t.trackId === payload.trackId);
        if (track && track.state !== 'dropped') {
          track.acked = true;
          track.ackTick = tick;
          this.events.push({
            tick,
            type: 'TRACK_ACKNOWLEDGED',
            payload: { trackId: track.trackId },
          });
        } else {
          this.events.push({
            tick,
            type: 'COMMAND_REJECTED',
            payload: { reason: 'unknown_or_dropped_track', trackId: payload?.trackId },
          });
        }
        break;
      }

      case 'CLASSIFY_TRACK': {
        const payload = command.payload as unknown as ClassifyTrackPayload;
        const track = this.tracks.find((t) => t.trackId === payload.trackId);
        if (track && track.state !== 'dropped') {
          track.assessedClass = payload.assessedClass;
          track.classifyTick = tick;
          this.events.push({
            tick,
            type: 'TRACK_CLASSIFIED',
            payload: { trackId: track.trackId, assessedClass: payload.assessedClass },
          });
        } else {
          this.events.push({
            tick,
            type: 'COMMAND_REJECTED',
            payload: { reason: 'unknown_or_dropped_track', trackId: payload?.trackId },
          });
        }
        break;
      }

      case 'ENGAGE_TRACK': {
        const payload = command.payload as unknown as EngageTrackPayload;
        tryEngageTrack(
          tick,
          payload.trackId,
          payload.effector,
          this.tracks,
          this.actors,
          this.effectorState,
          this.events
        );
        break;
      }

      case 'HOLD_FIRE': {
        const payload = command.payload as unknown as HoldFirePayload;
        const track = this.tracks.find((t) => t.trackId === payload.trackId);
        if (track && track.state !== 'dropped') {
          track.engagementStatus = 'holding_fire';
          this.events.push({
            tick,
            type: 'HOLD_FIRE_ISSUED',
            payload: { trackId: track.trackId },
          });
        } else {
          this.events.push({
            tick,
            type: 'COMMAND_REJECTED',
            payload: { reason: 'unknown_or_dropped_track', trackId: payload?.trackId },
          });
        }
        break;
      }

      case 'DEV_SPAWN_ACTOR': {
        const payload = command.payload as unknown as DevSpawnActorPayload;
        const actor = createActor(
          this.nextActorId++,
          payload.classId,
          { x: payload.x, y: payload.y, z: payload.z },
          payload.behaviourType === 'ingress_direct'
            ? { type: 'ingress_direct' }
            : {
                type: 'wander',
                headingDeg: 0,
                pitchDeg: 0,
                speed: payload.speed ?? 10,
                lastHeadingChangeTick: tick,
              },
          payload.speed
        );
        this.actors.push(actor);
        this.events.push({
          tick,
          type: 'ACTOR_SPAWNED',
          payload: { actorId: actor.id, classId: actor.classId },
        });
        break;
      }

      case 'SPAWN_ENTITY': {
        const payload = command.payload as SpawnEntityPayload;
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
    return stateHash({
      world: this.world,
      rngMainState: this.rng.getState(),
      forkStates: this.rng.getAllForkStates(),
      actors: this.actors,
      tracks: this.tracks,
      effectorState: this.effectorState,
    });
  }

  public getTraineeView(): TraineeView {
    return buildTraineeView(
      this.world.tick,
      this.tracks,
      this.effectorState,
      this.missionState.ended,
      this.missionState.reason,
      this.events,
      this.world.environment
    );
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
      scenarioId: scenarioId ?? this.scenarioId,
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
      formatVersion: LOG_FORMAT_VERSION,
      seed: this.seed,
      scenarioId: this.scenarioId,
      tick: this.world.tick,
      world: cloneWorld(this.world),
      rngStates: {
        main: this.rng.getState(),
        forks: this.rng.getAllForkStates(),
      },
      pendingCommands: this.pendingCommands.map((c) => ({
        tick: c.tick,
        type: c.type,
        payload: { ...c.payload },
      })),
      executedCommands: this.executedCommands.map((c) => ({
        tick: c.tick,
        type: c.type,
        payload: { ...c.payload },
      })),
      eventLog: this.events.map((e) => ({
        tick: e.tick,
        type: e.type,
        payload: { ...e.payload },
      })),
      actors: this.actors.map((a) => ({
        ...a,
        pos: { ...a.pos },
        vel: { ...a.vel },
        behaviour: JSON.parse(JSON.stringify(a.behaviour)),
      })),
      tracks: this.tracks.map((t) => ({
        ...t,
        estimatedPos: { ...t.estimatedPos },
        estimatedVel: { ...t.estimatedVel },
      })),
      effectorState: {
        jammer: {
          busyUntilTick: this.effectorState.jammer.busyUntilTick,
          currentEngagement: this.effectorState.jammer.currentEngagement
            ? { ...this.effectorState.jammer.currentEngagement }
            : undefined,
        },
        gun: {
          ammo: this.effectorState.gun.ammo,
          busyUntilTick: this.effectorState.gun.busyUntilTick,
          currentEngagement: this.effectorState.gun.currentEngagement
            ? { ...this.effectorState.gun.currentEngagement }
            : undefined,
        },
      },
      missionState: { ...this.missionState },
      nextActorId: this.nextActorId,
      nextTrackId: this.nextTrackId,
    };
  }

  public static restore(snapshot: EngineSnapshot): Engine {
    const engine = new Engine(snapshot.seed, snapshot.scenarioId ?? 'sandbox');
    engine.world = cloneWorld(snapshot.world);
    engine.rng.setState(snapshot.rngStates.main);
    engine.rng.restoreForkStates(snapshot.rngStates.forks);

    engine.pendingCommands = snapshot.pendingCommands.map((c) => ({
      tick: c.tick,
      type: c.type,
      payload: { ...c.payload },
    }));
    engine.executedCommands = snapshot.executedCommands.map((c) => ({
      tick: c.tick,
      type: c.type,
      payload: { ...c.payload },
    }));
    engine.events = snapshot.eventLog.map((e) => ({
      tick: e.tick,
      type: e.type,
      payload: { ...e.payload },
    }));

    engine.actors = snapshot.actors.map((a) => ({
      ...a,
      pos: { ...a.pos },
      vel: { ...a.vel },
      behaviour: JSON.parse(JSON.stringify(a.behaviour)),
    }));
    engine.tracks = snapshot.tracks.map((t) => ({
      ...t,
      estimatedPos: { ...t.estimatedPos },
      estimatedVel: { ...t.estimatedVel },
    }));
    engine.effectorState = {
      jammer: {
        busyUntilTick: snapshot.effectorState.jammer.busyUntilTick,
        currentEngagement: snapshot.effectorState.jammer.currentEngagement
          ? { ...snapshot.effectorState.jammer.currentEngagement }
          : undefined,
      },
      gun: {
        ammo: snapshot.effectorState.gun.ammo,
        busyUntilTick: snapshot.effectorState.gun.busyUntilTick,
        currentEngagement: snapshot.effectorState.gun.currentEngagement
          ? { ...snapshot.effectorState.gun.currentEngagement }
          : undefined,
      },
    };
    engine.missionState = { ...snapshot.missionState };
    engine.nextActorId = snapshot.nextActorId;
    engine.nextTrackId = snapshot.nextTrackId;

    return engine;
  }
}
