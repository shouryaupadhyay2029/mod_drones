import React from 'react';
import { TimeOfDay, TraineeEoView } from '../../sim/index.js';

export interface EoPanelProps {
  eo: TraineeEoView;
  selectedTrackId: number | null;
  timeOfDay?: TimeOfDay;
  weather?: string;
  onLock: (trackId: number) => void;
  onRelease: () => void;
  onToggleChannel: () => void;
}

export function EoPanel({
  eo,
  selectedTrackId,
  timeOfDay = 'dusk',
  onLock,
  onRelease,
  onToggleChannel,
}: EoPanelProps): React.JSX.Element {
  const isLocked = eo.state === 'locked';
  const isSlewing = eo.state === 'slewing';
  const isNight = timeOfDay === 'night';
  const isTv = eo.channel === 'tv';
  const isIr = eo.channel === 'ir';

  // Night TV has practically zero contrast and heavy grain
  const isNightTv = isTv && isNight;

  // Visual blur / degradation factor based on (1 - quality)
  const blurPx = Math.max(0, (1 - eo.quality) * 12);
  const opacity = Math.max(0.15, eo.quality);

  // Palette styling:
  // TV: Grayscale high-contrast or near-black at night
  // IR: Grey-green military thermal FLIR palette
  const viewportBg = isIr
    ? '#09150d'
    : isNightTv
    ? '#050505'
    : timeOfDay === 'dusk'
    ? '#141416'
    : '#1c1f24';

  const reticleColor = isIr
    ? 'rgba(74, 222, 128, 0.45)'
    : isNightTv
    ? 'rgba(100, 116, 139, 0.25)'
    : 'rgba(203, 179, 232, 0.45)';

  const silhouetteColor = isIr
    ? '#86efac' // Thermal bright green
    : isNightTv
    ? '#22252a' // Barely visible in night TV
    : '#f8fafc'; // Crisp white/grey optical

  return (
    <div style={styles.container}>
      {/* Header with Title, Channel Toggle, and Status Badge */}
      <div style={styles.headerRow}>
        <div style={styles.titleGroup}>
          <span style={styles.title}>EO/IR SENSOR TURRET</span>
          <span
            style={{
              ...styles.stateBadge,
              backgroundColor: isLocked
                ? 'rgba(212, 255, 63, 0.15)'
                : isSlewing
                ? 'rgba(245, 158, 11, 0.15)'
                : 'rgba(148, 163, 184, 0.1)',
              color: isLocked ? '#d4ff3f' : isSlewing ? '#f59e0b' : '#94a3b8',
              borderColor: isLocked
                ? 'rgba(212, 255, 63, 0.4)'
                : isSlewing
                ? 'rgba(245, 158, 11, 0.4)'
                : 'rgba(148, 163, 184, 0.2)',
            }}
          >
            {eo.state.toUpperCase()}
          </span>
        </div>

        <div style={styles.controlsGroup}>
          <button
            type="button"
            id="btn-toggle-channel"
            onClick={onToggleChannel}
            title="Toggle TV / IR Channel [T]"
            style={{
              ...styles.channelBtn,
              borderColor: isIr ? '#4ade80' : '#cbb3e8',
              color: isIr ? '#4ade80' : '#f8fafc',
            }}
          >
            {eo.channel.toUpperCase()} [T]
          </button>
        </div>
      </div>

      {/* Viewport: Vector Silhouette and HUD Crosshairs */}
      <div
        style={{
          ...styles.viewport,
          backgroundColor: viewportBg,
        }}
      >
        {/* Reticle / FOV Grid Overlay */}
        <svg style={styles.svgOverlay} viewBox="0 0 300 120">
          {/* Corner brackets */}
          <path d="M 20 25 L 20 15 L 35 15" stroke={reticleColor} strokeWidth="1.5" fill="none" />
          <path d="M 280 25 L 280 15 L 265 15" stroke={reticleColor} strokeWidth="1.5" fill="none" />
          <path d="M 20 95 L 20 105 L 35 105" stroke={reticleColor} strokeWidth="1.5" fill="none" />
          <path d="M 280 95 L 280 105 L 265 105" stroke={reticleColor} strokeWidth="1.5" fill="none" />

          {/* Central crosshair */}
          <line x1="150" y1="35" x2="150" y2="52" stroke={reticleColor} strokeWidth="1" />
          <line x1="150" y1="68" x2="150" y2="85" stroke={reticleColor} strokeWidth="1" />
          <line x1="110" y1="60" x2="135" y2="60" stroke={reticleColor} strokeWidth="1" />
          <line x1="165" y1="60" x2="190" y2="60" stroke={reticleColor} strokeWidth="1" />
          <circle cx="150" cy="60" r="14" stroke={reticleColor} strokeWidth="0.75" strokeDasharray="3 3" fill="none" />

          {/* Night TV noise pattern indicator */}
          {isNightTv && (
            <text x="150" y="64" fill="rgba(148, 163, 184, 0.35)" fontSize="9" textAnchor="middle" fontFamily="monospace">
              NO LIGHT // HIGH NOISE
            </text>
          )}

          {/* Procedural Vector Silhouette */}
          {isLocked && eo.hint && !isNightTv && (
            <g
              style={{
                filter: blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : undefined,
                opacity,
              }}
            >
              {eo.hint === 'commercial_quad' && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  {/* Central chassis */}
                  <rect x="-12" y="-12" width="24" height="24" rx="4" />
                  {/* 4 Diagonal Arms */}
                  <line x1="-10" y1="-10" x2="-28" y2="-28" strokeWidth="3" />
                  <line x1="10" y1="-10" x2="28" y2="-28" strokeWidth="3" />
                  <line x1="-10" y1="10" x2="-28" y2="28" strokeWidth="3" />
                  <line x1="10" y1="10" x2="28" y2="28" strokeWidth="3" />
                  {/* 4 Rotors */}
                  <ellipse cx="-28" cy="-28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="28" cy="-28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="-28" cy="28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="28" cy="28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                </g>
              )}

              {(eo.hint === 'fpv_kamikaze' || eo.hint === 'fpv_fiber') && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  {/* Compact aggressive X-frame */}
                  <rect x="-8" y="-14" width="16" height="28" rx="3" />
                  <circle cx="0" cy="-12" r="3" fill="#e34234" />
                  {/* Small high-speed props */}
                  <line x1="-6" y1="-8" x2="-22" y2="-18" strokeWidth="2.5" />
                  <line x1="6" y1="-8" x2="22" y2="-18" strokeWidth="2.5" />
                  <line x1="-6" y1="8" x2="-22" y2="18" strokeWidth="2.5" />
                  <line x1="6" y1="8" x2="22" y2="18" strokeWidth="2.5" />
                  <ellipse cx="-22" cy="-18" rx="8" ry="3" fill="none" strokeWidth="1.2" />
                  <ellipse cx="22" cy="-18" rx="8" ry="3" fill="none" strokeWidth="1.2" />
                  <ellipse cx="-22" cy="18" rx="8" ry="3" fill="none" strokeWidth="1.2" />
                  <ellipse cx="22" cy="18" rx="8" ry="3" fill="none" strokeWidth="1.2" />
                </g>
              )}

              {(eo.hint === 'fixed_wing_recon' ||
                eo.hint === 'fixed_wing' ||
                eo.hint === 'decoy_drone') && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  {/* Fuselage */}
                  <ellipse cx="0" cy="0" rx="6" ry="30" />
                  {/* Main Swept Wings */}
                  <polygon points="-55,-2 -50,6 0,0 50,6 55,-2 0,-8" />
                  {/* Tail stabilizer */}
                  <polygon points="-18,22 -14,26 0,20 14,26 18,22 0,18" />
                </g>
              )}

              {eo.hint === 'bird' && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  {/* Avian organic curved wings */}
                  <ellipse cx="0" cy="0" rx="5" ry="14" />
                  <path d="M 0 -2 Q -25 -22 -45 -10 Q -25 -4 0 2 Q 25 -4 45 -10 Q 25 -22 0 -2" />
                  <polygon points="-4,14 0,22 4,14" />
                </g>
              )}

              {eo.hint === 'multirotor' && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  <circle cx="0" cy="0" r="10" />
                  <line x1="-20" y1="-20" x2="20" y2="20" strokeWidth="2" />
                  <line x1="20" y1="-20" x2="-20" y2="20" strokeWidth="2" />
                  <circle cx="-20" cy="-20" r="6" fill="none" strokeWidth="1.5" />
                  <circle cx="20" cy="-20" r="6" fill="none" strokeWidth="1.5" />
                  <circle cx="-20" cy="20" r="6" fill="none" strokeWidth="1.5" />
                  <circle cx="20" cy="20" r="6" fill="none" strokeWidth="1.5" />
                </g>
              )}

              {eo.hint === 'object' && (
                <g transform="translate(150, 60)" fill={silhouetteColor}>
                  {/* Generic blurry blob */}
                  <ellipse cx="0" cy="0" rx="16" ry="12" />
                </g>
              )}
            </g>
          )}
        </svg>

        {/* Channel & Mode Tag in Corner */}
        <div style={styles.hudOverlayTags}>
          <span style={{ color: isIr ? '#4ade80' : '#cbb3e8' }}>
            {eo.channel === 'tv' ? 'OPTICAL TV' : 'FLIR THERMAL IR'}
          </span>
          <span style={{ color: '#94a3b8' }}>
            {isLocked ? `LOCKED: T${eo.lockedTrackId}` : isSlewing ? 'SLEWING...' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Target Lock Action & Telemetry Controls */}
      <div style={styles.actionRow}>
        {eo.lockedTrackId !== undefined ? (
          <button
            type="button"
            id="btn-eo-release"
            onClick={onRelease}
            style={styles.btnRelease}
          >
            RELEASE LOCK [E] (T{eo.lockedTrackId})
          </button>
        ) : selectedTrackId !== null ? (
          <button
            type="button"
            id="btn-eo-lock"
            onClick={() => onLock(selectedTrackId)}
            style={styles.btnLock}
          >
            LOCK TARGET [E] (T{selectedTrackId})
          </button>
        ) : (
          <button type="button" disabled style={styles.btnDisabled}>
            SELECT A TRACK TO LOCK [E]
          </button>
        )}
      </div>

      {/* Resolution Quality Bar & Hint Readout */}
      <div style={styles.telemetryCard}>
        <div style={styles.resolutionHeader}>
          <span style={styles.fieldLabel}>OPTICAL RESOLUTION:</span>
          <span
            style={{
              ...styles.levelBadge,
              color:
                eo.level === 'identify'
                  ? '#d4ff3f'
                  : eo.level === 'recognize'
                  ? '#38bdf8'
                  : eo.level === 'detect'
                  ? '#f59e0b'
                  : '#94a3b8',
            }}
          >
            {eo.level.toUpperCase()}
          </span>
        </div>

        {/* Quality Progress Bar */}
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.round(eo.quality * 100)}%`,
              backgroundColor:
                eo.level === 'identify'
                  ? '#d4ff3f'
                  : eo.level === 'recognize'
                  ? '#38bdf8'
                  : eo.level === 'detect'
                  ? '#f59e0b'
                  : '#64748b',
            }}
          />
        </div>

        {/* Classification Hint Text */}
        <div style={styles.hintRow}>
          <span style={styles.hintLabel}>SENSOR HINT:</span>
          <span style={styles.hintValue}>
            {eo.hint ? eo.hint.replace(/_/g, ' ').toUpperCase() : 'NO RESOLUTION'}
          </span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: '#0c1015',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
    padding: '12px 14px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: '#f8fafc',
    fontFamily: 'ui-monospace, monospace',
  },
  stateBadge: {
    fontSize: '9px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '4px',
    border: '1px solid transparent',
    letterSpacing: '0.04em',
    fontFamily: 'ui-monospace, monospace',
  },
  controlsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  channelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace',
    transition: 'all 0.16s ease',
  },
  viewport: {
    position: 'relative',
    height: '110px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgOverlay: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  hudOverlayTags: {
    position: 'absolute',
    bottom: '4px',
    left: '8px',
    right: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '8px',
    fontFamily: 'ui-monospace, monospace',
    fontWeight: 700,
    pointerEvents: 'none',
  },
  actionRow: {
    display: 'flex',
    width: '100%',
  },
  btnLock: {
    width: '100%',
    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    border: '1px solid rgba(52, 211, 153, 0.6)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace',
    boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
    transition: 'all 0.16s ease',
  },
  btnRelease: {
    width: '100%',
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.45)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'ui-monospace, monospace',
    transition: 'all 0.16s ease',
  },
  btnDisabled: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: '#64748b',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'not-allowed',
    fontFamily: 'ui-monospace, monospace',
  },
  telemetryCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    padding: '7px 9px',
  },
  resolutionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '9px',
    fontFamily: 'ui-monospace, monospace',
  },
  fieldLabel: {
    color: '#64748b',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  levelBadge: {
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  barTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.2s ease',
  },
  hintRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    fontFamily: 'ui-monospace, monospace',
  },
  hintLabel: {
    color: '#64748b',
  },
  hintValue: {
    color: '#f8fafc',
    fontWeight: 700,
  },
};
