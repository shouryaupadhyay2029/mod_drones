import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { ScenarioSpawnSchedule } from '../src/sim/scenarios/dawnIntrusion.js';
import { generateScenario } from '../src/sim/scenarios/generator.js';

interface HostileKinematics {
  classId: string;
  speed: number;
  d0: number;
  tSpawn: number;
  tJammer: number;
  tGun: number;
  tStandoff: number;
  tImpact: number;
  rfControlled: boolean;
}

export function capacityCheckRefined(schedule: ScenarioSpawnSchedule[]): number {
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
    const tStandoff = tSpawn + Math.max(0, d0 - 400) / speed;
    const tImpact = tSpawn + d0 / speed;

    hostiles.push({
      classId: s.classId,
      speed,
      d0,
      tSpawn,
      tJammer,
      tGun,
      tStandoff,
      tImpact,
      rfControlled: threat.rfControlled,
    });
  }

  if (hostiles.length === 0) return 0;

  // 1. Jammer queue: 2.0s dwell, p = 0.85, RF-controlled only
  const rfHostiles = hostiles
    .filter((h) => h.rfControlled)
    .sort((a, b) => a.tJammer - b.tJammer);

  let jammerFree = 0;
  const jammedHostiles = new Set<HostileKinematics>();
  for (const h of rfHostiles) {
    const start = Math.max(jammerFree, h.tJammer);
    const finish = start + 2.0;
    if (finish <= h.tGun + 2.0) { // Can be jammed before entering deep gun zone
      jammerFree = finish;
      jammedHostiles.add(h);
    }
  }

  // 2. Gun queue: 0.5s per burst, Pk at 500m, 20 bursts limit
  const gunHostiles = [...hostiles].sort((a, b) => a.tGun - b.tGun);
  let gunFree = 0;
  let maxRatio = 0;
  let totalBurstsUsed = 0;

  for (const h of gunHostiles) {
    const pSurvive = jammedHostiles.has(h) ? 0.15 : 1.0;
    const engRange = 500;
    const pk = Math.max(0.1, 0.7 * (1 - engRange / 1000)) * (h.speed > 25 ? 0.7 : 1.0);
    const expectedBursts = (1 / pk) * pSurvive;
    totalBurstsUsed += expectedBursts;

    const reqServiceTime = expectedBursts * 0.5;
    const start = Math.max(gunFree, h.tGun);
    const finish = start + reqServiceTime;
    gunFree = finish;

    // Time available before 400m standoff threshold
    const availTime = Math.max(0.1, h.tStandoff - h.tGun);
    const serviceSpan = finish - h.tGun;
    const ratio = serviceSpan / availTime;
    if (ratio > maxRatio) {
      maxRatio = ratio;
    }
  }

  const ammoRatio = totalBurstsUsed / 20;
  return Math.max(maxRatio, ammoRatio);
}

// Test what capacityCheckRefined outputs on failing seeds
console.log('Testing refined capacity on failing seeds:');
for (const s of [10, 11, 25, 29]) {
  const sc = generateScenario(`cap-vet-${s}`, 'veteran');
  console.log(`cap-vet-${s}: refinedRatio = ${capacityCheckRefined(sc.spawns).toFixed(3)}`);
}
