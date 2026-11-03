import { TraineeTrack, TraineeView } from '../../../sim/index.js';
import { polarToPixel, RangeRing, ringRadii } from './geometry.js';
import { getTerrainTexture } from './terrainTextures.js';

export interface ScopeDrawOptions {
  scaleM: number;
  showEffectorRings: boolean;
  selectedTrackId: number | null;
  hoveredTrackId?: number | null;
  trailHistory: Map<number, Array<{ x: number; y: number; z: number }>>;
  scenarioId?: string;
}

export function getAssessedColor(assessedClass?: string): string {
  if (!assessedClass || assessedClass === 'unknown') {
    return '#f43f5e'; // Crisp tactical red for unidentified threat
  }
  if (assessedClass === 'bird') {
    return '#94a3b8'; // Muted slate for biologicals
  }
  if (assessedClass === 'commercial_quad') {
    return '#f59e0b'; // Tactical amber for civilian drones
  }
  if (assessedClass === 'fpv_kamikaze' || assessedClass === 'fixed_wing_recon' || assessedClass === 'fpv_fiber') {
    return '#ef4444'; // Tactical Crimson for hostile UAV/FPVs
  }
  if (assessedClass === 'decoy_drone') {
    return '#eab308'; // Warning amber for decoy drone
  }
  if (assessedClass === 'clutter') {
    return '#64748b'; // Muted slate for terrain/weather clutter
  }
  return '#f59e0b';
}

export function getAssessedAbbr(assessedClass?: string): string {
  switch (assessedClass) {
    case 'bird':
      return 'BIRD';
    case 'commercial_quad':
      return 'QUAD';
    case 'fpv_kamikaze':
      return 'FPV';
    case 'fpv_fiber':
      return 'F-FPV';
    case 'fixed_wing_recon':
      return 'UAV';
    case 'decoy_drone':
      return 'DECOY';
    case 'clutter':
      return 'CLUT';
    default:
      return '';
  }
}

