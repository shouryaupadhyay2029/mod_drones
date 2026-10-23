import { Command } from '../core/types.js';
import { Engine } from '../core/engine.js';
import { TraineeView } from '../view/traineeView.js';
import { THREAT_LIBRARY } from '../model/threats.js';

/**
 * TEST-ONLY Oracle Operator Bot.
 * Reads ground truth directly, makes zero mistakes.
 * Strictly NOT exported from src/sim/index.ts or imported in src/app.
 * Used ONLY for solvability verification in test suites.
 */
export function oracleStep(view: TraineeView, engine: Engine): Command[] {
  const commands: Command[] = [];
  const tracks = engine.tracks;
  const actors = engine.actors;

  // 1. Acknowledge confirmed tracks immediately
  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (t && t.state === 'confirmed' && !t.acked) {
      commands.push({
        tick: view.tick,
        type: 'ACK_TRACK',
        payload: { trackId: t.trackId },
      });
    }
  }

  // 2. Classify tracks using 100% ground truth
  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (!t || t.state !== 'confirmed' || t.assessedClass !== undefined) continue;

    const simTrack = tracks.find((tr) => tr.trackId === t.trackId);
    if (!simTrack) continue;

    if (simTrack.isGhost) {
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: t.trackId, assessedClass: 'clutter' },
      });
      commands.push({
        tick: view.tick,
        type: 'HOLD_FIRE',
        payload: { trackId: t.trackId },
      });
    } else {
      const actor = actors.find((a) => a.id === simTrack.actorId);
      if (actor) {
        commands.push({
          tick: view.tick,
          type: 'CLASSIFY_TRACK',
          payload: { trackId: t.trackId, assessedClass: actor.classId },
        });

        const threat = THREAT_LIBRARY[actor.classId];
        if (!threat || !threat.hostile) {
          commands.push({
            tick: view.tick,
            type: 'HOLD_FIRE',
            payload: { trackId: t.trackId },
          });
        }
      }
    }
  }

  // 3. Prioritize hostile targets by time-to-impact (range / -closingRate)
  const hostileTargets: Array<{
    trackId: number;
    rangeM: number;
    timeToImpact: number;
    rfControlled: boolean;
  }> = [];

  for (let i = 0; i < view.tracks.length; i++) {
    const t = view.tracks[i];
    if (!t || t.state !== 'confirmed' || t.engagementStatus === 'engaged') continue;

    const simTrack = tracks.find((tr) => tr.trackId === t.trackId);
    if (!simTrack || simTrack.isGhost) continue;

    const actor = actors.find((a) => a.id === simTrack.actorId);
    if (!actor || actor.state !== 'active') continue;

    const threat = THREAT_LIBRARY[actor.classId];
    if (!threat || !threat.hostile) continue;

    const closingRate = t.closingRateMps ?? -20;
    const tti = closingRate < -0.1 ? t.rangeM / -closingRate : t.rangeM / 20;

    hostileTargets.push({
      trackId: t.trackId,
      rangeM: t.rangeM,
      timeToImpact: tti,
      rfControlled: threat.rfControlled,
    });
  }

  // Lowest time to impact first
  hostileTargets.sort((a, b) => a.timeToImpact - b.timeToImpact);

  let jammerBusy = view.effectors.jammer.busyUntilTick > view.tick;
  let gunBusy = view.effectors.gun.busyUntilTick > view.tick || view.effectors.gun.ammo <= 0;

  for (let i = 0; i < hostileTargets.length; i++) {
    const target = hostileTargets[i];
    if (!target) continue;

    if (target.rfControlled) {
      if (!jammerBusy && target.rangeM <= 1500) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'jammer' },
        });
        jammerBusy = true;
        continue;
      }

      // Close-in defense backup: gun RF target if within effective range (<= 750m) and jammer won't resolve in time
      if (!gunBusy && target.rangeM <= 750 && target.timeToImpact < 4.5) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'gun' },
        });
        gunBusy = true;
      }
    } else {
      // Non-RF target (fiber): must engage with gun within effective lethal envelope (<= 750m)
      if (!gunBusy && target.rangeM <= 750) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: target.trackId, effector: 'gun' },
        });
        gunBusy = true;
      }
    }
  }

  return commands;
}

export function createOracleOperator(engine: Engine): (view: TraineeView) => Command[] {
  return (view: TraineeView) => oracleStep(view, engine);
}

export function oracleOperator(view: TraineeView, engine?: Engine): Command[] {
  if (!engine) {
    throw new Error('oracleOperator requires engine reference for ground truth access');
  }
  return oracleStep(view, engine);
}
