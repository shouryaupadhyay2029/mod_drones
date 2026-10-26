import { describe, expect, it } from 'vitest';
import { Engine } from '../src/sim/core/engine.js';
import { Rng } from '../src/sim/core/rng.js';
import { vec3 } from '../src/sim/core/vec.js';
import { createActor } from '../src/sim/model/actors.js';
import { createInitialEffectorState } from '../src/sim/model/effectors.js';
import { Track } from '../src/sim/model/tracks.js';
import { tryEngageTrack, runEngagementSystem } from '../src/sim/systems/engagement.js';

function makeTrack(actorId: number, range: number): Track {
  return {
    trackId: 1, actorId, state: 'confirmed', estimatedPos: vec3(0, range, 50), estimatedVel: vec3(0, -20, 0),
    lastDetectedTick: 0, firstSeenTick: 0, confirmedTick: 0, consecutiveHits: 3, consecutiveMisses: 0,
    totalPlots: 3, rcsBucket: 'small', measuredRcs: 0.02, quality: 1, acked: true, engagementStatus: 'none',
    headingChangeRateSmoothed: 0, lastSweepChecked: 0,
  };
}

describe('abstract area-defence missile effector', () => {
  it('defaults to no rounds and rejects launch without inventory', () => {
    const engine = new Engine('missile-default', 'sandbox');
    expect(engine.effectorState.missile?.ammo).toBe(0);
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 2000, 50), { type: 'ingress_direct' });
    const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];
    tryEngageTrack(0, 1, 'missile', [makeTrack(1, 2000)], [actor], engine.effectorState, events);
    expect(events.at(-1)?.type).toBe('ENGAGEMENT_REJECTED');
    expect(events.at(-1)?.payload.reason).toBe('out_of_ammo');
  });

  it('consumes a round, resolves after 60 ticks, and has a 100-tick launcher cycle', () => {
    const state = createInitialEffectorState({ missiles: 1 });
    const actor = createActor(1, 'fpv_kamikaze', vec3(0, 2000, 50), { type: 'ingress_direct' });
    const tracks = [makeTrack(1, 2000)];
    const events: Array<{ tick: number; type: string; payload: Record<string, unknown> }> = [];
    tryEngageTrack(10, 1, 'missile', tracks, [actor], state, events);
    expect(state.missile?.ammo).toBe(0);
    expect(state.missile?.busyUntilTick).toBe(110);
    runEngagementSystem(69, [actor], tracks, state, new Rng('missile-shot'), events);
    expect(events.some((event) => event.type === 'ENGAGEMENT_RESOLVED')).toBe(false);
    runEngagementSystem(70, [actor], tracks, state, new Rng('missile-shot'), events);
    expect(events.at(-1)?.type).toBe('ENGAGEMENT_RESOLVED');
  });

  it('continues counting asset hits when the caller disables mission termination', () => {
    const engine = new Engine('multi-hit', 'sandbox', [], { assetHitEndsMission: false });
    engine.enqueueCommand({ tick: 0, type: 'DEV_SPAWN_ACTOR', payload: { classId: 'fpv_kamikaze', x: 0, y: 20, z: 50, speed: 20, behaviourType: 'ingress_direct' } });
    engine.step();
    expect(engine.missionState.assetHitCount).toBe(1);
    expect(engine.missionState.reason).not.toBe('asset_hit');
  });
});
