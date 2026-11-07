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
  const [jamWarningTriggered, setJamWarningTriggered] = React.useState(false);
  const [showIdGuide, setShowIdGuide] = React.useState(false);
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
  const isTerminalLocked = track.terminal_lock === true;

  return (
    <div className="mil-panel">
      {/* Mil-Spec Header */}
      <div className="mil-header">
        <div className="mil-header-left">
          <span className={`mil-led ${isTerminalLocked ? 'mil-led-red' : track.state === 'confirmed' ? 'mil-led-green' : 'mil-led-amber'}`} />
          <span className="mil-kicker">// SYS.01</span>
          <span className="mil-title" style={{ color: isTerminalLocked ? '#b83327' : undefined }}>
            TRACK T{track.trackId}
          </span>
        </div>
        <span
          className={`mil-tag ${isTerminalLocked ? 'mil-tag-lock' : track.state === 'confirmed' ? 'mil-tag-confirmed' : 'mil-tag-tentative'}`}
          style={isTerminalLocked ? { color: '#ef4444', borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.12)' } : undefined}
        >
          {isTerminalLocked ? 'OPTICAL LOCK' : track.state.toUpperCase()}
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
              color: track.velocityValid && track.closingRateMps !== undefined && track.closingRateMps < -2 ? '#b83327' : '#181716',
            }}
          >
            {track.velocityValid && track.closingRateMps !== undefined ? `${Math.round(track.closingRateMps)} m/s` : '—'}
          </span>
          {track.velocityValid && track.closingRateMps !== undefined && (
            <span
              style={{
                fontSize: '8.5px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                color:
                  track.closingRateMps <= -12
                    ? '#dc2626'
                    : track.closingRateMps < -3
                    ? '#d97706'
                    : '#15803d',
              }}
            >
              {track.closingRateMps <= -12
                ? 'DIRECT DIVE'
                : track.closingRateMps < -3
                ? 'APPROACHING'
                : 'LATERAL / ORBIT'}
            </span>
          )}
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
          <span
            style={{
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: track.altitudeM >= 135 ? '#0284c7' : '#57534e',
            }}
          >
            {track.altitudeM >= 135 ? 'HIGH (150-400m)' : 'LOW (20-120m)'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">RCS</span>
          <span className="mil-cue-value">{track.rcsBucket.toUpperCase()}</span>
          <span
            style={{
              fontSize: '8.5px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color:
                track.rcsBucket === 'medium'
                  ? '#b45309'
                  : track.rcsBucket === 'small'
                  ? '#475569'
                  : '#15803d',
            }}
          >
            {track.rcsBucket === 'medium'
              ? '0.05m² (UAV/DECOY)'
              : track.rcsBucket === 'small'
              ? '0.02m² (FPV/QUAD)'
              : '0.001m² (BIO)'}
          </span>
        </div>
        <div className="mil-cue-card">
          <span className="mil-cue-label">QUALITY</span>
          <span className="mil-cue-value" style={{ color: track.quality >= 0.8 ? '#15803d' : '#181716' }}>
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
                  ? '#0284c7'
                  : track.rfStatus === 'ambiguous'
                  ? '#d97706'
                  : track.rfStatus === 'silent'
                  ? '#57534e'
                  : '#64748b',
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
          <span style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.04em', color: '#78716c' }}>
            {track.rfSignature === 'wideband_video'
              ? 'FPV VIDEO LINK'
              : track.rfSignature === 'long_range_link'
              ? 'RECON C2 LINK'
              : track.rfSignature === 'telemetry_link'
              ? 'CIV QUAD TLM'
              : track.rfStatus === 'silent'
              ? 'NO RF (DECOY/FIBER/BIO)'
              : 'SCANNING'}
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
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#58544e', letterSpacing: '0.08em' }}>
            CLASSIFICATION MATRIX
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setShowIdGuide((prev) => !prev)}
              style={{
                background: showIdGuide ? '#c2410c' : '#262421',
                color: '#ffffff',
                border: '1px solid #c2410c',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '8.5px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
              title="Toggle Threat vs. Decoy Sensor Identification Specifications"
            >
              {showIdGuide ? 'HIDE ID SPECS' : '? ID SPECS'}
            </button>
            <span style={{ fontSize: '9px', color: '#787268' }}>[1-7, 0]</span>
          </div>
        </div>
        {showIdGuide && (
          <div
            style={{
              background: '#141311',
              color: '#e7e5e4',
              border: '1px solid #44403c',
              borderRadius: '4px',
              padding: '7px 8px',
              fontSize: '9px',
              lineHeight: 1.4,
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <div style={{ fontWeight: 800, color: '#fb923c', letterSpacing: '0.05em', fontSize: '9px' }}>
              SENSOR ID SPECIFICATIONS (THREAT VS. DECOY)
            </div>
            <div>
              <strong style={{ color: '#f87171' }}>[3] FPV STRIKE DRONE (JAM &gt;800m / GUN):</strong> Direct Dive (-20 to -35 m/s) ·{' '}
              <code>RCS: SMALL</code> · Low (20-80m) · <code>RF: VIDEO</code> · FLIR: 4 rotors + pointed RPG nose
            </div>
            <div>
              <strong style={{ color: '#ef4444' }}>[6] FIBER FPV (GUN ONLY - JAM IMMUNE):</strong> Direct Dive (-20 to -30 m/s) ·{' '}
              <code>RCS: SMALL</code> · Low (20-80m) · <code>RF: SILENT</code> · FLIR: 4 rotors + RPG nose + trailing wire
            </div>
            <div>
              <strong style={{ color: '#fbbf24' }}>[4] FIXED-WING RECON (JAM / GUN):</strong> High-Alt Transit (22-32 m/s) ·{' '}
              <code>RCS: MEDIUM</code> · High (150-400m) · <code>RF: LONG RANGE C2</code> · FLIR: Straight wings + nose prop
            </div>
            <div>
              <strong style={{ color: '#38bdf8' }}>[7] FAKE DECOY LURE (HOLD FIRE [H]!):</strong> Perimeter Pass / Lure ·{' '}
              <code>RCS: MEDIUM</code> (fake reflector) · Low (20-80m) · <code>RF: SILENT</code> · FLIR: Triangle delta-wing + radar ball + tail flare
            </div>
            <div>
              <strong style={{ color: '#a3e635' }}>[2] CIVILIAN QUAD (HOLD FIRE [H]!):</strong> Slow Lateral (8-16 m/s) ·{' '}
              <code>RCS: SMALL</code> · 40-120m · <code>RF: TELEMETRY</code> · FLIR: X-frame + landing skids
            </div>
            <div>
              <strong style={{ color: '#94a3b8' }}>[1] BIRD (HOLD FIRE [H]!):</strong> Erratic Wander (4-14 m/s) ·{' '}
              <code>RCS: TINY</code> · <code>RF: SILENT</code> · FLIR: Flapping wings
            </div>
            <div>
              <strong style={{ color: '#a8a29e' }}>[5] FALSE / CLUTTER (HOLD FIRE [H]!):</strong> Near-Stationary (&lt;6 m/s) ·{' '}
              <code>RCS: TINY</code> · Low (&lt;50m) · <code>RF: SILENT</code>
            </div>
          </div>
        )}
        <div className="mil-classify-grid">
          {CLASSIFICATION_OPTIONS.map((opt: ClassificationOption, idx: number) => {
            const isAssessed = track.assessedClass === opt.id;
            const keyLabel = opt.hotkey ?? (opt.id === 'unknown' ? '0' : String(idx + 1));

            return (
              <button
                type="button"
                key={opt.id}
                id={`btn-classify-${opt.id}`}
                className={`mil-classify-btn ${isAssessed ? 'is-active' : ''}`}
                disabled={missionEnded}
                onClick={() => onClassify(track.trackId, opt.id)}
              >
                <span style={{ color: isAssessed ? '#ffffff' : '#181716' }}>{opt.label}</span>
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
        {jamWarningTriggered && (
          <div
            style={{
              background: '#b83327',
              color: '#ffffff',
              padding: '6px 8px',
              borderRadius: '3px',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textAlign: 'center',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
            }}
          >
            AUTONOMOUS LOCK: RF IMMUNE - USE KINETIC
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#58544e', letterSpacing: '0.08em' }}>
            AUTHORIZE DEFENSE EFFECTOR
          </span>
          <span style={{ fontSize: '9px', color: '#787268' }}>[SAFETY INTERLOCKED]</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              type="button"
              id="btn-engage-jammer"
              className="mil-btn-tactile mil-btn-jammer"
              disabled={jammerDisabledReason !== null}
              onClick={() => {
                if (isTerminalLocked) {
                  setJamWarningTriggered(true);
                  setTimeout(() => setJamWarningTriggered(false), 3000);
                }
                onEngage(track.trackId, 'jammer');
              }}
              style={{ width: '100%' }}
            >
              <span>ENGAGE JAMMER</span>
              <kbd className="mil-keycap" style={{ background: '#7c2d12', color: '#fed7aa', borderColor: '#ea580c' }}>J</kbd>
            </button>
            {isTerminalLocked ? (
              <span className="mil-disabled-tag" style={{ color: '#ef4444', fontWeight: 800 }}>
                AUTONOMOUS LOCK: RF IMMUNE - USE KINETIC
              </span>
            ) : jammerDisabledReason && (
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
