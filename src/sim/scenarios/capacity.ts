// Generic illustrative parameters for training; not real specifications.

import { THREAT_LIBRARY } from '../model/threats.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';
import { TerrainMap, hasLineOfSight } from '../model/terrain.js';
import { Environment } from '../model/environment.js';
import { vec3, Vec3 } from '../core/vec.js';
import { RADAR_MAX_RANGE_M, RADAR_RCS_REF } from '../systems/radar.js';

export class CapacityCheckResult {
  constructor(
    public capacityRatio: number,
    public minWarningSec: number,
    public requiredGunBursts = 0,
    public requiredMissiles = 0,
  ) {}
  valueOf(): number {
    return this.capacityRatio;
  }
  toString(): string {
    return String(this.capacityRatio);
  }
}

interface HostileKinematics {
  classId: string;
  speed: number;
  d0: number;
  tSpawn: number;
  tJammer: number;
  tGun: number;
  tImpact: number;
  rfControlled: boolean;
  tDetect: number;
  warning: number;
  startJammer: number;
  startGun: number;
}

/**
 * Computes capacityRatio and minWarningSec for a scheduled scenario.
 *
 * Explainable greedy service queue model (documented in ARCHITECTURE.md):
 * 1. For each hostile compute the time it enters jammer range (1500 m) and gun range (1000 m) from speed and path.
 * 2. Compute first detectable time along straight path (LOS clear, range <= R_eff for its RCS, pd >= 0.5).
 *    Warning = tImpact - tDetect.
 *    The queue starts at max(range entry, tDetect + 1.5 s).
 * 3. Run greedy jammer queue: 2.0 s dwell, p = 0.85, RF-controlled only.
 * 4. Run greedy gun queue: 0.5 s per burst, expected kill probability per burst computed
 *    from the Pk formula at engagement range (500 m), 20 bursts total.
 * 5. capacityRatio = required service time / available time before impact (also checking ammo capacity).
 */
export function capacityCheck(
  schedule: ScenarioSpawnSchedule[],
  terrain?: TerrainMap,
  env?: Environment
): CapacityCheckResult {
  const hostiles: HostileKinematics[] = [];
  const mastPos = vec3(0, 0, 15);

  const weatherMult =
    env?.weather === 'clear' ? 1.0 :
    env?.weather === 'haze' ? 0.97 :
    env?.weather === 'fog' ? 0.95 :
    env?.weather === 'rain' ? 0.85 : 1.0;

  const ewPdMult =
    env?.ewLevel === 'heavy' ? 0.8 :
    env?.ewLevel === 'light' ? 0.92 : 1.0;

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

    // Detectability along straight path from s.pos to (0, 0, 0)
    const rEff = RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(threat.rcsM2 / RADAR_RCS_REF)) * weatherMult;
    let tDetect = tImpact;

    if (d0 > 0) {
      const ux = -s.pos.x / d0;
      const uy = -s.pos.y / d0;
      const uz = -s.pos.z / d0;

      // Sample along straight trajectory from tSpawn to tImpact in steps of 0.25 s
      const dtSample = 0.25;
      const totalSteps = Math.ceil((tImpact - tSpawn) / dtSample);

      for (let step = 0; step <= totalSteps; step++) {
        const tCur = Math.min(tImpact, tSpawn + step * dtSample);
        const dist = (tCur - tSpawn) * speed;
        const curPos: Vec3 = {
          x: s.pos.x + ux * dist,
          y: s.pos.y + uy * dist,
          z: s.pos.z + uz * dist,
        };

        const r = Math.sqrt(curPos.x * curPos.x + curPos.y * curPos.y + curPos.z * curPos.z);
        if (r > rEff) continue;

        const ratio = r / rEff;
        const ratio4 = ratio * ratio * ratio * ratio;
        const basePd = Math.min(0.95, Math.max(0, 1 - ratio4));

        let pdClutterMult = 1.0;
        let hasLos = true;
        if (terrain) {
          const terrainH = terrain.heightAt(curPos.x, curPos.y);
          const clutter = terrain.clutterAt(curPos.x, curPos.y);
          const agl = Math.max(0, curPos.z - terrainH);
          let lowFactor = 0;
          if (agl <= 50) {
            lowFactor = 1;
          } else if (agl < 150) {
            lowFactor = (150 - agl) / 100;
          }
          pdClutterMult = Math.max(0, 1 - clutter * lowFactor);
          hasLos = hasLineOfSight(mastPos, curPos, terrain, 50);
        }

        const pd = basePd * pdClutterMult * ewPdMult;
        if (hasLos && pd >= 0.5) {
          tDetect = tCur;
          break;
        }
      }
    }

    const warning = tImpact - tDetect;
    const startJammer = Math.max(tJammer, tDetect + 1.5);
    const startGun = Math.max(tGun, tDetect + 1.5);

    hostiles.push({
      classId: s.classId,
      speed,
      d0,
      tSpawn,
      tJammer,
      tGun,
      tImpact,
      rfControlled: threat.rfControlled,
      tDetect,
      warning,
      startJammer,
      startGun,
    });
  }

  if (hostiles.length === 0) {
    return new CapacityCheckResult(0, Infinity, 0, 0);
  }

  // 1. Greedy Jammer Service Queue (RF-controlled only, 2.0s dwell, p = 0.85)
  const rfHostiles = hostiles
    .filter((h) => h.rfControlled)
    .sort((a, b) => a.startJammer - b.startJammer);

  let jammerFree = 0;
  const jammedHostiles = new Set<HostileKinematics>();

  for (let i = 0; i < rfHostiles.length; i++) {
    const h = rfHostiles[i]!;
    const start = Math.max(jammerFree, h.startJammer);
    const finish = start + 2.0;
    if (finish <= h.tImpact) {
      jammerFree = finish;
      jammedHostiles.add(h);
    }
  }

  // 2. Greedy Gun Service Queue (0.5s per burst, Pk formula at 500m engagement range, 20 bursts limit)
  const gunHostiles = [...hostiles].sort((a, b) => a.startGun - b.startGun);
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
    const start = Math.max(gunFree, h.startGun);
    const finish = start + reqServiceTime;
    gunFree = finish;

    const availTime = Math.max(0.1, h.tImpact - h.startGun);
    const serviceSpan = finish - h.startGun;
    const ratio = serviceSpan / availTime;
    if (ratio > maxRatio) {
      maxRatio = ratio;
    }
  }

  const ammoRatio = totalBurstsUsed / 20;
  const capacityRatio = Math.max(maxRatio, ammoRatio);
  const minWarningSec = hostiles.reduce((min, h) => Math.min(min, h.warning), Infinity);
  // Planning need: ceil the capacity model's expected gun bursts. A target
  // that cannot receive a jammer service gets one abstract missile contingency.
  const requiredGunBursts = Math.ceil(totalBurstsUsed);
  const requiredMissiles = hostiles.filter((hostile) => !jammedHostiles.has(hostile)).length;

  return new CapacityCheckResult(capacityRatio, minWarningSec, requiredGunBursts, requiredMissiles);
}
