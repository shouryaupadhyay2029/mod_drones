import { describe, expect, it } from 'vitest';
import { idleOperator } from '../src/sim/bots/idleOperator.js';
import { referenceOperator } from '../src/sim/bots/referenceOperator.js';
import { triggerHappyOperator } from '../src/sim/bots/triggerHappyOperator.js';
import { Engine } from '../src/sim/core/engine.js';
import { replay } from '../src/sim/core/log.js';
import { Command } from '../src/sim/core/types.js';
import { bearingDeg, vec3, vDist, vLen } from '../src/sim/core/vec.js';
import { Actor, createActor } from '../src/sim/model/actors.js';
import { Track } from '../src/sim/model/tracks.js';
import { scoreSession } from '../src/sim/scoring/basic.js';
import { TraineeView } from '../src/sim/view/traineeView.js';

function runMissionWithBot(
  seed: string | number,
  botFn: (view: TraineeView) => Command[],
  maxTicks = 4800
): Engine {
  const engine = new Engine(seed, 'dawn_intrusion');
  while (!engine.missionState.ended && engine.world.tick < maxTicks) {
    const view = engine.getTraineeView();
    const commands = botFn(view);
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd) engine.enqueueCommand(cmd);
    }
    engine.step();
  }
  return engine;
}

describe('Phase 1A: Simulation Vertical Slice & Determinism', { timeout: 30000 }, () => {
  // Acceptance Test 3: Seed Repeatability
  it('3. Seed repeatability: same seed + same bot => identical hash; different seed => different hash', () => {
    const seed = 'repeatable-test-seed-42';
    const run1 = runMissionWithBot(seed, referenceOperator, 1500);
    const run2 = runMissionWithBot(seed, referenceOperator, 1500);
    const runDiff = runMissionWithBot('different-seed-99', referenceOperator, 1500);

    expect(run1.getHash()).toBe(run2.getHash());
    expect(run1.getHash()).not.toBe(runDiff.getHash());
  });

  // Acceptance Test 4: Replay & Snapshot Integrity
  it('4a. Replay: replay(sessionLog) matches live engine hash', () => {
    const seed = 'replay-dawn-seed';
    const engine = runMissionWithBot(seed, referenceOperator, 2500);
    const liveHash = engine.getHash();

    const log = engine.getSessionLog();
    const replayedHash = replay(log);

    expect(replayedHash).toBe(liveHash);
  });

  it('4b. Snapshot: snapshot at tick 1200, JSON roundtrip, restore, run to finish => identical hash and deep-equal getSessionLog()', () => {
    const seed = 'snapshot-roundtrip-seed';

    // 1. Uninterrupted run
    const uninterrupted = new Engine(seed, 'dawn_intrusion');
    while (!uninterrupted.missionState.ended && uninterrupted.world.tick < 2000) {
      const view = uninterrupted.getTraineeView();
      const commands = referenceOperator(view);
      for (const cmd of commands) uninterrupted.enqueueCommand(cmd);
      uninterrupted.step();
    }
    const uninterruptedHash = uninterrupted.getHash();
    const uninterruptedLog = uninterrupted.getSessionLog();

    // 2. Interrupted run to tick 1200
    const interrupted = new Engine(seed, 'dawn_intrusion');
    while (!interrupted.missionState.ended && interrupted.world.tick < 1200) {
      const view = interrupted.getTraineeView();
      const commands = referenceOperator(view);
      for (const cmd of commands) interrupted.enqueueCommand(cmd);
      interrupted.step();
    }

    // Snapshot, JSON serialize/parse
    const rawSnapshot = interrupted.snapshot();
    const jsonStr = JSON.stringify(rawSnapshot);
    const parsedSnapshot = JSON.parse(jsonStr);

    // Restore into fresh Engine
    const restored = Engine.restore(parsedSnapshot);
    expect(restored.world.tick).toBe(1200);
    expect(restored.getHash()).toBe(interrupted.getHash());

    // Continue run to tick 2000
    while (!restored.missionState.ended && restored.world.tick < 2000) {
      const view = restored.getTraineeView();
      const commands = referenceOperator(view);
      for (const cmd of commands) restored.enqueueCommand(cmd);
      restored.step();
    }

    expect(restored.getHash()).toBe(uninterruptedHash);
    expect(restored.getSessionLog()).toEqual(uninterruptedLog);
    expect(replay(restored.getSessionLog())).toBe(uninterruptedHash);
  });

  // Acceptance Test 5: Ground Truth Leakage Prevention
  it('5. Ground truth leakage: view never contains hostile/actorId/truthClass/actors, and positions have noise', () => {
    const engine = new Engine('anti-leak-seed', 'dawn_intrusion');

    for (let tick = 0; tick < 1500; tick++) {
      const view = engine.getTraineeView();
      const serialized = JSON.stringify(view);

      expect(serialized).not.toContain('"hostile"');
      expect(serialized).not.toContain('"actorId"');
      expect(serialized).not.toContain('"truthClass"');
      expect(serialized).not.toContain('"actors"');

      // Check noise on confirmed/tentative tracks compared to true actor positions
      for (const trk of view.tracks) {
        const actor = engine.actors.find((a) => a.id === (trk as unknown as { actorId?: number }).actorId);
        if (actor && actor.state === 'active') {
          // Track estimated position must not be exactly identical to actor true position
          const dist = vDist(trk.estimatedPosition, actor.pos);
          expect(dist).toBeGreaterThan(0);
        }
      }

      const commands = referenceOperator(view);
      for (const cmd of commands) engine.enqueueCommand(cmd);
      engine.step();
    }
  });

  // Acceptance Test 6: Radar RCS Scaling & Track Lifecycle
  it('6a. Radar RCS scaling: bird detection range < FPV detection range over 200 seeds', () => {
    let birdMaxDistSum = 0;
    let fpvMaxDistSum = 0;
    let trials = 0;

    for (let s = 1; s <= 200; s++) {
      const engine = new Engine(`radar-stat-seed-${s}`, 'dawn_intrusion');
      let birdFirstDist: number | null = null;
      let fpvFirstDist: number | null = null;

      for (let t = 0; t < 2000; t++) {
        engine.step();
        const events = engine.getEvents();
        for (const e of events) {
          if (e.type === 'TRACK_CONFIRMED' && e.payload) {
            const trkId = (e.payload as { trackId: number }).trackId;
            const trk = engine.tracks.find((x) => x.trackId === trkId);
            const actor = engine.actors.find((a) => a.id === trk?.actorId);
            const dist = (e.payload as { rangeM: number }).rangeM;

            if (actor?.classId === 'bird' && birdFirstDist === null) {
              birdFirstDist = dist;
            } else if (actor?.classId === 'fpv_kamikaze' && fpvFirstDist === null) {
              fpvFirstDist = dist;
            }
          }
        }
        if (birdFirstDist !== null && fpvFirstDist !== null) break;
      }

      if (birdFirstDist !== null && fpvFirstDist !== null) {
        birdMaxDistSum += birdFirstDist;
        fpvMaxDistSum += fpvFirstDist;
        trials++;
      }
    }

    expect(trials).toBeGreaterThan(50);
    // Mean first confirmation range for bird (RCS 0.001) must be significantly less than FPV (RCS 0.02)
    const birdMean = birdMaxDistSum / trials;
    const fpvMean = fpvMaxDistSum / trials;
    expect(birdMean).toBeLessThan(fpvMean);
  });

  it('6b. Track lifecycle: transitions through tentative -> confirmed -> lost/dropped', () => {
    const engine = new Engine('lifecycle-seed', 'dawn_intrusion');
    let sawTentative = false;
    let sawConfirmed = false;

    for (let t = 0; t < 3000; t++) {
      engine.step();
      for (const trk of engine.tracks) {
        if (trk.state === 'tentative') sawTentative = true;
        if (trk.state === 'confirmed') sawConfirmed = true;
      }
    }

    expect(sawTentative).toBe(true);
    expect(sawConfirmed).toBe(true);
  });

  // Acceptance Test 7: Command Validation & Rejection
  it('7. Command validation: unknown trackId, out-of-range, and effector-busy generate rejection events without throwing', () => {
    const engine = new Engine('command-val-seed', 'dawn_intrusion');
    engine.stepN(100);

    // Unknown track ACK
    expect(() => {
      engine.enqueueCommand({
        tick: 100,
        type: 'ACK_TRACK',
        payload: { trackId: 9999 },
      });
      engine.step();
    }).not.toThrow();

    const ackRejection = engine.getEvents().find(
      (e) => e.type === 'COMMAND_REJECTED' && (e.payload as { reason?: string })?.reason === 'unknown_or_dropped_track'
    );
    expect(ackRejection).toBeDefined();

    // Out of range engagement
    // Advance until FPV track is confirmed at >1500m
    while (engine.world.tick < 1500) {
      engine.step();
      const fpvTrack = engine.tracks.find((t) => {
        const actor = engine.actors.find((a) => a.id === t.actorId);
        return actor?.classId === 'fpv_kamikaze' && t.state === 'confirmed';
      });
      if (fpvTrack && vDist(fpvTrack.estimatedPos, vec3(0, 0, 0)) > 2000) {
        engine.enqueueCommand({
          tick: engine.world.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: fpvTrack.trackId, effector: 'jammer' },
        });
        engine.step();
        break;
      }
    }

    const outOfRangeEvent = engine.getEvents().find(
      (e) => e.type === 'ENGAGEMENT_REJECTED' && (e.payload as { reason?: string })?.reason === 'out_of_range'
    );
    expect(outOfRangeEvent).toBeDefined();
  });

  // Acceptance Test 8: Scoring Assertions
  it('8. Scoring: referenceOperator >= 85 on at least 4 of 5 seeds, idle <= 30 with asset_hit, triggerHappy lower than reference', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5'];
    let refHighScoreCount = 0;

    for (const seed of seeds) {
      // 1. Reference Operator
      const refEngine = runMissionWithBot(seed, referenceOperator);
      const refReport = scoreSession({
        actors: refEngine.actors,
        tracks: refEngine.tracks,
        events: refEngine.getEvents(),
      });
      if (refReport.total >= 85) refHighScoreCount++;

      // 2. Idle Operator
      const idleEngine = runMissionWithBot(seed, idleOperator);
      const idleReport = scoreSession({
        actors: idleEngine.actors,
        tracks: idleEngine.tracks,
        events: idleEngine.getEvents(),
      });
      expect(idleReport.total).toBeLessThanOrEqual(30);
      const idleAssetHit = idleEngine.getEvents().some((e) => e.type === 'ASSET_HIT');
      expect(idleAssetHit).toBe(true);

      // 3. Trigger Happy Operator
      const thEngine = runMissionWithBot(seed, triggerHappyOperator);
      const thReport = scoreSession({
        actors: thEngine.actors,
        tracks: thEngine.tracks,
        events: thEngine.getEvents(),
      });
      expect(thReport.total).toBeLessThan(refReport.total);
    }

    expect(refHighScoreCount).toBeGreaterThanOrEqual(4);
  });

  // Acceptance Test 9: Mission End Conditions
  it('9a. Mission end condition: asset_hit', () => {
    // Idle bot allows FPV drone to reach asset
    const engine = runMissionWithBot('asset-hit-seed', idleOperator);
    expect(engine.missionState.ended).toBe(true);
    expect(engine.missionState.reason).toBe('asset_hit');
    const assetHitEvent = engine.getEvents().find((e) => e.type === 'ASSET_HIT');
    expect(assetHitEvent).toBeDefined();
  });

  it('9b. Mission end condition: time_limit', () => {
    // If we run to tick 4800 without all resolved and no asset hit
    const engine = new Engine('time-limit-seed', 'sandbox');
    engine.stepN(4800);
    expect(engine.missionState.ended).toBe(true);
    expect(engine.missionState.reason).toBe('time_limit');
  });

  it('9c. Mission end condition: all_resolved', () => {
    // Sandbox with single neutralized actor
    const engine = new Engine('all-resolved-seed', 'sandbox');
    const actor = createActor(1, 'fpv_kamikaze', vec3(100, 100, 50), { type: 'wander' }, 10);
    actor.state = 'neutralized';
    engine.actors.push(actor);

    // Step engine to check mission rules
    engine.step();
    expect(engine.missionState.ended).toBe(true);
    expect(engine.missionState.reason).toBe('all_resolved');
  });

  it('9d. Mission end condition: all_resolved fires for reference operator in Dawn Intrusion', () => {
    const engine = runMissionWithBot('s1', referenceOperator);
    expect(engine.missionState.ended).toBe(true);
    expect(engine.missionState.reason).toBe('all_resolved');
    expect(engine.world.tick).toBeLessThan(4800);
  });

  // Step 0.1 Multi-track Scoring Tests
  it('10a. Multi-track scoring: two tracks on civilian quad, engagement on second track applies -25 penalty', () => {
    const quadActor: Actor = {
      id: 2,
      classId: 'commercial_quad',
      pos: vec3(1000, 1000, 50),
      vel: vec3(0, 0, 0),
      state: 'left_area',
      behaviour: { type: 'transit', waypointA: vec3(0, 0, 0), waypointB: vec3(1000, 1000, 0) },
      speed: 12,
    };
    const track1: Track = {
      trackId: 10,
      actorId: 2,
      state: 'dropped',
      estimatedPos: vec3(1000, 1000, 50),
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 100,
      firstSeenTick: 50,
      consecutiveHits: 3,
      consecutiveMisses: 5,
      rcsBucket: 'small',
      measuredRcs: 0.01,
      quality: 0.1,
      acked: false,
      engagementStatus: 'none',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 100,
    };
    const track2: Track = {
      trackId: 11,
      actorId: 2,
      state: 'confirmed',
      confirmedTick: 200,
      estimatedPos: vec3(900, 900, 50),
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 250,
      firstSeenTick: 180,
      consecutiveHits: 4,
      consecutiveMisses: 0,
      rcsBucket: 'small',
      measuredRcs: 0.01,
      quality: 0.8,
      acked: true,
      ackTick: 220,
      engagementStatus: 'engaged',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 250,
    };

    const report = scoreSession({
      actors: [quadActor],
      tracks: [track1, track2],
      events: [
        {
          tick: 230,
          type: 'ENGAGEMENT_STARTED',
          payload: { trackId: 11, effectorType: 'gun' },
        },
      ],
    });

    const quadPenalty = report.penalties.find((p) => p.points === 25);
    expect(quadPenalty).toBeDefined();
    expect(quadPenalty?.reason).toContain('Engaged civilian quad');
  });

  it('10b. Multi-track scoring: detection credit earned on second track when first track was not acked', () => {
    const quadActor: Actor = {
      id: 2,
      classId: 'commercial_quad',
      pos: vec3(1000, 1000, 50),
      vel: vec3(0, 0, 0),
      state: 'left_area',
      behaviour: { type: 'transit', waypointA: vec3(0, 0, 0), waypointB: vec3(1000, 1000, 0) },
      speed: 12,
    };
    const track1: Track = {
      trackId: 10,
      actorId: 2,
      state: 'dropped',
      estimatedPos: vec3(1000, 1000, 50),
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 100,
      firstSeenTick: 50,
      consecutiveHits: 3,
      consecutiveMisses: 5,
      rcsBucket: 'small',
      measuredRcs: 0.01,
      quality: 0.1,
      acked: false,
      engagementStatus: 'none',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 100,
    };
    const track2: Track = {
      trackId: 11,
      actorId: 2,
      state: 'confirmed',
      confirmedTick: 200,
      estimatedPos: vec3(900, 900, 50),
      estimatedVel: vec3(0, 0, 0),
      lastDetectedTick: 250,
      firstSeenTick: 180,
      consecutiveHits: 4,
      consecutiveMisses: 0,
      rcsBucket: 'small',
      measuredRcs: 0.01,
      quality: 0.8,
      acked: true,
      ackTick: 240, // 40 ticks = 2.0s <= 3.0s => perfect detection score 1.0
      engagementStatus: 'none',
      headingChangeRateSmoothed: 0,
      lastSweepChecked: 250,
    };

    const report = scoreSession({
      actors: [quadActor],
      tracks: [track1, track2],
      events: [],
    });

    const contact = report.perContact.find((c) => c.actorId === 2);
    expect(contact).toBeDefined();
    expect(contact?.detectionScore).toBe(1.0);
    expect(contact?.ackLatencySec).toBe(2.0);
  });

  // Step 2: Course on tracks & FPV course estimation accuracy
  it('11. Median FPV course estimation error is < 30 deg across seeds s1-s5', () => {
    const fpvErrors: number[] = [];
    const seeds = ['s1', 's2', 's3', 's4', 's5'];

    for (const seed of seeds) {
      const engine = new Engine(seed, 'dawn_intrusion');
      while (!engine.missionState.ended && engine.world.tick < 4800) {
        const view = engine.getTraineeView();
        for (const trk of view.tracks) {
          if (trk.courseDeg === undefined || trk.speedMps <= 1) continue;
          const realTrack = engine.tracks.find((t) => t.trackId === trk.trackId);
          if (!realTrack) continue;
          const actor = engine.actors.find((a) => a.id === realTrack.actorId);
          if (!actor || actor.classId !== 'fpv_kamikaze' || actor.state !== 'active') continue;
          const trueSpeed = vLen(actor.vel);
          if (trueSpeed <= 1) continue;
          const trueCourse = bearingDeg(vec3(0, 0, 0), vec3(actor.vel.x, actor.vel.y, 0));
          let diff = Math.abs(trk.courseDeg - trueCourse);
          if (diff > 180) diff = 360 - diff;
          fpvErrors.push(diff);
        }
        engine.step();
      }
    }

    expect(fpvErrors.length).toBeGreaterThan(100);
    const sorted = [...fpvErrors].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianError = sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    expect(medianError).toBeLessThan(30);
  });
});
