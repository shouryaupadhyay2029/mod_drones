import { describe, expect, it } from 'vitest';
import { dAtan2, dCos, dSin, DEG_TO_RAD, RAD_TO_DEG } from '../src/sim/core/dmath.js';

describe('Deterministic Math (dmath.ts)', () => {
  it('dSin accuracy <= 1e-5 across 10,000 sampled points in [-4pi, 4pi]', () => {
    const N = 10000;
    const minVal = -4 * Math.PI;
    const maxVal = 4 * Math.PI;
    const step = (maxVal - minVal) / N;

    let maxError = 0;
    for (let i = 0; i <= N; i++) {
      const x = minVal + i * step;
      const expected = Math.sin(x);
      const actual = dSin(x);
      const err = Math.abs(actual - expected);
      if (err > maxError) maxError = err;
      expect(err).toBeLessThanOrEqual(1e-5);
    }
  });

  it('dCos accuracy <= 1e-5 across 10,000 sampled points in [-4pi, 4pi]', () => {
    const N = 10000;
    const minVal = -4 * Math.PI;
    const maxVal = 4 * Math.PI;
    const step = (maxVal - minVal) / N;

    let maxError = 0;
    for (let i = 0; i <= N; i++) {
      const x = minVal + i * step;
      const expected = Math.cos(x);
      const actual = dCos(x);
      const err = Math.abs(actual - expected);
      if (err > maxError) maxError = err;
      expect(err).toBeLessThanOrEqual(1e-5);
    }
  });

  it('dAtan2 accuracy <= 1e-4 rad across 10,000 sampled (y, x) points', () => {
    const N = 100; // 100 x 100 = 10,000 points
    const range = 5000; // test over [-5000, 5000] meters

    let maxError = 0;
    for (let i = -N / 2; i <= N / 2; i++) {
      for (let j = -N / 2; j <= N / 2; j++) {
        const y = (i / (N / 2)) * range;
        const x = (j / (N / 2)) * range;
        if (x === 0 && y === 0) continue;

        const expected = Math.atan2(y, x);
        const actual = dAtan2(y, x);
        let err = Math.abs(actual - expected);
        if (err > Math.PI) err = 2 * Math.PI - err;

        if (err > maxError) maxError = err;
        expect(err).toBeLessThanOrEqual(1e-4);
      }
    }
  });

  it('degree and radian conversion constants', () => {
    expect(DEG_TO_RAD).toBeCloseTo(Math.PI / 180, 10);
    expect(RAD_TO_DEG).toBeCloseTo(180 / Math.PI, 10);
  });
});
