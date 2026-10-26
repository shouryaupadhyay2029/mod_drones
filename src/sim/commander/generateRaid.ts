// Generic illustrative raid generation for the offline VAJRA training simulator.
import { cyrb53 } from '../core/hash.js';
import { Rng } from '../core/rng.js';
import { createEnvironment } from '../model/environment.js';
import { capacityCheck } from '../scenarios/capacity.js';
import { buildSwarmSpawns } from '../scenarios/swarm.js';
import { CommanderSite, CommanderTier, RaidPlan, SiteIntel } from './types.js';

const TIER_SETTINGS: Record<CommanderTier, { siteCounts: [number, number]; strikers: [number, number]; decoys: [number, number]; ew: 'none' | 'light' | 'heavy' }> = {
  recruit: { siteCounts: [2, 2], strikers: [1, 1], decoys: [0, 1], ew: 'none' },
  operator: { siteCounts: [2, 3], strikers: [1, 2], decoys: [1, 1], ew: 'light' },
  veteran: { siteCounts: [3, 4], strikers: [2, 3], decoys: [1, 2], ew: 'light' },
  elite: { siteCounts: [3, 4], strikers: [3, 4], decoys: [2, 3], ew: 'heavy' },
};
const CORRECT_INTEL_PROBABILITY: Record<CommanderTier, number> = { recruit: 0.8, operator: 0.7, veteran: 0.6, elite: 0.6 };
export const RAID_SCARCITY: Record<CommanderTier, number> = { recruit: 1, operator: 0.85, veteran: 0.7, elite: 0.7 };
const BANDS = ['low', 'med', 'high'] as const;

export function generateRaid(seed: string | number, tier: CommanderTier): RaidPlan {
  const rng = new Rng(seed).fork('raid');
  const settings = TIER_SETTINGS[tier];
  const siteCount = rng.int(settings.siteCounts[0], settings.siteCounts[1]);
  const sites: CommanderSite[] = [];
  const schedules: RaidPlan['schedules'] = {};
  const siteNeeds: RaidPlan['siteNeeds'] = {};
  const fingerprintBits: string[] = [tier, String(siteCount)];
  for (let index = 0; index < siteCount; index++) {
    const id = `S${index + 1}`;
    const posX = index === 0 ? 0 : (sites[index - 1]?.mapPosKm.x ?? 0) + 8;
    const site: CommanderSite = {
      id,
      name: `Training Site ${index + 1}`,
      valueUnits: 80 + Math.floor(rng.next() * 121),
      mapPosKm: { x: Math.round(posX * 10) / 10, y: Math.round((rng.next() - 0.5) * 4 * 10) / 10 },
      inventory: { gunAmmo: 0, missiles: 0 },
      roe: 'standard',
      missileAuth: 'hold',
    };
    sites.push(site);
    const strikerCount = rng.int(settings.strikers[0], settings.strikers[1]);
    const decoyCount = rng.int(settings.decoys[0], settings.decoys[1]);
    const strikers = Array.from({ length: strikerCount }, (_, i) => ({
      classId: i % 3 === 1 ? 'fpv_fiber' as const : 'fpv_kamikaze' as const,
      role: 'striker' as const,
      speed: 25 + rng.int(0, 8),
    }));
    const decoys = Array.from({ length: decoyCount }, () => ({ classId: 'decoy_drone' as const, role: 'decoy' as const, speed: 22 + rng.int(0, 7) }));
    let schedule = buildSwarmSpawns({
      tactic: rng.pick(['saturation', 'split', 'decoy_screen'] as const),
      strikers,
      decoys,
      baseBearingDeg: rng.int(0, 359),
      startTick: 900 + index * 120,
    }, rng.fork(`site:${id}`));
    for (let attempt = 0; capacityCheck(schedule).capacityRatio > 1 && attempt < 4; attempt++) {
      const strikersFirst = schedule.filter((spawn) => spawn.role === 'striker');
      schedule = schedule.map((spawn) => {
        if (spawn.role !== 'striker') return spawn;
        const strikerIndex = strikersFirst.indexOf(spawn);
        return { ...spawn, tick: 700 + attempt * 40 + strikerIndex * 420 };
      });
    }
    schedules[id] = schedule;
    const capacity = capacityCheck(schedule);
    siteNeeds[id] = { gunAmmo: capacity.requiredGunBursts, missiles: capacity.requiredMissiles };
    fingerprintBits.push(`${id}:${site.valueUnits}:${strikerCount}:${decoyCount}:${siteNeeds[id].gunAmmo}/${siteNeeds[id].missiles}:${schedule.map((spawn) => `${spawn.classId}@${spawn.tick}`).join(',')}`);
  }
  const mainIndex = rng.int(0, sites.length - 1);
  const mainEffortSiteId = sites[mainIndex]?.id ?? 'S1';
  const feintSiteIds = sites.filter((site) => site.id !== mainEffortSiteId).slice(0, Math.max(1, Math.floor(siteCount / 2))).map((site) => site.id);
  fingerprintBits.push(`main:${mainEffortSiteId}`, `ew:${settings.ew}`);
  const fingerprint = cyrb53(fingerprintBits.join('|'));
  const scarcity = RAID_SCARCITY[tier];
  const totalGunNeed = Object.values(siteNeeds).reduce((sum, need) => sum + need.gunAmmo, 0);
  const totalMissileNeed = Object.values(siteNeeds).reduce((sum, need) => sum + need.missiles, 0);
  const gunAmmo = Math.ceil(totalGunNeed * scarcity);
  const missiles = Math.ceil(totalMissileNeed * scarcity);
  return {
    id: `raid:v1:${tier}`,
    seed,
    tier,
    sites,
    schedules,
    siteNeeds,
    scarcity,
    totalPool: { gunAmmo, missiles, reserve: { gunAmmo, missiles } },
    mainEffortSiteId,
    feintSiteIds,
    ewLevel: settings.ew,
    fingerprint,
  };
}

export function intelBrief(raid: RaidPlan): SiteIntel[] {
  const rng = new Rng(raid.seed).fork('intel');
  return raid.sites.map((site) => {
    const count = (raid.schedules[site.id] ?? []).filter((spawn) => spawn.role === 'striker').length;
    const actual = count <= 1 ? 0 : count <= 2 ? 1 : 2;
    if (rng.chance(CORRECT_INTEL_PROBABILITY[raid.tier])) return { siteId: site.id, threatBand: BANDS[actual]! };
    const alternatives = BANDS.filter((_, index) => index !== actual);
    return { siteId: site.id, threatBand: rng.pick(alternatives) };
  });
}

export function raidEnvironment(raid: RaidPlan) {
  return createEnvironment({ ewLevel: raid.ewLevel, terrainKind: raid.tier === 'elite' ? 'urban' : 'rural' });
}
