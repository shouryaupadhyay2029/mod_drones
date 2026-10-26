export type EffectorType = 'jammer' | 'gun' | 'missile';

export const EFFECTOR_RANGES = {
  jammer: 1500,
  gun: 1000,
  missile: 3000,
} as const;

export interface ActiveEngagement {
  effector: EffectorType;
  trackId: number;
  actorId: number;
  startTick: number;
  resolveTick: number;
  rangeAtFire: number;
  speedAtFire: number;
}

export interface JammerState {
  busyUntilTick: number;
  currentEngagement?: ActiveEngagement;
}

export interface GunState {
  ammo: number; // starts at 20
  busyUntilTick: number;
  currentEngagement?: ActiveEngagement;
}

export interface EffectorState {
  jammer: JammerState;
  gun: GunState;
  missile?: { ammo: number; busyUntilTick: number; currentEngagement?: ActiveEngagement };
}

export function createInitialEffectorState(inventory?: { gunAmmo?: number; missiles?: number }): EffectorState {
  return {
    jammer: {
      busyUntilTick: 0,
    },
    gun: {
      ammo: inventory?.gunAmmo ?? 20,
      busyUntilTick: 0,
    },
    missile: { ammo: inventory?.missiles ?? 0, busyUntilTick: 0 },
  };
}
