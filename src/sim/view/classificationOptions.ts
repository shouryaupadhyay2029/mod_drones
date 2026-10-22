import { ThreatClassId } from '../model/threats.js';

export interface ClassificationOption {
  id: ThreatClassId | 'unknown';
  label: string;
  hotkey?: string;
}

export const CLASSIFICATION_OPTIONS: readonly ClassificationOption[] = [
  { id: 'bird', label: 'Bird', hotkey: '1' },
  { id: 'commercial_quad', label: 'Civilian Quad', hotkey: '2' },
  { id: 'fpv_kamikaze', label: 'FPV Strike Drone', hotkey: '3' },
  { id: 'fixed_wing_recon', label: 'Fixed-Wing Recon', hotkey: '4' },
  { id: 'clutter', label: 'False / Clutter', hotkey: '5' },
  { id: 'unknown', label: 'Unknown', hotkey: '0' },
] as const;
