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

export function inferThreatAirframe(
  track?: TraineeTrack | null,
  eoHint?: string
): string {
  if (eoHint && eoHint !== 'object') {
    if (eoHint === 'multirotor') {
      if (track?.terminal_lock || track?.rfStatus === 'silent') return 'fpv_fiber';
      if (track?.speedMps && track.speedMps >= 19) return 'fpv_kamikaze';
      return 'commercial_quad';
    }
    if (eoHint === 'fixed_wing') {
      return track && track.altitudeM < 135 ? 'decoy_drone' : 'fixed_wing_recon';
    }
    return eoHint;
  }

  if (track?.assessedClass && track.assessedClass !== 'unknown') {
    return track.assessedClass;
  }

  if (!track) return 'commercial_quad';

  const speed = track.speedMps ?? 0;
  const alt = track.altitudeM ?? 0;
  const rcs = track.rcsBucket;
  const rfSig = track.rfSignature;
  const rfStat = track.rfStatus;
  const isTerminal = track.terminal_lock === true;
  const closingRate = track.closingRateMps ?? 0;

  const bearingToAsset = (track.bearingDeg + 180) % 360;
  let headingError =
    track.courseDeg !== undefined ? Math.abs(track.courseDeg - bearingToAsset) : 180;
  if (headingError > 180) headingError = 360 - headingError;

  // 1. Clutter
  if (track.quality < 0.25 && (!track.velocityValid || speed < 5)) {
    return 'clutter';
  }

  // 2. Avian Biological: tiny RCS (<0.005 m²) is exclusively bird in threat library
  if (rcs === 'tiny') {
    return 'bird';
  }

  // 3. Medium RCS (0.05 m²): Fixed-Wing Recon (high alt / C2 link) vs Decoy Drone (low alt)
  if (rcs === 'medium') {
    if (alt >= 135 || rfSig === 'long_range_link') {
      return 'fixed_wing_recon';
    }
    return 'decoy_drone';
  }

  // 4. Small RCS (0.01 - 0.02 m²): FPV Fiber vs FPV Kamikaze vs Commercial Quad
  if (isTerminal) {
    return 'fpv_fiber';
  }
  if (rfSig === 'wideband_video') {
    return 'fpv_kamikaze';
  }
  if (rfSig === 'telemetry_link') {
    return 'commercial_quad';
  }
  if (rfSig === 'long_range_link') {
    return 'fixed_wing_recon';
  }

  if (
    speed >= 19 ||
    closingRate <= -14 ||
    (track.velocityValid && headingError <= 35 && closingRate <= -5) ||
    (!track.velocityValid && alt <= 72)
  ) {
    if (rfStat === 'silent') {
      return 'fpv_fiber';
    }
    return 'fpv_kamikaze';
  }

  return 'commercial_quad';
}

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

  // Resolution and atmospheric blur factor:
  // Keep silhouette sharp enough to visually distinguish airframe geometry even at long range!
  const baseBlur = eo.level === 'identify' ? 0 : eo.level === 'recognize' ? 0.25 : 0.6;
  const blurPx = baseBlur;
  const opacity = Math.max(0.84, eo.quality || 0.88);

  // Multi-sensor visual airframe geometry (renders the silent visual silhouette in the camera when zoomed/close,
  // without printing any text spoilers so the trainee must visually identify the contact themselves!)
  const effectiveHint: string = inferThreatAirframe(track, eo.hint);

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
    const idPrefix = isExpanded ? 'pip-' : 'main-';

    // Real-world optical angular scaling & distance progression:
    // At long range (>1250m optical range at 1.0x), object appears as a pulsing thermal point-light / faded glowing dot
    // so identity is visually hidden at long range until it closes in on the base OR the trainee zooms in (2.5X / 5.0X)!
    const effectiveRange = Math.max(180, rangeM || 1400);
    const opticalRangeM = effectiveRange / zoom;

    const distanceFactor = Math.max(0.34, Math.min(2.35, 1150 / effectiveRange));
    const modelScale = distanceFactor * zoom * (isExpanded ? 1.55 : 1.02);

    // Progressive optical transition:
    // beaconIntensity: 1.0 at long range (bright thermal dot / faded light bloom), fades as airframe resolves close-in
    // silhouetteReveal: hidden inside the bright dot at >1650m (0.08), emerges smoothly as target approaches <1200m or under 2.5X/5.0X zoom
    const beaconIntensity = Math.max(0.15, Math.min(1.0, (opticalRangeM - 450) / 1150));
    const silhouetteReveal = Math.max(0.08, Math.min(1.0, (1750 - opticalRangeM) / 850));
    const opticalGateBanner =
      opticalRangeM > 1250
        ? 'OPTICAL: POINT-SOURCE // ZOOM [2.5X/5X] TO RESOLVE'
        : 'OPTICAL: VISUAL SILHOUETTE // OPERATOR ID REQUIRED';

    // Camera elevation angle & horizon placement (tilts with target altitude & range)
    const elevDeg = (Math.atan2(altM || 75, effectiveRange) * 180) / Math.PI;
    const horizonY = Math.min(
      height - 28,
      Math.max(height * 0.5, cy + Math.min(22, elevDeg * 2.2) + (isExpanded ? 28 : 14))
    );
    const ridgeOffsetX = -((Math.round(brgDeg) * 3) % 120);

    // Base approach progress (0 = at 4000m outer ring, 1 = at 0m defended base)
    const approachProgress = Math.max(0, Math.min(1, 1 - effectiveRange / 4000));
    const isClosingIn = closingRate < -2;
    const ttiSeconds =
      isClosingIn && Math.abs(closingRate) > 1
        ? Math.max(1, Math.round(effectiveRange / Math.abs(closingRate)))
        : null;

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
          <filter id={`${idPrefix}flir-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id={`${idPrefix}flir-beacon-grad`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor={hotSpotColor} stopOpacity="0.85" />
            <stop offset="65%" stopColor={hudTextColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={hudTextColor} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${idPrefix}flir-sky-grad`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={viewportBg} stopOpacity="1" />
            <stop
              offset="100%"
              stopColor={activePalette === 'bhot' ? '#cfd6de' : activePalette === 'nvg' ? '#0d2614' : '#161d26'}
              stopOpacity="0.85"
            />
          </linearGradient>
        </defs>

        {/* 0. Real-World 3D Optical Sky, Panning Mountain Ridge & Perspective Terrain Grid */}
        {!isNightTv && (
          <g>
            {/* Sky & Atmospheric Horizon Glow */}
            <rect x="0" y="0" width={width} height={horizonY} fill={`url(#${idPrefix}flir-sky-grad)`} />
            {/* Distant Panning Mountain Ridge Silhouette */}
            <path
              d={`M ${ridgeOffsetX - 60} ${horizonY} L ${ridgeOffsetX} ${horizonY - 14} L ${ridgeOffsetX + 55} ${horizonY - 5} L ${ridgeOffsetX + 115} ${horizonY - 21} L ${ridgeOffsetX + 175} ${horizonY - 8} L ${ridgeOffsetX + 240} ${horizonY - 18} L ${ridgeOffsetX + 310} ${horizonY - 6} L ${ridgeOffsetX + 380} ${horizonY - 22} L ${ridgeOffsetX + 460} ${horizonY - 9} L ${ridgeOffsetX + 550} ${horizonY - 19} L ${ridgeOffsetX + 660} ${horizonY - 7} L ${ridgeOffsetX + 780} ${horizonY - 16} L ${width + 120} ${horizonY} Z`}
              fill={activePalette === 'bhot' ? 'rgba(30, 36, 44, 0.25)' : 'rgba(255, 255, 255, 0.06)'}
              stroke={reticleColor}
              strokeWidth="0.6"
              opacity="0.7"
            />
            {/* Ground Plane Below Horizon */}
            <rect
              x="0"
              y={horizonY}
              width={width}
              height={height - horizonY}
              fill={activePalette === 'bhot' ? 'rgba(40, 48, 58, 0.18)' : 'rgba(255, 255, 255, 0.035)'}
            />
            {/* Horizon Line & Perspective Ground Range Grid */}
            <line x1="0" y1={horizonY} x2={width} y2={horizonY} stroke={reticleColor} strokeWidth="0.7" opacity="0.45" />
            <line x1={cx} y1={horizonY} x2={cx - width * 0.35} y2={height} stroke={reticleColor} strokeWidth="0.4" opacity="0.22" />
            <line x1={cx} y1={horizonY} x2={cx + width * 0.35} y2={height} stroke={reticleColor} strokeWidth="0.4" opacity="0.22" />
            <line x1={cx} y1={horizonY} x2={cx} y2={height} stroke={reticleColor} strokeWidth="0.4" strokeDasharray="2 3" opacity="0.25" />
          </g>
        )}

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

            {/* Optical Resolution Gate Status Below Tracking Box (No Identity Spoilers) */}
            <text
              x={cx}
              y={cy + boxH / 2 + 10}
              fill={opticalRangeM > 1250 ? '#fbbf24' : hudTextColor}
              fontSize={isExpanded ? '8.5' : '6.8'}
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
            >
              {opticalGateBanner}
            </text>
          </g>
        )}

        {/* 6. Dynamic Thermal Target Rendering (Visible Whenever Locked or Selected!) */}
        {isTracking && !isNightTv && (
          <g
            style={{
              filter: blurPx > 0 ? `blur(${blurPx.toFixed(2)}px)` : undefined,
              opacity,
            }}
          >
            {(isEngaged || isDropped) ? (
              /* Kinetic Impact / Neutralization Thermal Debris Flash */
              <g transform={`translate(${cx}, ${cy}) scale(${modelScale})`}>
                <circle cx="0" cy="0" r="18" fill="#ff4422" opacity="0.9" filter={`url(#${idPrefix}flir-glow)`} />
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
              /* Live Flying Target: Progressive Optical Transition from Distant Bright Light / Faded Dot -> Full Approaching 3D Airframe */
              <g transform={`translate(${cx}, ${cy})`}>
                <g className="flir-flight-bob">
                  {/* 6a. Distant Thermal Point-Source Beacon ("Bright Light / Faded Glowing Dot" seen in real military FLIR at long range) */}
                  <g opacity={beaconIntensity} className="flir-beacon-pulse">
                    <circle cx="0" cy="0" r={Math.max(14, 24 * distanceFactor)} fill={`url(#${idPrefix}flir-beacon-grad)`} />
                    {/* Infrared Star-Filter Optical Glint Spikes */}
                    <line
                      x1={-Math.max(12, 18 * distanceFactor)}
                      y1="0"
                      x2={Math.max(12, 18 * distanceFactor)}
                      y2="0"
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      opacity="0.7"
                    />
                    <line
                      x1="0"
                      y1={-Math.max(10, 15 * distanceFactor)}
                      x2="0"
                      y2={Math.max(10, 15 * distanceFactor)}
                      stroke="#ffffff"
                      strokeWidth="0.9"
                      opacity="0.7"
                    />
                    <circle cx="0" cy="0" r="3.2" fill="#ffffff" filter={`url(#${idPrefix}flir-glow)`} />
                  </g>

                  {/* 6b. Approaching 3D Airframe Silhouette (Emerges out of the bright thermal dot as target closes in or zooms) */}
                  <g transform={`scale(${modelScale})`} opacity={silhouetteReveal}>
                {/* A. Civilian Commercial Quadcopter (DJI Mavic / Matrice Perspective Profile) */}
                {(effectiveHint === 'commercial_quad' || effectiveHint === 'multirotor') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* Landing Skids */}
                    <path d="M -11 8 L -14 16 M 11 8 L 14 16 M -17 16 L -9 16 M 9 16 L 17 16" strokeWidth="1.5" fill="none" opacity="0.85" />
                    {/* 4 Outstretched Carbon Boom Arms */}
                    <line x1="-7" y1="-4" x2="-28" y2="-16" strokeWidth="2.6" />
                    <line x1="7" y1="-4" x2="28" y2="-16" strokeWidth="2.6" />
                    <line x1="-7" y1="4" x2="-24" y2="12" strokeWidth="2.4" />
                    <line x1="7" y1="4" x2="24" y2="12" strokeWidth="2.4" />
                    {/* Central Avionics Fuselage Shell */}
                    <polygon points="0,-10 11,-4 9,8 -9,8 -11,-4" />
                    {/* Underslung 3-Axis Camera Gimbal Pod */}
                    <circle cx="0" cy="6" r="4" fill={viewportBg} stroke={silhouetteColor} strokeWidth="1.4" />
                    <circle cx="0" cy="6" r="1.6" fill="#38bdf8" />
                    {/* Internal Battery Thermal Core */}
                    <ellipse cx="0" cy="-2" rx="5" ry="3.5" fill={hotSpotColor} className="flir-hot-motor" />
                    {/* 4 Brushless Motor Stator Bells (Thermal Hotspots) */}
                    <circle cx="-28" cy="-16" r="3.2" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="28" cy="-16" r="3.2" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="-24" cy="12" r="3" fill={hotSpotColor} className="flir-hot-motor" />
                    <circle cx="24" cy="12" r="3" fill={hotSpotColor} className="flir-hot-motor" />
                    {/* 4 Spinning Rotor Discs */}
                    <ellipse cx="-28" cy="-18" rx="13" ry="3.8" fill="none" strokeWidth="1.3" strokeOpacity="0.75" className="flir-spinning-prop" />
                    <ellipse cx="28" cy="-18" rx="13" ry="3.8" fill="none" strokeWidth="1.3" strokeOpacity="0.75" className="flir-spinning-prop" />
                    <ellipse cx="-24" cy="10" rx="11" ry="3.2" fill="none" strokeWidth="1.2" strokeOpacity="0.7" className="flir-spinning-prop" />
                    <ellipse cx="24" cy="10" rx="11" ry="3.2" fill="none" strokeWidth="1.2" strokeOpacity="0.7" className="flir-spinning-prop" />
                  </g>
                )}

                {/* B. Hostile FPV Strike Drone / Fiber-Optic Attack Drone (Forward-Pitched Attack Posture + RPG Warhead) */}
                {(effectiveHint === 'fpv_kamikaze' || effectiveHint === 'fpv_fiber') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* Rear VTX Cloverleaf & ELRS Dipole Antennae */}
                    <line x1="0" y1="10" x2="0" y2="22" strokeWidth="1.3" />
                    <circle cx="0" cy="23" r="2.2" fill="none" strokeWidth="1.1" />
                    <line x1="-8" y1="18" x2="8" y2="18" strokeWidth="1" />

                    {/* Swept X-Frame Carbon Racing Arms */}
                    <line x1="-5" y1="-5" x2="-24" y2="-19" strokeWidth="2.8" />
                    <line x1="5" y1="-5" x2="24" y2="-19" strokeWidth="2.8" />
                    <line x1="-5" y1="6" x2="-22" y2="15" strokeWidth="2.5" />
                    <line x1="5" y1="6" x2="22" y2="15" strokeWidth="2.5" />

                    {/* Top-Mounted Strapped 6S LiPo Battery Brick (High Thermal Output) */}
                    <rect x="-5.5" y="-5" width="11" height="14" rx="2" fill={hotSpotColor} className="flir-hot-motor" />

                    {/* Conical PG-7V Shaped-Charge RPG Warhead Strapped to Nose */}
                    <polygon points="0,-24 7,-12 5,-2 -5,-2 -7,-12" fill={silhouetteColor} stroke="#ef4444" strokeWidth="1" />
                    {/* Piezo Impact Fuze Probe Extending Forward */}
                    <line x1="0" y1="-24" x2="0" y2="-32" stroke="#ef4444" strokeWidth="1.8" />
                    <circle cx="0" cy="-32" r="2.2" fill="#ef4444" filter={`url(#${idPrefix}flir-glow)`} />

                    {/* 4 High-RPM Racing Motors & Tri-Blade Prop Discs */}
                    <circle cx="-24" cy="-19" r="3" fill="#ef4444" className="flir-hot-motor" />
                    <circle cx="24" cy="-19" r="3" fill="#ef4444" className="flir-hot-motor" />
                    <circle cx="-22" cy="15" r="2.8" fill="#ef4444" className="flir-hot-motor" />
                    <circle cx="22" cy="15" r="2.8" fill="#ef4444" className="flir-hot-motor" />
                    <ellipse cx="-24" cy="-19" rx="9.5" ry="3.2" fill="none" strokeWidth="1.3" strokeOpacity="0.85" className="flir-spinning-prop" />
                    <ellipse cx="24" cy="-19" rx="9.5" ry="3.2" fill="none" strokeWidth="1.3" strokeOpacity="0.85" className="flir-spinning-prop" />
                    <ellipse cx="-22" cy="15" rx="9" ry="3" fill="none" strokeWidth="1.3" strokeOpacity="0.85" className="flir-spinning-prop" />
                    <ellipse cx="22" cy="15" rx="9" ry="3" fill="none" strokeWidth="1.3" strokeOpacity="0.85" className="flir-spinning-prop" />

                    {/* Underslung Fiber-Optic Bobbin Canister & Trailing Glass Filament */}
                    {effectiveHint === 'fpv_fiber' && (
                      <g>
                        <rect x="-4.5" y="8" width="9" height="11" rx="2" fill="#0ea5e9" stroke="#38bdf8" strokeWidth="1" />
                        <path d="M 0 19 Q 6 30 -4 42 Q 7 54 -2 68" stroke="#38bdf8" strokeWidth="1.3" strokeDasharray="3 1.5" fill="none" />
                      </g>
                    )}
                  </g>
                )}

                {/* C. Fixed-Wing Reconnaissance UAV (Orlan-10 / Supercam High-Aspect Aircraft Silhouette) */}
                {(effectiveHint === 'fixed_wing_recon' || effectiveHint === 'fixed_wing') && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* High-Aspect Straight Tapered Reconnaissance Wings + Wingtip Winglets */}
                    <polygon points="-56,-1 -52,6 0,2 52,6 56,-1 0,-6" />
                    <line x1="-56" y1="-5" x2="-54" y2="8" strokeWidth="2.2" />
                    <line x1="56" y1="-5" x2="54" y2="8" strokeWidth="2.2" />
                    {/* Aerodynamic Fuselage Body */}
                    <ellipse cx="0" cy="1" rx="5.5" ry="27" />
                    {/* Rear V-Tail / Horizontal Stabilizer Empennage */}
                    <polygon points="-19,21 -15,26 0,19 15,26 19,21 0,15" />
                    {/* Belly Gyro-Stabilized EO/IR Gimbal Ball */}
                    <circle cx="0" cy="-12" r="3.8" fill={viewportBg} stroke={reticleColor} strokeWidth="1.4" />
                    <circle cx="0" cy="-12" r="1.5" fill="#38bdf8" />
                    {/* Nose Tractor Propeller Blur */}
                    <ellipse cx="0" cy="-27" rx="11" ry="2.2" fill="none" strokeWidth="1.2" className="flir-spinning-prop" />
                    {/* Rear Internal-Combustion Engine Thermal Exhaust Plume */}
                    <circle cx="0" cy="27" r="4.5" fill={hotSpotColor} className="flir-hot-motor" />
                    <ellipse cx="0" cy="34" rx="3.5" ry="8" fill={hotSpotColor} opacity="0.75" filter={`url(#${idPrefix}flir-glow)`} />
                  </g>
                )}

                {/* C2. Decoy Drone (Cropped-Delta Flying Wing with Luneburg Radar Lens & Pyrotechnic Flare) */}
                {effectiveHint === 'decoy_drone' && (
                  <g fill={silhouetteColor} stroke={silhouetteColor}>
                    {/* Cropped Delta Flying-Wing Planform */}
                    <polygon points="0,-26 32,14 26,18 0,11 -26,18 -32,14" />
                    {/* Wingtip Vertical Stabilizer Fins */}
                    <line x1="-30" y1="8" x2="-30" y2="20" strokeWidth="2.4" />
                    <line x1="30" y1="8" x2="30" y2="20" strokeWidth="2.4" />
                    {/* Internal Luneburg Radar-Augmenting Sphere */}
                    <circle cx="0" cy="-4" r="6.5" fill="none" stroke="#eab308" strokeWidth="1.3" strokeDasharray="2 2" />
                    <line x1="-6" y1="-4" x2="6" y2="-4" stroke="#eab308" strokeWidth="1" />
                    <line x1="0" y1="-10" x2="0" y2="2" stroke="#eab308" strokeWidth="1" />
                    {/* Blazing Rear Pyrotechnic IR Decoy Flare */}
                    <circle cx="0" cy="14" r="6" fill="#eab308" filter={`url(#${idPrefix}flir-glow)`} className="flir-hot-motor" />
                    <circle cx="0" cy="14" r="3" fill="#ffffff" />
                  </g>
                )}

                {/* D. Avian Biological Contact (Living Raptor / Waterfowl with Articulated Flapping Wings) */}
                {effectiveHint === 'bird' && (
                  <g fill={silhouetteColor} stroke={silhouetteColor} className="flir-wing-flap">
                    {/* Curved Swept Avian Wings with Primary Feather Tips */}
                    <path d="M 0 -5 C -14 -22 -32 -18 -46 -6 C -34 -2 -18 -1 0 4 C 18 -1 34 -2 46 -6 C 32 -18 14 -22 0 -5 Z" />
                    {/* Avian Head, Beak & Streamlined Torso */}
                    <polygon points="0,-19 -2.5,-13 2.5,-13" />
                    <ellipse cx="0" cy="-2" rx="5" ry="12" />
                    {/* Fanned Tail Feathers */}
                    <polygon points="-3,9 -7,21 0,18 7,21 3,9" />
                    {/* Warm Biological Pectoral/Thorax Heat Core */}
                    <ellipse cx="0" cy="-3" rx="3.2" ry="6.5" fill={hotSpotColor} opacity="0.8" filter={`url(#${idPrefix}flir-glow)`} />
                  </g>
                )}

                {/* E. Clutter / Environmental False Return */}
                {effectiveHint === 'clutter' && (
                  <g fill={silhouetteColor} stroke={silhouetteColor} opacity="0.65">
                    <circle cx="-6" cy="-4" r="3" />
                    <circle cx="5" cy="-2" r="4" />
                    <circle cx="-2" cy="5" r="3.5" />
                    <circle cx="4" cy="6" r="2" />
                    <path d="M -12 2 Q 0 -6 12 4" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
                  </g>
                )}
                  </g>
                </g>
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

        {/* Bottom-Center: Real-Time Base Approach Corridor & Time-To-Impact (TTI) */}
        {isTracking && !isNightTv && (
          <g>
            <text
              x={cx}
              y={height - 22}
              fill={isClosingIn && ttiSeconds !== null && ttiSeconds < 45 ? '#ef4444' : hudTextColor}
              fontSize={isExpanded ? '8' : '6.5'}
              fontFamily="monospace"
              textAnchor="middle"
              fontWeight="bold"
            >
              {ttiSeconds !== null ? `APPROACHING BASE // TTI: ${ttiSeconds}s` : 'LATERAL TRANSIT // LOITER'}
            </text>
            {/* Corridor Track Bar: [BASE] <-----(*)----- [4KM] */}
            <line
              x1={cx - 44}
              y1={height - 13}
              x2={cx + 44}
              y2={height - 13}
              stroke={reticleColor}
              strokeWidth="1.2"
              opacity="0.6"
            />
            <rect x={cx - 47} y={height - 16} width="4" height="6" fill="#38bdf8" />
            <circle
              cx={cx + 44 - approachProgress * 88}
              cy={height - 13}
              r="3"
              fill={isClosingIn ? '#ef4444' : hudTextColor}
              filter={`url(#${idPrefix}flir-glow)`}
            />
          </g>
        )}

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
          <span className="mil-kicker">// {eo.channel === 'ir' ? 'FLIR THERMAL IR' : 'DAYLIGHT TV'}</span>
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

        {/* Classification Hint Text (Never spoils identity at long range or when unlocked) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
          <span className="mil-cue-label">SENSOR HINT:</span>
          <span style={{ color: '#181716', fontWeight: 800 }}>
            {isLocked && eo.hint && eo.hint !== 'object'
              ? eo.hint.replace(/_/g, ' ').toUpperCase()
              : isLocked
              ? 'UNRESOLVED BLOB'
              : 'LOCK [E] TO ANALYZE'}
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
