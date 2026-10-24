import { generateScenario } from '../src/sim/scenarios/generator.js';
import { THREAT_LIBRARY } from '../src/sim/model/threats.js';
import { ScenarioSpawnSchedule } from '../src/sim/scenarios/dawnIntrusion.js';

export function testFormulations(spawns: ScenarioSpawnSchedule[]) {
  const hostiles: Array<{
    classId: string;
    speed: number;
    d0: number;
    tSpawn: number;
    tJammer: number;
    tGun: number;
    tImpact: number;
    rfControlled: boolean;
  }> = [];
  for (const s of spawns) {
    const threat = THREAT_LIBRARY[s.classId];
    if (!threat || !threat.hostile) continue;
    const d0 = Math.sqrt(s.pos.x * s.pos.x + s.pos.y * s.pos.y + s.pos.z * s.pos.z);
    const speed = s.speed ?? threat.speedRangeMps[0];
    const tSpawn = s.tick / 20;
    const tJammer = tSpawn + Math.max(0, d0 - 1500) / speed;
    const tGun = tSpawn + Math.max(0, d0 - 1000) / speed;
    const tImpact = tSpawn + d0 / speed;
    hostiles.push({ classId: s.classId, speed, d0, tSpawn, tJammer, tGun, tImpact, rfControlled: threat.rfControlled });
  }

  if (hostiles.length === 0) return { f1: 0, f2: 0, f3: 0 };

  // Jammer queue
  const rfHostiles = hostiles.filter((h) => h.rfControlled).sort((a, b) => a.tJammer - b.tJammer);
  let jammerFree = 0;
  let jammerServiceTotal = 0;
  const jammed = new Set();
  for (const h of rfHostiles) {
    const start = Math.max(jammerFree, h.tJammer);
    const finish = start + 2.0;
    if (finish <= h.tImpact) {
      jammerFree = finish;
      jammed.add(h);
      jammerServiceTotal += 2.0;
    }
  }

  // Gun queue
  const gunHostiles = [...hostiles].sort((a, b) => a.tGun - b.tGun);
  let gunServiceTotal = 0;
  for (const h of gunHostiles) {
    const pSurvive = jammed.has(h) ? 0.15 : 1.0;
    const pk = Math.max(0.1, 0.7 * (1 - 500 / 1000)) * (h.speed > 25 ? 0.7 : 1.0);
    const bursts = (1 / pk) * pSurvive;
    gunServiceTotal += bursts * 0.5;
  }

  const totalRequiredService = jammerServiceTotal + gunServiceTotal;

  // Window A: from first enter to first impact
  const firstEnter = Math.min(...hostiles.map((h) => h.tJammer));
  const firstImpact = Math.min(...hostiles.map((h) => h.tImpact));
  const availWindowA = Math.max(1, firstImpact - firstEnter);

  // Window B: per-target available time average
  const avgAvail = hostiles.reduce((acc, h) => acc + (h.tImpact - h.tJammer), 0) / hostiles.length;

  return {
    f1: totalRequiredService / availWindowA,
    f2: totalRequiredService / avgAvail,
    f3: gunServiceTotal / Math.max(1, Math.min(...hostiles.map(h => h.tImpact)) - Math.min(...hostiles.map(h => h.tGun))),
  };
}

for (const s of [1, 2, 3, 10, 11, 25, 29]) {
  const sc = generateScenario(`cap-vet-${s}`, 'veteran');
  console.log(`cap-vet-${s}:`, testFormulations(sc.spawns));
}
