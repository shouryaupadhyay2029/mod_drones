export interface Point2D {
  x: number;
  y: number;
}

export interface RangeRing {
  rangeM: number;
  radiusPx: number;
  label: string;
}

export interface PlotCandidate {
  trackId: number;
  posPx: Point2D;
}

export function polarToPixel(
  rangeM: number,
  bearingDeg: number,
  center: Point2D,
  scaleM: number,
  radiusPx: number
): Point2D {
  if (scaleM <= 0) return { x: center.x, y: center.y };
  const rPx = (rangeM / scaleM) * radiusPx;
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: center.x + rPx * Math.sin(rad),
    y: center.y - rPx * Math.cos(rad),
  };
}

export function pixelToPolar(
  pos: Point2D,
  center: Point2D,
  scaleM: number,
  radiusPx: number
): { rangeM: number; bearingDeg: number } {
  if (radiusPx <= 0) return { rangeM: 0, bearingDeg: 0 };
  const dx = pos.x - center.x;
  const dy = center.y - pos.y; // North is up
  const rPx = Math.sqrt(dx * dx + dy * dy);
  const rangeM = (rPx / radiusPx) * scaleM;

  const rad = Math.atan2(dx, dy);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return { rangeM, bearingDeg: deg };
}

export function ringRadii(scaleM: number, radiusPx: number): RangeRing[] {
  const rings: RangeRing[] = [];
  const maxKm = Math.floor(scaleM / 1000);
  for (let km = 1; km <= maxKm; km++) {
    const rangeM = km * 1000;
    const rPx = (rangeM / scaleM) * radiusPx;
    rings.push({
      rangeM,
      radiusPx: rPx,
      label: `${km} km`,
    });
  }
  return rings;
}

export function nearestPlot(
  pointerPx: Point2D,
  plots: PlotCandidate[],
  maxDistPx = 14
): number | null {
  let closestId: number | null = null;
  let minDistSq = maxDistPx * maxDistPx;

  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p) continue;
    const dx = p.posPx.x - pointerPx.x;
    const dy = p.posPx.y - pointerPx.y;
    const dSq = dx * dx + dy * dy;
    if (dSq <= minDistSq) {
      minDistSq = dSq;
      closestId = p.trackId;
    }
  }

  return closestId;
}
