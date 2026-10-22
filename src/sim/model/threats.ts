// Generic illustrative parameters for training; not real specifications.

export type ThreatClassId =
  | 'fpv_kamikaze'
  | 'commercial_quad'
  | 'fixed_wing_recon'
  | 'bird'
  | 'clutter'
  | 'fpv_fiber'
  | 'decoy_drone';

export type RfSignature =
  | 'none'
  | 'telemetry_link'
  | 'wideband_video'
  | 'long_range_link'
  | 'unknown_link';

export interface ThreatClass {
  id: ThreatClassId;
  label: string;
  speedRangeMps: [number, number];
  altitudeBandM: [number, number];
  rcsM2: number;
  sizeM: number;
  thermalSignature: number;
  rfSignature: RfSignature;
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
    sizeM: 0.35,
    thermalSignature: 0.8,
    rfSignature: 'wideband_video',
    rfControlled: true,
    hostile: true,
  },
  commercial_quad: {
    id: 'commercial_quad',
    label: 'Civilian Quadcopter',
    speedRangeMps: [8, 16],
    altitudeBandM: [40, 120],
    rcsM2: 0.01,
    sizeM: 0.5,
    thermalSignature: 0.6,
    rfSignature: 'telemetry_link',
    rfControlled: true,
    hostile: false,
  },
  fixed_wing_recon: {
    id: 'fixed_wing_recon',
    label: 'Fixed-Wing Reconnaissance UAV',
    speedRangeMps: [22, 32],
    altitudeBandM: [150, 400],
    rcsM2: 0.05,
    sizeM: 2.0,
    thermalSignature: 0.7,
    rfSignature: 'long_range_link',
    rfControlled: true,
    hostile: true,
  },
  bird: {
    id: 'bird',
    label: 'Avian (Bird)',
    speedRangeMps: [4, 14],
    altitudeBandM: [10, 150],
    rcsM2: 0.001,
    sizeM: 0.3,
    thermalSignature: 0.2,
    rfSignature: 'none',
    rfControlled: false,
    hostile: false,
  },
  clutter: {
    id: 'clutter',
    label: 'False / Clutter',
    speedRangeMps: [0, 6],
    altitudeBandM: [0, 50],
    rcsM2: 0.005,
    sizeM: 0.1,
    thermalSignature: 0.1,
    rfSignature: 'none',
    rfControlled: false,
    hostile: false,
  },
  fpv_fiber: {
    id: 'fpv_fiber',
    label: 'Fiber-Optic FPV Strike Drone',
    speedRangeMps: [20, 30],
    altitudeBandM: [20, 80],
    rcsM2: 0.02,
    sizeM: 0.35,
    thermalSignature: 0.8,
    rfSignature: 'none',
    rfControlled: false,
    hostile: true,
  },
  decoy_drone: {
    id: 'decoy_drone',
    label: 'Decoy Drone',
    speedRangeMps: [20, 30],
    altitudeBandM: [20, 80],
    rcsM2: 0.05,
    sizeM: 1.2,
    thermalSignature: 0.3,
    rfSignature: 'none',
    rfControlled: false,
    hostile: false,
  },
};
