import { Rng } from '../core/rng.js';
import { SimEvent } from '../core/types.js';
import { vDist, vec3 } from '../core/vec.js';
import { Actor } from '../model/actors.js';
import { ActiveEngagement, EffectorState, EffectorType } from '../model/effectors.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { Track } from '../model/tracks.js';

export const JAMMER_MAX_RANGE_M = 1500;
export const JAMMER_DWELL_TICKS = 40;
export const JAMMER_PK = 0.85;

export const GUN_MAX_RANGE_M = 1000;
export const GUN_RESOLVE_TICKS = 10;

export function tryEngageTrack(
  currentTick: number,
  trackId: number,
  effector: EffectorType,
  tracks: Track[],
  actors: Actor[],
  effectorState: EffectorState,
  events: SimEvent[]
): void {
  const track = tracks.find((t) => t.trackId === trackId);
  if (!track || track.state === 'dropped') {
    events.push({
      tick: currentTick,
      type: 'COMMAND_REJECTED',
      payload: { reason: 'unknown_or_dropped_track', trackId },
    });
    return;
  }

  const actor = actors.find((a) => a.id === track.actorId);
  if (!actor || actor.state !== 'active') {
    events.push({
      tick: currentTick,
      type: 'COMMAND_REJECTED',
      payload: { reason: 'target_not_active', trackId },
    });
    return;
  }

  const rangeToAsset = vDist(track.estimatedPos, vec3(0, 0, 0));

  if (effector === 'jammer') {
    if (rangeToAsset > JAMMER_MAX_RANGE_M) {
      events.push({
        tick: currentTick,
        type: 'ENGAGEMENT_REJECTED',
        payload: { reason: 'out_of_range', trackId, effector, range: rangeToAsset },
      });
      return;
    }
    if (
      effectorState.jammer.currentEngagement !== undefined ||
      currentTick < effectorState.jammer.busyUntilTick
    ) {
      events.push({
        tick: currentTick,
        type: 'ENGAGEMENT_REJECTED',
        payload: { reason: 'effector_busy', trackId, effector },
      });
      return;
    }

    const engagement: ActiveEngagement = {
      effector: 'jammer',
      trackId,
      actorId: actor.id,
      startTick: currentTick,
      resolveTick: currentTick + JAMMER_DWELL_TICKS,
      rangeAtFire: rangeToAsset,
      speedAtFire: actor.speed,
    };
    effectorState.jammer.busyUntilTick = currentTick + JAMMER_DWELL_TICKS;
    effectorState.jammer.currentEngagement = engagement;
    track.engagementStatus = 'engaged';

    events.push({
      tick: currentTick,
      type: 'ENGAGEMENT_STARTED',
      payload: { trackId, effector: 'jammer', resolveTick: engagement.resolveTick },
    });
  } else if (effector === 'gun') {
    if (rangeToAsset > GUN_MAX_RANGE_M) {
      events.push({
        tick: currentTick,
        type: 'ENGAGEMENT_REJECTED',
        payload: { reason: 'out_of_range', trackId, effector, range: rangeToAsset },
      });
      return;
    }
    if (effectorState.gun.ammo <= 0) {
      events.push({
        tick: currentTick,
        type: 'ENGAGEMENT_REJECTED',
        payload: { reason: 'out_of_ammo', trackId, effector },
      });
      return;
    }
    if (
      effectorState.gun.currentEngagement !== undefined ||
      currentTick < effectorState.gun.busyUntilTick
    ) {
      events.push({
        tick: currentTick,
        type: 'ENGAGEMENT_REJECTED',
        payload: { reason: 'effector_busy', trackId, effector },
      });
      return;
    }

    effectorState.gun.ammo--;
    const engagement: ActiveEngagement = {
      effector: 'gun',
      trackId,
      actorId: actor.id,
      startTick: currentTick,
      resolveTick: currentTick + GUN_RESOLVE_TICKS,
      rangeAtFire: rangeToAsset,
      speedAtFire: actor.speed,
    };
    effectorState.gun.busyUntilTick = currentTick + GUN_RESOLVE_TICKS;
    effectorState.gun.currentEngagement = engagement;
    track.engagementStatus = 'engaged';

    events.push({
      tick: currentTick,
      type: 'ENGAGEMENT_STARTED',
      payload: {
        trackId,
        effector: 'gun',
        ammoRemaining: effectorState.gun.ammo,
        resolveTick: engagement.resolveTick,
      },
    });
  }
}

export function runEngagementSystem(
  currentTick: number,
  actors: Actor[],
  tracks: Track[],
  effectorState: EffectorState,
  effectorRng: Rng,
  events: SimEvent[]
): void {
  // 1. Resolve Jammer
  const jam = effectorState.jammer.currentEngagement;
  if (jam && currentTick >= jam.resolveTick) {
    const actor = actors.find((a) => a.id === jam.actorId);
    const track = tracks.find((t) => t.trackId === jam.trackId);
    let result: 'hit' | 'miss' | 'no_effect' = 'miss';

    if (actor && actor.state === 'active') {
      const threat = THREAT_LIBRARY[actor.classId];
      if (!threat.rfControlled) {
        result = 'no_effect';
        events.push({
          tick: currentTick,
          type: 'NO_EFFECT',
          payload: { trackId: jam.trackId, effector: 'jammer', reason: 'target_not_rf_controlled' },
        });
      } else {
        const roll = effectorRng.next();
        if (roll < JAMMER_PK) {
          result = 'hit';
          actor.state = 'neutralized';
          actor.neutralizedTick = currentTick;
          actor.neutralizedDistanceToAsset = vDist(actor.pos, vec3(0, 0, 0));
        } else {
          result = 'miss';
        }
      }
    }

    if (track) {
      track.engagementStatus = result === 'hit' ? 'engaged' : 'none';
    }

    events.push({
      tick: currentTick,
      type: 'ENGAGEMENT_RESOLVED',
      payload: {
        trackId: jam.trackId,
        effector: 'jammer',
        result,
      },
    });
    effectorState.jammer.currentEngagement = undefined;
  }

  // 2. Resolve Gun
  const gunEng = effectorState.gun.currentEngagement;
  if (gunEng && currentTick >= gunEng.resolveTick) {
    const actor = actors.find((a) => a.id === gunEng.actorId);
    const track = tracks.find((t) => t.trackId === gunEng.trackId);
    let result: 'hit' | 'miss' = 'miss';

    if (actor && actor.state === 'active') {
      const pk =
        Math.max(0, 0.7 * (1 - gunEng.rangeAtFire / GUN_MAX_RANGE_M)) *
        (gunEng.speedAtFire > 25 ? 0.7 : 1.0);
      const roll = effectorRng.next();
      if (roll < pk) {
        result = 'hit';
        actor.state = 'neutralized';
        actor.neutralizedTick = currentTick;
        actor.neutralizedDistanceToAsset = vDist(actor.pos, vec3(0, 0, 0));
      } else {
        result = 'miss';
      }
    }

    if (track) {
      track.engagementStatus = result === 'hit' ? 'engaged' : 'none';
    }

    events.push({
      tick: currentTick,
      type: 'ENGAGEMENT_RESOLVED',
      payload: {
        trackId: gunEng.trackId,
        effector: 'gun',
        result,
      },
    });
    effectorState.gun.currentEngagement = undefined;
  }
}
