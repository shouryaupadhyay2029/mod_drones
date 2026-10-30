/**
 * Tactical Radar Scope Terrain Background Textures
 * Loads satellite / FLIR reconnaissance imagery for each operational environment.
 */

export const RADAR_TEXTURE_URLS: Record<string, string> = {
  dawn_intrusion: '/textures/radar/dawn_intrusion.png',
  ridge_runner: '/textures/radar/ridge_runner.png',
  city_edge_night: '/textures/radar/city_edge_night.png',
  dense_air_picture: '/textures/radar/dense_air_picture.png',
};

const DEFAULT_TEXTURE = '/textures/radar/dawn_intrusion.png';

const imageCache: Map<string, HTMLImageElement> = new Map();

export function resolveScenarioTextureKey(scenarioId?: string, terrainKind?: string): string {
  if (scenarioId && RADAR_TEXTURE_URLS[scenarioId]) {
    return scenarioId;
  }
  if (terrainKind === 'hilly') return 'ridge_runner';
  if (terrainKind === 'urban') return 'city_edge_night';
  if (scenarioId?.includes('swarm') || scenarioId?.includes('air_picture')) {
    return 'dense_air_picture';
  }
  return 'dawn_intrusion';
}

export function getTerrainTexture(scenarioId?: string, terrainKind?: string): HTMLImageElement | null {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  const key = resolveScenarioTextureKey(scenarioId, terrainKind);
  let img = imageCache.get(key);
  if (!img) {
    img = new Image();
    const textureUrl = RADAR_TEXTURE_URLS[key] || DEFAULT_TEXTURE;
    img.src = textureUrl;
    imageCache.set(key, img);
  }

  return img.complete && img.naturalWidth > 0 ? img : null;
}
