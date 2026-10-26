// Generic illustrative cost units for offline training. These are not real procurement or platform costs.
import { ThreatClassId } from '../model/threats.js';
import { EffectorType } from '../model/effectors.js';

export const ATTACKER_COST_UNITS: Partial<Record<ThreatClassId, number>> = {
  fpv_kamikaze: 1,
  fpv_fiber: 1.5,
  decoy_drone: 0.5,
  fixed_wing_recon: 6,
  commercial_quad: 0,
  bird: 0,
  clutter: 0,
};

export const DEFENDER_COST_UNITS: Record<EffectorType, number> = {
  gun: 0.08,
  jammer: 0.02,
  missile: 40,
};

export function attackerCostUnits(classId: ThreatClassId): number {
  return ATTACKER_COST_UNITS[classId] ?? 0;
}

export function defenderCostUnits(effector: EffectorType): number {
  return DEFENDER_COST_UNITS[effector];
}
