import { Rng } from '../core/rng.js';
import { createEnvironment, Environment } from '../model/environment.js';
import { buildCityEdgeNightSpawns, CITY_EDGE_NIGHT_ENV } from './cityEdgeNight.js';
import { buildDawnIntrusionSpawns, ScenarioSpawnSchedule } from './dawnIntrusion.js';
import { buildRidgeRunnerSpawns, RIDGE_RUNNER_ENV } from './ridgeRunner.js';

export * from './cityEdgeNight.js';
export * from './dawnIntrusion.js';
export * from './ridgeRunner.js';
export * from './sandbox.js';

export interface ScenarioDef {
  id: string;
  title: string;
  description: string;
  environment: Environment;
  durationLimitTicks: number; // 4800 default
  buildSpawns: (scenarioRng: Rng) => ScenarioSpawnSchedule[];
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  dawn_intrusion: {
    id: 'dawn_intrusion',
    title: 'Dawn Intrusion',
    description:
      'Single hostile FPV ingress with civilian quadcopter and avian clutter in rural conditions.',
    environment: createEnvironment({
      timeOfDay: 'dusk',
      weather: 'clear',
      visibilityKm: 10,
      ewLevel: 'none',
      terrainKind: 'rural',
    }),
    durationLimitTicks: 4800,
    buildSpawns: buildDawnIntrusionSpawns,
  },
  ridge_runner: {
    id: 'ridge_runner',
    title: 'Ridge Runner',
    description:
      'Dual hostile FPV ingress utilizing terrain ridge masking in hilly fog conditions with light EW.',
    environment: RIDGE_RUNNER_ENV,
    durationLimitTicks: 4800,
    buildSpawns: buildRidgeRunnerSpawns,
  },
  city_edge_night: {
    id: 'city_edge_night',
    title: 'City Edge Night',
    description:
      'High-altitude reconnaissance UAV and low-altitude fast strike drone in dense urban clutter with rain and heavy EW.',
    environment: CITY_EDGE_NIGHT_ENV,
    durationLimitTicks: 4800,
    buildSpawns: buildCityEdgeNightSpawns,
  },
};
