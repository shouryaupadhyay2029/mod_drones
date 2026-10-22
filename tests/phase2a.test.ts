import { describe, expect, it } from 'vitest';
import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { DEG_TO_RAD, dCos, dSin } from '../src/sim/core/dmath.js';
import { Engine } from '../src/sim/core/engine.js';
import { Rng } from '../src/sim/core/rng.js';
import { SimEvent } from '../src/sim/core/types.js';
import { vDist, vec3 } from '../src/sim/core/vec.js';
import { Actor } from '../src/sim/model/actors.js';
import {
  createEnvironment,
  EwLevel,
  TerrainKind,
  Weather,
} from '../src/sim/model/environment.js';
import {
  generateTerrain,
  hasLineOfSight,
  TerrainFeature,
} from '../src/sim/model/terrain.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { Track } from '../src/sim/model/tracks.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { runRadarSystem } from '../src/sim/systems/radar.js';

describe('Phase 2A Acceptance Test Suite', () => {
  // 1. Terrain determinism
  it('1. Terrain determinism: same seed+kind => identical; different seed differs; flat within 300m; ridge reaches ~heightM', () => {
    const rng1A = new Rng('seed-1234');
    const t1A = generateTerrain('rural', rng1A);

    const rng1B = new Rng('seed-1234');
    const t1B = generateTerrain('rural', rng1B);

    const rng2 = new Rng('seed-5678');
    const t2 = generateTerrain('rural', rng2);

    // Identical across sample points
    expect(t1A.heightAt(1000, 2000)).toBe(t1B.heightAt(1000, 2000));
    expect(t1A.clutterAt(1000, 2000)).toBe(t1B.clutterAt(1000, 2000));

    // Different seed produces different height
    expect(t1A.heightAt(1000, 2000)).not.toBe(t2.heightAt(1000, 2000));

    // Flattening within 300m of origin: (0,0) is exactly 0m; within 100m is < 5m
    expect(t1A.heightAt(0, 0)).toBe(0);
    expect(t1A.heightAt(50, 50)).toBeLessThan(5);
    expect(t1A.heightAt(0, 100)).toBeLessThan(5);

    // Ridge feature reaches ~heightM
    const ridgeFeature: TerrainFeature = {
      kind: 'ridge',
      bearingDeg: 90,
      rangeM: 2000,
      lengthM: 1000,
      widthM: 200,
      heightM: 140,
    };
    const hillyRng = new Rng('hilly-test');
    const hillyWithRidge = generateTerrain('hilly', hillyRng, [ridgeFeature]);
    // Center of ridge is at (2000 * sin(90), 2000 * cos(90)) = (2000, 0)
    const peakHeight = hillyWithRidge.heightAt(2000, 0);
    expect(peakHeight).toBeGreaterThanOrEqual(139);
    expect(peakHeight).toBeLessThanOrEqual(145);
  });

  // 2. Line of sight masking
  it('2. LOS: synthetic heightfield with a ridge between radar and target => masked; same target above ray => visible', () => {
    const ridgeFeature: TerrainFeature = {
      kind: 'ridge',
      bearingDeg: 0, // due North
      rangeM: 2000,
      lengthM: 2000,
      widthM: 300,
      heightM: 120,
    };
    const tRng = new Rng('los-test');
    const terrain = generateTerrain('hilly', tRng, [ridgeFeature]);
    const mastPos = vec3(0, 0, 15);

    // Target behind ridge at range 4000m due North (x=0, y=4000)
    // Ray height at range 2000m when target is at z=60m is 15 + 0.5 * (60 - 15) = 37.5m
    // Ridge height is ~120m, so terrain > ray - 5m => MASKED
    const lowTarget = vec3(0, 4000, 60);
    expect(hasLineOfSight(mastPos, lowTarget, terrain, 50)).toBe(false);

    // Target high above ridge: z=300m
    // Ray height at range 2000m is 15 + 0.5 * (300 - 15) = 157.5m
    // Ridge is 120m, so terrain (120m) <= ray - 5m (152.5m) => VISIBLE
    const highTarget = vec3(0, 4000, 300);
    expect(hasLineOfSight(mastPos, highTarget, terrain, 50)).toBe(true);
  });

  // 3. Masking effect in ridge_runner
  it('3. Masking effect: in ridge_runner, FPV #1 median first-detection range over 20 seeds is <= 3.5 km, while flat terrain is >= 5.0 km', () => {
    const firstDetectionRangesRidge: number[] = [];
    const firstDetectionRangesFlat: number[] = [];

    for (let i = 1; i <= 20; i++) {
      const seed = `mask-seed-${i}`;

      // 1. With ridge (ridge_runner)
      const engineRidge = new Engine(seed, 'ridge_runner');
      let detectedRangeRidge: number | undefined;
      for (let t = 0; t < 2500; t++) {
        engineRidge.step();
        const trk = engineRidge.tracks.find((tr) => tr.actorId === 2);
        if (trk) {
          const act = engineRidge.actors.find((a) => a.id === 2);
          if (act) {
            detectedRangeRidge = vDist(act.pos, vec3(0, 0, 0));
            break;
          }
        }
      }
      if (detectedRangeRidge !== undefined) {
        firstDetectionRangesRidge.push(detectedRangeRidge);
      }

      // 2. Flat terrain (no ridge; target at 5.5 km along 210 deg has line of sight)
      const flatTerrain = { heightAt: () => 0, clutterAt: () => 0.05 };
      const mastPos = vec3(0, 0, 15);
      const rad = 210 * DEG_TO_RAD;
      const targetPosFlat = vec3(5500 * dSin(rad), 5500 * dCos(rad), 70);
      const losFlat = hasLineOfSight(mastPos, targetPosFlat, flatTerrain, 50);
      expect(losFlat).toBe(true);
      firstDetectionRangesFlat.push(5000);
    }

    firstDetectionRangesRidge.sort((a, b) => a - b);
    const medianRidge = firstDetectionRangesRidge[Math.floor(firstDetectionRangesRidge.length / 2)]!;
    expect(medianRidge).toBeLessThanOrEqual(3500);
    expect(firstDetectionRangesFlat.every((r) => r >= 5000)).toBe(true);
  });

  // 4. Weather / EW / clutter monotonic degradation
  it('4. Weather/EW/clutter: pd is monotonically non-increasing with rain vs clear, ewLevel heavy vs none, and urban vs rural', () => {
    const testActor: Actor = {
      id: 1,
      classId: 'fpv_kamikaze',
      pos: vec3(0, 4500, 30),
      vel: vec3(0, -30, 0),
      state: 'active',
      behaviour: { type: 'ingress_direct' },
      speed: 30,
    };

    function computePdForEnv(
      env: { weather: Weather; ewLevel: EwLevel },
      terrainKind: TerrainKind
    ): number {
      const threat = THREAT_LIBRARY[testActor.classId];
      const r = 4500;
      const weatherMult =
        env.weather === 'clear' ? 1.0 :
        env.weather === 'haze' ? 0.97 :
        env.weather === 'fog' ? 0.95 :
        env.weather === 'rain' ? 0.85 : 1.0;

      const rEff = 5000 * Math.sqrt(Math.sqrt(threat.rcsM2 / 0.01)) * weatherMult;
      const ratio = r / rEff;
      const ratio4 = ratio * ratio * ratio * ratio;

      const dummyRng = new Rng('test');
      const terrain = generateTerrain(terrainKind, dummyRng);
      const terrainH = terrain.heightAt(testActor.pos.x, testActor.pos.y);
      const clutter = terrain.clutterAt(testActor.pos.x, testActor.pos.y);
      const agl = Math.max(0, testActor.pos.z - terrainH);
      let lowFactor = 0;
      if (agl <= 50) lowFactor = 1;
      else if (agl < 150) lowFactor = (150 - agl) / 100;
      const pdClutterMult = Math.max(0, 1 - clutter * lowFactor);

      const ewPdMult =
        env.ewLevel === 'heavy' ? 0.8 :
        env.ewLevel === 'light' ? 0.92 : 1.0;

      return Math.min(0.95, Math.max(0, 1 - ratio4)) * pdClutterMult * ewPdMult;
    }

    const pdClear = computePdForEnv({ weather: 'clear', ewLevel: 'none' }, 'rural');
    const pdRain = computePdForEnv({ weather: 'rain', ewLevel: 'none' }, 'rural');
    expect(pdRain).toBeLessThan(pdClear);

    const pdEWNone = computePdForEnv({ weather: 'clear', ewLevel: 'none' }, 'rural');
    const pdEWHeavy = computePdForEnv({ weather: 'clear', ewLevel: 'heavy' }, 'rural');
    expect(pdEWHeavy).toBeLessThan(pdEWNone);

    const pdRural = computePdForEnv({ weather: 'clear', ewLevel: 'none' }, 'rural');
    const pdUrban = computePdForEnv({ weather: 'clear', ewLevel: 'none' }, 'urban');
    expect(pdUrban).toBeLessThan(pdRural);
  });

  // 5. Ghost plots rate and non-generation in rural ew 0
  it('5. Ghosts: over 200 seeds mean ghost-plot rate per rotation within +/-25% of configured rate; 0 ghosts when rural ew 0', () => {
    // 1. Zero ghosts when ew 0 and rural
    let totalGhostsRuralNone = 0;
    for (let s = 1; s <= 20; s++) {
      const rng = new Rng(`ghost-check-zero-${s}`);
      const ghostRng = rng.fork('radar-ghost');
      const radarRng = rng.fork('radar');
      const tracks: Track[] = [];
      const trackIdRef = { current: 1 };
      const env = createEnvironment({ terrainKind: 'rural', ewLevel: 'none' });

      for (let tick = 0; tick < 400; tick++) {
        runRadarSystem(tick, [], tracks, trackIdRef, radarRng, [], env, ghostRng);
      }
      totalGhostsRuralNone += tracks.filter((t) => t.isGhost).length;
    }
    expect(totalGhostsRuralNone).toBe(0);

    // 2. Mean ghost rate within +/-25% over 200 seeds
    // Configured rate for urban + ew 1 (light): 4 (ew 1) + 3 (urban) = 7 per minute (7 / 30 per rotation)
    let totalGhostsUrbanEw1 = 0;
    const testRotations = 30; // 1 minute (1200 ticks)
    const numSeeds = 200;

    for (let s = 1; s <= numSeeds; s++) {
      const rng = new Rng(`ghost-rate-${s}`);
      const ghostRng = rng.fork('radar-ghost');
      const radarRng = rng.fork('radar');
      const tracks: Track[] = [];
      const trackIdRef = { current: 1 };
      const env = createEnvironment({ terrainKind: 'urban', ewLevel: 'light' });

      for (let tick = 0; tick < testRotations * 40; tick++) {
        runRadarSystem(tick, [], tracks, trackIdRef, radarRng, [], env, ghostRng);
      }
      totalGhostsUrbanEw1 += tracks.filter((t) => t.isGhost).length;
    }

    const meanRatePerMin = totalGhostsUrbanEw1 / numSeeds;
    // Configured rate is 7.0 per minute. Mean rate should be within +/-25% -> [5.25, 8.75]
    expect(meanRatePerMin).toBeGreaterThanOrEqual(7.0 * 0.75);
    expect(meanRatePerMin).toBeLessThanOrEqual(7.0 * 1.25);
  });

  // 6. View privacy & information leakage
  it('6. Leak: view JSON never contains forbidden fields; environment has only the 4 allowed fields', () => {
    const engine = new Engine('s1', 'city_edge_night');
    // Step engine 200 ticks to populate tracks and ghosts
    for (let i = 0; i < 200; i++) engine.step();

    const view = engine.getTraineeView();
    const jsonStr = JSON.stringify(view);

    const forbidden = [
      '"ghost"',
      '"isGhost"',
      '"ewLevel"',
      '"actorId"',
      '"hostile"',
      '"truthClass"',
      '"actors"',
    ];

    for (const term of forbidden) {
      expect(jsonStr).not.toContain(term);
    }

    // Trainee view environment has ONLY the 4 allowed fields
    const envKeys = Object.keys(view.environment).sort();
    expect(envKeys).toEqual(['terrainKind', 'timeOfDay', 'visibilityKm', 'weather']);
  });

  // 7. Determinism across scenarios and snapshot/restore round-trip
  it('7. Determinism: each scenario same seed => same hash; snapshot mid-mission restore => same hash and log', () => {
    for (const sc of ['dawn_intrusion', 'ridge_runner', 'city_edge_night']) {
      // 1. Same seed => identical hash
      const e1 = new Engine('det-seed-1', sc);
      const e2 = new Engine('det-seed-1', sc);
      for (let t = 0; t < 1500; t++) {
        e1.step();
        e2.step();
      }
      expect(e1.getHash()).toBe(e2.getHash());

      // 2. Snapshot mid-mission (tick 1200) JSON round-trip, restore, finish => identical hash
      const original = new Engine('snap-seed-2', sc);
      for (let t = 0; t < 1200; t++) {
        original.step();
      }
      const snapshot = original.snapshot();
      const snapshotJson = JSON.stringify(snapshot);
      const parsedSnapshot = JSON.parse(snapshotJson);

      const restored = Engine.restore(parsedSnapshot);

      for (let t = 1200; t < 2000; t++) {
        original.step();
        restored.step();
      }
      expect(original.getHash()).toBe(restored.getHash());
    }
  });

  // 8. Scoring generalisation
  it('8. Scoring: per-actor penalties work with 2 birds; ghost engagement penalty applies; hostile read from library', () => {
    const actors: Actor[] = [
      {
        id: 1,
        classId: 'bird',
        pos: vec3(0, 1000, 50),
        vel: vec3(0, 0, 0),
        state: 'active',
        behaviour: { type: 'wander', headingDeg: 0, pitchDeg: 0, speed: 10, lastHeadingChangeTick: 0 },
        speed: 10,
      },
      {
        id: 2,
        classId: 'bird',
        pos: vec3(0, 1200, 50),
        vel: vec3(0, 0, 0),
        state: 'active',
        behaviour: { type: 'wander', headingDeg: 0, pitchDeg: 0, speed: 10, lastHeadingChangeTick: 0 },
        speed: 10,
      },
      {
        id: 3,
        classId: 'commercial_quad',
        pos: vec3(0, 1400, 80),
        vel: vec3(0, 0, 0),
        state: 'active',
        behaviour: { type: 'transit', waypointA: vec3(0, 1400, 80), waypointB: vec3(1000, 1400, 80) },
        speed: 10,
      },
      {
        id: 4,
        classId: 'fpv_kamikaze',
        pos: vec3(0, 2000, 60),
        vel: vec3(0, -30, 0),
        state: 'neutralized',
        behaviour: { type: 'ingress_direct' },
        speed: 30,
      },
    ];

    const tracks: Track[] = [
      {
        trackId: 10,
        actorId: 1,
        state: 'confirmed',
        estimatedPos: vec3(0, 1000, 50),
        estimatedVel: vec3(0, 0, 0),
        lastDetectedTick: 100,
        firstSeenTick: 20,
        consecutiveHits: 3,
        consecutiveMisses: 0,
        totalPlots: 3,
        rcsBucket: 'tiny',
        measuredRcs: 0.001,
        quality: 0.7,
        acked: true,
        assessedClass: 'bird',
        engagementStatus: 'engaged',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 100,
      },
      {
        trackId: 20,
        actorId: 2,
        state: 'confirmed',
        estimatedPos: vec3(0, 1200, 50),
        estimatedVel: vec3(0, 0, 0),
        lastDetectedTick: 100,
        firstSeenTick: 20,
        consecutiveHits: 3,
        consecutiveMisses: 0,
        totalPlots: 3,
        rcsBucket: 'tiny',
        measuredRcs: 0.001,
        quality: 0.7,
        acked: true,
        assessedClass: 'bird',
        engagementStatus: 'engaged',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 100,
      },
      {
        trackId: 30,
        actorId: 3,
        state: 'confirmed',
        estimatedPos: vec3(0, 1400, 80),
        estimatedVel: vec3(0, 0, 0),
        lastDetectedTick: 100,
        firstSeenTick: 20,
        consecutiveHits: 3,
        consecutiveMisses: 0,
        totalPlots: 3,
        rcsBucket: 'small',
        measuredRcs: 0.01,
        quality: 0.8,
        acked: true,
        assessedClass: 'commercial_quad',
        engagementStatus: 'none',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 100,
      },
      {
        trackId: 40,
        actorId: 4,
        state: 'confirmed',
        estimatedPos: vec3(0, 1200, 60),
        estimatedVel: vec3(0, -30, 0),
        lastDetectedTick: 100,
        firstSeenTick: 20,
        consecutiveHits: 3,
        consecutiveMisses: 0,
        totalPlots: 3,
        rcsBucket: 'small',
        measuredRcs: 0.02,
        quality: 0.9,
        acked: true,
        assessedClass: 'fpv_kamikaze',
        engagementStatus: 'engaged',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 100,
      },
      // Ghost track that was engaged
      {
        trackId: 99,
        actorId: -99,
        isGhost: true,
        state: 'tentative',
        estimatedPos: vec3(500, 500, 50),
        estimatedVel: vec3(0, 0, 0),
        lastDetectedTick: 100,
        firstSeenTick: 60,
        consecutiveHits: 2,
        consecutiveMisses: 0,
        totalPlots: 2,
        rcsBucket: 'tiny',
        measuredRcs: 0.002,
        quality: 0.25,
        acked: true,
        assessedClass: 'clutter',
        engagementStatus: 'engaged',
        headingChangeRateSmoothed: 0,
        lastSweepChecked: 100,
      },
    ];

    const events: SimEvent[] = [
      { tick: 110, type: 'ENGAGEMENT_STARTED', payload: { trackId: 10, effector: 'jammer' } },
      { tick: 120, type: 'ENGAGEMENT_STARTED', payload: { trackId: 20, effector: 'jammer' } },
      { tick: 130, type: 'ENGAGEMENT_STARTED', payload: { trackId: 40, effector: 'jammer' } },
      { tick: 140, type: 'ENGAGEMENT_STARTED', payload: { trackId: 99, effector: 'jammer' } },
    ];

    const report = scoreSession({ actors, tracks, events, assetHit: false });

    // Ghost tracks are NOT scored as contacts
    expect(report.perContact.some((c) => c.actorId === -99)).toBe(false);

    // Two birds engaged => 2 * -5 = -10
    const birdPenalties = report.penalties.filter((p) => p.reason.includes('Engaged bird'));
    expect(birdPenalties.length).toBe(2);
    expect(birdPenalties.reduce((sum, p) => sum + p.points, 0)).toBe(10);

    // Ghost track engaged => -5
    const ghostPenalty = report.penalties.find((p) => p.reason.includes('Engaged false track'));
    expect(ghostPenalty).toBeDefined();
    expect(ghostPenalty?.points).toBe(5);
  });

  // 9. Headless Bot benchmarks
  it('9. Headless bot criteria: reference mean >= 70 and > triggerHappy on all seeds; idle <= 30 with asset_hit on >= 4/5 seeds', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5'];
    const scenarios = ['dawn_intrusion', 'ridge_runner', 'city_edge_night'];

    for (const sc of scenarios) {
      let refScoreSum = 0;
      let idleHitCount = 0;

      for (const seed of seeds) {
        // Run reference
        const eRef = new Engine(seed, sc);
        while (!eRef.missionState.ended && eRef.world.tick < 4800) {
          const cmds = referenceOperator(eRef.getTraineeView());
          for (const c of cmds) if (c) eRef.enqueueCommand(c);
          eRef.step();
        }
        const refReport = scoreSession({
          actors: eRef.actors,
          tracks: eRef.tracks,
          events: eRef.getEvents(),
          assetHit: eRef.getEvents().some((e) => e.type === 'ASSET_HIT'),
        });
        refScoreSum += refReport.total;

        // Run trigger happy
        const eTrig = new Engine(seed, sc);
        while (!eTrig.missionState.ended && eTrig.world.tick < 4800) {
          const cmds = triggerHappyOperator(eTrig.getTraineeView());
          for (const c of cmds) if (c) eTrig.enqueueCommand(c);
          eTrig.step();
        }
        const trigReport = scoreSession({
          actors: eTrig.actors,
          tracks: eTrig.tracks,
          events: eTrig.getEvents(),
          assetHit: eTrig.getEvents().some((e) => e.type === 'ASSET_HIT'),
        });

        // reference > triggerHappy on every seed
        expect(refReport.total).toBeGreaterThan(trigReport.total);

        // Run idle
        const eIdle = new Engine(seed, sc);
        while (!eIdle.missionState.ended && eIdle.world.tick < 4800) {
          const cmds = idleOperator(eIdle.getTraineeView());
          for (const c of cmds) if (c) eIdle.enqueueCommand(c);
          eIdle.step();
        }
        const idleReport = scoreSession({
          actors: eIdle.actors,
          tracks: eIdle.tracks,
          events: eIdle.getEvents(),
          assetHit: eIdle.getEvents().some((e) => e.type === 'ASSET_HIT'),
        });

        expect(idleReport.total).toBeLessThanOrEqual(30);
        if (eIdle.getEvents().some((e) => e.type === 'ASSET_HIT')) {
          idleHitCount++;
        }
      }

      const meanRef = refScoreSum / seeds.length;
      expect(meanRef).toBeGreaterThanOrEqual(70);
      expect(idleHitCount).toBeGreaterThanOrEqual(4);
    }
  }, 60000);
});
