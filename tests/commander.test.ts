import { describe, expect, it } from 'vitest';
import { capacityCheck } from '../src/sim/scenarios/capacity.js';
import { Engine } from '../src/sim/core/engine.js';
import { vec3 } from '../src/sim/core/vec.js';
import {
  CommanderSession,
  costExchangeScore,
  generateRaid,
  intelBrief,
  oracleCommander,
  replayCommander,
  scoreRaid,
} from '../src/sim/index.js';

const tiers = ['recruit', 'operator', 'veteran', 'elite'] as const;

describe('Phase 6A multi-site simulator', () => {
  it('generates bounded, separated, capacity-checked sites with diverse tier fingerprints', () => {
    for (const tier of tiers) {
      const fingerprints = new Set<string>();
      for (let seed = 1; seed <= 50; seed++) {
        const raid = generateRaid(`raid-${tier}-${seed}`, tier);
        expect(raid.id).toBe(`raid:v1:${tier}`);
        expect(raid.sites.length).toBeGreaterThanOrEqual(2);
        expect(raid.sites.length).toBeLessThanOrEqual(4);
        fingerprints.add(raid.fingerprint);
        for (const [index, site] of raid.sites.entries()) {
          expect(capacityCheck(raid.schedules[site.id] ?? []).capacityRatio).toBeLessThanOrEqual(1);
          for (const other of raid.sites.slice(index + 1)) {
            const dx = site.mapPosKm.x - other.mapPosKm.x;
            const dy = site.mapPosKm.y - other.mapPosKm.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            expect(distance).toBeGreaterThanOrEqual(8);
            expect(distance).toBeLessThanOrEqual(30);
          }
        }
        expect(intelBrief(raid)).toEqual(intelBrief(generateRaid(`raid-${tier}-${seed}`, tier)));
      }
      expect(fingerprints.size).toBeGreaterThanOrEqual(45);
    }
  });

  it('supports deterministic commander snapshot, restore, and event-log replay without leaking truth', () => {
    const raid = generateRaid('commander-replay-s1', 'operator');
    const session = new CommanderSession(raid);
    session.step(oracleCommander(session.view(), raid));
    for (let i = 0; i < 100; i++) session.step();
    expect(JSON.stringify(session.view())).not.toContain('actorId');
    const restored = CommanderSession.restore(session.snapshot());
    expect(restored.getHash()).toBe(session.getHash());
    restored.runToEnd();
    const report = scoreRaid(restored);
    expect(report.scoreVersion).toBe('raid-1.0');
    expect(report.sites.every((site) => site.scoreSessionV2.total >= 0)).toBe(true);
    const replayHash = replayCommander(raid, restored.getSessionLog());
    expect(replayHash).toBe(restored.getHash());
  });

  it('uses the specified piecewise CER curve and never rewards more spend on the same destroyed cost', () => {
    expect(costExchangeScore(1, 10, 10, 0)).toBe(100);
    expect(costExchangeScore(5, 10, 50, 0)).toBe(60);
    expect(costExchangeScore(10, 10, 100, 0)).toBe(30);
    expect(costExchangeScore(20, 10, 200, 0)).toBe(0);
    expect(costExchangeScore(10, 10, 100, 0)).toBeLessThan(costExchangeScore(5, 10, 50, 0));
    expect(costExchangeScore(0, 0, 1, 0)).toBe(0);
    expect(costExchangeScore(0, 0, 0, 0)).toBe(100);
    const cheapDecoyCost = 0.5;
    const noMissileCer = 0 / cheapDecoyCost;
    const oneMissileCer = 40 / cheapDecoyCost;
    expect(costExchangeScore(oneMissileCer, cheapDecoyCost, 40, 0)).toBeLessThan(costExchangeScore(noMissileCer, cheapDecoyCost, 0, 0));
  });

  it('keeps a one-site no-command run equivalent to a configured standalone Engine', () => {
    const raid = {
      id: 'raid:v1:recruit', seed: 'one-site', tier: 'recruit' as const,
      sites: [{ id: 'S1', name: 'Training Site', valueUnits: 100, mapPosKm: { x: 0, y: 0 }, inventory: { gunAmmo: 0, missiles: 0 }, roe: 'standard' as const, missileAuth: 'hold' as const }],
      schedules: { S1: [] }, totalPool: { gunAmmo: 20, missiles: 2, reserve: { gunAmmo: 20, missiles: 2 } },
      mainEffortSiteId: 'S1', feintSiteIds: [], ewLevel: 'none' as const, fingerprint: 'one-site',
    };
    const session = new CommanderSession(raid);
    const standalone = new Engine(raid.seed, 'sandbox', [], { assetHitEndsMission: false, missionEndWhenAllResolved: false, inventory: { gunAmmo: 0, missiles: 0 }, ewLevel: 'none' });
    session.step();
    standalone.step();
    expect(session.engineForReport('S1')?.getHash()).toBe(standalone.getHash());
  });

  it('validates commands without throwing and delivers reserve stock after distance times three seconds', () => {
    const raid = {
      id: 'raid:v1:recruit', seed: 'retask', tier: 'recruit' as const,
      sites: [
        { id: 'S1', name: 'Site 1', valueUnits: 100, mapPosKm: { x: 0, y: 0 }, inventory: { gunAmmo: 0, missiles: 0 }, roe: 'standard' as const, missileAuth: 'hold' as const },
        { id: 'S2', name: 'Site 2', valueUnits: 100, mapPosKm: { x: 8, y: 0 }, inventory: { gunAmmo: 0, missiles: 0 }, roe: 'standard' as const, missileAuth: 'hold' as const },
      ],
      schedules: { S1: [], S2: [] }, totalPool: { gunAmmo: 40, missiles: 4, reserve: { gunAmmo: 40, missiles: 4 } },
      mainEffortSiteId: 'S1', feintSiteIds: ['S2'], ewLevel: 'none' as const, fingerprint: 'retask',
    };
    const session = new CommanderSession(raid);
    session.step([{ type: 'ALLOCATE', tick: 0, payload: { siteId: 'S1', gunAmmo: 10, missiles: 0 } }]);
    session.step([{ type: 'RETASK_RESERVE', tick: 1, payload: { toSiteId: 'S2', item: 'gunAmmo', amount: 2 } }]);
    for (let i = 0; i < 479; i++) session.step();
    expect(session.view().sites.find((site) => site.siteId === 'S2')?.inventory.gunAmmo).toBe(0);
    session.step();
    expect(session.view().sites.find((site) => site.siteId === 'S2')?.inventory.gunAmmo).toBe(2);
    expect(() => session.step([{ type: 'SET_ROE', tick: session.tick, payload: { siteId: 'missing', roe: 'free' } }])).not.toThrow();
    expect(session.events.some((event) => event.type === 'COMMAND_REJECTED')).toBe(true);
  });

  it('counts each asset impact as 20% damage and scores a hand-calculated raid ledger', () => {
    const raid = {
      id: 'raid:v1:recruit', seed: 'asset-hit-ledger', tier: 'recruit' as const,
      sites: [{ id: 'S1', name: 'Training Site', valueUnits: 100, mapPosKm: { x: 0, y: 0 }, inventory: { gunAmmo: 0, missiles: 0 }, roe: 'standard' as const, missileAuth: 'hold' as const }],
      schedules: { S1: [0, 1].map((actorIndex) => ({ tick: 0, classId: 'fpv_kamikaze' as const, pos: vec3(actorIndex, 10, 50), behaviourType: 'ingress_direct' as const, speed: 25, role: 'striker' as const })) },
      totalPool: { gunAmmo: 20, missiles: 2, reserve: { gunAmmo: 20, missiles: 2 } },
      mainEffortSiteId: 'S1', feintSiteIds: [], ewLevel: 'none' as const, fingerprint: 'asset-hit-ledger',
    };
    const session = new CommanderSession(raid);
    session.step();
    const report = scoreRaid(session);
    expect(session.engineForReport('S1')?.missionState.assetHitCount).toBe(2);
    expect(report.sites[0]?.hits).toBe(2);
    expect(report.sites[0]?.damagePercent).toBe(40);
    expect(report.sites[0]?.defenderSpend).toBe(0);
    expect(report.sites[0]?.attackerCostDestroyed).toBe(0);
    expect(report.subscores.assetPreservation).toBe(60);
    expect(report.subscores.costExchange).toBe(0);
    expect(report.subscores.resourceManagement).toBe(50);
    expect(report.total).toBe(45);
  });
});
