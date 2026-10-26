// Deterministic multi-site commander simulation; all public views omit actor identity and truth.
import { canonicalStringify, cyrb53 } from '../core/hash.js';
import { Engine } from '../core/engine.js';
import { Command, EngineSnapshot, SimEvent } from '../core/types.js';
import { referenceOperator } from '../bots/referenceOperator.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { CommanderCommand, CommanderLog, CommanderSite, CommanderSiteView, CommanderView, RaidPlan, SiteIntel } from './types.js';
import { intelBrief } from './generateRaid.js';
import { scoreRaid } from './scoreRaid.js';

interface PendingTransfer { toSiteId: string; item: 'gunAmmo' | 'missiles'; amount: number; dueTick: number; }
function cloneValue<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
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

export class CommanderSession {
  public readonly raid: RaidPlan;
  private readonly initialRaid: RaidPlan;
  public tick = 0;
  public readonly events: SimEvent[] = [];
  private readonly engines = new Map<string, Engine>();
  private readonly spawnCursors = new Map<string, number>();
  private readonly allocatedSiteIds = new Set<string>();
  private readonly commands: CommanderLog['commands'] = [];
  private readonly pendingTransfers: PendingTransfer[] = [];
  private pool: RaidPlan['totalPool'];
  private pending: CommanderCommand[] = [];
  private readonly intel: SiteIntel[];

  constructor(raid: RaidPlan) {
    this.initialRaid = cloneValue(raid);
    this.raid = cloneValue(this.initialRaid);
    this.pool = cloneValue(this.raid.totalPool);
    this.intel = intelBrief(this.raid);
    for (const site of this.raid.sites) {
      this.engines.set(site.id, new Engine(this.raid.seed, 'sandbox', [], {
        assetHitEndsMission: false,
        missionEndWhenAllResolved: true,
        inventory: { gunAmmo: 0, missiles: 0 },
        ewLevel: raid.ewLevel,
      }));
      this.spawnCursors.set(site.id, 0);
    }
  }

  public enqueue(command: CommanderCommand): void {
    const cloned = cloneCommand(command);
    cloned.tick = Math.max(this.tick, Number.isFinite(cloned.tick) ? Math.floor(cloned.tick) : this.tick);
    this.pending.push(cloned);
    this.pending.sort((a, b) => a.tick - b.tick);
  }

