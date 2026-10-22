import { describe, expect, it } from 'vitest';
import {
  nearestPlot,
  pixelToPolar,
  PlotCandidate,
  polarToPixel,
  ringRadii,
} from '../src/app/console/radar/geometry.js';

describe('Radar Geometry & Projection (geometry.ts)', () => {
  const center = { x: 300, y: 300 };
  const scaleM = 6000;
  const radiusPx = 250;

  it('1. polar <-> pixel round trip holds with high precision across cardinal and diagonal bearings', () => {
    const testCases = [
      { rangeM: 1000, bearingDeg: 0 }, // North
      { rangeM: 2500, bearingDeg: 90 }, // East
      { rangeM: 4000, bearingDeg: 180 }, // South
      { rangeM: 5500, bearingDeg: 270 }, // West
      { rangeM: 3200, bearingDeg: 45 }, // NE
      { rangeM: 1800, bearingDeg: 135 }, // SE
      { rangeM: 4500, bearingDeg: 225 }, // SW
      { rangeM: 2900, bearingDeg: 315 }, // NW
    ];

    for (const tc of testCases) {
      const px = polarToPixel(tc.rangeM, tc.bearingDeg, center, scaleM, radiusPx);
      const polar = pixelToPolar(px, center, scaleM, radiusPx);

      expect(Math.abs(polar.rangeM - tc.rangeM)).toBeLessThan(1e-4);
      expect(Math.abs(polar.bearingDeg - tc.bearingDeg)).toBeLessThan(1e-4);
    }
  });

  it('2. ringRadii generates 1 km step rings matching the requested scales', () => {
    const scales = [2000, 4000, 6000, 8000];

    for (const scale of scales) {
      const rings = ringRadii(scale, radiusPx);
      const expectedCount = scale / 1000;
      expect(rings.length).toBe(expectedCount);

      // Verify each ring
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        if (!r) continue;
        const expectedKm = i + 1;
        expect(r.rangeM).toBe(expectedKm * 1000);
        expect(r.label).toBe(`${expectedKm} km`);
        expect(r.radiusPx).toBeCloseTo((expectedKm * 1000 / scale) * radiusPx, 4);
      }
    }
  });

  it('3. nearestPlot picks the closest candidate within 14 px and rejects points beyond 14 px', () => {
    const candidates: PlotCandidate[] = [
      { trackId: 101, posPx: { x: 100, y: 100 } },
      { trackId: 102, posPx: { x: 120, y: 100 } },
      { trackId: 103, posPx: { x: 200, y: 200 } },
    ];

    // Pointer at (105, 100): distance to 101 is 5 px (<= 14 px) -> selects 101
    const hit1 = nearestPlot({ x: 105, y: 100 }, candidates, 14);
    expect(hit1).toBe(101);

    // Pointer at (114, 100): distance to 102 is 6 px, to 101 is 14 px -> selects 102
    const hit2 = nearestPlot({ x: 114, y: 100 }, candidates, 14);
    expect(hit2).toBe(102);

    // Pointer at (100, 114): distance is exactly 14 px -> selects 101
    const hitBorder = nearestPlot({ x: 100, y: 114 }, candidates, 14);
    expect(hitBorder).toBe(101);

    // Pointer at (100, 115): distance is 15 px (> 14 px) -> returns null
    const hitMiss = nearestPlot({ x: 100, y: 115 }, candidates, 14);
    expect(hitMiss).toBeNull();

    // Pointer far away at (500, 500) -> returns null
    const hitFar = nearestPlot({ x: 500, y: 500 }, candidates, 14);
    expect(hitFar).toBeNull();
  });
});
