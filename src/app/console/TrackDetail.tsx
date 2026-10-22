import React from 'react';
import {
  CLASSIFICATION_OPTIONS,
  ClassificationOption,
  EFFECTOR_RANGES,
  ThreatClassId,
  TraineeEffectorsView,
  TraineeTrack,
} from '../../sim/index.js';

export interface TrackDetailProps {
  track: TraineeTrack | null;
  currentTick: number;
  effectors: TraineeEffectorsView;
  missionEnded: boolean;
  onAcknowledge: (trackId: number) => void;
  onClassify: (trackId: number, classId: ThreatClassId | 'unknown') => void;
  onEngage: (trackId: number, effector: 'jammer' | 'gun') => void;
  onHoldFire: (trackId: number) => void;
}

export function TrackDetail({
  track,
  currentTick,
  effectors,
  missionEnded,
  onAcknowledge,
  onClassify,
  onEngage,
  onHoldFire,
}: TrackDetailProps): React.JSX.Element {
  if (!track) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>TRACK CUES & ACTION CONTROL</div>
        <div style={styles.emptyPrompt}>
          Select a track from the radar scope or track table to view telemetry cues and dispatch
          commands.
        </div>
      </div>
    );
  }

  // Jammer disabled reasons
  let jammerDisabledReason: string | null = null;
  if (missionEnded) {
    jammerDisabledReason = 'Mission ended';
  } else if (track.rangeM > EFFECTOR_RANGES.jammer) {
    jammerDisabledReason = `Out of range (>${EFFECTOR_RANGES.jammer}m)`;
  } else if (effectors.jammer.busyUntilTick > currentTick) {
    jammerDisabledReason = `Jammer busy (${Math.ceil((effectors.jammer.busyUntilTick - currentTick) / 20)}s)`;
  }

  // Gun disabled reasons
  let gunDisabledReason: string | null = null;
  if (missionEnded) {
    gunDisabledReason = 'Mission ended';
  } else if (track.rangeM > EFFECTOR_RANGES.gun) {
    gunDisabledReason = `Out of range (>${EFFECTOR_RANGES.gun}m)`;
  } else if (effectors.gun.ammo <= 0) {
    gunDisabledReason = 'Gun ammo depleted (0)';
  } else if (effectors.gun.busyUntilTick > currentTick) {
    gunDisabledReason = `Gun cycling (${Math.ceil((effectors.gun.busyUntilTick - currentTick) / 20)}s)`;
  }

  const isAckDisabled = missionEnded || track.acked;
  const ackDisabledReason = missionEnded
    ? 'Mission ended'
    : track.acked
      ? 'Already acknowledged'
      : null;

  const isHoldDisabled = missionEnded || track.engagementStatus === 'holding_fire';
  const holdDisabledReason = missionEnded
    ? 'Mission ended'
    : track.engagementStatus === 'holding_fire'
      ? 'Already holding fire'
      : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>TRACK DETAIL: T{track.trackId}</span>
        <span
          style={{
            ...styles.lifecycleTag,
            color: track.state === 'confirmed' ? '#38bdf8' : '#94a3b8',
          }}
        >
          {track.state.toUpperCase()}
        </span>
      </div>

      {/* Telemetry Cues Grid */}
      <div style={styles.cuesGrid}>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>SPEED</span>
          <span style={styles.cueVal}>{Math.round(track.speedMps)} m/s</span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>COURSE</span>
          <span style={styles.cueVal}>
            {track.courseDeg !== undefined ? `${Math.round(track.courseDeg)}°` : 'N/A'}
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>CLOSING RATE</span>
          <span
            style={{
              ...styles.cueVal,
              color: track.closingRateMps < -2 ? '#f87171' : '#cbd5e1',
            }}
          >
            {Math.round(track.closingRateMps)} m/s
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>TURN RATE</span>
          <span style={styles.cueVal}>
            {track.headingChangeRateDegPerS.toFixed(1)}°/s
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>ALTITUDE</span>
          <span style={styles.cueVal}>{Math.round(track.altitudeM)} m</span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>RCS BUCKET</span>
          <span style={styles.cueVal}>{track.rcsBucket.toUpperCase()}</span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>TRACK QUALITY</span>
          <span style={styles.cueVal}>{(track.quality * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Action 1: Acknowledge & Hold Fire */}
      <div style={styles.sectionRow}>
        <div style={styles.actionBlock}>
          <button
            id="btn-ack"
            disabled={isAckDisabled}
            onClick={() => onAcknowledge(track.trackId)}
            style={{
              ...styles.btnAction,
              backgroundColor: isAckDisabled ? '#1e293b' : '#0284c7',
              opacity: isAckDisabled ? 0.6 : 1,
            }}
          >
            Acknowledge [A]
          </button>
          {ackDisabledReason && (
            <span style={styles.disabledReasonText}>{ackDisabledReason}</span>
          )}
        </div>

        <div style={styles.actionBlock}>
          <button
            id="btn-hold-fire"
            disabled={isHoldDisabled}
            onClick={() => onHoldFire(track.trackId)}
            style={{
              ...styles.btnAction,
              backgroundColor: isHoldDisabled ? '#1e293b' : '#334155',
              opacity: isHoldDisabled ? 0.6 : 1,
            }}
          >
            Hold Fire [H]
          </button>
          {holdDisabledReason && (
            <span style={styles.disabledReasonText}>{holdDisabledReason}</span>
          )}
        </div>
      </div>

      {/* Action 2: Classification Options */}
      <div style={styles.actionSection}>
        <div style={styles.sectionLabel}>CLASSIFY CONTACT</div>
        <div style={styles.classifyGrid}>
          {CLASSIFICATION_OPTIONS.map((opt: ClassificationOption, idx: number) => {
            const isAssessed = track.assessedClass === opt.id;
            const keyLabel = opt.id === 'unknown' ? '0' : String(idx + 1);

            return (
              <button
                key={opt.id}
                id={`btn-classify-${opt.id}`}
                disabled={missionEnded}
                onClick={() => onClassify(track.trackId, opt.id)}
                style={{
                  ...styles.btnClassify,
                  backgroundColor: isAssessed ? '#065f46' : '#1e293b',
                  borderColor: isAssessed ? '#10b981' : '#334155',
                  color: isAssessed ? '#a7f3d0' : '#e2e8f0',
                }}
              >
                <span>{opt.label}</span>
                <span style={styles.shortcutTag}>[{keyLabel}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action 3: Engagement Controls */}
      <div style={styles.actionSection}>
        <div style={styles.sectionLabel}>ENGAGE EFFECTOR</div>
        <div style={styles.effectorButtonsRow}>
          <div style={styles.actionBlock}>
            <button
              id="btn-engage-jammer"
              disabled={jammerDisabledReason !== null}
              onClick={() => onEngage(track.trackId, 'jammer')}
              style={{
                ...styles.btnEngage,
                backgroundColor:
                  jammerDisabledReason !== null ? '#1e293b' : '#7c3aed',
                opacity: jammerDisabledReason !== null ? 0.6 : 1,
              }}
            >
              ⚡ Engage Jammer [J]
            </button>
            {jammerDisabledReason && (
              <span style={styles.disabledReasonText}>{jammerDisabledReason}</span>
            )}
          </div>

          <div style={styles.actionBlock}>
            <button
              id="btn-engage-gun"
              disabled={gunDisabledReason !== null}
              onClick={() => onEngage(track.trackId, 'gun')}
              style={{
                ...styles.btnEngage,
                backgroundColor:
                  gunDisabledReason !== null ? '#1e293b' : '#dc2626',
                opacity: gunDisabledReason !== null ? 0.6 : 1,
              }}
            >
              💥 Engage Gun [G]
            </button>
            {gunDisabledReason && (
              <span style={styles.disabledReasonText}>{gunDisabledReason}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0b111e',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    fontFamily: 'monospace',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#94a3b8',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '8px',
  },
  lifecycleTag: {
    fontSize: '11px',
    fontWeight: 700,
  },
  emptyPrompt: {
    color: '#64748b',
    fontSize: '12px',
    padding: '24px 12px',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  cuesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  cueBox: {
    backgroundColor: '#030712',
    border: '1px solid #1e293b',
    borderRadius: '4px',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cueLabel: {
    color: '#64748b',
    fontSize: '9px',
    fontWeight: 600,
  },
  cueVal: {
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
  },
  sectionRow: {
    display: 'flex',
    gap: '10px',
  },
  actionBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  btnAction: {
    width: '100%',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  disabledReasonText: {
    color: '#f87171',
    fontSize: '10px',
    textAlign: 'center',
  },
  actionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: '0.05em',
  },
  classifyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '6px',
  },
  btnClassify: {
    border: '1px solid',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
  },
  shortcutTag: {
    color: '#94a3b8',
    fontSize: '10px',
  },
  effectorButtonsRow: {
    display: 'flex',
    gap: '10px',
  },
  btnEngage: {
    width: '100%',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '10px 14px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
};
