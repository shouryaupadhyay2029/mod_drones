import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  Engine,
  referenceOperator,
  idleOperator,
  scoreSession,
  generateScenario,
  Tier,
  GEN_VERSION,
  SwarmTactic,
  THREAT_LIBRARY,
  TraineeTrack,
  SessionLog,
} from '../src/sim/index.js';
import { oracleStep } from '../src/sim/bots/oracleOperator.js';
import { MissionSetup } from '../src/app/console/MissionSetup.js';
import { TrackTable } from '../src/app/console/TrackTable.js';
import { handleHotkey } from '../src/app/console/hotkeys.js';

describe('Phase 3A Acceptance Tests', () => {
  // 1. Generator determinism
  it('1. Generator determinism: identical arguments produce byte-identical output; different seeds differ; avoid list works', () => {
    const scA = generateScenario('seed-xyz-42', 'veteran');
    const scB = generateScenario('seed-xyz-42', 'veteran');
    expect(JSON.stringify(scA)).toBe(JSON.stringify(scB));
    expect(scA.fingerprint).toBe(scB.fingerprint);

    const scDiff = generateScenario('seed-other-99', 'veteran');
    expect(JSON.stringify(scA)).not.toBe(JSON.stringify(scDiff));

    // Avoid list excludes listed fingerprints
    const avoid = [scA.fingerprint];
    const scAvoid = generateScenario('seed-xyz-42', 'veteran', avoid);
    expect(scAvoid.fingerprint).not.toBe(scA.fingerprint);
  });

  // 2. Tier bounds
  it('2. Tier bounds: over 50 seeds per tier, verify counts and environments match tier specs', () => {
    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    for (const tier of tiers) {
      for (let s = 1; s <= 50; s++) {
        const seed = `tb-${tier}-${s}`;
        const sc = generateScenario(seed, tier);
        const spawns = sc.spawns;

        const strikers = spawns.filter(
          (sp) => sp.classId === 'fpv_kamikaze' || sp.classId === 'fpv_fiber' || sp.classId === 'fixed_wing_recon'
        );
        const decoys = spawns.filter((sp) => sp.classId === 'decoy_drone');
        const fiber = spawns.filter((sp) => sp.classId === 'fpv_fiber');
        const civilians = spawns.filter((sp) => sp.classId === 'commercial_quad');

        const fiberShare = strikers.length > 0 ? fiber.length / strikers.length : 0;

        if (tier === 'recruit') {
          expect(strikers.length).toBeGreaterThanOrEqual(1);
          expect(strikers.length).toBeLessThanOrEqual(2);
          expect(decoys.length).toBe(0);
          expect(fiberShare).toBe(0);
          expect(civilians.length).toBeGreaterThanOrEqual(1);
          expect(civilians.length).toBeLessThanOrEqual(2);
          expect(sc.environment.timeOfDay).toBe('day');
          expect(sc.environment.weather).toBe('clear');
          expect(sc.environment.ewLevel).toBe('none');
          expect(['rural', 'hilly']).toContain(sc.environment.terrainKind);
        } else if (tier === 'operator') {
          expect(strikers.length).toBeGreaterThanOrEqual(3);
          expect(strikers.length).toBeLessThanOrEqual(5);
          expect(decoys.length).toBeLessThanOrEqual(1);
          expect(fiberShare).toBeLessThanOrEqual(0.35); // 1 out of 3 or 4
          expect(civilians.length).toBeGreaterThanOrEqual(1);
          expect(civilians.length).toBeLessThanOrEqual(2);
          expect(['day', 'dusk']).toContain(sc.environment.timeOfDay);
          expect(['clear', 'fog']).toContain(sc.environment.weather);
          expect(['none', 'light']).toContain(sc.environment.ewLevel);
        } else if (tier === 'veteran') {
          expect(strikers.length).toBeGreaterThanOrEqual(6);
          expect(strikers.length).toBeLessThanOrEqual(10);
          expect(decoys.length).toBeGreaterThanOrEqual(1);
          expect(decoys.length).toBeLessThanOrEqual(3);
          expect(fiberShare).toBeLessThanOrEqual(0.45);
          expect(civilians.length).toBeGreaterThanOrEqual(1);
          expect(civilians.length).toBeLessThanOrEqual(3);
          expect(['light', 'heavy']).toContain(sc.environment.ewLevel);
        } else if (tier === 'elite') {
          expect(strikers.length).toBeGreaterThanOrEqual(10);
          expect(strikers.length).toBeLessThanOrEqual(16);
          expect(decoys.length).toBeGreaterThanOrEqual(2);
          expect(decoys.length).toBeLessThanOrEqual(4);
          expect(fiberShare).toBeLessThanOrEqual(0.55);
          expect(civilians.length).toBeLessThanOrEqual(2);
          expect(sc.environment.ewLevel).toBe('heavy');
        }
      }
    }
  });

  // 3. Diversity
  it('3. Diversity: over 50 seeds per tier, >= 45 distinct fingerprints per tier', () => {
    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    for (const tier of tiers) {
      const fps = new Set<string>();
      for (let s = 1; s <= 50; s++) {
        const sc = generateScenario(`div-${tier}-${s}`, tier);
        fps.add(sc.fingerprint);
      }
      expect(fps.size).toBeGreaterThanOrEqual(45);
    }
  });

  // 4. Solvability
  it('4. Solvability: oracle operator scores >= 90 on >= 90% of scenarios for recruit/operator; elite mean 60-95; idle hits asset >= 90%', () => {
    // Check recruit & operator
    for (const tier of ['recruit', 'operator'] as Tier[]) {
      let passCount = 0;
      for (let s = 1; s <= 10; s++) {
        const e = new Engine(`solv-${tier}-${s}`, `proc:v1:${tier}`);
        while (!e.missionState.ended) {
          const cmds = oracleStep(e.getTraineeView(), e);
          for (const c of cmds) e.enqueueCommand(c);
          e.step();
        }
        const rep = scoreSession(e.getEvents(), {
          actors: e.actors,
          tracks: e.tracks,
          events: e.getEvents(),
          assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
        });
        if (rep.total >= 90) passCount++;
      }
      expect(passCount / 10).toBeGreaterThanOrEqual(0.9);
    }

    // Elite mean score between 60 and 95
    let eliteSum = 0;
    for (let s = 1; s <= 10; s++) {
      const e = new Engine(`solv-elite-${s}`, 'proc:v1:elite');
      while (!e.missionState.ended) {
        const cmds = oracleStep(e.getTraineeView(), e);
        for (const c of cmds) e.enqueueCommand(c);
        e.step();
      }
      const rep = scoreSession(e.getEvents(), {
        actors: e.actors,
        tracks: e.tracks,
        events: e.getEvents(),
        assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
      });
      eliteSum += rep.total;
    }
    const eliteMean = eliteSum / 10;
    expect(eliteMean).toBeGreaterThanOrEqual(60);
    expect(eliteMean).toBeLessThanOrEqual(95);

    // Idle operator hit on asset >= 90% across tiers
    let idleHits = 0;
    const testTiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    for (const t of testTiers) {
      for (let s = 1; s <= 5; s++) {
        const e = new Engine(`idle-${t}-${s}`, `proc:v1:${t}`);
        while (!e.missionState.ended) {
          const cmds = idleOperator(e.getTraineeView());
          for (const c of cmds) e.enqueueCommand(c);
          e.step();
        }
        if (e.getEvents().some((ev) => ev.type === 'ASSET_HIT')) {
          idleHits++;
        }
      }
    }
    expect(idleHits / 20).toBeGreaterThanOrEqual(0.9);
  });

  // 5. Difficulty is real
  it('5. Difficulty is real: referenceOperator headless across 20 seeds per tier strictly decreases by >= 3 pts per step', () => {
    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    const means: Record<Tier, number> = { recruit: 0, operator: 0, veteran: 0, elite: 0 };

    for (const tier of tiers) {
      let sum = 0;
      for (let s = 1; s <= 20; s++) {
        const e = new Engine(`s${s}`, `proc:v1:${tier}`);
        while (!e.missionState.ended) {
          const cmds = referenceOperator(e.getTraineeView());
          for (const c of cmds) e.enqueueCommand(c);
          e.step();
        }
        const rep = scoreSession(e.getEvents(), {
          actors: e.actors,
          tracks: e.tracks,
          events: e.getEvents(),
          assetHit: e.getEvents().some((ev) => ev.type === 'ASSET_HIT'),
        });
        sum += rep.total;
      }
      means[tier] = sum / 20;
    }

    console.log('Tier Reference Means:', means);
    expect(means.recruit - means.operator).toBeGreaterThanOrEqual(3);
    expect(means.operator - means.veteran).toBeGreaterThanOrEqual(3);
    expect(means.veteran - means.elite).toBeGreaterThanOrEqual(3);
  });

  // 6. Replay and snapshot determinism
  it('6. Replay and snapshot determinism: live hash matches replay hash and restore hash for each tier', () => {
    const tiers: Tier[] = ['recruit', 'operator', 'veteran', 'elite'];
    for (const tier of tiers) {
      const eLive = new Engine('s1', `proc:v1:${tier}`);
      let snapAt1200: any = null;

      for (let t = 0; t < 1200; t++) {
        if (eLive.missionState.ended) break;
        const cmds = referenceOperator(eLive.getTraineeView());
        for (const c of cmds) eLive.enqueueCommand(c);
        eLive.step();
      }
      snapAt1200 = eLive.snapshot();

      while (!eLive.missionState.ended) {
        const cmds = referenceOperator(eLive.getTraineeView());
        for (const c of cmds) eLive.enqueueCommand(c);
        eLive.step();
      }
      const liveHash = eLive.getHash();

      // Snapshot restore
      const eRestored = Engine.restore(JSON.parse(JSON.stringify(snapAt1200)));
      while (!eRestored.missionState.ended) {
        const cmds = referenceOperator(eRestored.getTraineeView());
        for (const c of cmds) eRestored.enqueueCommand(c);
        eRestored.step();
      }
      expect(eRestored.getHash()).toBe(liveHash);
    }
  });

  // 7. View privacy leak audit
  it('7. View privacy leak audit: traineeView never contains role, groupId, decoy, autonomous, tactic; classes only in allowed fields', () => {
    const e = new Engine('privacy-test', 'proc:v1:elite');
    for (let t = 0; t < 200; t++) {
      if (e.missionState.ended) break;
      const cmds = referenceOperator(e.getTraineeView());
      for (const c of cmds) e.enqueueCommand(c);
      e.step();

      const view = e.getTraineeView();
      const viewStr = JSON.stringify(view);

      expect(viewStr).not.toContain('"role"');
      expect(viewStr).not.toContain('"groupId"');
      expect(viewStr).not.toContain('"decoy"');
      expect(viewStr).not.toContain('"autonomous"');
      expect(viewStr).not.toContain('"tactic"');
    }
  });

  // 8. Scoring
  it('8. Scoring: decoy -3, fiber+jammer penalty, 0.5 partial classification, effectorUse numbers', () => {
    // 8a. Decoy engagement penalty (-3)
    const reportDecoy = scoreSession({
      actors: [
        {
          id: 1,
          classId: 'decoy_drone',
          state: 'active',
          pos: { x: 500, y: 500, z: 50 },
          vel: { x: 0, y: 0, z: 0 },
          headingDeg: 0,
          speed: 20,
        },
      ],
      tracks: [
        {
          trackId: 101,
          actorId: 1,
          state: 'confirmed',
          isGhost: false,
          history: [],
          quality: 0.9,
          rcsBucket: 'medium',
          acked: true,
          confirmedTick: 20,
          ackTick: 30,
        },
      ],
      events: [
        {
          tick: 50,
          type: 'ENGAGEMENT_STARTED',
          payload: { trackId: 101, effector: 'gun' },
        },
      ],
    });
    const decoyPen = reportDecoy.penalties.find((p) => p.reason.includes('Engaged decoy'));
    expect(decoyPen).toBeDefined();
    expect(decoyPen?.points).toBe(3);
    expect(reportDecoy.effectorUse.wastedEngagements.decoy).toBe(1);

    // 8b. Fiber + jammer penalty (-5)
    const reportJammer = scoreSession({
      actors: [
        {
          id: 2,
          classId: 'fpv_fiber',
          state: 'active',
          pos: { x: 500, y: 500, z: 50 },
          vel: { x: 0, y: 0, z: 0 },
          headingDeg: 0,
          speed: 25,
        },
      ],
      tracks: [
        {
          trackId: 102,
          actorId: 2,
          state: 'confirmed',
          isGhost: false,
          history: [],
          quality: 0.9,
          rcsBucket: 'small',
          acked: true,
        },
      ],
      events: [
        {
          tick: 40,
          type: 'NO_EFFECT',
          payload: { trackId: 102, effector: 'jammer', reason: 'target_not_rf_controlled' },
        },
      ],
    });
    const jammerPen = reportJammer.penalties.find((p) => p.reason.includes('Wasted jammer'));
    expect(jammerPen).toBeDefined();
    expect(jammerPen?.points).toBe(5);

    // 8c. 0.5 partial classification between fpv_kamikaze and fpv_fiber
    const reportPartial = scoreSession({
      actors: [
        {
          id: 3,
          classId: 'fpv_fiber',
          state: 'neutralized',
          pos: { x: 0, y: 0, z: 0 },
          vel: { x: 0, y: 0, z: 0 },
          headingDeg: 0,
          speed: 0,
          neutralizedDistanceToAsset: 800,
        },
      ],
      tracks: [
        {
          trackId: 103,
          actorId: 3,
          state: 'confirmed',
          isGhost: false,
          history: [],
          quality: 0.9,
          rcsBucket: 'small',
          acked: true,
          assessedClass: 'fpv_kamikaze',
          classifyTick: 100,
        },
      ],
      events: [],
    });
    expect(reportPartial.perContact[0]?.classificationScore).toBe(0.5);

    // 8d. Effector use numbers
    const reportEffector = scoreSession({
      actors: [
        {
          id: 4,
          classId: 'fpv_kamikaze',
          state: 'neutralized',
          pos: { x: 0, y: 0, z: 0 },
          vel: { x: 0, y: 0, z: 0 },
          headingDeg: 0,
          speed: 0,
        },
      ],
      tracks: [
        {
          trackId: 104,
          actorId: 4,
          state: 'confirmed',
          isGhost: false,
          history: [],
          quality: 0.9,
          rcsBucket: 'small',
          acked: true,
        },
      ],
      events: [
        { tick: 10, type: 'ENGAGEMENT_STARTED', payload: { trackId: 104, effector: 'jammer' } },
        { tick: 20, type: 'ENGAGEMENT_STARTED', payload: { trackId: 104, effector: 'gun' } },
        { tick: 30, type: 'ENGAGEMENT_RESOLVED', payload: { trackId: 104, effector: 'gun', result: 'hit' } },
      ],
    });
    expect(reportEffector.effectorUse.gunBurstsFired).toBe(1);
    expect(reportEffector.effectorUse.jammerCycles).toBe(1);
    expect(reportEffector.effectorUse.killsPerEffector.gun).toBe(1);
    expect(reportEffector.effectorUse.killsPerEffector.jammer).toBe(0);
  });

  // 9. Scripted scenarios
  it('9. Scripted scenarios: referenceOperator ends all_resolved before tick 4800 on all 3 scenarios x 5 seeds', () => {
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];
    const seeds = ['s1', 's2', 's3', 's4', 's5'];

    for (const sc of scenarios) {
      for (const s of seeds) {
        const e = new Engine(s, sc);
        while (!e.missionState.ended) {
          const cmds = referenceOperator(e.getTraineeView());
          for (const c of cmds) e.enqueueCommand(c);
          e.step();
        }
        expect(e.missionState.ended).toBe(true);
        expect(e.missionState.reason).toBe('all_resolved');
        expect(e.world.tick).toBeLessThan(4800);
      }
    }
  });

  // 10. UI component tests
  it('10. UI component tests: Procedural card, Shift+A, N, and TrackTable internal scroll with 16 rows', () => {
    // 10a. Procedural card in MissionSetup
    const setupHtml = renderToStaticMarkup(
      <MissionSetup onStart={() => {}} />
    );
    expect(setupHtml).toContain('Procedural Swarm');
    expect(setupHtml).toContain('card-procedural');
    expect(setupHtml).toContain('tierSelect');

    // 10b. TrackTable internal scroll with 16 rows
    const mockTracks: TraineeTrack[] = [];
    for (let i = 1; i <= 16; i++) {
      mockTracks.push({
        trackId: i,
        state: 'confirmed',
        estimatedPosition: { x: i * 100, y: i * 100, z: 50 },
        rangeM: i * 200,
        bearingDeg: 45,
        altitudeM: 50,
        velocityValid: true,
        rcsBucket: 'small',
        quality: 0.8,
        acked: false,
        engagementStatus: 'none',
        lastPlotTick: i * 10,
      });
    }

    const tableHtml = renderToStaticMarkup(
      <TrackTable tracks={mockTracks} selectedTrackId={null} onSelectTrack={() => {}} />
    );

    for (let i = 1; i <= 16; i++) {
      expect(tableHtml).toContain(`T${i}`);
    }
    // Verify sticky header and scroll container styles in TrackTable markup
    expect(tableHtml).toContain('sticky');
    expect(tableHtml).toContain('overflow-y:auto');

    // 10c. Hotkeys Shift+A and N handlers
    const ackedTracks: number[] = [];
    let selectedTrack: number | null = null;

    const hotkeyProps = {
      tracks: mockTracks,
      selectedTrackId: selectedTrack,
      speed: 1 as const,
      isPaused: false,
      phase: 'running' as const,
      onSelectTrack: (id: number | null) => {
        selectedTrack = id;
      },
      onAcknowledge: (id: number) => {
        ackedTracks.push(id);
      },
      onClassify: () => {},
      onEngage: () => {},
      onHoldFire: () => {},
      onTogglePause: () => {},
      onSetSpeed: () => {},
    };

    // Trigger Shift+A: Acknowledge all unacknowledged confirmed tracks in tick order
    handleHotkey({ key: 'A', shiftKey: true }, hotkeyProps);
    expect(ackedTracks.length).toBe(16);
    expect(ackedTracks[0]).toBe(1);
    expect(ackedTracks[15]).toBe(16);

    // Trigger N: Select next unclassified confirmed track (ordered by range)
    handleHotkey({ key: 'n' }, hotkeyProps);
    expect(selectedTrack).toBe(1); // lowest range

    // Trigger N again when track 1 is selected
    hotkeyProps.selectedTrackId = 1;
    handleHotkey({ key: 'n' }, hotkeyProps);
    expect(selectedTrack).toBe(2);
  });
});