  public step(commands: readonly CommanderCommand[] = []): void {
    for (const command of commands) this.enqueue(command);
    for (const site of this.raid.sites) this.spawnScheduledActors(site);
    this.deliverTransfers();
    while (this.pending.length > 0 && (this.pending[0]?.tick ?? Number.POSITIVE_INFINITY) <= this.tick) {
      const command = this.pending.shift();
      if (command) {
        try {
          this.applyCommanderCommand(command);
        } catch {
          this.events.push({ tick: this.tick, type: 'COMMAND_REJECTED', payload: { reason: 'invalid_command_payload' } });
        }
      }
    }
    if (this.tick === 0 && this.allocatedSiteIds.size === 0) {
      const gunForSites = Math.floor(this.raid.totalPool.gunAmmo * 0.4);
      const missilesForSites = Math.floor(this.raid.totalPool.missiles * 0.4);
      for (const [index, site] of this.raid.sites.entries()) {
        this.applyCommanderCommand({
          type: 'ALLOCATE',
          tick: 0,
          payload: {
            siteId: site.id,
            gunAmmo: Math.floor(gunForSites / this.raid.sites.length) + (index < gunForSites % this.raid.sites.length ? 1 : 0),
            missiles: Math.floor(missilesForSites / this.raid.sites.length) + (index < missilesForSites % this.raid.sites.length ? 1 : 0),
          },
        });
      }
    }
    for (const site of this.raid.sites) {
      const engine = this.engines.get(site.id);
      if (!engine) continue;
      const view = engine.getTraineeView();
      const automatic = this.siteOperator(site, view);
      for (const command of automatic) engine.enqueueCommand(command);
      engine.step();
      for (const event of engine.getEvents()) {
        if (event.tick === this.tick && (event.type === 'ENGAGEMENT_STARTED' || event.type === 'ENGAGEMENT_RESOLVED' || event.type === 'ASSET_HIT')) {
          this.events.push({ tick: this.tick, type: `SITE_${event.type}`, payload: { siteId: site.id, ...event.payload } });
        }
      }
    }
    this.tick++;
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
    };
  }

  public getSessionLog(): CommanderLog {
    return { formatVersion: 1, raidId: this.raid.id, seed: this.raid.seed, tier: this.raid.tier, commands: this.commands.map((command) => ({ ...command, payload: { ...command.payload } })), totalTicks: this.tick };
  }

  public snapshot(): CommanderSnapshot {
    const siteSnapshots: Record<string, EngineSnapshot> = {};
    for (const [siteId, engine] of this.engines) siteSnapshots[siteId] = engine.snapshot();
    return {
      formatVersion: 1, raid: cloneValue(this.initialRaid), tick: this.tick, siteSnapshots,
      spawnCursors: Object.fromEntries(this.spawnCursors), allocatedSiteIds: [...this.allocatedSiteIds],
      commands: this.getSessionLog().commands, events: this.events.map((event) => ({ ...event, payload: { ...event.payload } })),
      pendingTransfers: this.pendingTransfers.map((transfer) => ({ ...transfer })), pool: cloneValue(this.pool),
    };
  }

  public static restore(snapshot: CommanderSnapshot): CommanderSession {
    const session = new CommanderSession(snapshot.raid);
    for (const command of snapshot.commands) session.enqueue({ type: command.type, tick: command.tick, payload: command.payload } as CommanderCommand);
    while (session.tick < snapshot.tick) session.step();
    return session;
  }

  public getHash(): string {
    const siteHashes = this.raid.sites.map((site) => [site.id, this.engines.get(site.id)?.getHash() ?? '']);
    return cyrb53(canonicalStringify({ raid: this.raid.fingerprint, tier: this.raid.tier, tick: this.tick, siteHashes, commands: this.commands, events: this.events, transfers: this.pendingTransfers, pool: this.pool }));
  }

  public engineForReport(siteId: string): Engine | undefined { return this.engines.get(siteId); }

  private siteView(site: CommanderSite): CommanderSiteView {
    const engine = this.engines.get(site.id)!;
    const operatorView = engine.getTraineeView();
    const inbound = operatorView.tracks.filter((track) => track.state === 'confirmed').length;
    const hitCount = engine.getEvents().filter((event) => event.type === 'ASSET_HIT').length;
    const damagePercent = Math.min(100, hitCount * 20);
    const lastEvent = [...engine.getEvents()].reverse().find((event) => event.type === 'ENGAGEMENT_RESOLVED');
    const status = damagePercent >= 60 ? 'red' : damagePercent > 0 || inbound > 0 ? 'amber' : 'green';
    return { siteId: site.id, valueUnits: site.valueUnits, threatBand: this.intel.find((item) => item.siteId === site.id)?.threatBand ?? 'low', status, confirmedInboundCount: inbound, inventory: { gunAmmo: engine.effectorState.gun.ammo, missiles: engine.effectorState.missile?.ammo ?? 0 }, allocated: { ...site.inventory },
      lastEngagementResult: typeof lastEvent?.payload?.result === 'string' ? lastEvent.payload.result : undefined,
      damagePercent, reportLatencyTicks: 0, operatorView };
  }

  private spawnScheduledActors(site: CommanderSite): void {
    const engine = this.engines.get(site.id)!;
    const schedule = this.raid.schedules[site.id] ?? [];
    let cursor = this.spawnCursors.get(site.id) ?? 0;
    while (cursor < schedule.length && (schedule[cursor]?.tick ?? Number.POSITIVE_INFINITY) <= this.tick) {
      const spawn = schedule[cursor]!;
      const command: Command = { tick: spawn.tick, type: 'DEV_SPAWN_ACTOR', payload: { classId: spawn.classId, x: spawn.pos.x, y: spawn.pos.y, z: spawn.pos.z, speed: spawn.speed, behaviourType: spawn.behaviourType } };
      engine.enqueueCommand(command);
      cursor++;
    }
    this.spawnCursors.set(site.id, cursor);
  }

  private applyCommanderCommand(command: CommanderCommand): void {
    const payload = command.payload as unknown as Record<string, unknown>;
    this.commands.push({ tick: this.tick, type: command.type, payload: { ...payload } });
    const reject = (reason: string): void => { this.events.push({ tick: this.tick, type: 'COMMAND_REJECTED', payload: { commandType: command.type, reason } }); };
    if (command.type === 'ALLOCATE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      const engine = site && this.engines.get(site.id);
      const { gunAmmo, missiles } = command.payload;
      if (this.tick !== 0 || !site || !engine || this.allocatedSiteIds.has(site.id) || !Number.isInteger(gunAmmo) || !Number.isInteger(missiles) || gunAmmo < 0 || missiles < 0 || gunAmmo > this.pool.gunAmmo || missiles > this.pool.missiles) return reject('invalid_allocation');
      this.pool.gunAmmo -= gunAmmo; this.pool.missiles -= missiles;
      this.pool.reserve = { gunAmmo: this.pool.gunAmmo, missiles: this.pool.missiles };
      engine.effectorState.gun.ammo = gunAmmo;
      if (engine.effectorState.missile) engine.effectorState.missile.ammo = missiles;
      site.inventory = { gunAmmo, missiles };
      this.allocatedSiteIds.add(site.id);
      this.events.push({ tick: this.tick, type: 'INVENTORY_ALLOCATED', payload: { siteId: site.id, gunAmmo, missiles } });
      return;
    }
    if (command.type === 'SET_ROE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      if (!site) return reject('unknown_site');
      if (!['tight', 'standard', 'free'].includes(command.payload.roe)) return reject('invalid_roe');
      site.roe = command.payload.roe;
      this.events.push({ tick: this.tick, type: 'ROE_UPDATED', payload: { siteId: site.id, roe: site.roe } });
      return;
    }
    if (command.type === 'SET_MISSILE_AUTH') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.siteId);
      if (!site) return reject('unknown_site');
      if (!['hold', 'asset_threat', 'free'].includes(command.payload.auth)) return reject('invalid_missile_auth');
      site.missileAuth = command.payload.auth;
      this.events.push({ tick: this.tick, type: 'MISSILE_AUTH_UPDATED', payload: { siteId: site.id, auth: site.missileAuth } });
      return;
    }
    if (command.type === 'RETASK_RESERVE') {
      const site = this.raid.sites.find((candidate) => candidate.id === command.payload.toSiteId);
      const { item, amount } = command.payload;
      if (!site || !['gunAmmo', 'missiles'].includes(item) || !Number.isInteger(amount) || amount <= 0 || amount > this.pool.reserve[item]) return reject('invalid_reserve_transfer');
      this.pool.reserve[item] -= amount;
      this.pool[item] -= amount;
      const dueTick = this.tick + Math.ceil(distanceKm(site) * 60);
      this.pendingTransfers.push({ toSiteId: site.id, item, amount, dueTick });
      this.events.push({ tick: this.tick, type: 'RESERVE_TRANSFER_ORDERED', payload: { siteId: site.id, item, amount, dueTick } });
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
        this.events.push({ tick: this.tick, type: 'RESERVE_TRANSFER_DELIVERED', payload: { siteId: transfer.toSiteId, item: transfer.item, amount: transfer.amount } });
      }
      this.pendingTransfers.splice(index, 1);
    }
  }

  private siteOperator(site: CommanderSite, view: import('../view/traineeView.js').TraineeView): Command[] {
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
      return [...allowed.filter((command) => command.type !== 'ENGAGE_TRACK' || command.payload.trackId !== missile.trackId), { tick: view.tick, type: 'ENGAGE_TRACK', payload: { trackId: missile.trackId, effector: 'missile' } }];
    }
    return allowed;
  }
}

export function replayCommander(raid: RaidPlan, log: CommanderLog): string {
  const session = new CommanderSession(raid);
  for (const item of log.commands) session.enqueue({ type: item.type, tick: item.tick, payload: item.payload } as CommanderCommand);
  while (session.tick < log.totalTicks) session.step();
  return session.getHash();
}

export function commanderReport(session: CommanderSession) {
  return scoreRaid(session);
}
