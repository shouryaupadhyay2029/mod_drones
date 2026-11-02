import React, { useState } from 'react';
import { TimeOfDay, TraineeEoView, TraineeTrack } from '../../sim/index.js';
import './tactical-console.css';

export interface EoPanelProps {
  eo: TraineeEoView;
  selectedTrackId: number | null;
  track?: TraineeTrack | null;
  timeOfDay?: TimeOfDay;
  weather?: string;
  onLock: (trackId: number) => void;
  onRelease: () => void;
  onToggleChannel: () => void;
}

export type FlirPalette = 'whot' | 'bhot' | 'nvg' | 'tv';
export type ZoomLevel = 1.0 | 2.5 | 5.0;

export function EoPanel({
  eo,
  selectedTrackId,
  track,
  timeOfDay = 'dusk',
  weather = 'clear',
  onLock,
  onRelease,
  onToggleChannel,
}: EoPanelProps): React.JSX.Element {
  const [palette, setPalette] = useState<FlirPalette>(eo.channel === 'tv' ? 'tv' : 'whot');
  const [zoom, setZoom] = useState<ZoomLevel>(1.0);
  const [isPipOpen, setIsPipOpen] = useState<boolean>(false);

  const isLocked = eo.state === 'locked';
  const isSlewing = eo.state === 'slewing';
  const isTracking = isLocked || selectedTrackId !== null;
  const isNight = timeOfDay === 'night';
  const isTv = eo.channel === 'tv';
  const isNightTv = isTv && isNight;

  // Active palette configuration
  const activePalette: FlirPalette = isTv ? 'tv' : palette === 'tv' ? 'whot' : palette;

  // Military FLIR palettes:
  // WHOT (White-Hot): Cold slate background, glowing white airframe & hot nacelles
  // BHOT (Black-Hot): Light thermal background, dark airframe with white-hot motor exhausts
  // NVG: High-contrast military night-vision phosphor green matrix
  // TV: Grayscale daylight electro-optical camera
  let viewportBg = '#0c1015';
  let reticleColor = 'rgba(74, 222, 128, 0.45)';
  let silhouetteColor = '#ffffff';
  let hotSpotColor = '#ff5522';
  let hudTextColor = '#4ade80';

  if (activePalette === 'whot') {
    viewportBg = '#0a0d11';
    reticleColor = 'rgba(74, 222, 128, 0.55)';
    silhouetteColor = '#ffffff';
    hotSpotColor = '#ffffff';
    hudTextColor = '#4ade80';
  } else if (activePalette === 'bhot') {
    viewportBg = '#a8b0b8';
    reticleColor = 'rgba(20, 24, 28, 0.7)';
    silhouetteColor = '#181b20';
    hotSpotColor = '#ffffff';
    hudTextColor = '#111418';
  } else if (activePalette === 'nvg') {
    viewportBg = '#061309';
    reticleColor = 'rgba(52, 211, 153, 0.65)';
    silhouetteColor = '#a7f3d0';
    hotSpotColor = '#ffffff';
    hudTextColor = '#34d399';
  } else {
    // TV mode
    viewportBg = isNightTv ? '#050505' : timeOfDay === 'dusk' ? '#141416' : '#1c1f24';
    reticleColor = isNightTv ? 'rgba(100, 116, 139, 0.3)' : 'rgba(203, 179, 232, 0.6)';
    silhouetteColor = isNightTv ? '#1e2228' : '#f8fafc';
    hotSpotColor = '#ef4444';
    hudTextColor = isNightTv ? '#64748b' : '#cbb3e8';
  }

  // Telemetry values derived from track (or realistic defaults)
  const rangeM = track?.rangeM ?? (isLocked ? 1240 : 0);
  const altM = track?.altitudeM ?? (isLocked ? 75 : 0);
  const brgDeg = track?.bearingDeg ?? (isLocked ? 48 : 0);
  const speedMps = track?.speedMps ?? (isLocked ? 38 : 0);
  const closingRate = track?.closingRateMps ?? (isLocked ? -35 : 0);
  const isEngaged = track?.engagementStatus === 'engaged';
  const isDropped = track?.state === 'dropped';

  // Resolution and atmospheric blur factor
  // High quality -> 0px blur; Low quality or distant detect -> subtle realistic optical blur
  const baseBlur = eo.level === 'identify' ? 0 : eo.level === 'recognize' ? 1 : Math.max(1.5, (1 - eo.quality) * 6);
  const blurPx = baseBlur;
  const opacity = Math.max(0.35, eo.quality || 0.6);

  // Guarantee that an object model ALWAYS resolves, even at long ranges or before full sensor classification!
  const effectiveHint: string =
    (eo.hint && eo.hint !== 'object' ? eo.hint : null) ||
    (track?.assessedClass && track.assessedClass !== 'unknown' ? track.assessedClass : null) ||
    (speedMps > 45 ? 'fixed_wing_recon' : 'commercial_quad');

  const cyclePalette = () => {
    if (isTv) {
      onToggleChannel();
      setPalette('whot');
      return;
    }
    if (palette === 'whot') setPalette('bhot');
    else if (palette === 'bhot') setPalette('nvg');
    else {
      setPalette('whot');
      onToggleChannel();
    }
  };

  const cycleZoom = () => {
    if (zoom === 1.0) setZoom(2.5);
    else if (zoom === 2.5) setZoom(5.0);
    else setZoom(1.0);
  };

  // Render the SVG thermal targeting viewfinder
  const renderTurretCanvas = (width: number, height: number, isExpanded = false) => {
    const cx = width / 2;
    const cy = height / 2;

    // Real-world optical angular scaling:
    // Drones at 2,000m look like distant heat contacts (~0.45x).
    // As they approach (1200m -> 600m -> 200m), they physically grow in the viewfinder!
    const effectiveRange = Math.max(200, rangeM || 1400);
    const distanceFactor = Math.max(0.42, Math.min(2.2, 1200 / effectiveRange));
    const modelScale = distanceFactor * zoom * (isExpanded ? 1.6 : 1.05);

    // Target tracking box dimensions scaled to the object
    const boxW = Math.max(26, Math.min(width * 0.75, 42 * modelScale));
    const boxH = Math.max(22, Math.min(height * 0.75, 36 * modelScale));

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      >
        <defs>
          <filter id="flir-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Compass Azimuth Ribbon at top */}
        <g stroke={reticleColor} strokeWidth="1" opacity="0.65">
          <line x1={cx - 110} y1="16" x2={cx + 110} y2="16" />
          <line x1={cx - 80} y1="16" x2={cx - 80} y2="11" />
          <line x1={cx - 40} y1="16" x2={cx - 40} y2="13" />
          <line x1={cx} y1="16" x2={cx} y2="7" strokeWidth="2" stroke={hudTextColor} />
          <line x1={cx + 40} y1="16" x2={cx + 40} y2="13" />
          <line x1={cx + 80} y1="16" x2={cx + 80} y2="11" />
          <text
            x={cx}
            y="26"
            fill={hudTextColor}
            fontSize="8"
            fontFamily="monospace"
            textAnchor="middle"
            fontWeight="bold"
          >
            {`${Math.round(brgDeg).toString().padStart(3, '0')}°`}
          </text>
        </g>

        {/* 2. Pitch Ladder on Left Edge */}
        <g stroke={reticleColor} strokeWidth="1" opacity="0.55">
          <line x1="28" y1={cy - 30} x2="38" y2={cy - 30} />
          <text x="24" y={cy - 28} fill={reticleColor} fontSize="7" fontFamily="monospace" textAnchor="end">+10</text>
          <line x1="24" y1={cy} x2="42" y2={cy} strokeWidth="1.5" stroke={hudTextColor} />
          <text x="20" y={cy + 3} fill={hudTextColor} fontSize="8" fontFamily="monospace" textAnchor="end">00</text>
          <line x1="28" y1={cy + 30} x2="38" y2={cy + 30} />
          <text x="24" y={cy + 33} fill={reticleColor} fontSize="7" fontFamily="monospace" textAnchor="end">-10</text>
        </g>

        {/* 3. Outer Corner Stadiametric Brackets */}
        <path d="M 16 28 L 16 16 L 32 16" stroke={reticleColor} strokeWidth="1.5" fill="none" />
        <path d={`M ${width - 16} 28 L ${width - 16} 16 L ${width - 32} 16`} stroke={reticleColor} strokeWidth="1.5" fill="none" />
        <path d={`M 16 ${height - 28} L 16 ${height - 16} L 32 ${height - 16}`} stroke={reticleColor} strokeWidth="1.5" fill="none" />
        <path d={`M ${width - 16} ${height - 28} L ${width - 16} ${height - 16} L ${width - 32} ${height - 16}`} stroke={reticleColor} strokeWidth="1.5" fill="none" />

        {/* 4. Center Tactical Reticle & Crosshairs */}
        <g stroke={reticleColor} strokeWidth="1">
          <line x1={cx} y1={cy - 26} x2={cx} y2={cy - 10} />
          <line x1={cx} y1={cy + 10} x2={cx} y2={cy + 26} />
          <line x1={cx - 32} y1={cy} x2={cx - 12} y2={cy} />
          <line x1={cx + 12} y1={cy} x2={cx + 32} y2={cy} />
          <circle cx={cx} cy={cy} r="14" stroke={reticleColor} strokeWidth="0.8" strokeDasharray="3 3" fill="none" />
          <circle cx={cx} cy={cy} r="1.5" fill={hudTextColor} />
        </g>

        {/* 5. Dynamic Object Tracking Gate & Stadiametric Lock Box */}
        {isTracking && !isNightTv && (
          <g stroke={isLocked ? hudTextColor : 'rgba(251, 191, 36, 0.6)'} strokeWidth="1.2" fill="none">
            {/* Dynamic Bounding Box Brackets */}
            <path d={`M ${cx - boxW / 2} ${cy - boxH / 2 + 8} L ${cx - boxW / 2} ${cy - boxH / 2} L ${cx - boxW / 2 + 8} ${cy - boxH / 2}`} />
            <path d={`M ${cx + boxW / 2 - 8} ${cy - boxH / 2} L ${cx + boxW / 2} ${cy - boxH / 2} L ${cx + boxW / 2} ${cy - boxH / 2 + 8}`} />
            <path d={`M ${cx - boxW / 2} ${cy + boxH / 2 - 8} L ${cx - boxW / 2} ${cy + boxH / 2} L ${cx - boxW / 2 + 8} ${cy + boxH / 2}`} />
            <path d={`M ${cx + boxW / 2 - 8} ${cy + boxH / 2} L ${cx + boxW / 2} ${cy + boxH / 2} L ${cx + boxW / 2} ${cy + boxH / 2 - 8}`} />

            {/* Target ID and Range Tag on Gate */}
            <text
              x={cx - boxW / 2}
              y={cy - boxH / 2 - 4}
              fill={isLocked ? hudTextColor : '#fbbf24'}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {isLocked ? `AUTO-TRK [T${eo.lockedTrackId ?? selectedTrackId}]` : `SLEW [T${selectedTrackId}]`}
            </text>
          </g>
        )}

        {/* 6. Dynamic Thermal Target Rendering (Visible Whenever Locked or Selected!) */}
        {isTracking && !isNightTv && (
          <g
            style={{
              filter: blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : undefined,
              opacity,
            }}
          >
            {(isEngaged || isDropped) ? (
              /* Kinetic Impact / Neutralization Thermal Debris Flash */
              <g transform={`translate(${cx}, ${cy}) scale(${modelScale})`}>
                <circle cx="0" cy="0" r="18" fill="#ff4422" opacity="0.9" filter="url(#flir-glow)" />
                <circle cx="0" cy="0" r="10" fill="#ffffff" opacity="0.95" />
                <line x1="-12" y1="-8" x2="-24" y2="-18" stroke="#ff8800" strokeWidth="2" />
                <line x1="14" y1="-6" x2="26" y2="-16" stroke="#ff8800" strokeWidth="2" />
                <line x1="-8" y1="12" x2="-18" y2="24" stroke="#ff8800" strokeWidth="2" />
                <line x1="10" y1="10" x2="22" y2="22" stroke="#ff8800" strokeWidth="2" />
                <text x="0" y="32" fill="#ef4444" fontSize="8" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
                  HIT CONFIRMED // TARGET DESTROYED
                </text>
              </g>
            ) : (
              /* Live Flying Target with Dynamic Distance Scaling, Spinning Rotors & Hotspots */
              <g transform={`translate(${cx}, ${cy}) scale(${modelScale})`}>
                {/* A. Quadcopter / Commercial Multirotor Target */}
                {(effectiveHint === 'commercial_quad' || effectiveHint === 'multirotor') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* Fuselage Core */}
                    <rect x="-10" y="-10" width="20" height="20" rx="4" />
                    {/* Center Battery Thermal Hotspot */}
                    <circle cx="0" cy="0" r="4.5" fill={hotSpotColor} className="flir-hot-motor" />

                    {/* Carbon Frame Arms */}
                    <line x1="-8" y1="-8" x2="-26" y2="-26" strokeWidth="2.5" />
                    <line x1="8" y1="-8" x2="26" y2="-26" strokeWidth="2.5" />
                    <line x1="-8" y1="8" x2="-26" y2="26" strokeWidth="2.5" />
                    <line x1="8" y1="8" x2="26" y2="26" strokeWidth="2.5" />

                    {/* 4 Motor Nacelles with Intense Heat Radiation */}
                    <circle cx="-26" cy="-26" r="3.5" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="26" cy="-26" r="3.5" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="-26" cy="26" r="3.5" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="26" cy="26" r="3.5" fill={hotSpotColor} className="flir-hot-motor" />

                    {/* 4 High-Speed Spinning Rotor Heat Discs */}
                    <ellipse cx="-26" cy="-26" rx="14" ry="4.5" fill="none" strokeWidth="1.2" strokeOpacity="0.65" className="flir-spinning-prop" />
                    <ellipse cx="26" cy="-26" rx="14" ry="4.5" fill="none" strokeWidth="1.2" strokeOpacity="0.65" className="flir-spinning-prop" />
                    <ellipse cx="-26" cy="26" rx="14" ry="4.5" fill="none" strokeWidth="1.2" strokeOpacity="0.65" className="flir-spinning-prop" />
                    <ellipse cx="26" cy="26" rx="14" ry="4.5" fill="none" strokeWidth="1.2" strokeOpacity="0.65" className="flir-spinning-prop" />
                  </g>
                )}

                {/* B. FPV Kamikaze / Fiber Attack Drone */}
                {(effectiveHint === 'fpv_kamikaze' || effectiveHint === 'fpv_fiber') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* Warhead Nose Cone (Red/Heat Alert) */}
                    <circle cx="0" cy="-14" r="3.5" fill="#ef4444" />
                    <rect x="-7" y="-12" width="14" height="24" rx="2" />
                    {/* Hot Battery Core */}
                    <rect x="-4" y="-4" width="8" height="12" fill={hotSpotColor} className="flir-hot-motor" />

                    <line x1="-5" y1="-6" x2="-22" y2="-18" strokeWidth="2.2" />
                    <line x1="5" y1="-6" x2="22" y2="-18" strokeWidth="2.2" />
                    <line x1="-5" y1="8" x2="-22" y2="18" strokeWidth="2.2" />
                    <line x1="5" y1="8" x2="22" y2="18" strokeWidth="2.2" />

                    {/* High-RPM Racing Prop Discs */}
                    <ellipse cx="-22" cy="-18" rx="8" ry="3" fill="none" strokeWidth="1" strokeOpacity="0.75" className="flir-spinning-prop" />
                    <ellipse cx="22" cy="-18" rx="8" ry="3" fill="none" strokeWidth="1" strokeOpacity="0.75" className="flir-spinning-prop" />
                    <ellipse cx="-22" cy="18" rx="8" ry="3" fill="none" strokeWidth="1" strokeOpacity="0.75" className="flir-spinning-prop" />
                    <ellipse cx="22" cy="18" rx="8" ry="3" fill="none" strokeWidth="1" strokeOpacity="0.75" className="flir-spinning-prop" />

                    {/* Trailing Optical Fiber / Antenna Wire */}
                    {effectiveHint === 'fpv_fiber' && (
                      <path d="M 0 12 Q 4 24 -2 38 Q 6 52 0 68" stroke="#38bdf8" strokeWidth="0.8" fill="none" opacity="0.8" />
                    )}
                  </g>
                )}

                {/* C. Fixed-Wing / Decoy Recon Drone */}
                {(effectiveHint === 'fixed_wing_recon' || effectiveHint === 'fixed_wing' || effectiveHint === 'decoy_drone') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    <ellipse cx="0" cy="0" rx="5" ry="28" />
                    <polygon points="-52,-2 -48,5 0,0 48,5 52,-2 0,-7" />
                    <polygon points="-16,20 -12,24 0,18 12,24 16,20 0,16" />
                    {/* Rear Engine Nozzle Thermal Heat Plume */}
                    <circle cx="0" cy="28" r="4.5" fill={hotSpotColor} className="flir-hot-motor" />
                    <ellipse cx="0" cy="34" rx="3" ry="7" fill={hotSpotColor} opacity="0.65" filter="url(#flir-glow)" />
                  </g>
                )}

                {/* D. Biological Contact (Flock of Birds) */}
                {effectiveHint === 'bird' && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    <ellipse cx="0" cy="0" rx="4.5" ry="12" />
                    <path d="M 0 -2 Q -24 -20 -42 -9 Q -24 -4 0 2 Q 24 -4 42 -9 Q 24 -20 0 -2" />
                    <polygon points="-3,12 0,20 3,12" />
                    {/* Warm Biological Core */}
                    <ellipse cx="0" cy="1" rx="3" ry="6" fill={hotSpotColor} opacity="0.6" />
                  </g>
                )}
              </g>
            )}
          </g>
        )}

        {/* 7. Night TV High-Noise Warning */}
        {isNightTv && (
          <text
            x={cx}
            y={cy}
            fill="rgba(148, 163, 184, 0.45)"
            fontSize="10"
            textAnchor="middle"
            fontFamily="monospace"
            fontWeight="bold"
          >
            NO LIGHT // SWITCH TO FLIR THERMAL [T]
          </text>
        )}

        {/* 8. Live Telemetry HUD Overlays */}
        {/* Top-Left: Sensor Status */}
        <text x="14" y="32" fill={hudTextColor} fontSize="8" fontFamily="monospace" fontWeight="bold">
          CAM 02 // {activePalette.toUpperCase()}
        </text>
        <text x="14" y="42" fill="rgba(255,255,255,0.6)" fontSize="7" fontFamily="monospace">
          {eo.state.toUpperCase()} {isTracking ? `[TRK-${eo.lockedTrackId ?? selectedTrackId}]` : '[STANDBY]'}
        </text>

        {/* Top-Right: Zoom & Atmosphere */}
        <text x={width - 14} y="32" fill={hudTextColor} fontSize="8" fontFamily="monospace" textAnchor="end" fontWeight="bold">
          MAG: {zoom.toFixed(1)}X
        </text>
        <text x={width - 14} y="42" fill="rgba(255,255,255,0.6)" fontSize="7" fontFamily="monospace" textAnchor="end">
          ATMOS: {weather.toUpperCase()}
        </text>

        {/* Bottom-Left: Target Altitude & Real-time Range */}
        <text x="14" y={height - 24} fill="rgba(255,255,255,0.85)" fontSize="8" fontFamily="monospace">
          ALT: {altM > 0 ? `${Math.round(altM)}m MSL` : '--'}
        </text>
        <text x="14" y={height - 14} fill={hudTextColor} fontSize="8" fontFamily="monospace" fontWeight="bold">
          RNG: {rangeM > 0 ? `${Math.round(rangeM)}m` : '--'}
        </text>

        {/* Bottom-Right: Speed & Closing Rate */}
        <text x={width - 14} y={height - 24} fill="rgba(255,255,255,0.85)" fontSize="8" fontFamily="monospace" textAnchor="end">
          SPD: {speedMps > 0 ? `${Math.round(speedMps)} m/s` : '--'}
        </text>
        <text
          x={width - 14}
          y={height - 14}
          fill={closingRate < -20 ? '#ef4444' : hudTextColor}
          fontSize="8"
          fontFamily="monospace"
          textAnchor="end"
          fontWeight="bold"
        >
          {closingRate < 0 ? `CLOSING: ${Math.round(Math.abs(closingRate))} m/s` : `RATE: +${Math.round(closingRate)} m/s`}
        </text>
      </svg>
    );
  };

  return (
    <div className="mil-panel">
      {/* Panel Header */}
      <div className="mil-header">
        <div className="mil-header-left">
          <span
            className={`mil-led ${
              isLocked ? 'mil-led-green' : isSlewing ? 'mil-led-amber' : 'mil-led'
            }`}
            style={{ backgroundColor: !isLocked && !isSlewing ? '#8c8275' : undefined }}
          />
          <span className="mil-kicker">// SYS.02</span>
          <span className="mil-title">FLIR / EO-IR TURRET</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {/* Palette Switcher Pill */}
          <button
            type="button"
            id="btn-flir-palette"
            onClick={cyclePalette}
            title="Cycle Thermal Palette: WHOT / BHOT / NVG / TV [T]"
            className={`mil-rocker-btn ${activePalette !== 'tv' ? 'is-active-ir' : 'is-active'}`}
            style={{
              padding: '2px 7px',
              fontSize: '9px',
              fontFamily: 'monospace',
              fontWeight: 800,
              borderRadius: '4px',
              letterSpacing: '0.04em',
            }}
          >
            <span>{activePalette.toUpperCase()}</span>
          </button>

          {/* Zoom Level Switcher */}
          <button
            type="button"
            id="btn-flir-zoom"
            onClick={cycleZoom}
            title="Cycle Digital Zoom: 1.0X / 2.5X / 5.0X"
            className="mil-rocker-btn is-active"
            style={{
              padding: '2px 7px',
              fontSize: '9px',
              fontFamily: 'monospace',
              fontWeight: 800,
              borderRadius: '4px',
            }}
          >
            <span>{zoom.toFixed(1)}X</span>
          </button>

          {/* PiP Expand Button */}
          <button
            type="button"
            id="btn-flir-pip"
            onClick={() => setIsPipOpen(true)}
            title="Expand Picture-in-Picture Thermal Targeting Screen"
            className="mil-rocker-btn"
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⤢
          </button>
        </div>
      </div>

      {/* Main Panel Viewport */}
      <div
        className="flir-viewport"
        style={{
          height: '145px',
          backgroundColor: viewportBg,
        }}
      >
        {renderTurretCanvas(300, 145)}
      </div>

      {/* Target Lock Action & Quick Controls */}
      <div style={{ display: 'flex', width: '100%', gap: '6px', marginTop: '6px' }}>
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
              padding: '7px 10px',
              fontSize: '10.5px',
            }}
          >
            <span>RELEASE LOCK</span>
            <kbd className="mil-keycap" style={{ background: '#381e1e', color: '#fca5a5', borderColor: '#ef4444' }}>E</kbd>
            <span style={{ color: '#58544e', fontSize: '9px' }}>(T{eo.lockedTrackId})</span>
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
              padding: '7px 10px',
              fontSize: '10.5px',
            }}
          >
            <span>LOCK OPTICAL TARGET</span>
            <kbd className="mil-keycap" style={{ borderColor: '#38bdf8', color: '#38bdf8' }}>E</kbd>
            <span style={{ color: '#58544e', fontSize: '9px' }}>(T{selectedTrackId})</span>
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
              fontWeight: 700,
              color: '#58544e',
              backgroundColor: '#f7f3eb',
              border: '1px solid rgba(45, 40, 35, 0.16)',
              borderRadius: '6px',
            }}
          >
            SELECT A TRACK TO LOCK [E]
          </button>
        )}
      </div>

      {/* Resolution Quality Bar & Hint Readout */}
      <div className="mil-cue-card" style={{ marginTop: '6px', padding: '6px 8px' }}>
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
                  : '#58544e',
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
            backgroundColor: 'rgba(45, 40, 35, 0.12)',
            borderRadius: '2px',
            overflow: 'hidden',
            margin: '4px 0',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: '2px',
              width: `${Math.round(Math.max(0.15, eo.quality) * 100)}%`,
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
          <span style={{ color: '#181716', fontWeight: 800 }}>
            {effectiveHint.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
      </div>

      {/* Picture-in-Picture Expanded Theater Modal */}
      {isPipOpen && (
        <div
          className="flir-pip-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPipOpen(false);
          }}
        >
          <div className="flir-pip-dialog">
            {/* Header */}
            <div className="flir-pip-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="mil-led mil-led-green" />
                <span style={{ color: '#f7f3eb', fontWeight: 800, fontSize: '12px', letterSpacing: '0.08em' }}>
                  VAJRA // TADS FLIR TARGETING MONITOR
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    fontWeight: 800,
                  }}
                >
                  REC [●] LIVE
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={cyclePalette}
                  className="mil-rocker-btn is-active-ir"
                  style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '4px' }}
                >
                  PALETTE: {activePalette.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={cycleZoom}
                  className="mil-rocker-btn is-active"
                  style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '4px' }}
                >
                  ZOOM: {zoom.toFixed(1)}X
                </button>
                <button
                  type="button"
                  onClick={() => setIsPipOpen(false)}
                  className="flir-pip-close"
                  title="Close Targeting Monitor (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Expanded FLIR Viewport */}
            <div
              className="flir-viewport"
              style={{
                height: '460px',
                backgroundColor: viewportBg,
                borderRadius: '0 0 11px 11px',
              }}
            >
              {renderTurretCanvas(780, 460, true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
