import { ThreatClassId } from '../model/threats.js';

export interface ClassificationOption {
  id: ThreatClassId | 'unknown';
  label: string;
}

export const CLASSIFICATION_OPTIONS: readonly ClassificationOption[] = [
  { id: 'bird', label: 'Bird / clutter' },
  { id: 'commercial_quad', label: 'Commercial quadcopter' },
  { id: 'fpv_kamikaze', label: 'FPV-type drone' },
  { id: 'fixed_wing_recon', label: 'Fixed-wing UAV' },
  { id: 'unknown', label: 'Unknown' },
] as const;
