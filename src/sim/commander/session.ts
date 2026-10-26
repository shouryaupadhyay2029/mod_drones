// Deterministic multi-site commander simulation; all public views omit actor identity and truth.
import { canonicalStringify, cyrb53 } from '../core/hash.js';
import { Engine } from '../core/engine.js';
import { Rng } from '../core/rng.js';
import { Command, EngineSnapshot, SimEvent } from '../core/types.js';
import { referenceOperator } from '../bots/referenceOperator.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { TraineeView } from '../view/traineeView.js';
import {
  CommanderCommand,
  CommanderLog,
  CommanderSite,
  CommanderSiteView,
  CommanderView,
  CommsStatus,
  RaidPlan,
  SiteIntel,
  SiteLinkState,
} from './types.js';
import { intelBrief } from './generateRaid.js';
import { scoreRaid } from './scoreRaid.js';

interface PendingTransfer {
  toSiteId: string;
  item: 'gunAmmo' | 'missiles';
  amount: number;
  dueTick: number;
}

interface InFlightCommand {
  command: CommanderCommand;
  siteId: string;
  dispatchTick: number;
  deliveryTick: number;
}

interface CommsWindow {
  startTick: number;
  endTick: number;
  status: CommsStatus;
  latencyTicks: number;
}

interface CachedSiteTelemetry {
  capturedAtTick: number;
  status: 'green' | 'amber' | 'red';
  confirmedInboundCount: number;
  inventory: { gunAmmo: number; missiles: number };
  allocated: { gunAmmo: number; missiles: number };
  lastEngagementResult?: string;
  damagePercent: number;
  operatorView: TraineeView;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface CommanderSnapshot {
  formatVersion: 1;
  raid: RaidPlan;
  tick: number;
  siteSnapshots: Record<string, EngineSnapshot>;
  spawnCursors: Record<string, number>;
  allocatedSiteIds: string[];
  commands: CommanderLog['commands'];
  events: SimEvent[];
  pendingTransfers: PendingTransfer[];
  pool: RaidPlan['totalPool'];
}

function cloneCommand(command: CommanderCommand): CommanderCommand {
  const payload = command.payload && typeof command.payload === 'object' ? command.payload : {};
  return { ...command, payload: { ...payload } } as CommanderCommand;
}

function distanceKm(site: CommanderSite): number {
  return Math.sqrt(site.mapPosKm.x * site.mapPosKm.x + site.mapPosKm.y * site.mapPosKm.y);
}

function normalizeLinkState(state: SiteLinkState): SiteLinkState {
  if (state.status === 'nominal') {
    return { status: 'nominal', latencyTicks: 0 };
  }
  if (state.status === 'offline') {
    return { status: 'offline', latencyTicks: Number.POSITIVE_INFINITY };
  }
  const latency = Number.isFinite(state.latencyTicks) && state.latencyTicks > 0
    ? Math.floor(state.latencyTicks)
    : 20;
  return { status: 'degraded', latencyTicks: latency };
}

export function buildCommsSchedule(raid: RaidPlan): Record<string, CommsWindow[]> {
  const commsRng = new Rng(raid.seed).fork('comms');
  const schedules: Record<string, CommsWindow[]> = {};

  for (const site of raid.sites) {
    const siteRng = commsRng.fork(site.id);
    const windows: CommsWindow[] = [];

    if (raid.tier === 'recruit') {
      windows.push({ startTick: 0, endTick: Number.POSITIVE_INFINITY, status: 'nominal', latencyTicks: 0 });
    } else if (raid.tier === 'operator') {
      let cursor = siteRng.int(160, 260);
      windows.push({ startTick: 0, endTick: cursor, status: 'nominal', latencyTicks: 0 });
      while (cursor < 6000) {
        const degradedDur = siteRng.int(80, 140);
        const latency = siteRng.int(20, 35);
        windows.push({ startTick: cursor, endTick: cursor + degradedDur, status: 'degraded', latencyTicks: latency });
        cursor += degradedDur;
        const nominalDur = siteRng.int(300, 480);
        windows.push({ startTick: cursor, endTick: cursor + nominalDur, status: 'nominal', latencyTicks: 0 });
        cursor += nominalDur;
      }
    } else if (raid.tier === 'veteran') {
      let cursor = siteRng.int(120, 200);
      windows.push({ startTick: 0, endTick: cursor, status: 'nominal', latencyTicks: 0 });
      while (cursor < 6000) {
        const degDur1 = siteRng.int(100, 180);
        const lat1 = siteRng.int(30, 50);
        windows.push({ startTick: cursor, endTick: cursor + degDur1, status: 'degraded', latencyTicks: lat1 });
        cursor += degDur1;

        const offDur = siteRng.int(60, 120);
        windows.push({ startTick: cursor, endTick: cursor + offDur, status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
        cursor += offDur;

        const nomDur1 = siteRng.int(180, 280);
        windows.push({ startTick: cursor, endTick: cursor + nomDur1, status: 'nominal', latencyTicks: 0 });
        cursor += nomDur1;

        const degDur2 = siteRng.int(80, 150);
        const lat2 = siteRng.int(25, 45);
        windows.push({ startTick: cursor, endTick: cursor + degDur2, status: 'degraded', latencyTicks: lat2 });
        cursor += degDur2;

        const nomDur2 = siteRng.int(160, 260);
        windows.push({ startTick: cursor, endTick: cursor + nomDur2, status: 'nominal', latencyTicks: 0 });
        cursor += nomDur2;
      }
    } else {
      // elite: extended offline periods, heavy latency (45-60 ticks)
      let cursor = siteRng.int(60, 110);
      windows.push({ startTick: 0, endTick: cursor, status: 'nominal', latencyTicks: 0 });
      while (cursor < 6000) {
        const degDur1 = siteRng.int(120, 200);
        const lat1 = siteRng.int(45, 60);
        windows.push({ startTick: cursor, endTick: cursor + degDur1, status: 'degraded', latencyTicks: lat1 });
        cursor += degDur1;

        const offDur1 = siteRng.int(220, 380);
        windows.push({ startTick: cursor, endTick: cursor + offDur1, status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
        cursor += offDur1;

        const nomDur1 = siteRng.int(70, 130);
        windows.push({ startTick: cursor, endTick: cursor + nomDur1, status: 'nominal', latencyTicks: 0 });
        cursor += nomDur1;

        const degDur2 = siteRng.int(100, 180);
        const lat2 = siteRng.int(45, 60);
        windows.push({ startTick: cursor, endTick: cursor + degDur2, status: 'degraded', latencyTicks: lat2 });
        cursor += degDur2;

        const offDur2 = siteRng.int(200, 340);
        windows.push({ startTick: cursor, endTick: cursor + offDur2, status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
        cursor += offDur2;

        const nomDur2 = siteRng.int(80, 140);
        windows.push({ startTick: cursor, endTick: cursor + nomDur2, status: 'nominal', latencyTicks: 0 });
        cursor += nomDur2;
      }
    }

    schedules[site.id] = windows;
  }

  return schedules;
}

export class CommanderSession {
  public readonly raid: RaidPlan;
  private readonly initialRaid: RaidPlan;
  public tick = 0;
  public readonly events: SimEvent[] = [];
  public readonly linkStates: Record<string, SiteLinkState> = {};
  private readonly commsSchedule: Record<string, CommsWindow[]>;
  private readonly lastScheduledStates = new Map<string, SiteLinkState>();
  private readonly manualLinkOverrides = new Set<string>();
  private readonly engines = new Map<string, Engine>();
  private readonly spawnCursors = new Map<string, number>();
  private readonly allocatedSiteIds = new Set<string>();
  private readonly commands: CommanderLog['commands'] = [];
  private readonly pendingTransfers: PendingTransfer[] = [];
  private inFlightCommands: InFlightCommand[] = [];
  private readonly siteTelemetryHistory = new Map<string, Map<number, CachedSiteTelemetry>>();
  private readonly lastKnownTelemetry = new Map<string, CachedSiteTelemetry>();
  private pool: RaidPlan['totalPool'];
  private pending: CommanderCommand[] = [];
  private readonly intel: SiteIntel[];

  constructor(raid: RaidPlan) {
    this.initialRaid = cloneValue(raid);
    this.raid = cloneValue(this.initialRaid);
    this.pool = cloneValue(this.raid.totalPool);
    this.intel = intelBrief(this.raid);
    this.commsSchedule = buildCommsSchedule(this.raid);
    for (const site of this.raid.sites) {
      this.engines.set(site.id, new Engine(this.raid.seed, 'sandbox', [], {
        assetHitEndsMission: false,
        missionEndWhenAllResolved: true,
        inventory: { gunAmmo: 0, missiles: 0 },
        ewLevel: raid.ewLevel,
      }));
      this.spawnCursors.set(site.id, 0);
      const initialLink = this.scheduledLinkStateAt(site.id, 0);
      this.linkStates[site.id] = { ...initialLink };
      this.lastScheduledStates.set(site.id, { ...initialLink });
      this.siteTelemetryHistory.set(site.id, new Map());
    }
    this.recordTelemetryAtCurrentTick();
  }

  public getLinkState(siteId: string): SiteLinkState {
    const raw = this.linkStates[siteId];
    if (!raw) return { status: 'nominal', latencyTicks: 0 };
    return normalizeLinkState(raw);
  }

  public setLinkState(siteId: string, state: SiteLinkState): void {
    const normalized = normalizeLinkState(state);
    this.manualLinkOverrides.add(siteId);
    this.linkStates[siteId] = normalized;
  }

  private scheduledLinkStateAt(siteId: string, tick: number): SiteLinkState {
    const windows = this.commsSchedule[siteId] ?? [];
    const found = windows.find((w) => tick >= w.startTick && tick < w.endTick);
    if (!found) return { status: 'nominal', latencyTicks: 0 };
    return { status: found.status, latencyTicks: found.latencyTicks };
  }

  private syncLinkStatesForTick(tick: number): void {
    for (const site of this.raid.sites) {
      const current = this.linkStates[site.id];
      const lastSched = this.lastScheduledStates.get(site.id);
      if (!this.manualLinkOverrides.has(site.id) && current && lastSched) {
        if (current.status !== lastSched.status || current.latencyTicks !== lastSched.latencyTicks) {
          this.manualLinkOverrides.add(site.id);
        }
      }
      if (this.manualLinkOverrides.has(site.id)) {
        this.linkStates[site.id] = this.getLinkState(site.id);
      } else {
        const next = this.scheduledLinkStateAt(site.id, tick);
        this.linkStates[site.id] = { ...next };
        this.lastScheduledStates.set(site.id, { ...next });
      }
    }
  }

  public enqueue(command: CommanderCommand): void {
    const cloned = cloneCommand(command);
    cloned.tick = Math.max(this.tick, Number.isFinite(cloned.tick) ? Math.floor(cloned.tick) : this.tick);
    this.pending.push(cloned);
    this.pending.sort((a, b) => a.tick - b.tick);
  }

  public step(commands: readonly CommanderCommand[] = []): void {
    this.syncLinkStatesForTick(this.tick);
    for (const command of commands) this.enqueue(command);
    for (const site of this.raid.sites) this.spawnScheduledActors(site);
    this.deliverTransfers();

    // 1. Dispatch commands scheduled for this tick
    while (this.pending.length > 0 && (this.pending[0]?.tick ?? Number.POSITIVE_INFINITY) <= this.tick) {
      const command = this.pending.shift();
      if (command) {
        this.dispatchCommanderCommand(command);
      }
    }

    // 2. Deliver any in-flight commands whose deliveryTick has been reached
    this.deliverInFlightCommands();

    // 3. Unattended tick-0 default allocation if no ALLOCATE command was dispatched
    if (
      this.tick === 0 &&
      this.allocatedSiteIds.size === 0 &&
      !this.inFlightCommands.some((item) => item.command.type === 'ALLOCATE')
    ) {
      const gunForSites = Math.floor(this.raid.totalPool.gunAmmo * 0.4);
      const missilesForSites = Math.floor(this.raid.totalPool.missiles * 0.4);
      for (const [index, site] of this.raid.sites.entries()) {
        this.applyCommanderCommand(
          {
            type: 'ALLOCATE',
            tick: 0,
            dispatchTick: 0,
            deliveryTick: 0,
            payload: {
              siteId: site.id,
              gunAmmo: Math.floor(gunForSites / this.raid.sites.length) + (index < gunForSites % this.raid.sites.length ? 1 : 0),
              missiles: Math.floor(missilesForSites / this.raid.sites.length) + (index < missilesForSites % this.raid.sites.length ? 1 : 0),
            },
          },
          0,
          0,
          true,
        );
      }
    }

    // 4. Step site engines
    for (const site of this.raid.sites) {
      const engine = this.engines.get(site.id);
      if (!engine) continue;
      const view = engine.getTraineeView();
      const automatic = this.siteOperator(site, view);
      for (const command of automatic) engine.enqueueCommand(command);
      engine.step();
      const linkStatus = this.getLinkState(site.id).status;
      for (const event of engine.getEvents()) {
        if (event.tick === this.tick && (event.type === 'ENGAGEMENT_STARTED' || event.type === 'ENGAGEMENT_RESOLVED' || event.type === 'ASSET_HIT')) {
          this.events.push({ tick: this.tick, type: `SITE_${event.type}`, payload: { siteId: site.id, linkStatus, ...event.payload } });
        }
      }
    }

    this.tick++;
    this.syncLinkStatesForTick(this.tick);
    this.recordTelemetryAtCurrentTick();
  }

  private dispatchCommanderCommand(command: CommanderCommand): void {
    const dispatchTick = this.tick;
    const payload = command.payload && typeof command.payload === 'object'
      ? (command.payload as unknown as Record<string, unknown>)
      : {};
    const siteId = typeof payload.siteId === 'string'
      ? payload.siteId
      : typeof payload.toSiteId === 'string'
      ? payload.toSiteId
      : undefined;
    const site = siteId ? this.raid.sites.find((candidate) => candidate.id === siteId) : undefined;

    if (site) {
      const link = this.getLinkState(site.id);
      if (link.status === 'offline' || !Number.isFinite(link.latencyTicks)) {
        this.commands.push({
          tick: dispatchTick,
          dispatchTick,
          deliveryTick: null,
          siteId: site.id,
          type: command.type,
          payload: { ...payload },
          rejected: true,
          reason: 'Link offline',
        });
        this.events.push({
          tick: dispatchTick,
          type: 'COMMAND_REJECTED',
          payload: {
            commandType: command.type,
            siteId: site.id,
            reason: 'Link offline',
            dispatchTick,
          },
        });
        return;
      }

      const latencyTicks = Math.max(0, Math.floor(link.latencyTicks));
      const deliveryTick = dispatchTick + latencyTicks;
      const stamped: CommanderCommand = {
        ...cloneCommand(command),
        tick: dispatchTick,
        dispatchTick,
        deliveryTick,
      };
      this.commands.push({
        tick: dispatchTick,
        dispatchTick,
        deliveryTick,
        siteId: site.id,
        type: command.type,
        payload: { ...payload },
      });
      this.inFlightCommands.push({
        command: stamped,
        siteId: site.id,
        dispatchTick,
        deliveryTick,
      });
      return;
    }

    // Unknown or missing site: record and pass immediately to applyCommanderCommand for rejection
    const stamped: CommanderCommand = {
      ...cloneCommand(command),
      tick: dispatchTick,
      dispatchTick,
      deliveryTick: dispatchTick,
    };
    this.commands.push({
      tick: dispatchTick,
      dispatchTick,
      deliveryTick: dispatchTick,
      siteId,
      type: command.type,
      payload: { ...payload },
    });
    this.inFlightCommands.push({
      command: stamped,
      siteId: siteId ?? '',
      dispatchTick,
      deliveryTick: dispatchTick,
    });
  }

  private deliverInFlightCommands(): void {
    const remaining: InFlightCommand[] = [];
    for (const item of this.inFlightCommands) {
      if (item.deliveryTick <= this.tick) {
        try {
          this.applyCommanderCommand(item.command, item.dispatchTick, item.deliveryTick, false);
        } catch {
          this.events.push({ tick: this.tick, type: 'COMMAND_REJECTED', payload: { reason: 'invalid_command_payload' } });
        }
      } else {
        remaining.push(item);
      }
    }
    this.inFlightCommands = remaining;
  }

  public runToEnd(maxTicks = 4800): void {
    while (!this.isComplete() && this.tick < maxTicks) this.step();
  }

  public isComplete(): boolean {
    return this.raid.sites.every((site) => {
      const engine = this.engines.get(site.id);
      const schedule = this.raid.schedules[site.id] ?? [];
      return !!engine && (this.spawnCursors.get(site.id) ?? 0) >= schedule.length && engine.actors.every((actor) => actor.state !== 'active');
    });
  }

  public view(): CommanderView {
    return {
      tick: this.tick,
      raidId: this.raid.id,
      sites: this.raid.sites.map((site) => this.siteView(site)),
      totalPool: cloneValue(this.pool),
      intel: this.intel.map((item) => ({ ...item })),
      pendingTransfers: this.pendingTransfers.map((transfer) => ({ ...transfer })),
      pendingCommands: this.inFlightCommands.map((item) => ({
        type: item.command.type,
        siteId: item.siteId,
        dispatchTick: item.dispatchTick,
        deliveryTick: item.deliveryTick,
        payload: { ...(item.command.payload as unknown as Record<string, unknown>) },
      })),
    };
  }

  public getSessionLog(): CommanderLog {
    return {
      formatVersion: 1,
      raidId: this.raid.id,
      seed: this.raid.seed,
      tier: this.raid.tier,
      commands: this.commands.map((command) => ({ ...command, payload: { ...command.payload } })),
      totalTicks: this.tick,
    };
  }

  public snapshot(): CommanderSnapshot {
    const siteSnapshots: Record<string, EngineSnapshot> = {};
    for (const [siteId, engine] of this.engines) siteSnapshots[siteId] = engine.snapshot();
    return {
      formatVersion: 1,
      raid: cloneValue(this.initialRaid),
      tick: this.tick,
      siteSnapshots,
      spawnCursors: Object.fromEntries(this.spawnCursors),
      allocatedSiteIds: [...this.allocatedSiteIds],
      commands: this.getSessionLog().commands,
      events: this.events.map((event) => ({ ...event, payload: { ...event.payload } })),
      pendingTransfers: this.pendingTransfers.map((transfer) => ({ ...transfer })),
      pool: cloneValue(this.pool),
    };
  }

  public static restore(snapshot: CommanderSnapshot): CommanderSession {
    const session = new CommanderSession(snapshot.raid);
    for (const command of snapshot.commands) {
      session.enqueue({ type: command.type, tick: command.tick, payload: command.payload } as CommanderCommand);
    }
    while (session.tick < snapshot.tick) session.step();
    return session;
  }

  public getHash(): string {
    const siteHashes = this.raid.sites.map((site) => [site.id, this.engines.get(site.id)?.getHash() ?? '']);
    const linkSummary = this.raid.sites.map((site) => {
      const link = this.getLinkState(site.id);
      return [site.id, link.status, Number.isFinite(link.latencyTicks) ? link.latencyTicks : 'inf'];
    });
    return cyrb53(
      canonicalStringify({
        raid: this.raid.fingerprint,
        tier: this.raid.tier,
        tick: this.tick,
        siteHashes,
        linkSummary,
        commands: this.commands,
        inFlight: this.inFlightCommands,
        events: this.events,
        transfers: this.pendingTransfers,
        pool: this.pool,
      }),
    );
  }

  public engineForReport(siteId: string): Engine | undefined {
    return this.engines.get(siteId);
  }

  private captureLiveTelemetry(site: CommanderSite): CachedSiteTelemetry {
    const engine = this.engines.get(site.id)!;
    const operatorView = cloneValue(engine.getTraineeView());
    const inbound = operatorView.tracks.filter((track) => track.state === 'confirmed' && (track.closingRateMps ?? 0) < 0).length;
    const hitCount = engine.getEvents().filter((event) => event.type === 'ASSET_HIT').length;
    const damagePercent = Math.min(100, hitCount * 20);
    const lastEvent = [...engine.getEvents()].reverse().find((event) => event.type === 'ENGAGEMENT_RESOLVED');
    const status = damagePercent >= 60 ? 'red' : damagePercent > 0 || inbound > 0 ? 'amber' : 'green';
    return {
      capturedAtTick: this.tick,
      status,
      confirmedInboundCount: inbound,
      inventory: {
        gunAmmo: engine.effectorState.gun.ammo,
        missiles: engine.effectorState.missile?.ammo ?? 0,
      },
      allocated: { ...site.inventory },
      lastEngagementResult: typeof lastEvent?.payload?.result === 'string' ? lastEvent.payload.result : undefined,
      damagePercent,
      operatorView,
    };
  }

  private recordTelemetryAtCurrentTick(): void {
    for (const site of this.raid.sites) {
      const live = this.captureLiveTelemetry(site);
      let history = this.siteTelemetryHistory.get(site.id);
      if (!history) {
        history = new Map();
        this.siteTelemetryHistory.set(site.id, history);
      }
      history.set(this.tick, live);

      const link = this.getLinkState(site.id);
      if (link.status === 'nominal') {
        this.lastKnownTelemetry.set(site.id, live);
      } else if (link.status === 'degraded') {
        const delayedTick = Math.max(0, this.tick - Math.floor(link.latencyTicks));
        const delayed = history.get(delayedTick) ?? live;
        const prevKnown = this.lastKnownTelemetry.get(site.id);
        if (!prevKnown || delayed.capturedAtTick >= prevKnown.capturedAtTick) {
          this.lastKnownTelemetry.set(site.id, delayed);
        }
      } else if (!this.lastKnownTelemetry.has(site.id)) {
        // Offline at tick 0 fallback
        this.lastKnownTelemetry.set(site.id, live);
      }
    }
  }

  private siteView(site: CommanderSite): CommanderSiteView {
    const link = this.getLinkState(site.id);
    const history = this.siteTelemetryHistory.get(site.id);
    const live = this.captureLiveTelemetry(site);
    if (history) {
      history.set(this.tick, live);
    }

    let telemetry: CachedSiteTelemetry;
    let dataAgeTicks: number;
    let reportLatencyTicks: number;

    if (link.status === 'nominal') {
      telemetry = live;
      this.lastKnownTelemetry.set(site.id, live);
      dataAgeTicks = 0;
      reportLatencyTicks = 0;
    } else if (link.status === 'degraded') {
      const latency = Math.max(0, Math.floor(link.latencyTicks));
      const targetTick = Math.max(0, this.tick - latency);
      const delayed = history?.get(targetTick) ?? this.lastKnownTelemetry.get(site.id) ?? live;
      const prevKnown = this.lastKnownTelemetry.get(site.id);
      if (!prevKnown || delayed.capturedAtTick >= prevKnown.capturedAtTick) {
        this.lastKnownTelemetry.set(site.id, delayed);
      }
      telemetry = this.lastKnownTelemetry.get(site.id) ?? delayed;
      dataAgeTicks = Math.max(0, this.tick - telemetry.capturedAtTick);
      reportLatencyTicks = latency;
    } else {
      // Offline: return last known telemetry without updating it
      const frozen = this.lastKnownTelemetry.get(site.id) ?? live;
      if (!this.lastKnownTelemetry.has(site.id)) {
        this.lastKnownTelemetry.set(site.id, frozen);
      }
      telemetry = frozen;
      dataAgeTicks = Math.max(0, this.tick - telemetry.capturedAtTick);
      reportLatencyTicks = Number.POSITIVE_INFINITY;
    }

    return {
      siteId: site.id,
      valueUnits: site.valueUnits,
      threatBand: this.intel.find((item) => item.siteId === site.id)?.threatBand ?? 'low',
      status: telemetry.status,
      confirmedInboundCount: telemetry.confirmedInboundCount,
      inventory: { ...telemetry.inventory },
      allocated: { ...telemetry.allocated },
      lastEngagementResult: telemetry.lastEngagementResult,
      damagePercent: telemetry.damagePercent,
      reportLatencyTicks,
      linkStatus: link.status,
      linkState: { status: link.status, latencyTicks: link.latencyTicks },
      latencyTicks: link.latencyTicks,
      dataAgeTicks,
      operatorView: cloneValue(telemetry.operatorView),
    };
  }

  private spawnScheduledActors(site: CommanderSite): void {
    const engine = this.engines.get(site.id)!;
    const schedule = this.raid.schedules[site.id] ?? [];
    let cursor = this.spawnCursors.get(site.id) ?? 0;
    while (cursor < schedule.length && (schedule[cursor]?.tick ?? Number.POSITIVE_INFINITY) <= this.tick) {
      const spawn = schedule[cursor]!;
      const command: Command = {
        tick: spawn.tick,
        type: 'DEV_SPAWN_ACTOR',
        payload: {
          classId: spawn.classId,
          x: spawn.pos.x,
          y: spawn.pos.y,
          z: spawn.pos.z,
          speed: spawn.speed,
          behaviourType: spawn.behaviourType,
        },
      };
      engine.enqueueCommand(command);
      cursor++;
    }
    this.spawnCursors.set(site.id, cursor);
  }

  private applyCommanderCommand(
    command: CommanderCommand,
    dispatchTick = this.tick,
    deliveryTick = this.tick,
    recordInLog = false,
  ): void {
    const payload = command.payload as unknown as Record<string, unknown>;
    if (recordInLog) {
      const siteId = typeof payload.siteId === 'string'
        ? payload.siteId
        : typeof payload.toSiteId === 'string'
        ? payload.toSiteId
        : undefined;
      this.commands.push({
        tick: dispatchTick,
        dispatchTick,
        deliveryTick,
        siteId,
        type: command.type,
        payload: { ...payload },
      });
    }
    const reject = (reason: string): void => {
      this.events.push({
        tick: this.tick,
        type: 'COMMAND_REJECTED',
        payload: { commandType: command.type, reason, dispatchTick, deliveryTick },
      });
    };

    if (command.type === 'ALLOCATE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      const engine = site && this.engines.get(site.id);
      const { gunAmmo, missiles } = command.payload;
      if (
        dispatchTick !== 0 ||
        !site ||
        !engine ||
        this.allocatedSiteIds.has(site.id) ||
        !Number.isInteger(gunAmmo) ||
        !Number.isInteger(missiles) ||
        gunAmmo < 0 ||
        missiles < 0 ||
        gunAmmo > this.pool.gunAmmo ||
        missiles > this.pool.missiles
      ) {
        return reject('invalid_allocation');
      }
      this.pool.gunAmmo -= gunAmmo;
      this.pool.missiles -= missiles;
      this.pool.reserve = { gunAmmo: this.pool.gunAmmo, missiles: this.pool.missiles };
      engine.effectorState.gun.ammo = gunAmmo;
      if (engine.effectorState.missile) engine.effectorState.missile.ammo = missiles;
      site.inventory = { gunAmmo, missiles };
      this.allocatedSiteIds.add(site.id);
      this.events.push({
        tick: this.tick,
        type: 'INVENTORY_ALLOCATED',
        payload: { siteId: site.id, gunAmmo, missiles, dispatchTick, deliveryTick },
      });
      return;
    }

    if (command.type === 'SET_ROE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      if (!site) return reject('unknown_site');
      if (!['tight', 'standard', 'free'].includes(command.payload.roe)) return reject('invalid_roe');
      site.roe = command.payload.roe;
      this.events.push({
        tick: this.tick,
        type: 'ROE_UPDATED',
        payload: { siteId: site.id, roe: site.roe, dispatchTick, deliveryTick },
      });
      return;
    }

    if (command.type === 'SET_MISSILE_AUTH') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      if (!site) return reject('unknown_site');
      if (!['hold', 'asset_threat', 'free'].includes(command.payload.auth)) return reject('invalid_missile_auth');
      site.missileAuth = command.payload.auth;
      this.events.push({
        tick: this.tick,
        type: 'MISSILE_AUTH_UPDATED',
        payload: { siteId: site.id, auth: site.missileAuth, dispatchTick, deliveryTick },
      });
      return;
    }

    if (command.type === 'RETASK_RESERVE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.toSiteId);
      const { item, amount } = command.payload;
      if (!site || !['gunAmmo', 'missiles'].includes(item) || !Number.isInteger(amount) || amount <= 0 || amount > this.pool.reserve[item]) {
        return reject('invalid_reserve_transfer');
      }
      this.pool.reserve[item] -= amount;
      this.pool[item] -= amount;
      const dueTick = this.tick + Math.ceil(distanceKm(site) * 60);
      this.pendingTransfers.push({ toSiteId: site.id, item, amount, dueTick });
      this.events.push({
        tick: this.tick,
        type: 'RESERVE_TRANSFER_ORDERED',
        payload: { siteId: site.id, item, amount, dueTick, dispatchTick, deliveryTick },
      });
      return;
    }

    reject('unknown_command');
  }

  private deliverTransfers(): void {
    for (let index = this.pendingTransfers.length - 1; index >= 0; index--) {
      const transfer = this.pendingTransfers[index]!;
      if (transfer.dueTick > this.tick) continue;
      const engine = this.engines.get(transfer.toSiteId);
      if (engine) {
        if (transfer.item === 'gunAmmo') engine.effectorState.gun.ammo += transfer.amount;
        else if (engine.effectorState.missile) engine.effectorState.missile.ammo += transfer.amount;
        this.events.push({
          tick: this.tick,
          type: 'RESERVE_TRANSFER_DELIVERED',
          payload: { siteId: transfer.toSiteId, item: transfer.item, amount: transfer.amount },
        });
      }
      this.pendingTransfers.splice(index, 1);
    }
  }

  private siteOperator(site: CommanderSite, view: TraineeView): Command[] {
    const engine = this.engines.get(site.id);
    const proposed = referenceOperator(view);
    if (site.roe === 'free') {
      const existing = new Set(proposed.filter((command) => command.type === 'ENGAGE_TRACK').map((command) => Number(command.payload.trackId)));
      for (const track of view.tracks) {
        if (track.state !== 'confirmed' || (track.closingRateMps ?? 0) >= -5 || existing.has(track.trackId)) continue;
        const hostile = track.assessedClass && track.assessedClass !== 'unknown' && THREAT_LIBRARY[track.assessedClass].hostile;
        const effector = track.assessedClass && track.assessedClass !== 'unknown' && THREAT_LIBRARY[track.assessedClass].rfControlled && track.rangeM <= 1500
          ? 'jammer'
          : track.rangeM <= 1000 && (engine?.effectorState.gun.ammo ?? 0) > 0
            ? 'gun'
            : hostile && site.missileAuth === 'free' && (engine?.effectorState.missile?.ammo ?? 0) > 0
              ? 'missile'
              : null;
        if (effector) proposed.push({ tick: view.tick, type: 'ENGAGE_TRACK', payload: { trackId: track.trackId, effector } });
      }
    }
    const allowed = proposed.filter((command) => {
      if (command.type !== 'ENGAGE_TRACK') return true;
      const trackId = Number(command.payload.trackId);
      const track = view.tracks.find((candidate) => candidate.trackId === trackId);
      if (!track) return false;
      if (site.roe === 'free') return track.state === 'confirmed' && (track.closingRateMps ?? 0) < -5;
      if (!track.assessedClass || track.assessedClass === 'unknown' || !THREAT_LIBRARY[track.assessedClass].hostile) return false;
      if (site.roe === 'standard') return true;
      const eo = engine?.getTraineeView().eo;
      const eoIdentified = eo?.lockedTrackId === track.trackId && eo.level === 'identify';
      const rfIdentified = track.state === 'confirmed' && track.rfStatus !== 'ambiguous' && (track.rfSignature === 'wideband_video' || track.rfSignature === 'long_range_link');
      return !!eoIdentified || rfIdentified;
    });
    const missile = view.tracks.find((track) => {
      if (!track.assessedClass || track.assessedClass === 'unknown' || !THREAT_LIBRARY[track.assessedClass].hostile || !['fpv_kamikaze', 'fpv_fiber'].includes(track.assessedClass) || track.state !== 'confirmed' || track.engagementStatus === 'engaged') return false;
      if (site.missileAuth === 'hold') return false;
      if (site.missileAuth === 'free') return true;
      const closing = Math.max(0, -(track.closingRateMps ?? 0));
      const timeToImpactTicks = closing > 0 ? track.rangeM / closing * 20 : Number.POSITIVE_INFINITY;
      if (timeToImpactTicks >= 200) return false;
      const jammerReady = Math.max(view.tick, engine?.effectorState.jammer.busyUntilTick ?? 0);
      const gunReady = Math.max(view.tick, engine?.effectorState.gun.busyUntilTick ?? 0);
      const jammerCannotCover = !THREAT_LIBRARY[track.assessedClass].rfControlled || jammerReady > view.tick + timeToImpactTicks || track.rangeM > 1500;
      const gunCannotCover = (engine?.effectorState.gun.ammo ?? 0) <= 0 || gunReady > view.tick + timeToImpactTicks || track.rangeM > 1000;
      return jammerCannotCover && gunCannotCover;
    });
    if (missile && (this.engines.get(site.id)?.effectorState.missile?.ammo ?? 0) > 0) {
      return [
        ...allowed.filter((command) => command.type !== 'ENGAGE_TRACK' || command.payload.trackId !== missile.trackId),
        { tick: view.tick, type: 'ENGAGE_TRACK', payload: { trackId: missile.trackId, effector: 'missile' } },
      ];
    }
    return allowed;
  }
}

export function replayCommander(raid: RaidPlan, log: CommanderLog): string {
  const session = new CommanderSession(raid);
  for (const item of log.commands) {
    session.enqueue({ type: item.type, tick: item.tick, payload: item.payload } as CommanderCommand);
  }
  while (session.tick < log.totalTicks) session.step();
  return session.getHash();
}

export function commanderReport(session: CommanderSession) {
  return scoreRaid(session);
}
