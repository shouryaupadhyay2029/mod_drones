export type EffectorType = 'jammer' | 'gun';

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
}

export function createInitialEffectorState(): EffectorState {
  return {
    jammer: {
      busyUntilTick: 0,
    },
    gun: {
      ammo: 20,
      busyUntilTick: 0,
    },
  };
}
