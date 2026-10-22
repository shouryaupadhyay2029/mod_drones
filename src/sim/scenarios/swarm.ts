// Generic illustrative parameters for training; not real specifications.

import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { vec3 } from '../core/vec.js';
import { TerrainMap } from '../model/terrain.js';
import { ThreatClassId } from '../model/threats.js';
import { ScenarioSpawnSchedule } from './dawnIntrusion.js';

export type SwarmTactic = 'saturation' | 'split' | 'decoy_screen';

export interface SwarmMemberConfig {
  classId: ThreatClassId;
  role: 'striker' | 'decoy';
  speed: number;
}

export interface SwarmParams {
  tactic: SwarmTactic;
  strikers: SwarmMemberConfig[];
  decoys: SwarmMemberConfig[];
  baseBearingDeg: number;
  startTick: number;
  terrain?: TerrainMap;
}

/**
 * Builds a deterministic swarm formation without boids.
 * Formation = leader path plus per-member lateral offsets with seeded jitter.
 * Positions computed only with +, -, *, /, Math.sqrt, and deterministic dSin/dCos.
 * Spawn range 4.0 - 5.5 km, altitude 40 - 120 m and at least 20 m AGL.
 */
export function buildSwarmSpawns(params: SwarmParams, rng: Rng): ScenarioSpawnSchedule[] {
  const { tactic, strikers, decoys, baseBearingDeg, startTick, terrain } = params;
  const spawns: ScenarioSpawnSchedule[] = [];

  function clampAltitude(x: number, y: number, zNominal: number): number {
    const groundH = terrain ? terrain.heightAt(x, y) : 0;
    return Math.max(zNominal, groundH + 20);
  }

  switch (tactic) {
    case 'saturation': {
      // Saturation: all strikers inbound in a 20-40s window (400-800 ticks) from one bearing
      // (spread +/- 12 deg, lateral spacing 40-80 m).
      const durationTicks = 400 + Math.floor(rng.next() * 400); // 20-40s
      const allMembers = [...strikers, ...decoys];
      const count = allMembers.length;
      const baseRad = baseBearingDeg * DEG_TO_RAD;

      const latX = dCos(baseRad);
      const latY = -dSin(baseRad);

      for (let i = 0; i < count; i++) {
        const member = allMembers[i]!;
        const timeFraction = count > 1 ? i / (count - 1) : 0;
        const tickJitter = Math.floor((rng.next() - 0.5) * 40);
        const tick = startTick + Math.max(0, Math.floor(timeFraction * durationTicks) + tickJitter);

        const baseRange = 4000 + rng.next() * 1500;
        const lateralSign = i % 2 === 0 ? 1 : -1;
        const lateralDist = (Math.floor(i / 2) + 1) * (40 + rng.next() * 40) * lateralSign;
        const bearingJitterDeg = (rng.next() - 0.5) * 24; // +/- 12 deg
        const finalBearingRad = (baseBearingDeg + bearingJitterDeg) * DEG_TO_RAD;

        const posX = baseRange * dSin(finalBearingRad) + lateralDist * latX * 0.2;
        const posY = baseRange * dCos(finalBearingRad) + lateralDist * latY * 0.2;
        const altNominal = 40 + rng.next() * 80; // 40-120 m
        const posZ = clampAltitude(posX, posY, altNominal);

        spawns.push({
          tick,
          classId: member.classId,
          pos: vec3(posX, posY, posZ),
          behaviourType: 'ingress_direct',
          speed: member.speed,
          groupId: 'swarm-saturation',
          role: member.role,
        });
      }
      break;
    }

    case 'split': {
      // Split: two subgroups from bearings 70-120 deg apart; the second is delayed 10-25 s.
      const delayTicks = 200 + Math.floor(rng.next() * 300); // 10-25 s
      const splitAngleDeg = 70 + rng.next() * 50; // 70-120 deg
      const bearing1 = baseBearingDeg;
      const bearing2 = (baseBearingDeg + splitAngleDeg) % 360;

      const half = Math.ceil(strikers.length / 2);
      const group1Strikers = strikers.slice(0, half);
      const group2Strikers = strikers.slice(half);

      const halfDecoys = Math.ceil(decoys.length / 2);
      const group1Decoys = decoys.slice(0, halfDecoys);
      const group2Decoys = decoys.slice(halfDecoys);

      const sub1 = [...group1Strikers, ...group1Decoys];
      const sub2 = [...group2Strikers, ...group2Decoys];

      const makeSubgroup = (
        members: SwarmMemberConfig[],
        bearingDeg: number,
        subStartTick: number,
        groupId: string
      ) => {
        for (let i = 0; i < members.length; i++) {
          const m = members[i]!;
          const tickJitter = Math.floor(rng.next() * 60);
          const tick = subStartTick + i * 30 + tickJitter;
          const range = 4200 + rng.next() * 1200;
          const bRad = (bearingDeg + (rng.next() - 0.5) * 16) * DEG_TO_RAD; // +/- 8 deg
          const posX = range * dSin(bRad);
          const posY = range * dCos(bRad);
          const posZ = clampAltitude(posX, posY, 40 + rng.next() * 80);

          spawns.push({
            tick,
            classId: m.classId,
            pos: vec3(posX, posY, posZ),
            behaviourType: 'ingress_direct',
            speed: m.speed,
            groupId,
            role: m.role,
          });
        }
      };

      makeSubgroup(sub1, bearing1, startTick, 'split-group-1');
      makeSubgroup(sub2, bearing2, startTick + delayTicks, 'split-group-2');
      break;
    }

    case 'decoy_screen': {
      // Decoy Screen: decoys 500-900 m ahead of strikers on the same bearing;
      // strikers trail by 12-20 s (240-400 ticks).
      const trailTicks = 240 + Math.floor(rng.next() * 160); // 12-20 s
      const baseRad = baseBearingDeg * DEG_TO_RAD;
      const latX = dCos(baseRad);
      const latY = -dSin(baseRad);

      for (let i = 0; i < decoys.length; i++) {
        const d = decoys[i]!;
        const tick = startTick + Math.floor(rng.next() * 40);
        const range = 4000 + rng.next() * 600;
        const bRad = (baseBearingDeg + (rng.next() - 0.5) * 10) * DEG_TO_RAD;
        const latOffset = (i - (decoys.length - 1) / 2) * 80;
        const posX = range * dSin(bRad) + latOffset * latX;
        const posY = range * dCos(bRad) + latOffset * latY;
        const posZ = clampAltitude(posX, posY, 50 + rng.next() * 60);

        spawns.push({
          tick,
          classId: d.classId,
          pos: vec3(posX, posY, posZ),
          behaviourType: 'ingress_direct',
          speed: d.speed,
          groupId: 'decoy-screen',
          role: 'decoy',
        });
      }

      for (let i = 0; i < strikers.length; i++) {
        const s = strikers[i]!;
        const tick = startTick + trailTicks + Math.floor(rng.next() * 80);
        const range = 4800 + rng.next() * 700;
        const bRad = (baseBearingDeg + (rng.next() - 0.5) * 12) * DEG_TO_RAD;
        const latOffset = (i - (strikers.length - 1) / 2) * 60;
        const posX = range * dSin(bRad) + latOffset * latX;
        const posY = range * dCos(bRad) + latOffset * latY;
        const posZ = clampAltitude(posX, posY, 40 + rng.next() * 80);

        spawns.push({
          tick,
          classId: s.classId,
          pos: vec3(posX, posY, posZ),
          behaviourType: 'ingress_direct',
          speed: s.speed,
          groupId: 'striker-trailing',
          role: 'striker',
        });
      }
      break;
    }
  }

  spawns.sort((a, b) => a.tick - b.tick);
  return spawns;
}
