// Generic illustrative parameters for training; not real specifications.

export type ThreatClassId =
  | 'fpv_kamikaze'
  | 'commercial_quad'
  | 'fixed_wing_recon'
  | 'bird'
  | 'clutter';

export interface ThreatClass {
  id: ThreatClassId;
  label: string;
  speedRangeMps: [number, number];
  altitudeBandM: [number, number];
  rcsM2: number;
  rfControlled: boolean;
  hostile: boolean;
}

export const THREAT_LIBRARY: Record<ThreatClassId, ThreatClass> = {
  fpv_kamikaze: {
    id: 'fpv_kamikaze',
    label: 'FPV Strike Drone',
    speedRangeMps: [25, 35],
    altitudeBandM: [20, 80],
    rcsM2: 0.02,
    rfControlled: true,
    hostile: true,
  },
  commercial_quad: {
    id: 'commercial_quad',
    label: 'Civilian Quadcopter',
    speedRangeMps: [8, 16],
    altitudeBandM: [40, 120],
    rcsM2: 0.01,
    rfControlled: true,
    hostile: false,
  },
  fixed_wing_recon: {
    id: 'fixed_wing_recon',
    label: 'Fixed-Wing Reconnaissance UAV',
    speedRangeMps: [22, 32],
    altitudeBandM: [150, 400],
    rcsM2: 0.05,
    rfControlled: true,
    hostile: true,
  },
  bird: {
    id: 'bird',
    label: 'Avian (Bird)',
    speedRangeMps: [4, 14],
    altitudeBandM: [10, 150],
    rcsM2: 0.001,
    rfControlled: false,
    hostile: false,
  },
  clutter: {
    id: 'clutter',
    label: 'False / Clutter',
    speedRangeMps: [0, 6],
    altitudeBandM: [0, 50],
    rcsM2: 0.005,
    rfControlled: false,
    hostile: false,
  },
};
