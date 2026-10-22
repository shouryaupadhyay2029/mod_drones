import { Command } from '../core/types.js';
import { TraineeTrack, TraineeView } from '../view/traineeView.js';

/**
 * Computes angular heading error (0 - 180 deg) between the track's course
 * and the direct line-of-bearing from the track to the defended asset.
 * A heading error near 0 indicates direct inbound attack toward the asset.
 */
export function computeHeadingErrorToAsset(track: TraineeTrack): number | undefined {
  if (track.courseDeg === undefined) return undefined;
  const bearingToAsset = (track.bearingDeg + 180) % 360;
  let diff = Math.abs(track.courseDeg - bearingToAsset);
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Reference Operator Bot:
 * Purely cue-driven tactical classifier and decision maker.
 * Strictly adheres to trainee-accessible cues without scenario knowledge or bearing-sector bias.
 * Requires confirmed state AND valid velocity before classifying or engaging.
 */
export function referenceOperator(view: TraineeView): Command[] {
  const commands: Command[] = [];

  for (let i = 0; i < view.tracks.length; i++) {
    const track = view.tracks[i];
    if (!track) continue;

    // 1. Acknowledge confirmed track immediately upon confirmation
    if (track.state === 'confirmed' && !track.acked) {
      commands.push({
        tick: view.tick,
        type: 'ACK_TRACK',
        payload: { trackId: track.trackId },
      });
      continue;
    }

    if (!track.acked) continue;

    // Both classification and engagement require confirmed state and valid velocity estimates
    if (track.state !== 'confirmed' || !track.velocityValid) {
      continue;
    }

    const speed = track.speedMps ?? 0;
    const closingRate = track.closingRateMps ?? 0;
    const turnRate = track.headingChangeRateDegPerS ?? 0;
    const headingError = computeHeadingErrorToAsset(track) ?? 180;

    // 2. Classify or re-evaluate classification based on pure kinematic & radar cues
    if (track.assessedClass === undefined) {
      let assessed:
        | 'fpv_kamikaze'
        | 'commercial_quad'
        | 'fixed_wing_recon'
        | 'bird'
        | 'clutter'
        | undefined;

      // Cue A: False track / clutter (low quality blips, non-coherent velocity)
      if (track.quality < 0.28) {
        assessed = 'clutter';
      }
      // Cue B: Avian (tiny RCS bucket or erratic wander turn rates)
      else if (track.rcsBucket === 'tiny' || (speed < 16 && turnRate > 3.5)) {
        assessed = 'bird';
      }
      // Cue C1: High-altitude fixed-wing reconnaissance UAV (altitude >= 160m)
      else if (track.altitudeM >= 160 && speed >= 18) {
        assessed = 'fixed_wing_recon';
      }
      // Cue C2: High-speed direct closing threat (FPV strike drone)
      else if (speed >= 24 && closingRate <= -20 && headingError <= 35) {
        assessed = 'fpv_kamikaze';
      }
      // Cue D: Standoff transit corridor / non-closing crossing trajectory
      else if (speed >= 6 && (closingRate > -16 || headingError > 40)) {
        assessed = 'commercial_quad';
      }
      // Cue E: Low speed or ambiguous
      else if (speed < 6) {
        assessed = 'bird';
      } else {
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

    // Re-evaluate if a previously non-hostile track turns into a high-speed direct inbound attack
    if (
      track.assessedClass !== 'fpv_kamikaze' &&
      track.rcsBucket !== 'tiny' &&
      speed >= 24 &&
      closingRate <= -20 &&
      headingError <= 30
    ) {
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: track.trackId, assessedClass: 'fpv_kamikaze' },
      });
      continue;
    }

    // Re-evaluate if a track assessed as FPV proves to be crossing or slow civilian transit
    if (
      track.assessedClass === 'fpv_kamikaze' &&
      (speed < 18 || headingError > 45)
    ) {
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: track.trackId, assessedClass: 'commercial_quad' },
      });
      commands.push({
        tick: view.tick,
        type: 'HOLD_FIRE',
        payload: { trackId: track.trackId },
      });
      continue;
    }

    // 3. Action based on classification
    if (track.assessedClass === 'fpv_kamikaze' || track.assessedClass === 'fixed_wing_recon') {
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
    } else if (
      track.assessedClass === 'commercial_quad' ||
      track.assessedClass === 'bird' ||
      track.assessedClass === 'clutter'
    ) {
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
