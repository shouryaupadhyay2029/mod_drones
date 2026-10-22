export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Weather = 'clear' | 'fog' | 'rain';
export type EwLevel = 'none' | 'light' | 'heavy';
export type TerrainKind = 'rural' | 'hilly' | 'urban';

export interface Environment {
  timeOfDay: TimeOfDay;
  weather: Weather;
  visibilityKm: number; // clear=10, fog=2, rain=5
  ewLevel: EwLevel;
  terrainKind: TerrainKind;
}

export const DEFAULT_VISIBILITY_KM: Record<Weather, number> = {
  clear: 10,
  fog: 2,
  rain: 5,
};

export function createEnvironment(params?: Partial<Environment>): Environment {
  const weather = params?.weather ?? 'clear';
  return {
    timeOfDay: params?.timeOfDay ?? 'dusk',
    weather,
    visibilityKm: params?.visibilityKm ?? DEFAULT_VISIBILITY_KM[weather],
    ewLevel: params?.ewLevel ?? 'none',
    terrainKind: params?.terrainKind ?? 'rural',
  };
}
