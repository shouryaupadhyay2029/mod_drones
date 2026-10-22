import { describe, expect, it } from 'vitest';
import { TrailPoint, updateTrailHistory } from '../src/app/console/radar/trails.js';

describe('Radar Scope Trail History Management', () => {
  it('10 identical updates (same lastPlotTick) result in exactly 1 point stored', () => {
    const trailMap = new Map<number, TrailPoint[]>();

    const trackUpdate = {
      trackId: 1,
      estimatedPosition: { x: 100, y: 200, z: 50 },
      lastPlotTick: 40,
    };

    // 10 identical updates
    for (let i = 0; i < 10; i++) {
      updateTrailHistory(trailMap, [trackUpdate]);
    }

    const trail = trailMap.get(1);
    expect(trail).toBeDefined();
    expect(trail?.length).toBe(1);
    expect(trail?.[0]).toEqual({
      x: 100,
      y: 200,
      z: 50,
      lastPlotTick: 40,
    });
  });

  it('new plots (different lastPlotTick) add points up to a maximum of 6', () => {
    const trailMap = new Map<number, TrailPoint[]>();

    // 10 distinct plots with changing lastPlotTick
    for (let i = 1; i <= 10; i++) {
      updateTrailHistory(trailMap, [
        {
          trackId: 1,
          estimatedPosition: { x: i * 10, y: i * 20, z: 50 },
          lastPlotTick: i * 40,
        },
      ]);
    }

    const trail = trailMap.get(1);
    expect(trail).toBeDefined();
    expect(trail?.length).toBe(6);

    // Should retain the last 6 (plots 5 to 10)
    expect(trail?.[0]?.lastPlotTick).toBe(5 * 40);
    expect(trail?.[5]?.lastPlotTick).toBe(10 * 40);
    expect(trail?.[5]?.x).toBe(100);
  });

  it('drops trails for tracks that are no longer in the active view', () => {
    const trailMap = new Map<number, TrailPoint[]>();

    // Both track 1 and track 2 active
    updateTrailHistory(trailMap, [
      { trackId: 1, estimatedPosition: { x: 100, y: 100, z: 50 }, lastPlotTick: 40 },
      { trackId: 2, estimatedPosition: { x: 200, y: 200, z: 50 }, lastPlotTick: 40 },
    ]);
    expect(trailMap.has(1)).toBe(true);
    expect(trailMap.has(2)).toBe(true);

    // Next update: track 2 dropped / left view, only track 1 remains
    updateTrailHistory(trailMap, [
      { trackId: 1, estimatedPosition: { x: 105, y: 105, z: 50 }, lastPlotTick: 80 },
    ]);

    expect(trailMap.has(1)).toBe(true);
    expect(trailMap.has(2)).toBe(false);
  });
});
