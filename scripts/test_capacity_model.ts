import { generateScenario } from '../src/sim/scenarios/generator.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { ScenarioSpawnSchedule } from '../src/sim/scenarios/dawnIntrusion.js';

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

export function capacityCheck(spawns: ScenarioSpawnSchedule[]): number {
  const hostiles: HostileKinematics[] = [];
  for (const s of spawns) {
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

  // 1. Greedy Jammer Queue
  // Jammer 2.0s dwell, p = 0.85, RF-controlled only
  const rfHostiles = hostiles
    .filter((h) => h.rfControlled)
    .sort((a, b) => a.tJammer - b.tJammer);

  let jammerFree = 0;
  const jammedHostiles = new Set<HostileKinematics>();

  for (const h of rfHostiles) {
    const start = Math.max(jammerFree, h.tJammer);
    const finish = start + 2.0;
    if (finish <= h.tImpact) {
      jammerFree = finish;
      jammedHostiles.add(h);
    }
  }

  // 2. Greedy Gun Queue
  // Gun 0.5s per burst, Pk at engagement range (500m), max 20 bursts
  const gunHostiles = [...hostiles].sort((a, b) => a.tGun - b.tGun);
  let gunFree = 0;
  let maxRatio = 0;
  let totalBurstsUsed = 0;

  for (const h of gunHostiles) {
    // If jammed: 85% neutralized, expected survive factor 0.15
    const pSurvive = jammedHostiles.has(h) ? 0.15 : 1.0;
    const engRange = 500;
    const pk = Math.max(0.1, 0.7 * (1 - engRange / 1000)) * (h.speed > 25 ? 0.7 : 1.0);
    const expectedBursts = (1 / pk) * pSurvive;
    totalBurstsUsed += expectedBursts;

    // 0.5s per burst
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

  // Also factor in 20-burst ammo limit:
  const ammoRatio = totalBurstsUsed / 20;
  return Math.max(maxRatio, ammoRatio);
}

async function run() {
  console.log('Testing 20 unconstrained veteran seeds...');
  for (let s = 1; s <= 20; s++) {
    const seed = `test-cap-${s}`;
    const sc = generateScenario(seed, 'veteran');
    const ratio = capacityCheck(sc.spawns);
    console.log(`Seed ${seed}: capacityRatio = ${ratio.toFixed(3)} (spawns=${sc.spawns.length})`);
  }
}

run();
