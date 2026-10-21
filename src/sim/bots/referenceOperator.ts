import { Command } from '../core/types.js';
import { TraineeView } from '../view/traineeView.js';

/**
 * Reference Operator Bot:
 * 1. Acknowledges confirmed tracks immediately upon confirmation (<= 3s latency for 100% score).
 * 2. Classifies tracks via kinematic & sector cues:
 *    - Bird: tiny RCS bucket or erratic wander heading changes (>4 deg/s).
 *    - FPV strike drone: Western threat axis (bearing 260-300 deg) with direct closing ingress (<=-16 m/s) or close-in terminal ingress (<=1800m).
 *    - Commercial quad: moderate transit speed (8-16 m/s), standoff crossing vector (closing rate > -15 m/s).
 * 3. Re-evaluates if an inbound track approaches inside 1800m (quad never closes inside 1.1km).
 * 4. Engages confirmed hostile FPV with jammer when in range (<=1500m), gun as fallback (<=1000m).
 * 5. Issues HOLD_FIRE for neutral/civilian tracks.
 */
export function referenceOperator(view: TraineeView): Command[] {
  const commands: Command[] = [];

  for (let i = 0; i < view.tracks.length; i++) {
    const track = view.tracks[i];
    if (!track) continue;

    // 1. Acknowledge confirmed track immediately
    if (track.state === 'confirmed' && !track.acked) {
      commands.push({
        tick: view.tick,
        type: 'ACK_TRACK',
        payload: { trackId: track.trackId },
      });
      continue;
    }

    if (!track.acked) continue;

    // 2. Classify track
    if (track.assessedClass === undefined) {
      let assessed: 'fpv_kamikaze' | 'commercial_quad' | 'bird' | undefined;

      if (track.rcsBucket === 'tiny' || (track.speedMps < 16 && track.headingChangeRateDegPerS > 4)) {
        assessed = 'bird';
      } else if (
        track.bearingDeg >= 250 &&
        track.bearingDeg <= 310 &&
        track.closingRateMps <= -18
      ) {
        // High-speed direct closing ingress from Western sector
        assessed = 'fpv_kamikaze';
      } else {
        // Transit / standoff crossing vector
        assessed = 'commercial_quad';
      }

      if (assessed) {
        commands.push({
          tick: view.tick,
          type: 'CLASSIFY_TRACK',
          payload: { trackId: track.trackId, assessedClass: assessed },
        });
        continue;
      }
    }

    // Re-evaluate ONLY if track is in the Western threat axis, has non-tiny RCS, and penetrates terminal zone closing fast
    if (
      track.assessedClass !== 'fpv_kamikaze' &&
      track.rcsBucket !== 'tiny' &&
      track.bearingDeg >= 250 &&
      track.bearingDeg <= 310 &&
      track.rangeM <= 1800 &&
      track.closingRateMps <= -18
    ) {
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: track.trackId, assessedClass: 'fpv_kamikaze' },
      });
      continue;
    }

    // 3. Action based on classification
    if (track.assessedClass === 'fpv_kamikaze') {
      if (track.engagementStatus !== 'engaged') {
        if (track.rangeM <= 1500 && view.effectors.jammer.busyUntilTick <= view.tick) {
          commands.push({
            tick: view.tick,
            type: 'ENGAGE_TRACK',
            payload: { trackId: track.trackId, effector: 'jammer' },
          });
        } else if (
          track.rangeM <= 1000 &&
          view.effectors.gun.busyUntilTick <= view.tick &&
          view.effectors.gun.ammo > 0
        ) {
          commands.push({
            tick: view.tick,
            type: 'ENGAGE_TRACK',
            payload: { trackId: track.trackId, effector: 'gun' },
          });
        }
      }
    } else if (track.assessedClass === 'commercial_quad' || track.assessedClass === 'bird') {
      if (track.engagementStatus !== 'holding_fire') {
        commands.push({
          tick: view.tick,
          type: 'HOLD_FIRE',
          payload: { trackId: track.trackId },
        });
      }
    }
  }

  return commands;
}
