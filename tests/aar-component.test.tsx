import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Engine } from '../src/sim/core/engine.js';
import { scoreSessionV2 } from '../src/sim/scoring/doctrine.js';
import { SessionReplay } from '../src/app/aar/SessionReplay.js';

describe('session review component fixture', () => {
  it('renders timeline, shadow control, contacts and grade from a session fixture', () => {
    const engine = new Engine('aar-component-fixture', 'dawn_intrusion');
    for (let tick = 0; tick < 80; tick++) engine.step();
    const actors = engine.actors;
    const report = scoreSessionV2({ actors, tracks: engine.tracks, events: engine.getEvents() });
    const html = renderToStaticMarkup(React.createElement(SessionReplay, {
      sessionLog: engine.getSessionLog(),
      report,
    }));

    expect(html).toContain('aria-label="Session replay"');
    expect(html).toContain('RADAR SHADOW ALTITUDE');
    expect(html).toContain('Replay timeline');
    expect(html).toContain('RANGE RINGS');
    expect(html).toContain(report.grade);
  });
});
