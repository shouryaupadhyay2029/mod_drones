import React from 'react';
import {
  CLASSIFICATION_OPTIONS,
  ClassificationOption,
  EFFECTOR_RANGES,
  ThreatClassId,
  TraineeEffectorsView,
  TraineeTrack,
} from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: track.state === 'confirmed' ? '#10b981' : '#f59e0b',
              boxShadow: track.state === 'confirmed' ? '0 0 6px #10b981' : 'none',
            }}
          />
          <span style={{ color: '#f8fafc', letterSpacing: '0.04em' }}>TRACK DETAIL: T{track.trackId}</span>
        </div>
        <span
          style={{
            ...styles.lifecycleTag,
            backgroundColor: track.state === 'confirmed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            color: track.state === 'confirmed' ? '#34d399' : '#fbbf24',
            border: track.state === 'confirmed' ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
            padding: '2px 8px',
            borderRadius: '4px',
          }}
        >
          {track.state.toUpperCase()}
        </span>
      </div>

      {/* Telemetry Cues Grid */}
      <div style={styles.cuesGrid}>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>SPEED</span>
          <span style={styles.cueVal}>
            {track.velocityValid && track.speedMps !== undefined ? `${Math.round(track.speedMps)} m/s` : '—'}
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>COURSE</span>
          <span style={styles.cueVal}>
            {track.velocityValid && track.courseDeg !== undefined ? `${Math.round(track.courseDeg)}°` : '—'}
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>CLOSING RATE</span>
          <span
            style={{
              ...styles.cueVal,
              color: track.velocityValid && track.closingRateMps !== undefined && track.closingRateMps < -2 ? '#fb7185' : '#f8fafc',
            }}
          >
            {track.velocityValid && track.closingRateMps !== undefined ? `${Math.round(track.closingRateMps)} m/s` : '—'}
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>TURN RATE</span>
          <span style={styles.cueVal}>
            {track.velocityValid && track.headingChangeRateDegPerS !== undefined ? `${track.headingChangeRateDegPerS.toFixed(1)}°/s` : '—'}
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
          <span style={{ ...styles.cueVal, color: track.quality >= 0.8 ? '#34d399' : '#f8fafc' }}>
            {(track.quality * 100).toFixed(0)}%
          </span>
        </div>
        <div style={styles.cueBox}>
          <span style={styles.cueLabel}>RF EMISSION</span>
          <span
            style={{
              ...styles.cueVal,
              fontSize: '11px',
              color:
                track.rfStatus === 'emitting'
                  ? '#38bdf8'
                  : track.rfStatus === 'ambiguous'
                  ? '#f59e0b'
                  : track.rfStatus === 'silent'
                  ? '#94a3b8'
                  : '#cbd5e1',
            }}
          >
            {track.rfSignature
              ? track.rfSignature.replace(/_/g, ' ').toUpperCase()
              : track.rfStatus === 'ambiguous'
              ? 'AMBIGUOUS'
              : track.rfStatus === 'silent'
              ? 'SILENT'
              : 'UNKNOWN'}
          </span>
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
              background: isAckDisabled
                ? 'rgba(255, 255, 255, 0.04)'
                : 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
              color: isAckDisabled ? '#64748b' : '#ffffff',
              border: isAckDisabled ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(52, 211, 153, 0.6)',
              boxShadow: isAckDisabled ? 'none' : '0 2px 10px rgba(16, 185, 129, 0.35)',
              opacity: isAckDisabled ? 0.6 : 1,
            }}
          >
            <TextRoll center stagger={0.02}>Acknowledge [A]</TextRoll>
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
              background: isHoldDisabled ? 'rgba(255, 255, 255, 0.04)' : 'rgba(245, 158, 11, 0.08)',
              color: isHoldDisabled ? '#64748b' : '#fbbf24',
              border: isHoldDisabled ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(245, 158, 11, 0.4)',
              opacity: isHoldDisabled ? 0.6 : 1,
            }}
          >
            <TextRoll center stagger={0.02}>Hold Fire [H]</TextRoll>
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
                  backgroundColor: isAssessed ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: isAssessed ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                  color: isAssessed ? '#38bdf8' : '#cbd5e1',
                  boxShadow: isAssessed ? '0 0 10px rgba(56, 189, 248, 0.25)' : 'none',
                }}
              >
                <span>
                  <TextRoll stagger={0.02}>{opt.label}</TextRoll>
                </span>
                <span style={{ ...styles.shortcutTag, color: isAssessed ? '#38bdf8' : '#64748b' }}>[{keyLabel}]</span>
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
                background:
                  jammerDisabledReason !== null
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
                color: jammerDisabledReason !== null ? '#64748b' : '#ffffff',
                border: jammerDisabledReason !== null ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(56, 189, 248, 0.6)',
                boxShadow: jammerDisabledReason !== null ? 'none' : '0 2px 14px rgba(2, 132, 199, 0.4)',
                opacity: jammerDisabledReason !== null ? 0.6 : 1,
              }}
            >
              <TextRoll center stagger={0.02}>⚡ Engage Jammer [J]</TextRoll>
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
                background:
                  gunDisabledReason !== null
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)',
                color: gunDisabledReason !== null ? '#64748b' : '#ffffff',
                border: gunDisabledReason !== null ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(248, 113, 113, 0.6)',
                boxShadow: gunDisabledReason !== null ? 'none' : '0 2px 14px rgba(220, 38, 38, 0.45)',
                opacity: gunDisabledReason !== null ? 0.6 : 1,
              }}
            >
              <TextRoll center stagger={0.02}>💥 Engage Gun [G]</TextRoll>
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
    backgroundColor: '#0c1015',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    fontFamily: 'ui-monospace, monospace',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#f8fafc',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '10px',
  },
  lifecycleTag: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  emptyPrompt: {
    color: '#64748b',
    fontSize: '11.5px',
    padding: '28px 14px',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  cuesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px',
  },
  cueBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  cueLabel: {
    color: '#64748b',
    fontSize: '8.5px',
    fontWeight: 600,
    letterSpacing: '0.06em',
  },
  cueVal: {
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
  },
  sectionRow: {
    display: 'flex',
    gap: '8px',
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
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11.5px',
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    transition: 'all 0.16s ease',
  },
  disabledReasonText: {
    color: '#f87171',
    fontSize: '9.5px',
    textAlign: 'center',
    fontFamily: 'ui-monospace, monospace',
  },
  actionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: '9.5px',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.06em',
  },
  classifyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '6px',
  },
  btnClassify: {
    border: '1px solid',
    borderRadius: '6px',
    padding: '6px 9px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.16s ease',
  },
  shortcutTag: {
    fontSize: '9.5px',
    fontFamily: 'ui-monospace, monospace',
  },
  effectorButtonsRow: {
    display: 'flex',
    gap: '8px',
  },
  btnEngage: {
    width: '100%',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '11.5px',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    cursor: 'pointer',
    transition: 'all 0.16s ease',
  },
};
