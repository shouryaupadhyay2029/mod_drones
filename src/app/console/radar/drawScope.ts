import { TraineeTrack, TraineeView } from '../../../sim/index.js';
import { polarToPixel, RangeRing, ringRadii } from './geometry.js';

export interface ScopeDrawOptions {
  scaleM: number;
  showEffectorRings: boolean;
  selectedTrackId: number | null;
  trailHistory: Map<number, Array<{ x: number; y: number; z: number }>>;
}

export function getAssessedColor(assessedClass?: string): string {
  if (!assessedClass || assessedClass === 'unknown') {
    return '#f59e0b'; // amber
  }
  if (assessedClass === 'bird' || assessedClass === 'commercial_quad') {
    return '#22c55e'; // green
  }
  if (assessedClass === 'fpv_kamikaze' || assessedClass === 'fixed_wing_recon') {
    return '#ef4444'; // red
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
    case 'fixed_wing_recon':
      return 'UAV';
    default:
      return '';
  }
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
  const radiusPx = Math.min(centerX, centerY) - 28;
  if (radiusPx <= 20) {
    ctx.restore();
    return;
  }

  const center = { x: centerX, y: centerY };

  // Scope background
  ctx.beginPath();
  ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
  ctx.fillStyle = '#050a12';
  ctx.fill();
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Range rings every 1 km
  const rings: RangeRing[] = ringRadii(options.scaleM, radiusPx);
  ctx.lineWidth = 1;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    if (!ring) continue;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = '#16283f';
    ctx.stroke();

    // Ring distance label
    ctx.fillStyle = '#475569';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(ring.label, centerX + 4, centerY - ring.radiusPx + 12);
  }

  // Bearing lines & ticks (every 10 deg, labels every 30 deg + cardinal)
  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const tickLen = isMajor ? 10 : 5;
    const innerR = radiusPx - tickLen;

    const x1 = centerX + innerR * Math.sin(rad);
    const y1 = centerY - innerR * Math.cos(rad);
    const x2 = centerX + radiusPx * Math.sin(rad);
    const y2 = centerY - radiusPx * Math.cos(rad);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = isMajor ? '#334155' : '#1e293b';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.stroke();

    if (isMajor) {
      const labelR = radiusPx + 14;
      const lx = centerX + labelR * Math.sin(rad);
      const ly = centerY - labelR * Math.cos(rad);

      let text = `${deg}°`;
      if (deg === 0) text = 'N';
      else if (deg === 90) text = 'E';
      else if (deg === 180) text = 'S';
      else if (deg === 270) text = 'W';

      ctx.fillStyle = deg === 0 ? '#38bdf8' : '#94a3b8';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx, ly);
    }
  }

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(centerX - radiusPx, centerY);
  ctx.lineTo(centerX + radiusPx, centerY);
  ctx.moveTo(centerX, centerY - radiusPx);
  ctx.lineTo(centerX, centerY + radiusPx);
  ctx.strokeStyle = '#0f2035';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Effector ranges (dashed rings): Jammer = 1500m, Gun = 1000m
  if (options.showEffectorRings) {
    ctx.save();
    ctx.setLineDash([4, 4]);

    // Gun 1000m
    const gunRPx = (1000 / options.scaleM) * radiusPx;
    if (gunRPx <= radiusPx) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, gunRPx, 0, Math.PI * 2);
      ctx.strokeStyle = '#ea580c'; // orange
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#ea580c';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('GUN 1km', centerX + gunRPx - 45, centerY - 4);
    }

    // Jammer 1500m
    const jamRPx = (1500 / options.scaleM) * radiusPx;
    if (jamRPx <= radiusPx) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, jamRPx, 0, Math.PI * 2);
      ctx.strokeStyle = '#8b5cf6'; // purple
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#8b5cf6';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('JAM 1.5km', centerX + jamRPx - 50, centerY - 4);
    }
    ctx.restore();
  }

  // Sweep arm and fading wedge behind it
  if (view && view.radarSweepDeg !== undefined) {
    const sweepRad = (view.radarSweepDeg * Math.PI) / 180;
    const wedgeAngleRad = (40 * Math.PI) / 180; // 40 degree trail wedge

    // Fading wedge behind sweep arm
    const wedgeGrad = ctx.createConicGradient(sweepRad - Math.PI / 2, centerX, centerY);
    wedgeGrad.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
    wedgeGrad.addColorStop(0.12, 'rgba(56, 189, 248, 0.0)');
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

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radiusPx * Math.sin(sweepRad),
      centerY - radiusPx * Math.cos(sweepRad)
    );
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  // Asset symbol at centre: square symbol labelled ASSET
  const assetSize = 10;
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(
    centerX - assetSize / 2,
    centerY - assetSize / 2,
    assetSize,
    assetSize
  );
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ASSET', centerX, centerY + 16);

  // Draw Tracks
  if (view && view.tracks) {
    for (let i = 0; i < view.tracks.length; i++) {
      const track = view.tracks[i];
      if (!track || track.state === 'dropped') continue;

      drawTrack(ctx, track, center, options, radiusPx);
    }
  }

  ctx.restore();
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: TraineeTrack,
  center: { x: number; y: number },
  options: ScopeDrawOptions,
  radiusPx: number
): void {
  const plotPx = polarToPixel(
    track.rangeM,
    track.bearingDeg,
    center,
    options.scaleM,
    radiusPx
  );

  const color = getAssessedColor(track.assessedClass);
  const isSelected = options.selectedTrackId === track.trackId;

  // 1. Trail: last 6 plots fading
  const history = options.trailHistory.get(track.trackId);
  if (history && history.length > 1) {
    for (let h = 0; h < history.length - 1; h++) {
      const pos = history[h];
      if (!pos) continue;
      const alpha = ((h + 1) / history.length) * 0.45;
      const hDist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      let hDeg = (Math.atan2(pos.x, pos.y) * 180) / Math.PI;
      if (hDeg < 0) hDeg += 360;

      const hPx = polarToPixel(hDist, hDeg, center, options.scaleM, radiusPx);
      ctx.beginPath();
      ctx.arc(hPx.x, hPx.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
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
    const vEnd = {
      x: plotPx.x + velRPx * Math.sin(courseRad),
      y: plotPx.y - velRPx * Math.cos(courseRad),
    };
    ctx.beginPath();
    ctx.moveTo(plotPx.x, plotPx.y);
    ctx.lineTo(vEnd.x, vEnd.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // 3. Track Symbol by Lifecycle
  // Tentative: hollow circle
  // Confirmed: filled diamond
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;

  if (track.state === 'tentative') {
    ctx.beginPath();
    ctx.arc(plotPx.x, plotPx.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Confirmed diamond
    const dSize = 6;
    ctx.beginPath();
    ctx.moveTo(plotPx.x, plotPx.y - dSize);
    ctx.lineTo(plotPx.x + dSize, plotPx.y);
    ctx.lineTo(plotPx.x, plotPx.y + dSize);
    ctx.lineTo(plotPx.x - dSize, plotPx.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 4. Selection outer ring
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(plotPx.x, plotPx.y, 11, 0, Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 5. Track label: "T<id>" + assessed abbreviation
  const abbr = getAssessedAbbr(track.assessedClass);
  const label = abbr ? `T${track.trackId} [${abbr}]` : `T${track.trackId}`;

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, plotPx.x + 9, plotPx.y - 7);

  // Status indicators: ACK status / Hold fire
  if (!track.acked) {
    ctx.fillStyle = '#f87171';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('UNACK', plotPx.x + 9, plotPx.y + 4);
  } else if (track.engagementStatus === 'holding_fire') {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('HOLD', plotPx.x + 9, plotPx.y + 4);
  } else if (track.engagementStatus === 'engaged') {
    ctx.fillStyle = '#f59e0b';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText('ENGAGED', plotPx.x + 9, plotPx.y + 4);
  }

  ctx.restore();
}