export function inferScopeAirframe(track: TraineeTrack): string {
  if (track.assessedClass && track.assessedClass !== 'unknown') {
    return track.assessedClass;
  }
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

  // 1. Clutter: very low quality & non-moving
  if (track.quality < 0.25 && (!track.velocityValid || speed < 5)) {
    return 'clutter';
  }

  // 2. Avian Biological: tiny RCS (<0.005 m²) is exclusively biological in threat library
  if (rcs === 'tiny') {
    return 'bird';
  }

  // 3. Medium RCS (0.05 m²): Fixed-Wing Recon (high alt / C2 link) vs Decoy Drone (low alt, RF silent)
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

  // Inbound high-speed or direct attack vector
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

export function drawScope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: TraineeView | null,
  options: ScopeDrawOptions
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radiusPx = Math.min(centerX, centerY) - 26;
  if (radiusPx <= 20) {
    ctx.restore();
    return;
  }

  const center = { x: centerX, y: centerY };

  // Scope background: High-Precision Deep Tactical Field with subtle vignette
  const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusPx);
  bgGrad.addColorStop(0, '#0c1117');
  bgGrad.addColorStop(0.75, '#070a0e');
  bgGrad.addColorStop(1, '#05070a');

  ctx.beginPath();
  ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Tactical Environment Satellite Reconnaissance Underlay
  const terrainImg = getTerrainTexture(options.scenarioId, view?.environment?.terrainKind);
  if (terrainImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.clip();

    const cropSize = Math.min(terrainImg.naturalWidth, terrainImg.naturalHeight);
    const sx = (terrainImg.naturalWidth - cropSize) / 2;
    const sy = (terrainImg.naturalHeight - cropSize) / 2;
    const destSize = radiusPx * 2;

    ctx.globalAlpha = 0.52;
    ctx.drawImage(
      terrainImg,
      sx,
      sy,
      cropSize,
      cropSize,
      centerX - radiusPx,
      centerY - radiusPx,
      destSize,
      destSize
    );

    // Deep peripheral vignette to smoothly blend satellite edges into CRT bezel
    const overlayGrad = ctx.createRadialGradient(centerX, centerY, radiusPx * 0.45, centerX, centerY, radiusPx);
    overlayGrad.addColorStop(0, 'rgba(8, 14, 21, 0.12)');
    overlayGrad.addColorStop(0.78, 'rgba(6, 11, 17, 0.58)');
    overlayGrad.addColorStop(1, 'rgba(4, 7, 10, 0.94)');

    ctx.fillStyle = overlayGrad;
    ctx.fillRect(centerX - radiusPx, centerY - radiusPx, destSize, destSize);
    ctx.restore();
  }

  // Subtle outer instrument bezel rings
  ctx.beginPath();
  ctx.arc(centerX, centerY, radiusPx + 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)'; // Tactical cyan instrument perimeter
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Range rings every 1 km (subtle, clean, non-intrusive)
  const rings: RangeRing[] = ringRadii(options.scaleM, radiusPx);
  ctx.lineWidth = 1;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (!ring) continue;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
    ctx.stroke();

    // Clean, minimalist distance labels positioned cleanly at 45 deg angle
    const angleRad = (45 * Math.PI) / 180;
    const labelX = centerX + ring.radiusPx * Math.sin(angleRad) + 3;
    const labelY = centerY - ring.radiusPx * Math.cos(angleRad) - 2;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ring.label, labelX, labelY);
  }

  // Bearing lines & precision ticks (ticks every 10 deg, major markings every 30 deg)
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const tickLen = isMajor ? 8 : 4;
    const innerR = radiusPx - tickLen;

    const x1 = centerX + innerR * Math.sin(rad);
    const y1 = centerY - innerR * Math.cos(rad);
    const x2 = centerX + radiusPx * Math.sin(rad);
    const y2 = centerY - radiusPx * Math.cos(rad);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.30)' : 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = isMajor ? 1.2 : 0.8;
    ctx.stroke();

    if (isMajor) {
      const labelR = radiusPx + 14;
      const lx = centerX + labelR * Math.sin(rad);
      const ly = centerY - labelR * Math.cos(rad);

      let text = `${deg}°`;
      let isCardinal = false;
      if (deg === 0) {
        text = 'N';
        isCardinal = true;
      } else if (deg === 90) {
        text = 'E';
        isCardinal = true;
      } else if (deg === 180) {
        text = 'S';
        isCardinal = true;
      } else if (deg === 270) {
        text = 'W';
        isCardinal = true;
      }

      if (deg === 0) {
        ctx.fillStyle = '#38bdf8'; // North highlighted in cyan
        ctx.font = 'bold 11px ui-monospace, monospace';
      } else if (isCardinal) {
        ctx.fillStyle = '#cbd5e1'; // Cardinals in crisp slate
        ctx.font = 'bold 10px ui-monospace, monospace';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.50)'; // Degree labels in subtle slate
        ctx.font = '9px ui-monospace, monospace';
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx, ly);
    }
  }

  // Tactical Crosshairs with center gap around asset
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  const centerGap = 16;

  ctx.beginPath();
  // Horizontal
  ctx.moveTo(centerX - radiusPx, centerY);
  ctx.lineTo(centerX - centerGap, centerY);
  ctx.moveTo(centerX + centerGap, centerY);
  ctx.lineTo(centerX + radiusPx, centerY);
  // Vertical
  ctx.moveTo(centerX, centerY - radiusPx);
  ctx.lineTo(centerX, centerY - centerGap);
  ctx.moveTo(centerX, centerY + centerGap);
  ctx.lineTo(centerX, centerY + radiusPx);
  ctx.stroke();

  // Effector ranges (dashed rings): Jammer = 1500m (Tactical Amber), Gun = 1000m (Tactical Crimson)
  if (options.showEffectorRings) {
    ctx.save();

    // Gun 1000m (Tactical Crimson)
    const gunRPx = (1000 / options.scaleM) * radiusPx;
    if (gunRPx <= radiusPx) {
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.arc(centerX, centerY, gunRPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.font = '8.5px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('CIWS 1.0 KM', centerX - 8, centerY - gunRPx + 10);
    }

    // Jammer 1500m (Tactical Amber)
    const jamRPx = (1500 / options.scaleM) * radiusPx;
    if (jamRPx <= radiusPx) {
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.arc(centerX, centerY, jamRPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.font = '8.5px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('JAMMER 1.5 KM', centerX - 8, centerY - jamRPx + 10);
    }
    ctx.restore();
  }

  // Sweep arm and fading phosphor wedge behind it in tactical cyan
  if (view && view.radarSweepDeg !== undefined) {
    const sweepRad = (view.radarSweepDeg * Math.PI) / 180;
    const wedgeAngleRad = (38 * Math.PI) / 180; // 38 degree smooth phosphor persistence

    // Fading wedge behind sweep arm
    const wedgeGrad = ctx.createConicGradient(sweepRad - Math.PI / 2, centerX, centerY);
    wedgeGrad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
    wedgeGrad.addColorStop(0.1, 'rgba(56, 189, 248, 0.0)');
    wedgeGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(
      centerX,
      centerY,
      radiusPx,
      sweepRad - Math.PI / 2 - wedgeAngleRad,
      sweepRad - Math.PI / 2
    );
    ctx.closePath();
    ctx.fillStyle = wedgeGrad;
    ctx.fill();

    // Crisp luminous sweep beam
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radiusPx * Math.sin(sweepRad),
      centerY - radiusPx * Math.cos(sweepRad)
    );
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Defended Asset symbol at centre: Clean Mil-Spec protected stronghold glyph
  const assetRadius = 5;
  ctx.save();
  // Outer perimeter diamond
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - 9);
  ctx.lineTo(centerX + 9, centerY);
  ctx.lineTo(centerX, centerY + 9);
  ctx.lineTo(centerX - 9, centerY);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Core asset dot
  ctx.beginPath();
  ctx.arc(centerX, centerY, assetRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.font = 'bold 8.5px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ASSET', centerX, centerY + 18);
  ctx.restore();

  // Draw Tracks
  if (view && view.tracks) {
    for (let i = 0; i < view.tracks.length; i++) {
      const track = view.tracks[i];
      if (!track || track.state === 'dropped') continue;

      drawTrack(ctx, track, center, options, radiusPx, view.radarSweepDeg);
    }
  }

  // Draw RF lines of bearing (thin dashed lines with staggered badges to prevent clutter)
  if (view && view.rf && view.rf.lines) {
    for (let i = 0; i < view.rf.lines.length; i++) {
      const line = view.rf.lines[i];
      if (!line) continue;
      const opacity = Math.max(0, Math.min(1, 1 - line.ageS / 5.0));
      if (opacity <= 0.01) continue;

      const rad = (line.bearingDeg * Math.PI) / 180;
      const endX = centerX + radiusPx * Math.sin(rad);
      const endY = centerY - radiusPx * Math.cos(rad);

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 4]);
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = `rgba(56, 189, 248, ${opacity * 0.45})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stagger RF tags along radius so clustered signals don't overlap into a blob
      const staggerOffset = (i % 3) * 18;
      const tagDist = radiusPx - 32 - staggerOffset;
      const tagX = centerX + tagDist * Math.sin(rad);
      const tagY = centerY - tagDist * Math.cos(rad);

      const sigAbbr =
        line.signature === 'wideband_video'
          ? 'RF:VIDEO'
          : line.signature === 'telemetry_link'
          ? 'RF:TLM'
          : line.signature === 'long_range_link'
          ? 'RF:C2'
          : 'RF:LINK';

      // Minimalist HUD tag capsule
      ctx.font = 'bold 8.5px ui-monospace, monospace';
      const textWidth = ctx.measureText(sigAbbr).width;
      const padX = 4;
      const padY = 2;

      ctx.fillStyle = `rgba(8, 14, 22, ${opacity * 0.85})`;
      ctx.fillRect(
        tagX - textWidth / 2 - padX,
        tagY - 6 - padY,
        textWidth + padX * 2,
        12 + padY
      );
      ctx.strokeStyle = `rgba(56, 189, 248, ${opacity * 0.35})`;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(
        tagX - textWidth / 2 - padX,
        tagY - 6 - padY,
        textWidth + padX * 2,
        12 + padY
      );

      ctx.fillStyle = `rgba(56, 189, 248, ${opacity})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sigAbbr, tagX, tagY);
      ctx.restore();
    }
  }

  // Draw Tactical Airframe Symbology Legend in bottom-left corner
  if (width >= 340 && height >= 340) {
    ctx.save();
    const legX = 12;
    const legY = height - 92;
    const legW = 112;
    const legH = 80;

    ctx.fillStyle = 'rgba(7, 11, 17, 0.82)';
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY, legW, legH);

    ctx.font = 'bold 7.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('RADAR SYMBOLOGY', legX + 7, legY + 10);

    const items: Array<{ sym: string; label: string; col: string }> = [
      { sym: '▲', label: 'FPV / FIBER', col: '#ef4444' },
      { sym: '✣', label: 'QUADROTOR', col: '#f59e0b' },
      { sym: '✈', label: 'FIXED-WING', col: '#ef4444' },
      { sym: '◈', label: 'DECOY LURE', col: '#eab308' },
      { sym: '⌒', label: 'AVIAN BIO', col: '#94a3b8' },
    ];

    items.forEach((it, idx) => {
      const iy = legY + 23 + idx * 12;
      ctx.fillStyle = it.col;
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText(it.sym, legX + 8, iy);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 7.5px ui-monospace, monospace';
      ctx.fillText(it.label, legX + 22, iy);
    });
    ctx.restore();
  }

  ctx.restore();
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: TraineeTrack,
  center: { x: number; y: number },
  options: ScopeDrawOptions,
  radiusPx: number,
  radarSweepDeg?: number
): void {
  const plotPx = polarToPixel(
    track.rangeM,
    track.bearingDeg,
    center,
    options.scaleM,
    radiusPx
  );

  const isTerminalLocked = track.terminal_lock === true;
  const airframe = inferScopeAirframe(track);
  const effectiveClass =
    track.assessedClass && track.assessedClass !== 'unknown'
      ? track.assessedClass
      : airframe;
  const color = isTerminalLocked ? '#ef4444' : getAssessedColor(effectiveClass);
  const isSelected = options.selectedTrackId === track.trackId;

  // 1. Trail: last 6 plots fading with connected phosphor afterglow path
  const history = options.trailHistory.get(track.trackId);
  if (history && history.length > 1) {
    let prevHPx: { x: number; y: number } | null = null;
    for (let h = 0; h < history.length - 1; h++) {
      const pos = history[h];
      if (!pos) continue;
      const alpha = ((h + 1) / history.length) * 0.5;
      const hDist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      let hDeg = (Math.atan2(pos.x, pos.y) * 180) / Math.PI;
      if (hDeg < 0) hDeg += 360;

      const hPx = polarToPixel(hDist, hDeg, center, options.scaleM, radiusPx);
      if (prevHPx) {
        ctx.beginPath();
        ctx.moveTo(prevHPx.x, prevHPx.y);
        ctx.lineTo(hPx.x, hPx.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = alpha * 0.65;
        ctx.stroke();
      }
      prevHPx = hPx;

      // Soft outer phosphor trail bloom
      ctx.beginPath();
      ctx.arc(hPx.x, hPx.y, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.22;
      ctx.fill();

      // Core fading trail dot
      ctx.beginPath();
      ctx.arc(hPx.x, hPx.y, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // 1b. Inbound Base Approach Corridor Line for fast-closing threats
  if (
    track.closingRateMps !== undefined &&
    track.closingRateMps < -10 &&
    airframe !== 'bird'
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2, 5]);
    ctx.moveTo(plotPx.x, plotPx.y);
    ctx.lineTo(center.x, center.y);
    ctx.strokeStyle = isSelected ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.16)';
    ctx.lineWidth = isSelected ? 1.2 : 0.9;
    ctx.stroke();
    ctx.restore();
  }

  // 2. Velocity vector: length = speed * 10 s (capped at 3 km), along estimated courseDeg
  if (
    track.velocityValid &&
    track.speedMps !== undefined &&
    track.speedMps > 1 &&
    track.courseDeg !== undefined
  ) {
    const vectorLenM = Math.min(3000, track.speedMps * 10);
    const velRPx = (vectorLenM / options.scaleM) * radiusPx;
    const courseRad = (track.courseDeg * Math.PI) / 180;
    const dx = Math.sin(courseRad);
    const dy = -Math.cos(courseRad);
    const vEnd = {
      x: plotPx.x + velRPx * dx,
      y: plotPx.y + velRPx * dy,
    };
    ctx.beginPath();
    ctx.moveTo(plotPx.x, plotPx.y);
    ctx.lineTo(vEnd.x, vEnd.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // NATO speed pips (perpendicular ticks every 10 m/s along vector)
    const perpX = -dy;
    const perpY = dx;
    const pipIntervalM = 10 * 10; // 10 m/s * 10s = 100m world distance
    const pipIntervalPx = (pipIntervalM / options.scaleM) * radiusPx;
    if (pipIntervalPx >= 5) {
      const numPips = Math.min(4, Math.floor(track.speedMps / 10));
      ctx.lineWidth = 1.2;
      for (let p = 1; p <= numPips; p++) {
        const px = plotPx.x + dx * (p * pipIntervalPx);
        const py = plotPx.y + dy * (p * pipIntervalPx);
        const pipHalf = 2.5;
        ctx.beginPath();
        ctx.moveTo(px - perpX * pipHalf, py - perpY * pipHalf);
        ctx.lineTo(px + perpX * pipHalf, py + perpY * pipHalf);
        ctx.stroke();
      }
    }
  }

  // 3. Differentiated Tactical Symbology + "Army Movie" Phosphor Blip Bloom
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;

  const rcsBase = track.rcsBucket === 'tiny' ? 6.0 : track.rcsBucket === 'medium' ? 9.0 : 7.5;

  // Compute sweep-beam phosphor excitation ("radar ping flash" when sweep passes target bearing)
  let sweepFlash = 0.35;
  if (radarSweepDeg !== undefined) {
    const behindDeg = (radarSweepDeg - track.bearingDeg + 360) % 360;
    if (behindDeg <= 65) {
      sweepFlash = 0.35 + (1 - behindDeg / 65) * 0.65;
    }
  }

  // Luminous radial phosphor blip halo behind every radar contact ("faded glowing dot / bright radar light")
  ctx.save();
  ctx.beginPath();
  ctx.arc(plotPx.x, plotPx.y, rcsBase * 2.3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 * sweepFlash;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(plotPx.x, plotPx.y, rcsBase * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.28 * sweepFlash;
  ctx.fill();

  // Intense white-hot phosphor center point when freshly painted by the radar sweep
  if (sweepFlash > 0.65) {
    ctx.beginPath();
    ctx.arc(plotPx.x, plotPx.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = (sweepFlash - 0.5) * 1.1;
    ctx.fill();
  }
  ctx.restore();

  if (track.state === 'tentative') {
    // Tentative track: Dashed acquisition ring around the airframe glyph
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2.5, 2.5]);
    ctx.arc(plotPx.x, plotPx.y, rcsBase * 1.55, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 0.85;
  }

  if (airframe === 'commercial_quad') {
    // Tactical Rotary-Wing Symbology: Central flight controller box with 4 radial rotor arms & motor hubs
    const s = rcsBase * 0.7;
    ctx.strokeRect(plotPx.x - s / 2, plotPx.y - s / 2, s, s);
    ctx.fillRect(plotPx.x - s / 2 + 1, plotPx.y - s / 2 + 1, s - 2, s - 2);

    const armDist = rcsBase * 1.3;
    const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    for (const a of angles) {
      const mx = plotPx.x + Math.cos(a) * armDist;
      const my = plotPx.y + Math.sin(a) * armDist;
      ctx.beginPath();
      ctx.moveTo(plotPx.x, plotPx.y);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (airframe === 'fpv_kamikaze' || airframe === 'fpv_fiber') {
    // Hostile Strike Drone: High-aspect tactical attack wedge / chevron facing heading
    const rotRad = track.courseDeg !== undefined ? (track.courseDeg * Math.PI) / 180 : 0;
    ctx.save();
    ctx.translate(plotPx.x, plotPx.y);
    ctx.rotate(rotRad);

    const h = rcsBase * 1.5;
    const w = rcsBase * 1.25;
    ctx.beginPath();
    ctx.moveTo(0, -h); // Front attack nose
    ctx.lineTo(w, h * 0.7); // Right wingtip
    ctx.lineTo(0, h * 0.2); // Inner notch
    ctx.lineTo(-w, h * 0.7); // Left wingtip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (airframe === 'fpv_fiber') {
      // Trailing fiber optic tether indicator
      ctx.beginPath();
      ctx.moveTo(0, h * 0.4);
      ctx.lineTo(0, h * 1.5);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, h * 1.7, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
    }
    ctx.restore();
  } else if (airframe === 'fixed_wing_recon' || airframe === 'decoy_drone') {
    // Fixed-Wing Recon / Decoy: Tactical swept-wing aircraft silhouette facing heading
    const rotRad = track.courseDeg !== undefined ? (track.courseDeg * Math.PI) / 180 : 0;
    ctx.save();
    ctx.translate(plotPx.x, plotPx.y);
    ctx.rotate(rotRad);

    const fLen = rcsBase * 1.4;
    const span = rcsBase * 1.6;
    // Fuselage
    ctx.beginPath();
    ctx.moveTo(0, -fLen);
    ctx.lineTo(0, fLen * 0.85);
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Swept Wings
    ctx.beginPath();
    ctx.moveTo(-span, fLen * 0.15);
    ctx.lineTo(0, -fLen * 0.25);
    ctx.lineTo(span, fLen * 0.15);
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Tailplane
    ctx.beginPath();
    ctx.moveTo(-span * 0.45, fLen * 0.75);
    ctx.lineTo(span * 0.45, fLen * 0.75);
    ctx.stroke();

    if (airframe === 'decoy_drone') {
      // Dotted radar reflector halo around decoy
      ctx.beginPath();
      ctx.arc(0, 0, rcsBase * 1.25, 0, Math.PI * 2);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#eab308';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  } else if (airframe === 'bird') {
    // Avian Biological: Smooth double-arc flapping wings
    const rotRad = track.courseDeg !== undefined ? (track.courseDeg * Math.PI) / 180 : 0;
    ctx.save();
    ctx.translate(plotPx.x, plotPx.y);
    ctx.rotate(rotRad);
    const bSpan = rcsBase * 1.35;
    ctx.beginPath();
    ctx.moveTo(-bSpan, 0);
    ctx.quadraticCurveTo(-bSpan * 0.5, -rcsBase * 0.9, 0, 0);
    ctx.quadraticCurveTo(bSpan * 0.5, -rcsBase * 0.9, bSpan, 0);
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (airframe === 'clutter') {
    // Radar Clutter: Diffuse 4-cross tick
    const cSize = 4;
    ctx.beginPath();
    ctx.moveTo(plotPx.x - cSize, plotPx.y - cSize);
    ctx.lineTo(plotPx.x + cSize, plotPx.y + cSize);
    ctx.moveTo(plotPx.x + cSize, plotPx.y - cSize);
    ctx.lineTo(plotPx.x - cSize, plotPx.y + cSize);
    ctx.stroke();
  } else {
    // Unclassified Confirmed Contact: Standard tactical NATO diamond
    const dSize = rcsBase;
    ctx.beginPath();
    ctx.moveTo(plotPx.x, plotPx.y - dSize);
    ctx.lineTo(plotPx.x + dSize, plotPx.y);
    ctx.lineTo(plotPx.x, plotPx.y + dSize);
    ctx.lineTo(plotPx.x - dSize, plotPx.y);
    ctx.closePath();
    ctx.stroke();
    // Inner center dot
    ctx.beginPath();
    ctx.arc(plotPx.x, plotPx.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Selection Targeting Reticle: High-Precision Tactical Corners
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = isTerminalLocked ? '#ef4444' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 6;

    const bSize = 10;
    const bArm = 4;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(plotPx.x - bSize, plotPx.y - bSize + bArm);
    ctx.lineTo(plotPx.x - bSize, plotPx.y - bSize);
    ctx.lineTo(plotPx.x - bSize + bArm, plotPx.y - bSize);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(plotPx.x + bSize - bArm, plotPx.y - bSize);
    ctx.lineTo(plotPx.x + bSize, plotPx.y - bSize);
    ctx.lineTo(plotPx.x + bSize, plotPx.y - bSize + bArm);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(plotPx.x - bSize, plotPx.y + bSize - bArm);
    ctx.lineTo(plotPx.x - bSize, plotPx.y + bSize);
    ctx.lineTo(plotPx.x - bSize + bArm, plotPx.y + bSize);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(plotPx.x + bSize - bArm, plotPx.y + bSize);
    ctx.lineTo(plotPx.x + bSize, plotPx.y + bSize);
    ctx.lineTo(plotPx.x + bSize, plotPx.y + bSize - bArm);
    ctx.stroke();

    ctx.restore();
  }

  // 4b. Terminal optical lock warning on PPI
  if (isTerminalLocked) {
    ctx.save();
    ctx.font = 'bold 8.5px ui-monospace, monospace';
    const warnText = 'AUTONOMOUS LOCK: RF IMMUNE - USE KINETIC';
    const textWidth = ctx.measureText(warnText).width;
    const badgeW = textWidth + 12;
    const badgeH = 16;
    const badgeX = plotPx.x - badgeW / 2;
    const badgeY = plotPx.y - 25;

    ctx.fillStyle = 'rgba(185, 28, 28, 0.94)';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(warnText, plotPx.x, badgeY + badgeH / 2);
    ctx.restore();
  }

  // 5. Track label: only shown for SELECTED, HOVERED, or UNACKNOWLEDGED confirmed tracks (declutter)
  const isHovered = options.hoveredTrackId === track.trackId;
  const isUnackedConfirmed = track.state === 'confirmed' && !track.acked;
  const showLabel = isSelected || isHovered || isUnackedConfirmed;

  if (showLabel) {
    const assessedAbbr = getAssessedAbbr(track.assessedClass);
    const inferredAbbr = assessedAbbr || (airframe !== 'unknown' ? getAssessedAbbr(airframe) : '');
    const label = inferredAbbr ? `T${track.trackId} [${inferredAbbr}]` : `T${track.trackId}`;

    ctx.save();
    ctx.font = 'bold 9.5px ui-monospace, monospace';
    const textMetrics = ctx.measureText(label);
    const tagW = Math.max(textMetrics.width + 8, 48);
    const tagH = isUnackedConfirmed || track.engagementStatus !== 'none' ? 24 : 15;
    const tagX = plotPx.x + 10;
    const tagY = plotPx.y - tagH / 2;

    // Tactical tag glass pill
    ctx.fillStyle = 'rgba(7, 11, 17, 0.88)';
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.strokeStyle = isUnackedConfirmed
      ? 'rgba(244, 63, 94, 0.5)'
      : isSelected
      ? 'rgba(56, 189, 248, 0.5)'
      : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tagX, tagY, tagW, tagH);

    // Track ID label
    ctx.fillStyle = isUnackedConfirmed ? '#fb7185' : '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, tagX + 4, tagY + 3);

    // Status subtitle line
    if (!track.acked) {
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('● UNACK', tagX + 4, tagY + 14);
    } else if (track.engagementStatus === 'holding_fire') {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('HOLD', tagX + 4, tagY + 14);
    } else if (track.engagementStatus === 'engaged') {
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText('ENGAGED', tagX + 4, tagY + 14);
    }
    ctx.restore();
  }

  ctx.restore();
}
