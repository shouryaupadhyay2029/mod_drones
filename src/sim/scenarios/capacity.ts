// Generic illustrative parameters for training; not real specifications.

import { THREAT_LIBRARY } from '../model/threats.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

interface HostileKinematics {
  classId: string;
  speed: number;
  d0: number;
  tSpawn: number;
  tJammer: number;
  tGun: number;
  tImpact: number;
  rfControlled: boolean;
}

/**
 * Computes capacityRatio for a scheduled scenario.
 *
 * Explainable greedy service queue model (documented in ARCHITECTURE.md):
 * 1. For each hostile compute the time it enters jammer range (1500 m) and gun range (1000 m) from speed and path.
 * 2. Run greedy jammer queue: 2.0 s dwell, p = 0.85, RF-controlled only.
 * 3. Run greedy gun queue: 0.5 s per burst, expected kill probability per burst computed
 *    from the Pk formula at engagement range (500 m), 20 bursts total.
 * 4. capacityRatio = required service time / available time before impact (also checking ammo capacity).
 */
export function capacityCheck(schedule: ScenarioSpawnSchedule[]): number {
  const hostiles: HostileKinematics[] = [];
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i]!;
    const threat = THREAT_LIBRARY[s.classId];
    if (!threat || !threat.hostile) continue;

    const d0 = Math.sqrt(s.pos.x * s.pos.x + s.pos.y * s.pos.y + s.pos.z * s.pos.z);
    const speed = s.speed ?? threat.speedRangeMps[0];
    const tSpawn = s.tick / 20;
    const tJammer = tSpawn + Math.max(0, d0 - 1500) / speed;
    const tGun = tSpawn + Math.max(0, d0 - 1000) / speed;
    const tImpact = tSpawn + d0 / speed;

    hostiles.push({
      classId: s.classId,
      speed,
      d0,
      tSpawn,
      tJammer,
      tGun,
      tImpact,
      rfControlled: threat.rfControlled,
    });
  }

  if (hostiles.length === 0) return 0;

  // 1. Greedy Jammer Service Queue (RF-controlled only, 2.0s dwell, p = 0.85)
  const rfHostiles = hostiles
    .filter((h) => h.rfControlled)
    .sort((a, b) => a.tJammer - b.tJammer);

  let jammerFree = 0;
  const jammedHostiles = new Set<HostileKinematics>();

  for (let i = 0; i < rfHostiles.length; i++) {
    const h = rfHostiles[i]!;
    const start = Math.max(jammerFree, h.tJammer);
    const finish = start + 2.0;
    if (finish <= h.tImpact) {
      jammerFree = finish;
      jammedHostiles.add(h);
    }
  }

  // 2. Greedy Gun Service Queue (0.5s per burst, Pk formula at 500m engagement range, 20 bursts limit)
  const gunHostiles = [...hostiles].sort((a, b) => a.tGun - b.tGun);
  let gunFree = 0;
  let maxRatio = 0;
  let totalBurstsUsed = 0;

  for (let i = 0; i < gunHostiles.length; i++) {
    const h = gunHostiles[i]!;
    const pSurvive = jammedHostiles.has(h) ? 0.15 : 1.0;
    const engRange = 500;
    const pk = Math.max(0.1, 0.7 * (1 - engRange / 1000)) * (h.speed > 25 ? 0.7 : 1.0);
    const expectedBursts = (1 / pk) * pSurvive;
    totalBurstsUsed += expectedBursts;

    const reqServiceTime = expectedBursts * 0.5;
    const start = Math.max(gunFree, h.tGun);
    const finish = start + reqServiceTime;
    gunFree = finish;

    const availTime = Math.max(0.1, h.tImpact - h.tGun);
    const serviceSpan = finish - h.tGun;
    const ratio = serviceSpan / availTime;
    if (ratio > maxRatio) {
      maxRatio = ratio;
    }
  }

  const ammoRatio = totalBurstsUsed / 20;
  return Math.max(maxRatio, ammoRatio);
}
