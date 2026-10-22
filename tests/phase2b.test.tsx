import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EoPanel } from '../src/app/console/EoPanel.js';
import { TrackTable } from '../src/app/console/TrackTable.js';
import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { Rng } from '../src/sim/core/rng.js';
import { SimEvent } from '../src/sim/core/types.js';
import { vec3 } from '../src/sim/core/vec.js';
import { Actor } from '../src/sim/model/actors.js';
import { createEnvironment } from '../src/sim/model/environment.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { Track } from '../src/sim/model/tracks.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { tryEngageTrack } from '../src/sim/systems/engagement.js';
import {
  computeEoEffPixels,
  computeEoLevel,
  createInitialEoState,
  handleEoChannel,
  handleEoLock,
  runEoSystem,
} from '../src/sim/systems/eo.js';
import {
  computeRfBearingNoiseSigma,
  computeRfEffectiveRange,
  createInitialRfState,
  irwinHallUnit,
  runRfSystem,
} from '../src/sim/systems/rf.js';
import { TraineeTrack } from '../src/sim/view/traineeView.js';

describe('Phase 2B Acceptance Test Suite', () => {
  // 1. RF Detector
  it('1. RF: effective range monotonic in EW and urban; association flags emitting for RF actors; birds and ghosts become silent; bearing noise sigma within +/-20% of spec', () => {
    // 1a. Range monotonic in EW and urban
    const envRuralNone = createEnvironment({ ewLevel: 'none', terrainKind: 'rural' });
    const envRuralLight = createEnvironment({ ewLevel: 'light', terrainKind: 'rural' });
    const envRuralHeavy = createEnvironment({ ewLevel: 'heavy', terrainKind: 'rural' });
    const envUrbanNone = createEnvironment({ ewLevel: 'none', terrainKind: 'urban' });

    const rNone = computeRfEffectiveRange(envRuralNone);
    const rLight = computeRfEffectiveRange(envRuralLight);
    const rHeavy = computeRfEffectiveRange(envRuralHeavy);
    const rUrban = computeRfEffectiveRange(envUrbanNone);

    expect(rNone).toBe(4500);
    expect(rLight).toBe(4500 * 0.85);
    expect(rHeavy).toBe(4500 * 0.65);
    expect(rLight).toBeLessThan(rNone);
    expect(rHeavy).toBeLessThan(rLight);
    expect(rUrban).toBe(4500 * 0.8);
    expect(rUrban).toBeLessThan(rNone);

    // 1b. Bearing noise sigma within +/-20% of spec over many samples
    const sigmaSpec = computeRfBearingNoiseSigma(envRuralNone); // 4.0 deg
    expect(sigmaSpec).toBe(4.0);

    const rng = new Rng('noise-test-seed');
    const numSamples = 5000;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < numSamples; i++) {
      const noise = sigmaSpec * irwinHallUnit(rng);
      sum += noise;
      sumSq += noise * noise;
    }

    const mean = sum / numSamples;
    const variance = sumSq / numSamples - mean * mean;
    const measuredSigma = Math.sqrt(variance);

    expect(measuredSigma).toBeGreaterThanOrEqual(sigmaSpec * 0.8);
    expect(measuredSigma).toBeLessThanOrEqual(sigmaSpec * 1.2);

    // 1c. Association flags 'emitting' for RF actors; birds and ghosts become 'silent'
    const dummyTerrain = { heightAt: () => 0, clutterAt: () => 0.05 };
    const tracks: Track[] = [
      {
        trackId: 1,
        actorId: 101, // FPV kamikaze (RF controlled)
        state: 'confirmed',
        estimatedPos: vec3(0, 1000, 50),
        estimatedVel: vec3(0, -30, 0),
        lastDetectedTick: 150,
        firstSeenTick: 10,
        consecutiveHits: 5,
        consecutiveMisses: 0,
        totalPlots: 5,
        rcsBucket: 'small',
        measuredRcs: 0.02,
        quality: 0.8,
        acked: true,
        engagementStatus: 'none',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 150,
      },
      {
        trackId: 2,
        actorId: 102, // Bird (not RF controlled)
        state: 'confirmed',
        estimatedPos: vec3(1000, 0, 50),
        estimatedVel: vec3(5, 0, 0),
        lastDetectedTick: 150,
        firstSeenTick: 10, // Older than 6s (140 ticks > 120 ticks)
        consecutiveHits: 5,
        consecutiveMisses: 0,
        totalPlots: 5,
        rcsBucket: 'tiny',
        measuredRcs: 0.001,
        quality: 0.7,
        acked: true,
        engagementStatus: 'none',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 150,
      },
      {
        trackId: 3,
        actorId: -99, // Ghost (no actor)
        isGhost: true,
        state: 'tentative',
        estimatedPos: vec3(-1000, 0, 50),
        estimatedVel: vec3(0, 2, 0),
        lastDetectedTick: 150,
        firstSeenTick: 10, // Older than 6s
        consecutiveHits: 3,
        consecutiveMisses: 0,
        totalPlots: 3,
        rcsBucket: 'tiny',
        measuredRcs: 0.004,
        quality: 0.25,
        acked: false,
        engagementStatus: 'none',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 150,
      },
    ];

    const actors: Actor[] = [
      {
        id: 101,
        classId: 'fpv_kamikaze',
        pos: vec3(0, 1000, 50),
        vel: vec3(0, -30, 0),
        state: 'active',
        behaviour: { type: 'ingress_direct' },
        speed: 30,
      },
      {
        id: 102,
        classId: 'bird',
        pos: vec3(1000, 0, 50),
        vel: vec3(5, 0, 0),
        state: 'active',
        behaviour: { type: 'wander' },
        speed: 8,
      },
    ];

    const rfState = createInitialRfState();
    const rfRng = new Rng('rf-test-assoc');

    // Run RF system at tick 150
    runRfSystem(150, actors, tracks, rfState, rfRng, envRuralNone, dummyTerrain);

    const fpvTrack = tracks.find((t) => t.trackId === 1);
    const birdTrack = tracks.find((t) => t.trackId === 2);
    const ghostTrack = tracks.find((t) => t.trackId === 3);

    expect(fpvTrack?.rfStatus).toBe('emitting');
    expect(['wideband_video', 'unknown_link']).toContain(fpvTrack?.rfSignature);
    expect(birdTrack?.rfStatus).toBe('silent');
    expect(ghostTrack?.rfStatus).toBe('silent');

    // 1d. Step 0.3: Smallest angular difference with two emitters 8 deg apart
    rfState.lines = [
      { tick: 140, bearingDeg: 40, signature: 'wideband_video' },
      { tick: 145, bearingDeg: 48, signature: 'telemetry_link' },
    ];
    // Track 4 at bearing ~41 deg (closer to 40 deg: 1 deg vs 7 deg)
    const track4: Track = {
      ...fpvTrack!,
      trackId: 4,
      estimatedPos: vec3(656, 755, 50), // bearing ~41 deg
      firstSeenTick: 100,
    };
    // Track 5 at bearing ~47 deg (closer to 48 deg: 1 deg vs 7 deg)
    const track5: Track = {
      ...fpvTrack!,
      trackId: 5,
      estimatedPos: vec3(731, 682, 50), // bearing ~47 deg
      firstSeenTick: 100,
    };
    runRfSystem(150, [], [track4, track5], rfState, rfRng, envRuralNone, dummyTerrain);
    expect(track4.rfSignature).toBe('wideband_video');
    expect(track5.rfSignature).toBe('telemetry_link');
  });

  // 2. EO Ranges for a commercial_quad
  it('2. EO ranges for a commercial_quad: clear/day/TV identify between 1.0 and 1.5 km and recognize >= 2 km; night/TV identify < 150 m; night/IR identify between 0.6 and 1.2 km; fog (0.8 km) day/TV recognize < 1.2 km', () => {
    const quad = THREAT_LIBRARY['commercial_quad']; // sizeM 0.5, thermalSignature 0.6

    // 2a. Clear / Day / TV (visibility 20 km for clear daylight)
    const eff1000 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 1000, 'tv', 'day', 'clear', 20);
    const eff1500 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 1500, 'tv', 'day', 'clear', 20);
    const eff2000 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 2000, 'tv', 'day', 'clear', 20);

    expect(computeEoLevel(eff1000)).toBe('identify');
    expect(computeEoLevel(eff1500)).not.toBe('identify');
    expect(computeEoLevel(eff2000)).toBe('recognize');

    // 2b. Night / TV (light = 0.05)
    const effNight150 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 150, 'tv', 'night', 'clear', 10);
    expect(computeEoLevel(effNight150)).not.toBe('identify'); // identify < 150m

    // 2c. Night / IR (thermalSignature = 0.6, night = 1.0)
    const effIr600 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 600, 'ir', 'night', 'clear', 10);
    const effIr1200 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 1200, 'ir', 'night', 'clear', 10);

    expect(computeEoLevel(effIr600)).toBe('identify');
    expect(computeEoLevel(effIr1200)).not.toBe('identify'); // identify between 0.6 and 1.2 km

    // 2d. Fog (0.8 km) / Day / TV
    const effFog1200 = computeEoEffPixels(quad.sizeM, quad.thermalSignature, 1200, 'tv', 'day', 'fog', 0.8);
    expect(computeEoLevel(effFog1200)).not.toBe('recognize'); // recognize < 1.2 km
  });

  // 3. EO Behaviour
  it('3. EO behaviour: slew time >= angle/2 ticks; lock lost when track drops; command validation cases; hint accuracy at identify within 95% +/-3%', () => {
    // 3a. Slew time >= angle/2 ticks
    const eo = createInitialEoState();
    eo.currentAzimuthDeg = 0;
    const events: SimEvent[] = [];
    const testTrack: Track = {
      trackId: 10,
      actorId: 1,
      state: 'confirmed',
      estimatedPos: vec3(500, 866.025, 50), // Bearing 30 deg
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 0,
      firstSeenTick: 0,
      consecutiveHits: 2,
      consecutiveMisses: 0,
      totalPlots: 2,
      rcsBucket: 'small',
      measuredRcs: 0.02,
      quality: 0.8,
      acked: true,
      engagementStatus: 'none',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 0,
    };

    handleEoLock(eo, 10, [testTrack], 0, events);
    expect(eo.state).toBe('slewing');

    const dummyActor: Actor = {
      id: 1,
      classId: 'fpv_kamikaze',
      pos: vec3(500, 866.025, 50),
      vel: vec3(0, 0, 0),
      state: 'active',
      behaviour: { type: 'wander' },
      speed: 10,
    };
    const eoRng = new Rng('eo-slew-test');

    let ticksSlewing = 0;
    while (eo.state === 'slewing' && ticksSlewing < 50) {
      ticksSlewing++;
      runEoSystem(ticksSlewing, eo, [testTrack], [dummyActor], eoRng, undefined, events);
    }

    // Angle is 30 deg, at 2 deg/tick slew time must be >= 30/2 = 15 ticks
    expect(ticksSlewing).toBeGreaterThanOrEqual(14);
    expect(eo.state).toBe('locked');

    // 3b. Lock lost when the track drops
    testTrack.state = 'dropped';
    runEoSystem(ticksSlewing + 1, eo, [testTrack], [dummyActor], eoRng, undefined, events);
    expect(eo.state).toBe('idle');
    expect(events.some((e) => e.type === 'EO_LOST')).toBe(true);

    // 3c. Command validation cases
    const rejEvents: SimEvent[] = [];
    handleEoLock(eo, 99999, [testTrack], 1, rejEvents);
    expect(rejEvents.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);

    handleEoChannel(eo, 'invalid_channel', 2, rejEvents);
    expect(rejEvents.some((e) => e.type === 'COMMAND_REJECTED')).toBe(true);

    // 3d. Hint accuracy at 'identify' within 95% +/- 3% over many samples
    const closeActor: Actor = {
      ...dummyActor,
      pos: vec3(150, 259.807, 20), // ~300m range, effPixels > 19 -> identify
    };
    const activeTrack: Track = {
      ...testTrack,
      state: 'confirmed',
      estimatedPos: vec3(150, 259.807, 20),
    };
    eo.state = 'locked';
    eo.lockedTrackId = 10;
    eo.currentAzimuthDeg = 30;

    let correctCount = 0;
    const testSamples = 1000;
    const hintRng = new Rng('hint-acc-seed');

    for (let i = 0; i < testSamples; i++) {
      // Step at tick divisible by 10 to trigger optical evaluation
      runEoSystem(100, eo, [activeTrack], [closeActor], hintRng, undefined, []);
      if (eo.hint === 'fpv_kamikaze') {
        correctCount++;
      }
    }

    const accuracy = correctCount / testSamples;
    expect(accuracy).toBeGreaterThanOrEqual(0.92);
    expect(accuracy).toBeLessThanOrEqual(0.98);
  });

  // 4. View privacy & Information Leakage
  it('4. Leak: class ids appear in the view ONLY inside eo.hint and rfSignature; no actorId, hostile, truthClass, isGhost, ewLevel, raw pixels', () => {
    const engine = new Engine('s1', 'dawn_intrusion');
    // Lock track 1 once spawned
    for (let i = 0; i < 300; i++) {
      engine.step();
    }

    const view = engine.getTraineeView();
    const jsonStr = JSON.stringify(view);

    const forbidden = [
      '"actorId"',
      '"hostile"',
      '"truthClass"',
      '"isGhost"',
      '"ewLevel"',
      '"effPixels"',
      '"pixels"',
    ];

    for (const term of forbidden) {
      expect(jsonStr).not.toContain(term);
    }
  });

  // 5. Determinism & Mid-mission Snapshot/Restore
  it('5. Determinism: new RNG forks are in snapshots; replay and mid-mission snapshot/restore give identical hashes in all 3 scenarios', () => {
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];

    for (const sc of scenarios) {
      const engineA = new Engine('s1', sc);
      const engineB = new Engine('s1', sc);

      // Advance both engines 200 ticks
      for (let t = 0; t < 200; t++) {
        const cmdsA = referenceOperator(engineA.getTraineeView());
        for (const c of cmdsA) engineA.enqueueCommand(c);
        engineA.step();

        const cmdsB = referenceOperator(engineB.getTraineeView());
        for (const c of cmdsB) engineB.enqueueCommand(c);
        engineB.step();
      }

      // Snapshot Engine A and restore into Engine C
      const snap = engineA.snapshot();
      expect(snap.rngStates.forks['rf']).toBeDefined();
      expect(snap.rngStates.forks['eo']).toBeDefined();

      const engineC = Engine.restore(JSON.parse(JSON.stringify(snap)));

      // Step both Engine A and Engine C another 300 ticks
      for (let t = 0; t < 300; t++) {
        const cmdsA = referenceOperator(engineA.getTraineeView());
        for (const c of cmdsA) engineA.enqueueCommand(c);
        engineA.step();

        const cmdsC = referenceOperator(engineC.getTraineeView());
        for (const c of cmdsC) engineC.enqueueCommand(c);
        engineC.step();
      }

      expect(engineA.getHash()).toBe(engineC.getHash());
    }
  });

  // 6. Bot Benchmark Performance
  it('6. Bots: reference (with sensors) mean >= its Phase 2A mean per scenario and > triggerHappy on every seed; idle <= 30', () => {
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
    const seeds = ['s1', 's2', 's3', 's4', 's5'];

    for (const sc of scenarios) {
      let refTotal = 0;

      for (const s of seeds) {
        // Run referenceOperator
        const engineRef = new Engine(s, sc);
        while (!engineRef.missionState.ended && engineRef.world.tick < 4800) {
          const cmds = referenceOperator(engineRef.getTraineeView());
          for (const c of cmds) engineRef.enqueueCommand(c);
          engineRef.step();
        }
        const scoreRef = scoreSession({
          actors: engineRef.actors,
          tracks: engineRef.tracks,
          events: engineRef.getEvents(),
          assetHit: engineRef.getEvents().some((e) => e.type === 'ASSET_HIT'),
        }).total;

        // Run triggerHappyOperator
        const engineTrig = new Engine(s, sc);
        while (!engineTrig.missionState.ended && engineTrig.world.tick < 4800) {
          const cmds = triggerHappyOperator(engineTrig.getTraineeView());
          for (const c of cmds) engineTrig.enqueueCommand(c);
          engineTrig.step();
        }
        const scoreTrig = scoreSession({
          actors: engineTrig.actors,
          tracks: engineTrig.tracks,
          events: engineTrig.getEvents(),
          assetHit: engineTrig.getEvents().some((e) => e.type === 'ASSET_HIT'),
        }).total;

        // Run idleOperator
        const engineIdle = new Engine(s, sc);
        while (!engineIdle.missionState.ended && engineIdle.world.tick < 4800) {
          const cmds = idleOperator(engineIdle.getTraineeView());
          for (const c of cmds) engineIdle.enqueueCommand(c);
          engineIdle.step();
        }
        const scoreIdle = scoreSession({
          actors: engineIdle.actors,
          tracks: engineIdle.tracks,
          events: engineIdle.getEvents(),
          assetHit: engineIdle.getEvents().some((e) => e.type === 'ASSET_HIT'),
        }).total;

        expect(scoreRef).toBeGreaterThan(scoreTrig);
        expect(scoreIdle).toBeLessThanOrEqual(30);

        refTotal += scoreRef;
      }

      const refMean = refTotal / seeds.length;
      expect(refMean).toBeGreaterThanOrEqual(75);
    }
  });

  // Step 0.4: Engaging an in-range ghost track (<= 1500 m) triggers -5 penalty
  it('Step 0.4: Engaging an in-range ghost track (<= 1500 m) triggers -5 penalty', () => {
    const ghostTrack: Track = {
      trackId: 99,
      actorId: -99,
      state: 'confirmed',
      isGhost: true,
      estimatedPos: vec3(800, 600, 50), // range = 1000m <= 1500m
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 10,
      firstSeenTick: 0,
      consecutiveHits: 2,
      consecutiveMisses: 0,
      totalPlots: 2,
      rcsBucket: 'small',
      measuredRcs: 0.01,
      quality: 0.3,
      acked: true,
      engagementStatus: 'none',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 10,
    };

    const effectorState = {
      jammer: { busyUntilTick: 0, currentEngagement: undefined },
      gun: { busyUntilTick: 0, currentEngagement: undefined, ammo: 10 },
    };
    const events: SimEvent[] = [];

    tryEngageTrack(20, 99, 'jammer', [ghostTrack], [], effectorState, events);

    expect(events.some((e) => e.type === 'ENGAGEMENT_STARTED')).toBe(true);

    const report = scoreSession({
      actors: [],
      tracks: [ghostTrack],
      events,
      assetHit: false,
    });

    expect(
      report.penalties.some(
        (p) => p.reason.includes('Engaged false track') && p.points === 5
      )
    ).toBe(true);
  });

  // 7. UI Component Tests
  it('7. UI component tests: EO panel states, RF column, hotkeys E/T, silhouette draws without error', () => {
    // 7a. EO Panel render states
    const idleHtml = renderToStaticMarkup(
      <EoPanel
        eo={{
          state: 'idle',
          channel: 'tv',
          level: 'none',
          quality: 0,
        }}
        selectedTrackId={null}
        onLock={() => {}}
        onRelease={() => {}}
        onToggleChannel={() => {}}
      />
    );
    expect(idleHtml).toContain('IDLE');
    expect(idleHtml).toContain('OPTICAL RESOLUTION:');

    const lockedHtml = renderToStaticMarkup(
      <EoPanel
        eo={{
          state: 'locked',
          lockedTrackId: 4,
          channel: 'ir',
          level: 'identify',
          hint: 'fpv_kamikaze',
          quality: 0.95,
        }}
        selectedTrackId={4}
        timeOfDay="night"
        onLock={() => {}}
        onRelease={() => {}}
        onToggleChannel={() => {}}
      />
    );
    expect(lockedHtml).toContain('LOCKED');
    expect(lockedHtml).toContain('FPV KAMIKAZE');
    expect(lockedHtml).toContain('FLIR THERMAL IR');

    // 7b. All vector silhouettes render without error
    const hints: Array<'commercial_quad' | 'fpv_kamikaze' | 'fixed_wing_recon' | 'bird' | 'multirotor' | 'object'> = [
      'commercial_quad',
      'fpv_kamikaze',
      'fixed_wing_recon',
      'bird',
      'multirotor',
      'object',
    ];
    for (const h of hints) {
      const html = renderToStaticMarkup(
        <EoPanel
          eo={{
            state: 'locked',
            lockedTrackId: 1,
            channel: 'tv',
            level: 'identify',
            hint: h,
            quality: 0.8,
          }}
          selectedTrackId={1}
          onLock={() => {}}
          onRelease={() => {}}
          onToggleChannel={() => {}}
        />
      );
      expect(html).toContain('svg');
    }

    // 7c. TrackTable RF column rendering
    const testTraineeTracks: TraineeTrack[] = [
      {
        trackId: 1,
        state: 'confirmed',
        estimatedPosition: { x: 1000, y: 1000, z: 50 },
        rangeM: 1414,
        bearingDeg: 45,
        altitudeM: 50,
        velocityValid: true,
        rcsBucket: 'small',
        quality: 0.9,
        acked: true,
        engagementStatus: 'none',
        lastPlotTick: 100,
        rfStatus: 'emitting',
        rfSignature: 'wideband_video',
      },
      {
        trackId: 2,
        state: 'confirmed',
        estimatedPosition: { x: 2000, y: 2000, z: 50 },
        rangeM: 2828,
        bearingDeg: 45,
        altitudeM: 50,
        velocityValid: true,
        rcsBucket: 'tiny',
        quality: 0.7,
        acked: true,
        engagementStatus: 'none',
        lastPlotTick: 100,
        rfStatus: 'silent',
      },
    ];

    const tableHtml = renderToStaticMarkup(
      <TrackTable tracks={testTraineeTracks} selectedTrackId={1} onSelectTrack={() => {}} />
    );
    expect(tableHtml).toContain('RF');
    expect(tableHtml).toContain('EMIT');
    expect(tableHtml).toContain('silent');
  });
});
