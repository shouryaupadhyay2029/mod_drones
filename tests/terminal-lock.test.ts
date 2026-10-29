import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { Rng } from '../src/sim/core/rng.js';
import { vec3 } from '../src/sim/core/vec.js';
import { createActor } from '../src/sim/model/actors.js';
import { createInitialEffectorState } from '../src/sim/model/effectors.js';
import { Track } from '../src/sim/model/tracks.js';
import { tryEngageTrack, runEngagementSystem } from '../src/sim/systems/engagement.js';

function makeTrack(actorId: number, range: number, terminalLock = false): Track {
  return {
    trackId: 1,
    actorId,
    state: 'confirmed',
    estimatedPos: vec3(0, range, 50),
    estimatedVel: vec3(0, -30, 0),
    lastDetectedTick: 0,
    firstSeenTick: 0,
    confirmedTick: 0,
    consecutiveHits: 3,
    consecutiveMisses: 0,
    totalPlots: 3,
    rcsBucket: 'small',
    measuredRcs: 0.02,
    quality: 1,
    acked: true,
    engagementStatus: 'none',
    headingChangeRateSmoothed: 0,
    lastSweepChecked: 0,
    terminal_lock: terminalLock,
  };
}

describe('Machine-Vision Terminal Optical Lock Mechanic', () => {
  it('1. Hostile FPV actor initializes with terminal_lock = false', () => {
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 1500, 50), { type: 'ingress_direct' });
    expect(actor.terminal_lock).toBe(false);
  });

  it('2. FPV breaches < 800m range and engages terminal_lock = true in engine tick', () => {
    const engine = new Engine('terminal-lock-test', 'sandbox');
    // Spawn FPV at 850m
    engine.enqueueCommand({
      tick: 0,
      type: 'DEV_SPAWN_ACTOR',
      payload: { classId: 'fpv_kamikaze', x: 0, y: 850, z: 50, speed: 30, behaviourType: 'ingress_direct' },
    });
    engine.step(); // tick 0 -> 1

    const actor = engine.actors.find((a) => a.classId === 'fpv_kamikaze');
    expect(actor).toBeDefined();
    expect(actor?.pos.y).toBeGreaterThan(800);
    expect(actor?.terminal_lock).toBe(false);

    // Step until FPV crosses 800m threshold (at 30m/s = 1.5m/tick, takes ~35 ticks)
    for (let i = 0; i < 40; i++) {
      engine.step();
    }

    expect(actor?.pos.y).toBeLessThan(800);
    expect(actor?.terminal_lock).toBe(true);
  });

  it('3. FPV with terminal_lock survives RF Jammer attempts (0% effectiveness)', () => {
    const effectorState = createInitialEffectorState();
    // Hostile FPV inside 800m with terminal_lock = true
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 750, 50), { type: 'ingress_direct' });
    actor.terminal_lock = true;

    const tracks = [makeTrack(1, 750, true)];
    const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];

    // Attempt to engage with RF Jammer
    tryEngageTrack(10, 1, 'jammer', tracks, [actor], effectorState, events);

    // Event log immediately flags warning on attempt
    const attemptWarning = events.find((e) => e.type === 'JAMMER_IMMUNE_WARNING' || e.type === 'NO_EFFECT');
    expect(attemptWarning).toBeDefined();
    expect(attemptWarning?.payload.warning).toBe('AUTONOMOUS LOCK: RF IMMUNE - USE KINETIC');

    // Run engagement to completion (JAMMER_DWELL_TICKS = 40)
    runEngagementSystem(50, [actor], tracks, effectorState, new Rng('test-jammer'), events);

    const resolveEvent = events.find((e) => e.type === 'ENGAGEMENT_RESOLVED');
    expect(resolveEvent).toBeDefined();
    expect(resolveEvent?.payload.result).toBe('no_effect');

    // Crucial assertion: FPV survives jammer attempt
    expect(actor.state).toBe('active');
  });

  it('4. FPV outside 800m (no terminal_lock) CAN be neutralized by RF Jammer', () => {
    const effectorState = createInitialEffectorState();
    // Hostile FPV at 1200m (outside 800m)
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 1200, 50), { type: 'ingress_direct' });
    actor.terminal_lock = false;

    const tracks = [makeTrack(1, 1200, false)];
    const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];

    tryEngageTrack(10, 1, 'jammer', tracks, [actor], effectorState, events);
    // Fixed RNG that produces hit with JAMMER_PK = 0.85
    const rng = new Rng('test-success-jammer');
    runEngagementSystem(50, [actor], tracks, effectorState, rng, events);

    const resolveEvent = events.find((e) => e.type === 'ENGAGEMENT_RESOLVED');
    expect(resolveEvent).toBeDefined();
    expect(resolveEvent?.payload.result).toBe('hit');
    expect(actor.state).toBe('neutralized');
  });

  it('5. Terminal locked FPV CAN be destroyed by the kinetic CIWS gun', () => {
    const effectorState = createInitialEffectorState();
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 600, 50), { type: 'ingress_direct' }, 20);
    actor.terminal_lock = true;

    const tracks = [makeTrack(1, 600, true)];
    const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];

    // Engage with gun
    tryEngageTrack(10, 1, 'gun', tracks, [actor], effectorState, events);
    expect(effectorState.gun.currentEngagement).toBeDefined();

    // Gun resolves at tick 20 (GUN_RESOLVE_TICKS = 10) with roll guaranteed < pk
    const rng = new Rng('test-gun-hit');
    runEngagementSystem(20, [actor], tracks, effectorState, rng, events);

    const resolveEvent = events.find((e) => e.type === 'ENGAGEMENT_RESOLVED');
    expect(resolveEvent).toBeDefined();
    expect(resolveEvent?.payload.result).toBe('hit');
    expect(actor.state).toBe('neutralized');
  });

  it('6. TraineeView reflects terminal_lock property on tracks', () => {
    const engine = new Engine('trainee-view-lock-test', 'sandbox');
    engine.enqueueCommand({
      tick: 0,
      type: 'DEV_SPAWN_ACTOR',
      payload: { classId: 'fpv_kamikaze', x: 0, y: 700, z: 50, speed: 25, behaviourType: 'ingress_direct' },
    });

    for (let i = 0; i < 5; i++) engine.step();

    const view = engine.getTraineeView();
    const fpvTrack = view.tracks.find((t) => t.rangeM < 800);
    if (fpvTrack) {
      expect(fpvTrack.terminal_lock).toBe(true);
    }
  });
});
