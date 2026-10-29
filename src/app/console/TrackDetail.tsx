import React from 'react';
import {
  CLASSIFICATION_OPTIONS,
  ClassificationOption,
  EFFECTOR_RANGES,
  ThreatClassId,
  TraineeEffectorsView,
  TraineeTrack,
} from '../../sim/index.js';
import './tactical-console.css';

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
      <div className="mil-panel">
        <div className="mil-header">
          <div className="mil-header-left">
            <span className="mil-led mil-led-amber" />
            <span className="mil-title">TRACK CUES & ACTION CONTROL</span>
          </div>
          <span className="mil-tag mil-tag-neutral">STANDBY</span>
        </div>
        <div className="mil-standby-box">
          <div className="mil-standby-reticle">
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#c2410c' }} />
          </div>
          <div className="mil-standby-title">NO TRACK DESIGNATED</div>
          <div className="mil-standby-desc">
            Select a contact from the radar scope or tactical air picture to inspect cues and authorize effectors.
          </div>
          <div className="mil-standby-cta">
            <kbd className="mil-keycap">TAB</kbd> / <kbd className="mil-keycap">N</kbd> DESIGNATE TARGET
          </div>
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
    <div className="mil-panel">
      {/* Mil-Spec Header */}
      <div className="mil-header">
        <div className="mil-header-left">
          <span className={`mil-led ${track.state === 'confirmed' ? 'mil-led-green' : 'mil-led-amber'}`} />
          <span className="mil-kicker">// SYS.01</span>
          <span className="mil-title">TRACK T{track.trackId}</span>
        </div>
        <span className={`mil-tag ${track.state === 'confirmed' ? 'mil-tag-confirmed' : 'mil-tag-tentative'}`}>
          {track.state.toUpperCase()}
        </span>
      </div>

      {/* Telemetry Cues Grid */}
      <div className="mil-cues-grid">
        <div className="mil-cue-card">
          <span className="mil-cue-label">SPEED</span>
          <span className="mil-cue-value">
            {track.velocityValid && track.speedMps !== undefined ? `${Math.round(track.speedMps)} m/s` : '—'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">COURSE</span>
          <span className="mil-cue-value">
            {track.velocityValid && track.courseDeg !== undefined ? `${Math.round(track.courseDeg)}°` : '—'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">CLOSING</span>
          <span
            className="mil-cue-value"
            style={{
              color: track.velocityValid && track.closingRateMps !== undefined && track.closingRateMps < -2 ? '#fb7185' : '#f1ece1',
            }}
          >
            {track.velocityValid && track.closingRateMps !== undefined ? `${Math.round(track.closingRateMps)} m/s` : '—'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">TURN RATE</span>
          <span className="mil-cue-value">
            {track.velocityValid && track.headingChangeRateDegPerS !== undefined ? `${track.headingChangeRateDegPerS.toFixed(1)}°/s` : '—'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">ALTITUDE</span>
          <span className="mil-cue-value">{Math.round(track.altitudeM)} m</span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">RCS</span>
          <span className="mil-cue-value">{track.rcsBucket.toUpperCase()}</span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">QUALITY</span>
          <span className="mil-cue-value" style={{ color: track.quality >= 0.8 ? '#34d399' : '#f1ece1' }}>
            {(track.quality * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">RF SIG</span>
          <span
            className="mil-cue-value"
            style={{
              fontSize: '11px',
              color:
                track.rfStatus === 'emitting'
                  ? '#38bdf8'
                  : track.rfStatus === 'ambiguous'
                  ? '#f59e0b'
                  : track.rfStatus === 'silent'
                  ? '#8c8275'
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

      {/* Directives: Acknowledge & Hold Fire */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            type="button"
            id="btn-ack"
            className="mil-btn-tactile mil-btn-ack"
            disabled={isAckDisabled}
            onClick={() => onAcknowledge(track.trackId)}
            style={{ width: '100%' }}
          >
            <span>ACKNOWLEDGE</span>
            <kbd className="mil-keycap">A</kbd>
          </button>
          {ackDisabledReason && (
            <span className="mil-disabled-tag">{ackDisabledReason}</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            type="button"
            id="btn-hold-fire"
            className="mil-btn-tactile mil-btn-hold"
            disabled={isHoldDisabled}
            onClick={() => onHoldFire(track.trackId)}
            style={{ width: '100%' }}
          >
            <span>HOLD FIRE</span>
            <kbd className="mil-keycap">H</kbd>
          </button>
          {holdDisabledReason && (
            <span className="mil-disabled-tag">{holdDisabledReason}</span>
          )}
        </div>
      </div>

      {/* Classification Rocker Matrix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#8c8275', letterSpacing: '0.08em' }}>
            CLASSIFICATION MATRIX
          </span>
          <span style={{ fontSize: '9px', color: '#686055' }}>[HOTKEYS 1-7, 0]</span>
        </div>
        <div className="mil-classify-grid">
          {CLASSIFICATION_OPTIONS.map((opt: ClassificationOption, idx: number) => {
            const isAssessed = track.assessedClass === opt.id;
            const keyLabel = opt.id === 'unknown' ? '0' : String(idx + 1);

            return (
              <button
                type="button"
                key={opt.id}
                id={`btn-classify-${opt.id}`}
                className={`mil-classify-btn ${isAssessed ? 'is-active' : ''}`}
                disabled={missionEnded}
                onClick={() => onClassify(track.trackId, opt.id)}
              >
                <span style={{ color: isAssessed ? '#f1ece1' : '#c9c1b3' }}>{opt.label}</span>
                <kbd className="mil-keycap" style={{ borderColor: isAssessed ? '#c2410c' : undefined }}>
                  {keyLabel}
                </kbd>
              </button>
            );
          })}
        </div>
      </div>

      {/* Engagement Effectors */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#8c8275', letterSpacing: '0.08em' }}>
            AUTHORIZE DEFENSE EFFECTOR
          </span>
          <span style={{ fontSize: '9px', color: '#686055' }}>[SAFETY INTERLOCKED]</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              type="button"
              id="btn-engage-jammer"
              className="mil-btn-tactile mil-btn-jammer"
              disabled={jammerDisabledReason !== null}
              onClick={() => onEngage(track.trackId, 'jammer')}
              style={{ width: '100%' }}
            >
              <span>ENGAGE JAMMER</span>
              <kbd className="mil-keycap" style={{ background: '#7c2d12', color: '#fed7aa', borderColor: '#ea580c' }}>J</kbd>
            </button>
            {jammerDisabledReason && (
              <span className="mil-disabled-tag">{jammerDisabledReason}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              type="button"
              id="btn-engage-gun"
              className="mil-btn-tactile mil-btn-gun"
              disabled={gunDisabledReason !== null}
              onClick={() => onEngage(track.trackId, 'gun')}
              style={{ width: '100%' }}
            >
              <span>ENGAGE GUN</span>
              <kbd className="mil-keycap" style={{ background: '#7f1d1d', color: '#fecaca', borderColor: '#dc2626' }}>G</kbd>
            </button>
            {gunDisabledReason && (
              <span className="mil-disabled-tag">{gunDisabledReason}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
