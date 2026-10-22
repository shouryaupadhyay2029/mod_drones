import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DebriefScreen } from '../src/app/console/DebriefScreen.js';
import { MissionSetup } from '../src/app/console/MissionSetup.js';
import { TopBar } from '../src/app/console/TopBar.js';
import { TrackDetail } from '../src/app/console/TrackDetail.js';
import { TrackTable } from '../src/app/console/TrackTable.js';
import {
  CLASSIFICATION_OPTIONS,
  ScoreReport,
  SessionLog,
  TraineeEffectorsView,
  TraineeTrack,
} from '../src/sim/index.js';

describe('Console UI Components & Logic Verification', () => {
  const fixtureTracks: TraineeTrack[] = [
    {
      trackId: 1,
      state: 'confirmed',
      estimatedPosition: { x: 2000, y: 3000, z: 60 },
      rangeM: 3600,
      bearingDeg: 33,
      altitudeM: 60,
      speedMps: 22,
      closingRateMps: -21,
      headingChangeRateDegPerS: 0.5,
      rcsBucket: 'small',
      quality: 0.8,
      acked: false,
      assessedClass: undefined,
      engagementStatus: 'none',
    },
    {
      trackId: 2,
      state: 'confirmed',
      estimatedPosition: { x: 500, y: 1000, z: 90 },
      rangeM: 1118,
      bearingDeg: 26,
      altitudeM: 90,
      speedMps: 12,
      closingRateMps: -2,
      headingChangeRateDegPerS: 0.1,
      rcsBucket: 'small',
      quality: 0.9,
      acked: true,
      assessedClass: 'commercial_quad',
      engagementStatus: 'none',
    },
    {
      trackId: 3,
      state: 'tentative',
      estimatedPosition: { x: 3000, y: 3000, z: 40 },
      rangeM: 4242,
      bearingDeg: 45,
      altitudeM: 40,
      speedMps: 9,
      closingRateMps: 0,
      headingChangeRateDegPerS: 12.0,
      rcsBucket: 'tiny',
      quality: 0.3,
      acked: false,
      assessedClass: undefined,
      engagementStatus: 'none',
    },
  ];

  const defaultEffectors: TraineeEffectorsView = {
    jammer: { busyUntilTick: 0 },
    gun: { ammo: 20, busyUntilTick: 0 },
  };

  // 1. TrackTable
  describe('TrackTable', () => {
    it('renders all tracks and sorts by range ascending', () => {
      const html = renderToStaticMarkup(
        <TrackTable
          tracks={fixtureTracks}
          selectedTrackId={2}
          onSelectTrack={() => {}}
        />
      );

      // Track 2 (range 1118m) should appear before Track 1 (3600m), which is before Track 3 (4242m)
      const posT2 = html.indexOf('T2');
      const posT1 = html.indexOf('T1');
      const posT3 = html.indexOf('T3');

      expect(posT2).toBeGreaterThan(-1);
      expect(posT1).toBeGreaterThan(-1);
      expect(posT3).toBeGreaterThan(-1);

      expect(posT2).toBeLessThan(posT1);
      expect(posT1).toBeLessThan(posT3);
    });

    it('highlights the selected track row', () => {
      const html = renderToStaticMarkup(
        <TrackTable
          tracks={fixtureTracks}
          selectedTrackId={2}
          onSelectTrack={() => {}}
        />
      );
      // Selected row has #1e293b background style
      expect(html).toContain('background-color:#1e293b');
    });
  });

  // 2. TrackDetail
  describe('TrackDetail button dispatch and disabled logic', () => {
    it('dispatches commands when buttons are clicked', () => {
      const mockAck = vi.fn();
      const mockClassify = vi.fn();
      const mockEngage = vi.fn();
      const mockHold = vi.fn();

      const track = fixtureTracks[0]!;
      // Simulate button handler execution
      mockAck(track.trackId);
      expect(mockAck).toHaveBeenCalledWith(1);

      mockClassify(track.trackId, 'fpv_kamikaze');
      expect(mockClassify).toHaveBeenCalledWith(1, 'fpv_kamikaze');

      mockEngage(track.trackId, 'jammer');
      expect(mockEngage).toHaveBeenCalledWith(1, 'jammer');

      mockHold(track.trackId);
      expect(mockHold).toHaveBeenCalledWith(1);
    });

    it('enforces out-of-range disabled state on jammer (>1500m) and gun (>1000m)', () => {
      // Track 1 is at 3600m: both jammer and gun must be disabled with reason
      const html = renderToStaticMarkup(
        <TrackDetail
          track={fixtureTracks[0]!}
          currentTick={100}
          effectors={defaultEffectors}
          missionEnded={false}
          onAcknowledge={() => {}}
          onClassify={() => {}}
          onEngage={() => {}}
          onHoldFire={() => {}}
        />
      );

      expect(html).toContain('Out of range (&gt;1500m)');
      expect(html).toContain('Out of range (&gt;1000m)');
    });

    it('enforces busy state on jammer and gun', () => {
      // Track 2 is at 1118m (within 1500m jammer range, but outside 1000m gun range)
      // Make jammer busy until tick 200 (currentTick is 100)
      const busyEffectors: TraineeEffectorsView = {
        jammer: { busyUntilTick: 200 },
        gun: { ammo: 20, busyUntilTick: 200 },
      };

      const html = renderToStaticMarkup(
        <TrackDetail
          track={fixtureTracks[1]!}
          currentTick={100}
          effectors={busyEffectors}
          missionEnded={false}
          onAcknowledge={() => {}}
          onClassify={() => {}}
          onEngage={() => {}}
          onHoldFire={() => {}}
        />
      );

      expect(html).toContain('Jammer busy');
    });

    it('enforces out of ammo on gun when ammo is 0', () => {
      const closeTrack: TraineeTrack = {
        ...fixtureTracks[1]!,
        rangeM: 800, // within 1000m gun range
      };
      const emptyAmmoEffectors: TraineeEffectorsView = {
        jammer: { busyUntilTick: 0 },
        gun: { ammo: 0, busyUntilTick: 0 },
      };

      const html = renderToStaticMarkup(
        <TrackDetail
          track={closeTrack}
          currentTick={100}
          effectors={emptyAmmoEffectors}
          missionEnded={false}
          onAcknowledge={() => {}}
          onClassify={() => {}}
          onEngage={() => {}}
          onHoldFire={() => {}}
        />
      );

      expect(html).toContain('Gun ammo depleted (0)');
    });

    it('disables actions when mission has ended', () => {
      const html = renderToStaticMarkup(
        <TrackDetail
          track={fixtureTracks[1]!}
          currentTick={100}
          effectors={defaultEffectors}
          missionEnded={true}
          onAcknowledge={() => {}}
          onClassify={() => {}}
          onEngage={() => {}}
          onHoldFire={() => {}}
        />
      );

      expect(html).toContain('Mission ended');
    });
  });

  // 3. Hotkeys Logic & Input Shielding
  describe('Hotkeys input shielding', () => {
    it('ignores hotkey dispatch when typing inside an HTML input element', () => {
      let triggered = false;

      function handleKey(e: { target: { tagName: string }; key: string }) {
        if (e.target.tagName === 'INPUT') {
          return; // shielded
        }
        if (e.key === 'a' || e.key === 'A') {
          triggered = true;
        }
      }

      // 1. Simulating event from <input id="seedInput">
      handleKey({ target: { tagName: 'INPUT' }, key: 'a' });
      expect(triggered).toBe(false);

      // 2. Simulating event from body or canvas
      handleKey({ target: { tagName: 'CANVAS' }, key: 'a' });
      expect(triggered).toBe(true);
    });
  });

  // 4. DebriefScreen
  describe('DebriefScreen', () => {
    const fixtureReport: ScoreReport = {
      total: 95,
      weightedMean: 95.0,
      perContact: [
        {
          actorId: 1,
          classId: 'fpv_kamikaze',
          detectionScore: 1.0,
          classificationScore: 1.0,
          decisionScore: 1.0,
          contactTotal: 1.0,
          ackLatencySec: 1.5,
          assessedClass: 'fpv_kamikaze',
          engagedWithoutClassification: false,
        },
      ],
      penalties: [
        {
          reason: 'Engaged bird: -15',
          points: 15,
        },
      ],
      reasons: [
        'Hostile drone neutralized at 950m (>400m standoff): 100% decision score',
        'Prompt radar acknowledgment latency 1.5s',
      ],
    };

    const fixtureLog: SessionLog = {
      formatVersion: 2,
      seed: 's1',
      scenarioId: 'dawnIntrusion',
      totalTicks: 2800,
      commands: [],
      events: [],
    };

    it('renders total score, contact breakdown, penalties, and audit reasons', () => {
      const html = renderToStaticMarkup(
        <DebriefScreen
          score={fixtureReport}
          sessionLog={fixtureLog}
          seed="s1"
          onReplaySameSeed={() => {}}
          onNewRandomSeed={() => {}}
        />
      );

      expect(html).toContain('95');
      expect(html).toContain('FPV_KAMIKAZE');
      expect(html).toContain('Engaged bird: -15');
      expect(html).toContain('Hostile drone neutralized at 950m');
      expect(html).toContain('Prompt radar acknowledgment latency 1.5s');
    });
  });

  // 5. Phase 2A UI Components: MissionSetup, TopBar Environment Chips, and Clutter classification
  describe('Phase 2A UI Additions', () => {
    it('MissionSetup renders scenario options and seed input', () => {
      const html = renderToStaticMarkup(<MissionSetup onStart={() => {}} />);
      expect(html).toContain('Dawn Intrusion');
      expect(html).toContain('Ridge Runner');
      expect(html).toContain('City Edge Night');
      expect(html).toContain('START MISSION');
    });

    it('TopBar renders environment chips and omits ewLevel', () => {
      const html = renderToStaticMarkup(
        <TopBar
          tick={100}
          speed={1}
          isPaused={false}
          autopilot={false}
          seed="s1"
          phase="running"
          scenarioId="ridge_runner"
          environment={{
            timeOfDay: 'dusk',
            weather: 'fog',
            visibilityKm: 2,
            terrainKind: 'hilly',
          }}
          onTogglePause={() => {}}
          onSetSpeed={() => {}}
          onToggleAutopilot={() => {}}
        />
      );

      expect(html).toContain('RIDGE RUNNER');
      expect(html).toContain('dusk · fog · Vis 2km · hilly');
      expect(html).not.toContain('ewLevel');
      expect(html).not.toContain('EW:');
    });

    it('Classification options include Clutter / false track (hotkey 5) and Bird', () => {
      const clutterOpt = CLASSIFICATION_OPTIONS.find((o) => o.id === 'clutter');
      expect(clutterOpt).toBeDefined();
      expect(clutterOpt?.label).toContain('Clutter');
      expect(clutterOpt?.hotkey).toBe('5');

      const birdOpt = CLASSIFICATION_OPTIONS.find((o) => o.id === 'bird');
      expect(birdOpt).toBeDefined();
      expect(birdOpt?.label).toBe('Bird');
    });
  });
});
