import { Engine } from './engine.js';
import { EngineSnapshot, SessionLog } from './types.js';

export function migrateSessionLog(value: SessionLog | Record<string, unknown>): SessionLog {
  const raw = value as unknown as SessionLog;
  return {
    formatVersion: 3,
    seed: raw.seed,
    scenarioId: raw.scenarioId,
    commands: (raw.commands ?? []).map((command) => ({
      tick: command.tick,
      type: command.type,
      payload: { ...command.payload },
    })),
    totalTicks: Math.max(0, Math.floor(raw.totalTicks ?? 0)),
    generatorAvoid: raw.generatorAvoid ? [...raw.generatorAvoid] : undefined,
    forkOf: raw.forkOf ? { ...raw.forkOf } : undefined,
    options: raw.options ? {
      assetHitEndsMission: raw.options.assetHitEndsMission ?? true,
      missionEndWhenAllResolved: raw.options.missionEndWhenAllResolved ?? true,
      inventory: { gunAmmo: raw.options.inventory?.gunAmmo ?? 20, missiles: raw.options.inventory?.missiles ?? 0 },
      ewLevel: raw.options.ewLevel,
    } : undefined,
  };
}

export interface ForkSessionResult {
  snapshot: EngineSnapshot;
  parentLog: SessionLog;
}

/** Capture state before commands stamped at the requested tick can run. */
export function forkSession(log: SessionLog, tick: number, parentId?: string): ForkSessionResult {
  const migrated = migrateSessionLog(log);
  const forkTick = Math.max(0, Math.min(migrated.totalTicks, Math.floor(tick)));
  const prefix = migrated.commands.filter((command) => command.tick < forkTick);
  const engine = new Engine(migrated.seed, migrated.scenarioId, migrated.generatorAvoid ?? [], migrated.options);
  for (const command of prefix) engine.enqueueCommand(command);
  engine.stepN(forkTick);
  engine.forkOf = {
    parentId: parentId ?? migrated.forkOf?.parentId ?? `${migrated.scenarioId ?? 'session'}:${migrated.seed}`,
    tick: forkTick,
  };
  return {
    snapshot: engine.snapshot(),
    parentLog: {
      ...migrated,
      commands: prefix.map((command) => ({ ...command, payload: { ...command.payload } })),
      totalTicks: forkTick,
    },
  };
}

export function replay(log: SessionLog): string {
  const migrated = migrateSessionLog(log);
  const engine = new Engine(migrated.seed, migrated.scenarioId, migrated.generatorAvoid ?? [], migrated.options);

  for (let i = 0; i < migrated.commands.length; i++) {
    const cmd = migrated.commands[i];
    if (cmd) {
      engine.enqueueCommand({
        tick: cmd.tick,
        type: cmd.type,
        payload: { ...cmd.payload },
      });
    }
  }

  while (engine.world.tick < migrated.totalTicks) {
    engine.step();
  }

  return engine.getHash();
}
