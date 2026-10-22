import { useEffect } from 'react';
import { ThreatClassId, TraineeTrack } from '../../sim/index.js';

export interface UseHotkeysProps {
  tracks: TraineeTrack[];
  selectedTrackId: number | null;
  speed: 1 | 2 | 4;
  isPaused: boolean;
  phase: 'setup' | 'running' | 'ended';
  onSelectTrack: (trackId: number | null) => void;
  onAcknowledge: (trackId: number) => void;
  onClassify: (trackId: number, classId: ThreatClassId | 'unknown') => void;
  onEngage: (trackId: number, effector: 'jammer' | 'gun') => void;
  onHoldFire: (trackId: number) => void;
  onTogglePause: () => void;
  onSetSpeed: (speed: 1 | 2 | 4) => void;
  onToggleEoLock?: () => void;
  onToggleEoChannel?: () => void;
}

export function useHotkeys({
  tracks,
  selectedTrackId,
  speed,
  phase,
  onSelectTrack,
  onAcknowledge,
  onClassify,
  onEngage,
  onHoldFire,
  onTogglePause,
  onSetSpeed,
  onToggleEoLock,
  onToggleEoChannel,
}: UseHotkeysProps): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Must not fire while typing in any input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (phase !== 'running') return;

      // Space: Pause / Resume
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePause();
        return;
      }

      // + / =: Speed up
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        if (speed === 1) onSetSpeed(2);
        else if (speed === 2) onSetSpeed(4);
        return;
      }

      // - / _: Speed down
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        if (speed === 4) onSetSpeed(2);
        else if (speed === 2) onSetSpeed(1);
        return;
      }

      // Esc: Deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        onSelectTrack(null);
        return;
      }

      // Tab / Shift+Tab: Next/Previous track
      if (e.key === 'Tab') {
        e.preventDefault();
        if (tracks.length === 0) return;
        const currentIdx = tracks.findIndex((t) => t.trackId === selectedTrackId);
        if (e.shiftKey) {
          // Previous
          const prevIdx = currentIdx <= 0 ? tracks.length - 1 : currentIdx - 1;
          const prevTrack = tracks[prevIdx];
          if (prevTrack) onSelectTrack(prevTrack.trackId);
        } else {
          // Next
          const nextIdx = currentIdx < 0 || currentIdx >= tracks.length - 1 ? 0 : currentIdx + 1;
          const nextTrack = tracks[nextIdx];
          if (nextTrack) onSelectTrack(nextTrack.trackId);
        }
        return;
      }

      // T: Toggle TV / IR channel
      if ((e.key === 't' || e.key === 'T') && onToggleEoChannel) {
        e.preventDefault();
        onToggleEoChannel();
        return;
      }

      // Shift+A: Acknowledge ALL unacknowledged confirmed tracks in tick order
      if ((e.key === 'a' || e.key === 'A') && e.shiftKey) {
        e.preventDefault();
        const unacked = tracks
          .filter((t) => t.state === 'confirmed' && !t.acked)
          .sort((a, b) => a.trackId - b.trackId);
        for (const t of unacked) {
          onAcknowledge(t.trackId);
        }
        return;
      }

      // N: Select next unclassified confirmed track (ordered by range)
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const unclassified = tracks
          .filter(
            (t) =>
              t.state === 'confirmed' &&
              (t.assessedClass === undefined || t.assessedClass === 'unknown')
          )
          .sort((a, b) => a.rangeM - b.rangeM);

        if (unclassified.length > 0) {
          const curIdx = unclassified.findIndex((t) => t.trackId === selectedTrackId);
          const next =
            curIdx >= 0 && curIdx < unclassified.length - 1
              ? unclassified[curIdx + 1]
              : unclassified[0];
          if (next) onSelectTrack(next.trackId);
        }
        return;
      }

      // Track-dependent actions require a selected track
      // E: Toggle EO lock on selected track (or release if already locked)
      if ((e.key === 'e' || e.key === 'E') && onToggleEoLock) {
        e.preventDefault();
        onToggleEoLock();
        return;
      }

      if (selectedTrackId === null) return;

      // A: Acknowledge single track
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        onAcknowledge(selectedTrackId);
        return;
      }

      // Classification hotkeys: 1 bird, 2 quad, 3 FPV, 4 fixed-wing, 0 unknown
      if (e.key === '1') {
        e.preventDefault();
        onClassify(selectedTrackId, 'bird');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        onClassify(selectedTrackId, 'commercial_quad');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        onClassify(selectedTrackId, 'fpv_kamikaze');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        onClassify(selectedTrackId, 'fixed_wing_recon');
        return;
      }
      if (e.key === '5') {
        e.preventDefault();
        onClassify(selectedTrackId, 'clutter');
        return;
      }
      if (e.key === '6') {
        e.preventDefault();
        onClassify(selectedTrackId, 'fpv_fiber');
        return;
      }
      if (e.key === '7') {
        e.preventDefault();
        onClassify(selectedTrackId, 'decoy_drone');
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        onClassify(selectedTrackId, 'unknown');
        return;
      }

      // J: Jammer
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onEngage(selectedTrackId, 'jammer');
        return;
      }

      // G: Gun
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        onEngage(selectedTrackId, 'gun');
        return;
      }

      // H: Hold Fire
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        onHoldFire(selectedTrackId);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    tracks,
    selectedTrackId,
    speed,
    phase,
    onSelectTrack,
    onAcknowledge,
    onClassify,
    onEngage,
    onHoldFire,
    onTogglePause,
    onSetSpeed,
    onToggleEoLock,
    onToggleEoChannel,
  ]);
}
