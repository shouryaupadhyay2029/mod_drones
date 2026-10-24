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

  // 0. EO Turret Management
  // Lock nearest confirmed unclassified track within 3 km; release once classified
  const lockedTrack =
    view.eo.lockedTrackId !== undefined
      ? view.tracks.find((t) => t.trackId === view.eo.lockedTrackId)
      : undefined;

  if (
    view.eo.lockedTrackId !== undefined &&
    (!lockedTrack || lockedTrack.state === 'dropped' || lockedTrack.assessedClass !== undefined)
  ) {
    commands.push({
      tick: view.tick,
      type: 'EO_RELEASE',
      payload: {},
    });
  } else if (view.eo.state === 'idle' || view.eo.lockedTrackId === undefined) {
    const unclassifiedTracks = view.tracks
      .filter((t) => t.state === 'confirmed' && t.assessedClass === undefined && t.rangeM <= 3000)
      .sort((a, b) => a.rangeM - b.rangeM);

    if (unclassifiedTracks.length > 0) {
      commands.push({
        tick: view.tick,
        type: 'EO_LOCK',
        payload: { trackId: unclassifiedTracks[0]!.trackId },
      });
    }
  }

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
    if (track.state !== 'confirmed' || !track.velocityValid || track.speedMps === undefined) {
      continue;
    }

    const speed = track.speedMps ?? 0;
    const closingRate = track.closingRateMps ?? 0;
    const turnRate = track.headingChangeRateDegPerS ?? 0;
    const headingError = computeHeadingErrorToAsset(track) ?? 180;

    // 2. Classify using sensor fusion: EO identify > RF signature > EO recognize > Kinematics
    if (track.assessedClass === undefined) {
      let assessed:
        | 'fpv_kamikaze'
        | 'fpv_fiber'
        | 'decoy_drone'
        | 'commercial_quad'
        | 'fixed_wing_recon'
        | 'bird'
        | 'clutter'
        | undefined;

      // Priority 1: EO 'identify' hint (highest confidence sensor cue)
      if (
        view.eo.state === 'locked' &&
        view.eo.lockedTrackId === track.trackId &&
        view.eo.level === 'identify' &&
        view.eo.hint
      ) {
        if (
          view.eo.hint === 'fpv_kamikaze' ||
          view.eo.hint === 'fpv_fiber' ||
          view.eo.hint === 'decoy_drone' ||
          view.eo.hint === 'commercial_quad' ||
          view.eo.hint === 'fixed_wing_recon' ||
          view.eo.hint === 'bird'
        ) {
          assessed = view.eo.hint;
        }
      }

      // Priority 2: Distinct RF signature cue
      if (!assessed && track.rfStatus === 'emitting' && track.rfSignature) {
        if (track.rfSignature === 'wideband_video') {
          assessed = 'fpv_kamikaze';
        } else if (track.rfSignature === 'telemetry_link') {
          assessed = 'commercial_quad';
        } else if (track.rfSignature === 'long_range_link') {
          assessed = 'fixed_wing_recon';
        }
      }

      // Priority 3: EO 'recognize' category cue
      if (
        !assessed &&
        view.eo.state === 'locked' &&
        view.eo.lockedTrackId === track.trackId &&
        view.eo.level === 'recognize' &&
        view.eo.hint
      ) {
        if (view.eo.hint === 'bird') {
          assessed = 'bird';
        } else if (view.eo.hint === 'fixed_wing') {
          assessed = 'fixed_wing_recon';
        } else if (view.eo.hint === 'multirotor') {
          if (track.rfStatus === 'silent') {
            if (track.rcsBucket === 'medium') {
              assessed = 'decoy_drone';
            } else if (speed >= 18 && (closingRate <= -15 || headingError <= 35)) {
              assessed = 'fpv_fiber';
            } else {
              assessed = 'commercial_quad';
            }
          } else {
            if (speed >= 20 || (speed >= 18 && closingRate <= -15)) {
              assessed = 'fpv_kamikaze';
            } else {
              assessed = 'commercial_quad';
            }
          }
        }
      }

      // Priority 3.5: RF-silent Decoy / Fiber cues
      if (!assessed && track.rfStatus === 'silent') {
        if (track.rcsBucket === 'medium' && track.altitudeM < 160) {
          assessed = 'decoy_drone';
        } else if (
          track.rcsBucket !== 'medium' &&
          speed >= 20 &&
          closingRate <= -18 &&
          headingError <= 35
        ) {
          assessed = 'fpv_fiber';
        }
      }

      // Priority 3.6: Medium RCS low-altitude deferral / resolution
      // Decoys have medium RCS (0.05 m²), civilian quads and FPVs have small RCS (0.01-0.02 m²).
      // If RF is unknown and standoff is safe (>1500m), defer classification to observe RF silence / EO.
      // If within 1500m and not emitting, classify medium-RCS low-altitude as decoy_drone.
      if (!assessed && track.rcsBucket === 'medium' && track.altitudeM < 160 && track.rfStatus !== 'emitting') {
        if (track.rangeM > 1500 && track.rfStatus === 'unknown') {
          // Defer classification: wait for RF status to resolve to 'silent' (6s) or EO
          continue;
        } else {
          assessed = 'decoy_drone';
        }
      }

      // Priority 4: Kinematics fallback
      if (!assessed) {
        // Cue A: False track / clutter (low quality blips, non-coherent velocity)
        if (track.quality < 0.28) {
          assessed = 'clutter';
        }
        // Cue B: Avian (tiny RCS bucket or erratic wander turn rates)
        else if (track.rcsBucket === 'tiny' || (speed < 16 && turnRate > 3.5)) {
          assessed = 'bird';
        }
        // Cue C1: High-altitude fixed-wing reconnaissance UAV (altitude >= 160m, requires medium RCS or long-range link)
        else if (
          track.altitudeM >= 160 &&
          speed >= 20 &&
          (track.rcsBucket === 'medium' || track.rfSignature === 'long_range_link')
        ) {
          assessed = 'fixed_wing_recon';
        }
        // Cue C2: High-speed direct closing threat (FPV strike drone or decoy)
        else if (speed >= 18 && closingRate <= -14 && headingError <= 35) {
          if (track.rcsBucket === 'medium') {
            assessed = 'decoy_drone';
          } else if (track.rfStatus === 'silent') {
            assessed = 'fpv_fiber';
          } else {
            assessed = 'fpv_kamikaze';
          }
        }
        // Cue D: Standoff transit corridor / non-closing crossing trajectory
        else if (speed >= 6 && headingError > 35 && track.rcsBucket !== 'medium') {
          assessed = 'commercial_quad';
        }
        // Cue E: Low speed or ambiguous
        else if (speed < 6) {
          assessed = 'bird';
        } else if (headingError <= 35 && closingRate <= -5) {
          if (track.rcsBucket === 'medium') {
            assessed = 'decoy_drone';
          } else if (track.rfStatus === 'silent') {
            assessed = 'fpv_fiber';
          } else {
            assessed = 'fpv_kamikaze';
          }
        } else if (track.rcsBucket === 'medium') {
          assessed = 'decoy_drone';
        } else {
          assessed = 'commercial_quad';
        }
      }

      if (assessed) {
        commands.push({
          tick: view.tick,
          type: 'CLASSIFY_TRACK',
          payload: { trackId: track.trackId, assessedClass: assessed },
        });

        // Release EO lock once target is classified
        if (view.eo.lockedTrackId === track.trackId) {
          commands.push({
            tick: view.tick,
            type: 'EO_RELEASE',
            payload: {},
          });
        }
        continue;
      }
    }

    // Re-evaluate if jammer proved ineffective on this track (it is fiber FPV)
    const jammerIneffective = view.events.some(
      (e) =>
        e.type === 'NO_EFFECT' &&
        e.payload?.trackId === track.trackId
    );
    if (jammerIneffective && track.assessedClass !== 'fpv_fiber') {
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: track.trackId, assessedClass: 'fpv_fiber' },
      });
      continue;
    }

    // Re-evaluate if a previously non-hostile track turns into a high-speed direct inbound attack
    if (
      track.assessedClass !== 'fpv_kamikaze' &&
      track.assessedClass !== 'fpv_fiber' &&
      track.assessedClass !== 'fixed_wing_recon' &&
      track.rfSignature !== 'telemetry_link' &&
      track.rcsBucket !== 'tiny' &&
      track.rcsBucket !== 'medium' &&
      speed >= 24 &&
      closingRate <= -20 &&
      headingError <= 30
    ) {
      const newClass = track.rfStatus === 'silent' ? 'fpv_fiber' : 'fpv_kamikaze';
      commands.push({
        tick: view.tick,
        type: 'CLASSIFY_TRACK',
        payload: { trackId: track.trackId, assessedClass: newClass },
      });
      continue;
    }

    // Re-evaluate if a track assessed as FPV proves to be crossing or slow civilian transit
    // NEVER downgrade if actively engaged or if heading directly on the asset
    if (
      (track.assessedClass === 'fpv_kamikaze' || track.assessedClass === 'fpv_fiber') &&
      track.engagementStatus !== 'engaged' &&
      headingError > 45 &&
      closingRate > -8
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

    // Non-hostile contacts: hold fire
    if (
      track.assessedClass === 'commercial_quad' ||
      track.assessedClass === 'bird' ||
      track.assessedClass === 'clutter' ||
      track.assessedClass === 'decoy_drone'
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

  // 3. Hostile Target Prioritization & Engagement
  // Prioritize classified hostiles by time-to-impact (range / -closingRate)
  const hostileCandidates: Array<{
    track: TraineeTrack;
    timeToImpact: number;
  }> = [];

  // Also engage close penetrating tentative tracks (< 300 m, unengaged)
  // to handle terrain-masked threats that never get confirmed in time
  const gunAvailableNow = view.effectors.gun.busyUntilTick <= view.tick && view.effectors.gun.ammo > 0;
  for (let i = 0; i < view.tracks.length; i++) {
    const track = view.tracks[i];
    if (
      track &&
      (track.state === 'tentative' || track.state === 'confirmed') &&
      track.rangeM <= 300 &&
      track.engagementStatus === 'none' &&
      gunAvailableNow &&
      (track.assessedClass === 'fpv_kamikaze' ||
        track.assessedClass === 'fpv_fiber' ||
        track.assessedClass === 'fixed_wing_recon' ||
        track.assessedClass === undefined)
    ) {
      commands.push({
        tick: view.tick,
        type: 'ENGAGE_TRACK',
        payload: { trackId: track.trackId, effector: 'gun' },
      });
      break; // only one gun shot per tick
    }
  }

  for (let i = 0; i < view.tracks.length; i++) {
    const track = view.tracks[i];
    if (!track || track.state !== 'confirmed' || !track.velocityValid) {
      continue;
    }
    const isPenetrating = track.rangeM <= 650;
    const gunAvailable = view.effectors.gun.busyUntilTick <= view.tick && view.effectors.gun.ammo > 0;
    if (track.engagementStatus === 'engaged' && (!isPenetrating || !gunAvailable)) {
      continue;
    }

    if (
      track.assessedClass === 'fpv_kamikaze' ||
      track.assessedClass === 'fpv_fiber' ||
      track.assessedClass === 'fixed_wing_recon'
    ) {
      const closing = track.closingRateMps ?? -20;
      const tti = closing < -0.5 ? track.rangeM / -closing : track.rangeM / 10;
      hostileCandidates.push({ track, timeToImpact: tti });
    }
  }

  // Sort ascending by time to impact
  hostileCandidates.sort((a, b) => a.timeToImpact - b.timeToImpact);

  let jammerUsed = view.effectors.jammer.busyUntilTick > view.tick;
  let gunUsed = view.effectors.gun.busyUntilTick > view.tick || view.effectors.gun.ammo <= 0;

  for (let i = 0; i < hostileCandidates.length; i++) {
    const item = hostileCandidates[i];
    if (!item) continue;
    const track = item.track;

    const jammerFailedOnTrack = view.events.some(
      (e) =>
        e.type === 'NO_EFFECT' &&
        e.payload?.trackId === track.trackId
    );
    const isSilent = track.rfStatus === 'silent' || track.assessedClass === 'fpv_fiber' || jammerFailedOnTrack;
    const isEmitting =
      !jammerFailedOnTrack &&
      (track.rfStatus === 'emitting' ||
        track.rfSignature === 'wideband_video' ||
        track.rfSignature === 'long_range_link');

    // High priority gun engagement for penetrating threats (<600m)
    if (!gunUsed && track.rangeM <= 600) {
      commands.push({
        tick: view.tick,
        type: 'ENGAGE_TRACK',
        payload: { trackId: track.trackId, effector: 'gun' },
      });
      gunUsed = true;
      if (isSilent) continue;
    }

    if (track.rfStatus === 'ambiguous') {
      // Ambiguous RF: never jam; use gun inside 1000m, otherwise wait or use EO
      if (!gunUsed && track.rangeM <= 1000) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'gun' },
        });
        gunUsed = true;
      }
      continue;
    }

    if (isSilent) {
      // RF-silent FPV-like: jammer is ineffective, use gun only
      if (!gunUsed && track.rangeM <= 1000) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'gun' },
        });
        gunUsed = true;
      }
    } else if (isEmitting) {
      // Emitting target: prioritize jammer
      if (!jammerUsed && track.rangeM <= 1500) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'jammer' },
        });
        jammerUsed = true;
      } else if (!gunUsed && track.rangeM <= 1000) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'gun' },
        });
        gunUsed = true;
      }
    } else {
      // Unknown RF: try jammer first at range <= 1500, or gun at <= 1000
      if (!jammerUsed && track.rangeM <= 1500) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'jammer' },
        });
        jammerUsed = true;
      } else if (!gunUsed && track.rangeM <= 1000) {
        commands.push({
          tick: view.tick,
          type: 'ENGAGE_TRACK',
          payload: { trackId: track.trackId, effector: 'gun' },
        });
        gunUsed = true;
      }
    }
  }

  return commands;
}
