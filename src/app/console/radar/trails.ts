export interface TrailPoint {
  x: number;
  y: number;
  z: number;
  lastPlotTick: number;
}

/**
 * Updates trail history:
 * - Stores a trail point ONLY when the track's plot changed (using lastPlotTick).
 * - Retains at most the last 6 radar plots.
 * - Drops trails for tracks no longer in the view.
 */
export function updateTrailHistory(
  trailMap: Map<number, TrailPoint[]>,
  currentTracks: readonly {
    trackId: number;
    estimatedPosition: { x: number; y: number; z: number };
    lastPlotTick: number;
  }[]
): void {
  const activeIds = new Set<number>();

  for (let i = 0; i < currentTracks.length; i++) {
    const t = currentTracks[i];
    if (!t) continue;
    activeIds.add(t.trackId);

    let list = trailMap.get(t.trackId);
    if (!list) {
      list = [];
      trailMap.set(t.trackId, list);
    }

    const lastEntry = list[list.length - 1];
    if (!lastEntry || lastEntry.lastPlotTick !== t.lastPlotTick) {
      list.push({
        x: t.estimatedPosition.x,
        y: t.estimatedPosition.y,
        z: t.estimatedPosition.z,
        lastPlotTick: t.lastPlotTick,
      });
      if (list.length > 6) {
        list.shift();
      }
    }
  }

  // Drop trails for tracks no longer in the view
  for (const trackId of Array.from(trailMap.keys())) {
    if (!activeIds.has(trackId)) {
      trailMap.delete(trackId);
    }
  }
}
