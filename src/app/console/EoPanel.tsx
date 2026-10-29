import React from 'react';
import { TimeOfDay, TraineeEoView } from '../../sim/index.js';
import './tactical-console.css';

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
    <div className="mil-panel">
      {/* Header with Title, Channel Toggle, and Status Badge */}
      <div className="mil-header">
        <div className="mil-header-left">
          <span
            className={`mil-led ${
              isLocked ? 'mil-led-green' : isSlewing ? 'mil-led-amber' : 'mil-led'
            }`}
            style={{ backgroundColor: !isLocked && !isSlewing ? '#8c8275' : undefined }}
          />
          <span className="mil-kicker">// SYS.02</span>
          <span className="mil-title">EO/IR SENSOR TURRET</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            className="mil-tag"
            style={{
              backgroundColor: isLocked
                ? 'rgba(16, 185, 129, 0.12)'
                : isSlewing
                ? 'rgba(245, 158, 11, 0.12)'
                : 'rgba(100, 116, 139, 0.12)',
              color: isLocked ? '#34d399' : isSlewing ? '#fbbf24' : '#94a3b8',
              borderColor: isLocked
                ? 'rgba(16, 185, 129, 0.35)'
                : isSlewing
                ? 'rgba(245, 158, 11, 0.35)'
                : 'rgba(100, 116, 139, 0.25)',
            }}
          >
            {eo.state.toUpperCase()}
          </span>

          {/* Tactile Channel Rocker */}
          <button
            type="button"
            id="btn-toggle-channel"
            onClick={onToggleChannel}
            title="Toggle TV / IR Channel [T]"
            className={`mil-rocker-btn ${isIr ? 'is-active-ir' : 'is-active'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '4px',
              border: isIr ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
            }}
          >
            <span>{eo.channel.toUpperCase()}</span>
            <kbd className="mil-keycap" style={{ fontSize: '8px', padding: '0 4px' }}>T</kbd>
          </button>
        </div>
      </div>

      {/* Viewport: Vector Silhouette and HUD Crosshairs */}
      <div
        style={{
          position: 'relative',
          height: '110px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: viewportBg,
        }}
      >
        {/* Reticle / FOV Grid Overlay */}
        <svg
          viewBox="0 0 300 120"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        >
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
                  <rect x="-12" y="-12" width="24" height="24" rx="4" />
                  <line x1="-10" y1="-10" x2="-28" y2="-28" strokeWidth="3" />
                  <line x1="10" y1="-10" x2="28" y2="-28" strokeWidth="3" />
                  <line x1="-10" y1="10" x2="-28" y2="28" strokeWidth="3" />
                  <line x1="10" y1="10" x2="28" y2="28" strokeWidth="3" />
                  <ellipse cx="-28" cy="-28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="28" cy="-28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="-28" cy="28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                  <ellipse cx="28" cy="28" rx="14" ry="4" fill="none" strokeWidth="1.5" />
                </g>
              )}

              {(eo.hint === 'fpv_kamikaze' || eo.hint === 'fpv_fiber') && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
                  <rect x="-8" y="-14" width="16" height="28" rx="3" />
                  <circle cx="0" cy="-12" r="3" fill="#e34234" />
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
                  <ellipse cx="0" cy="0" rx="6" ry="30" />
                  <polygon points="-55,-2 -50,6 0,0 50,6 55,-2 0,-8" />
                  <polygon points="-18,22 -14,26 0,20 14,26 18,22 0,18" />
                </g>
              )}

              {eo.hint === 'bird' && (
                <g transform="translate(150, 60)" fill={silhouetteColor} stroke={silhouetteColor}>
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
                  <ellipse cx="0" cy="0" rx="16" ry="12" />
                </g>
              )}
            </g>
          )}
        </svg>

        {/* Channel & Mode Tag in Corner */}
        <div
          style={{
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
          }}
        >
          <span style={{ color: isIr ? '#4ade80' : '#cbb3e8' }}>
            {eo.channel === 'tv' ? 'OPTICAL TV' : 'FLIR THERMAL IR'}
          </span>
          <span style={{ color: '#8c8275' }}>
            {isLocked ? `LOCKED: T${eo.lockedTrackId}` : isSlewing ? 'SLEWING...' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Target Lock Action & Telemetry Controls */}
      <div style={{ display: 'flex', width: '100%' }}>
        {eo.lockedTrackId !== undefined ? (
          <button
            type="button"
            id="btn-eo-release"
            onClick={onRelease}
            className="mil-btn-tactile"
            style={{
              width: '100%',
              background: 'linear-gradient(180deg, #2a1f1d 0%, #1c1514 100%)',
              color: '#f87171',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              padding: '8px 12px',
              fontSize: '11px',
            }}
          >
            <span>RELEASE LOCK</span>
            <kbd className="mil-keycap" style={{ background: '#381e1e', color: '#fca5a5', borderColor: '#ef4444' }}>E</kbd>
            <span style={{ color: '#8c8275', fontSize: '9px' }}>(T{eo.lockedTrackId})</span>
          </button>
        ) : selectedTrackId !== null ? (
          <button
            type="button"
            id="btn-eo-lock"
            onClick={() => onLock(selectedTrackId)}
            className="mil-btn-tactile mil-btn-ack"
            style={{
              width: '100%',
              borderColor: 'rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '8px 12px',
              fontSize: '11px',
            }}
          >
            <span>LOCK TARGET</span>
            <kbd className="mil-keycap" style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>E</kbd>
            <span style={{ color: '#8c8275', fontSize: '9px' }}>(T{selectedTrackId})</span>
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="mil-btn-tactile"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '10.5px',
              color: '#686055',
              borderColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            SELECT A TRACK TO LOCK [E]
          </button>
        )}
      </div>

      {/* Resolution Quality Bar & Hint Readout */}
      <div className="mil-cue-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px' }}>
          <span className="mil-cue-label">OPTICAL RESOLUTION:</span>
          <span
            style={{
              fontWeight: 800,
              color:
                eo.level === 'identify'
                  ? '#34d399'
                  : eo.level === 'recognize'
                  ? '#38bdf8'
                  : eo.level === 'detect'
                  ? '#f59e0b'
                  : '#8c8275',
            }}
          >
            {eo.level.toUpperCase()}
          </span>
        </div>

        {/* Quality Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: '2px',
              width: `${Math.round(eo.quality * 100)}%`,
              backgroundColor:
                eo.level === 'identify'
                  ? '#34d399'
                  : eo.level === 'recognize'
                  ? '#38bdf8'
                  : eo.level === 'detect'
                  ? '#f59e0b'
                  : '#64748b',
              transition: 'width 0.2s ease',
            }}
          />
        </div>

        {/* Classification Hint Text */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
          <span className="mil-cue-label">SENSOR HINT:</span>
          <span style={{ color: '#f1ece1', fontWeight: 700 }}>
            {eo.hint ? eo.hint.replace(/_/g, ' ').toUpperCase() : 'NO RESOLUTION'}
          </span>
        </div>
      </div>
    </div>
  );
}
