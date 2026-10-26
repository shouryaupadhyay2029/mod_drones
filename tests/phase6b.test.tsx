import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommanderSession, generateRaid, scoreRaid, heuristicCommander, preventedDamageForMissileKill, costExchangeScore, commanderTotalScore } from '../src/sim/index.js';
import { CommanderSetup, buildCommanderSetupCommands } from '../src/app/commander/CommanderSetup.js';
import { CommanderConsole } from '../src/app/commander/CommanderConsole.js';
import { CommanderDebrief } from '../src/app/commander/CommanderDebrief.js';

function configuredSession(seed: string, roe: 'tight' | 'free'): CommanderSession {
  const raid = generateRaid(seed, 'veteran');
  const session = new CommanderSession(raid);
  const gun = Math.floor(raid.totalPool.gunAmmo / raid.sites.length);
  const commands = raid.sites.map((site, i) => ({ type: 'ALLOCATE' as const, tick: 0, payload: { siteId: site.id, gunAmmo: i === raid.sites.length - 1 ? raid.totalPool.gunAmmo - gun * i : gun, missiles: 0 } }))
    .concat(raid.sites.map((site) => ({ type: 'SET_ROE' as const, tick: 0, payload: { siteId: site.id, roe } })));
  session.step(commands);
  return session;
}

describe('Phase 6B commander', () => {
  it('changes the prevention ledger only for a timely missile kill with no available cover', () => {
    expect(preventedDamageForMissileKill(200, 11.9, true, true, false, false)).toBe(40);
    expect(preventedDamageForMissileKill(200, 12, true, true, false, false)).toBe(0);
    expect(preventedDamageForMissileKill(200, 8, true, true, true, false)).toBe(0);
    const prevented = preventedDamageForMissileKill(200, 8, true, true, false, false);
    const savedCer = 40 / (2 + prevented);
    const savedTotal = commanderTotalScore(100, costExchangeScore(savedCer, 2 + prevented, 40, 0), 100, 100);
    const hitTotal = commanderTotalScore(80, costExchangeScore(0, 0, 0, 1), 100, 100);
    expect(savedTotal).toBeGreaterThan(hitTotal);
  });

  it('produces different engagement counts under tight and free ROE on the same deterministic raid', () => {
    const tight = configuredSession('phase6b-roe-same-seed', 'tight');
    const free = configuredSession('phase6b-roe-same-seed', 'free');
    tight.runToEnd(4200);
    free.runToEnd(4200);
    const count = (session: CommanderSession): number => session.raid.sites.reduce((n, site) => n + (session.engineForReport(site.id)?.getEvents().filter((event) => event.type === 'ENGAGEMENT_STARTED').length ?? 0), 0);
    expect(count(tight)).not.toBe(count(free));
  });

  it('uses only the four standard raid grades and keeps truth out of the view', () => {
    const session = new CommanderSession(generateRaid('phase6b-grade', 'recruit'));
    session.runToEnd(4200);
    expect(['Unsatisfactory', 'Marginal', 'Competent', 'Proficient']).toContain(scoreRaid(session).grade);
    const view = JSON.stringify(session.view());
    expect(view).not.toContain('mainEffortSiteId');
    expect(view).not.toContain('schedules');
    expect(view).not.toContain('classId');
  });

  it('renders setup allocation, live commander controls, and debrief ledger/site summaries', () => {
    const setup = renderToStaticMarkup(<CommanderSetup onLaunch={() => undefined} />);
    expect(setup).toContain('Intel briefing');
    expect(setup).toContain('allocation weight');
    expect(setup).toContain('LAUNCH RAID');

    const raid = generateRaid('phase6b-components', 'recruit');
    const session = new CommanderSession(raid);
    session.step(heuristicCommander(session.view()));
    const consoleMarkup = renderToStaticMarkup(<CommanderConsole session={session} autopilot={false} onAutopilotChange={() => undefined} onComplete={() => undefined} />);
    expect(consoleMarkup).toContain('+5 Gun from reserve');
    expect(consoleMarkup).toContain('Missile auth');

    session.runToEnd(4200);
    const report = scoreRaid(session);
    const debrief = renderToStaticMarkup(<CommanderDebrief report={report} raid={raid} log={session.getSessionLog()} />);
    expect(debrief).toContain('Cost-exchange ledger');
    expect(debrief).toContain('Site summaries');
    expect(debrief).toContain('CER');
  });

  it('conserves the selected site allocation and dispatches tick-zero ALLOCATE commands', () => {
    const raid = generateRaid('phase6b-setup-allocation', 'operator');
    const commands = buildCommanderSetupCommands(raid, 0.2, raid.sites.map((_, i) => i + 1), 'tight', 'hold', {}, {});
    const allocations = commands.filter((command) => command.type === 'ALLOCATE');
    expect(allocations).toHaveLength(raid.sites.length);
    expect(allocations.every((command) => command.tick === 0)).toBe(true);
    expect(allocations.reduce((sum, command) => sum + command.payload.gunAmmo, 0)).toBe(Math.floor(raid.totalPool.gunAmmo * 0.8));
    expect(allocations.reduce((sum, command) => sum + command.payload.missiles, 0)).toBe(Math.floor(raid.totalPool.missiles * 0.8));
  });
});
