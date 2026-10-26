import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CommanderSession,
  RAID_SCORE_WEIGHTS,
  buildCommsSchedule,
  commanderTotalScore,
  generateRaid,
  heuristicCommander,
  replayCommander,
  scoreRaid,
} from '../src/sim/index.js';
import { CommanderConsole } from '../src/app/commander/CommanderConsole.js';
import { CommanderDebrief } from '../src/app/commander/CommanderDebrief.js';

describe('Phase 7 DDIL (Denied, Degraded, Intermittent, and Limited Bandwidth)', () => {
  it('1. Command Delivery: commands to a nominal site arrive instantly (tick 0) and commands to a degraded site arrive at tick + latencyTicks', () => {
    const raid = generateRaid('phase7-cmd-delivery', 'operator');
    const session = new CommanderSession(raid);
    const siteA = raid.sites[0]!;
    const siteB = raid.sites[1]!;
    const allocGun = Math.max(1, Math.floor(raid.totalPool.gunAmmo / 3));

    // Site A is nominal (latencyTicks = 0)
    session.setLinkState(siteA.id, { status: 'nominal', latencyTicks: 0 });
    // Site B is degraded with 30 ticks latency (1.5s)
    session.setLinkState(siteB.id, { status: 'degraded', latencyTicks: 30 });

    session.step([
      { type: 'ALLOCATE', tick: 0, payload: { siteId: siteA.id, gunAmmo: allocGun, missiles: 0 } },
      { type: 'SET_ROE', tick: 0, payload: { siteId: siteA.id, roe: 'free' } },
      { type: 'ALLOCATE', tick: 0, payload: { siteId: siteB.id, gunAmmo: allocGun, missiles: 0 } },
      { type: 'SET_ROE', tick: 0, payload: { siteId: siteB.id, roe: 'tight' } },
    ]);

    // Site A (nominal): delivered immediately at tick 0
    expect(session.raid.sites[0]?.roe).toBe('free');
    expect(session.engineForReport(siteA.id)?.effectorState.gun.ammo).toBe(allocGun);
    const roeEventA = session.events.find(
      (event) => event.type === 'ROE_UPDATED' && event.payload?.siteId === siteA.id,
    );
    expect(roeEventA?.tick).toBe(0);
    expect(roeEventA?.payload?.deliveryTick).toBe(0);

    // Site B (degraded, latency 30): still in flight before tick 30
    expect(session.raid.sites[1]?.roe).toBe('standard');
    expect(session.engineForReport(siteB.id)?.effectorState.gun.ammo).toBe(0);
    expect(session.view().pendingCommands.some((cmd) => cmd.siteId === siteB.id && cmd.deliveryTick === 30)).toBe(true);

    // Step through ticks 1..29: still not delivered at tick 29
    for (let t = 1; t < 30; t++) {
      session.step();
    }
    expect(session.raid.sites[1]?.roe).toBe('standard');
    expect(session.engineForReport(siteB.id)?.effectorState.gun.ammo).toBe(0);

    // Step at tick 30 (0 + latencyTicks): delivered at tick 30
    session.step();
    expect(session.raid.sites[1]?.roe).toBe('tight');
    expect(session.engineForReport(siteB.id)?.effectorState.gun.ammo).toBe(allocGun);
    const roeEventB = session.events.find(
      (event) => event.type === 'ROE_UPDATED' && event.payload?.siteId === siteB.id,
    );
    expect(roeEventB?.tick).toBe(30);
    expect(roeEventB?.payload?.dispatchTick).toBe(0);
    expect(roeEventB?.payload?.deliveryTick).toBe(30);
  });

  it('2. Offline Rejection: commands to an offline site are rejected with COMMAND_REJECTED ("Link offline") and do not affect ROE or inventory', () => {
    const raid = generateRaid('phase7-offline-reject', 'veteran');
    const session = new CommanderSession(raid);
    const site = raid.sites[0]!;

    // Initial nominal allocation at tick 0
    session.step([
      { type: 'ALLOCATE', tick: 0, payload: { siteId: site.id, gunAmmo: 5, missiles: 1 } },
      { type: 'SET_ROE', tick: 0, payload: { siteId: site.id, roe: 'standard' } },
    ]);
    const reserveBefore = { ...session.view().totalPool.reserve };

    // Drop site link to offline
    session.setLinkState(site.id, { status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
    expect(session.getLinkState(site.id).status).toBe('offline');
    expect(session.getLinkState(site.id).latencyTicks).toBe(Number.POSITIVE_INFINITY);

    session.step([
      { type: 'SET_ROE', tick: session.tick, payload: { siteId: site.id, roe: 'free' } },
      { type: 'SET_MISSILE_AUTH', tick: session.tick, payload: { siteId: site.id, auth: 'free' } },
      { type: 'RETASK_RESERVE', tick: session.tick, payload: { toSiteId: site.id, item: 'gunAmmo', amount: 3 } },
    ]);

    const rejections = session.events.filter(
      (event) => event.type === 'COMMAND_REJECTED' && event.payload?.siteId === site.id,
    );
    expect(rejections).toHaveLength(3);
    expect(rejections.every((event) => event.payload?.reason === 'Link offline')).toBe(true);

    // Site ROE, missile auth, site inventory, and reserve remain untouched
    expect(session.raid.sites[0]?.roe).toBe('standard');
    expect(session.raid.sites[0]?.missileAuth).toBe('hold');
    expect(session.engineForReport(site.id)?.effectorState.gun.ammo).toBe(5);
    expect(session.view().totalPool.reserve).toEqual(reserveBefore);
    expect(session.view().pendingTransfers).toHaveLength(0);
    expect(session.view().pendingCommands).toHaveLength(0);
  });

  it('3. Stale View: an offline site freezes its CommanderView track count and inventory while dataAgeTicks strictly increases', () => {
    const raid = generateRaid('phase7-stale-view', 'operator');
    const session = new CommanderSession(raid);
    const site = raid.sites[0]!;

    // Allocate stock and advance while nominal so actors spawn and tracks/engagements evolve
    session.step([
      { type: 'ALLOCATE', tick: 0, payload: { siteId: site.id, gunAmmo: 12, missiles: 2 } },
      { type: 'SET_ROE', tick: 0, payload: { siteId: site.id, roe: 'free' } },
    ]);
    for (let i = 0; i < 120; i++) {
      session.step();
    }

    // Take site offline
    session.setLinkState(site.id, { status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
    const initialOfflineView = session.view().sites.find((s) => s.siteId === site.id)!;
    const frozenTrackCount = initialOfflineView.operatorView.tracks.length;
    const frozenInboundCount = initialOfflineView.confirmedInboundCount;
    const frozenInventory = { ...initialOfflineView.inventory };
    let previousAge = initialOfflineView.dataAgeTicks;

    // Step while site continues fighting locally; CommanderView must stay frozen while dataAgeTicks strictly increases
    for (let stepIdx = 0; stepIdx < 60; stepIdx++) {
      session.step();
      const siteView = session.view().sites.find((s) => s.siteId === site.id)!;
      expect(siteView.linkStatus).toBe('offline');
      expect(siteView.operatorView.tracks.length).toBe(frozenTrackCount);
      expect(siteView.confirmedInboundCount).toBe(frozenInboundCount);
      expect(siteView.inventory).toEqual(frozenInventory);
      expect(siteView.dataAgeTicks).toBeGreaterThan(previousAge);
      previousAge = siteView.dataAgeTicks;
    }
  });

  it('4. Determinism: DDIL schedules, raid hashes, snapshot/restore, and replay remain identical for the same seed', () => {
    for (const tier of ['recruit', 'operator', 'veteran', 'elite'] as const) {
      const raidA = generateRaid(`phase7-det-${tier}`, tier);
      const raidB = generateRaid(`phase7-det-${tier}`, tier);
      expect(buildCommsSchedule(raidA)).toEqual(buildCommsSchedule(raidB));

      const sessionA = new CommanderSession(raidA);
      const sessionB = new CommanderSession(raidB);
      for (let t = 0; t < 350; t++) {
        sessionA.step(heuristicCommander(sessionA.view()));
        sessionB.step(heuristicCommander(sessionB.view()));
      }
      expect(sessionA.getHash()).toBe(sessionB.getHash());
      expect(replayCommander(raidA, sessionA.getSessionLog())).toBe(sessionA.getHash());
    }

    // Verify tier DDIL characteristics
    const recruitSched = Object.values(buildCommsSchedule(generateRaid('tier-check', 'recruit'))).flat();
    expect(recruitSched.every((w) => w.status === 'nominal' && w.latencyTicks === 0)).toBe(true);

    const operatorSched = Object.values(buildCommsSchedule(generateRaid('tier-check', 'operator'))).flat();
    expect(operatorSched.some((w) => w.status === 'degraded' && w.latencyTicks >= 20 && w.latencyTicks <= 60)).toBe(true);
    expect(operatorSched.every((w) => w.status !== 'offline')).toBe(true);

    const veteranSched = Object.values(buildCommsSchedule(generateRaid('tier-check', 'veteran'))).flat();
    expect(veteranSched.some((w) => w.status === 'degraded')).toBe(true);
    expect(veteranSched.some((w) => w.status === 'offline' && w.latencyTicks === Number.POSITIVE_INFINITY)).toBe(true);

    const eliteSched = Object.values(buildCommsSchedule(generateRaid('tier-check', 'elite'))).flat();
    expect(eliteSched.some((w) => w.status === 'offline' && w.endTick - w.startTick >= 200)).toBe(true);
    expect(eliteSched.some((w) => w.status === 'degraded' && w.latencyTicks >= 45)).toBe(true);
  });

  it('5. Component Tests: site cards render STALE DATA text and disable command buttons when offline, and debrief renders Comms Resilience and dropped commands', () => {
    const raid = generateRaid('phase7-ui', 'veteran');
    const session = new CommanderSession(raid);
    const site0 = raid.sites[0]!;
    const site1 = raid.sites[1]!;

    session.step(heuristicCommander(session.view()));
    session.setLinkState(site0.id, { status: 'offline', latencyTicks: Number.POSITIVE_INFINITY });
    session.setLinkState(site1.id, { status: 'degraded', latencyTicks: 50 });

    // Dispatch a command to degraded site1 (queued as Transmitting...) and a command to offline site0 (rejected/dropped)
    session.step([
      { type: 'SET_ROE', tick: session.tick, payload: { siteId: site1.id, roe: 'tight' } },
      { type: 'SET_ROE', tick: session.tick, payload: { siteId: site0.id, roe: 'free' } },
    ]);
    session.step();

    const consoleHtml = renderToStaticMarkup(
      <CommanderConsole
        session={session}
        autopilot={false}
        onAutopilotChange={() => undefined}
        onComplete={() => undefined}
      />,
    );

    expect(consoleHtml).toContain('STALE DATA');
    expect(consoleHtml).toContain('Last contact:');
    expect(consoleHtml).toContain('seconds ago');
    expect(consoleHtml).toContain('Delay: 2.5s');
    expect(consoleHtml).toContain('Transmitting...');
    // Command buttons and selects for the offline site are disabled
    expect(consoleHtml).toContain('title="Site link is offline"');
    expect(consoleHtml).toMatch(/<button[^>]*disabled=""[^>]*title="Site link is offline"[^>]*>\+5 Gun from reserve<\/button>/);
    expect(consoleHtml).toMatch(/<button[^>]*disabled=""[^>]*title="Site link is offline"[^>]*>\+1 Missile from reserve<\/button>/);

    // Verify 45/25/10/10/10 weights and Debrief rendering
    expect(RAID_SCORE_WEIGHTS).toEqual({
      assetPreservation: 0.45,
      costExchange: 0.25,
      resourceManagement: 0.1,
      commandDiscipline: 0.1,
      commsResilience: 0.1,
    });
    expect(commanderTotalScore(100, 100, 100, 100, 50)).toBe(95);

    const report = scoreRaid(session);
    expect(report.subscores.commsResilience).toBeLessThan(100);
    expect(report.decisionCauses).toContain('command_dropped_offline');
    expect(report.droppedCommands).toHaveLength(1);

    const debriefHtml = renderToStaticMarkup(
      <CommanderDebrief report={report} raid={raid} log={session.getSessionLog()} />,
    );
    expect(debriefHtml).toContain('Comms Resilience');
    expect(debriefHtml).toContain('Dropped commands (DDIL)');
    expect(debriefHtml).toContain('SET_ROE');
    expect(debriefHtml).toContain('Link offline');
  });
});
