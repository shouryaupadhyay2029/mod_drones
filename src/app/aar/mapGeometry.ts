export interface MapPoint { x: number; y: number }
export interface MapBounds { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number }

export function worldToCanvas(point: MapPoint, bounds: MapBounds): MapPoint {
  return {
    x: ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * bounds.width,
    y: bounds.height - ((point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * bounds.height,
  };
}

export function canvasToWorld(point: MapPoint, bounds: MapBounds): MapPoint {
  return {
    x: bounds.minX + (point.x / bounds.width) * (bounds.maxX - bounds.minX),
    y: bounds.minY + ((bounds.height - point.y) / bounds.height) * (bounds.maxY - bounds.minY),
  };
}
