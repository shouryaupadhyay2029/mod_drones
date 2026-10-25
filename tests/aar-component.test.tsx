import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSessionV2 } from '../src/sim/scoring/doctrine.js';
import { SessionReplay } from '../src/app/aar/SessionReplay.js';
import { ForkPracticeBanner } from '../src/app/routes/ConsolePage.js';
import { SessionRecord } from '../src/app/storage/db.js';
import { SessionTable } from '../src/app/aar/AarPage.js';
import { CompareResults } from '../src/app/aar/CompareResults.js';

describe('session review component fixture', () => {
  it('renders timeline, shadow control, contacts and grade from a session fixture', () => {
    const engine = new Engine('aar-component-fixture', 'dawn_intrusion');
    engine.enqueueCommand({ tick: 1, type: 'ACK_TRACK', payload: { trackId: 1 } });
    for (let tick = 0; tick < 80; tick++) engine.step();
    const actors = engine.actors;
    const report = scoreSessionV2({ actors, tracks: engine.tracks, events: engine.getEvents() });
    const html = renderToStaticMarkup(React.createElement(SessionReplay, {
      sessionLog: engine.getSessionLog(),
      report,
      onFork: () => undefined,
    }));

    expect(html).toContain('aria-label="Session replay"');
    expect(html).toContain('RADAR SHADOW ALTITUDE');
    expect(html).toContain('Replay timeline');
    expect(html).toContain('RANGE RINGS');
    expect(html).toContain(report.grade);
    expect(html).toContain('KEY MOMENTS');
    expect(html).toContain('FORK HERE');
    expect(html).toContain('Fork before this command');
  });

  it('renders the fork banner, comparison, and child sessions nested under their parent', () => {
    const engine = new Engine('fork-ui-fixture', 'dawn_intrusion');
    engine.stepN(40);
    const log = engine.getSessionLog();
    const report = scoreSessionV2({ actors: engine.actors, tracks: engine.tracks, events: engine.getEvents() });
    const record = (id: string, isFork: boolean, parentId?: string): SessionRecord => ({
      id, traineeId: 'trainee', unitId: 'unit', startedAt: 1, scenarioKey: 'dawn_intrusion', tier: 'scripted', focus: 'none',
      seed: log.seed, sessionLog: log, scoreVersion: '2.2', report,
      summary: { total: report.total, grade: report.grade, subscores: report.subscores, hostilesTotal: 1, hostilesNeutralised: 0, assetHit: false, durationTicks: 40 },
      hash: engine.getHash(), parentId, forkTick: isFork ? 20 : undefined, isFork,
    });
    const parent = record('parent-session', false);
    const fork = record('fork-session', true, parent.id);
    const bannerHtml = renderToStaticMarkup(React.createElement(ForkPracticeBanner, {
      forkContext: { parentId: parent.id, parentLabel: 'Dawn Intrusion · seed-1', tick: 400 },
    }));
    const compareHtml = renderToStaticMarkup(React.createElement(CompareResults, { original: parent, fork }));
    const tableHtml = renderToStaticMarkup(React.createElement(SessionTable, { sessions: [parent, fork] }));

    expect(bannerHtml).toContain('FORK of Dawn Intrusion · seed-1 at 00:20');
    expect(bannerHtml).toContain('not scored toward your record');
    expect(compareHtml).toContain('ORIGINAL');
    expect(compareHtml).toContain('FORK');
    expect(compareHtml).toContain('Outcome · original / fork');
    expect(compareHtml).toContain('What changed');
    expect(tableHtml).toContain('COMPARE');
    expect(tableHtml).toContain('aar-session-fork');
  });
});
