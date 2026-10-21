import { Command } from '../core/types.js';
import { TraineeView } from '../view/traineeView.js';

export function triggerHappyOperator(view: TraineeView): Command[] {
  const commands: Command[] = [];

  for (let i = 0; i < view.tracks.length; i++) {
    const track = view.tracks[i];
    if (!track) continue;

    if (!track.acked) {
      commands.push({
        tick: view.tick,
        type: 'ACK_TRACK',
        payload: { trackId: track.trackId },
      });
    }

    if (track.engagementStatus !== 'engaged' && view.effectors.gun.ammo > 0) {
      commands.push({
        tick: view.tick,
        type: 'ENGAGE_TRACK',
        payload: { trackId: track.trackId, effector: 'gun' },
      });
    }
  }

  return commands;
}
