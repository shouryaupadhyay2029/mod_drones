// Baseline commanders are pure functions over the non-truth CommanderView.
import { CommanderCommand, CommanderView, RaidPlan } from './types.js';

export function passiveCommander(): CommanderCommand[] { return []; }

export function heuristicCommander(view: CommanderView): CommanderCommand[] {
  if (view.tick === 0) {
    const availableGun = Math.floor(view.totalPool.gunAmmo * 0.8);
    const availableMissiles = Math.floor(view.totalPool.missiles * 0.8);
    const intelWeight = { low: 1, med: 2, high: 3 };
    const weights = view.sites.map((site) => ({
      site,
      weight: Math.max(1, site.valueUnits * intelWeight[site.threatBand]),
    }));
    const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
    const commands: CommanderCommand[] = [];
    let gunsUsed = 0;
    let missilesUsed = 0;
    for (const [index, entry] of weights.entries()) {
      const gunAmmo = index === weights.length - 1 ? availableGun - gunsUsed : Math.floor(availableGun * entry.weight / totalWeight);
      const missiles = index === weights.length - 1 ? availableMissiles - missilesUsed : Math.floor(availableMissiles * entry.weight / totalWeight);
      gunsUsed += gunAmmo;
      missilesUsed += missiles;
      commands.push({ type: 'ALLOCATE', tick: 0, payload: { siteId: entry.site.siteId, gunAmmo, missiles } });
    }
    for (const site of view.sites) commands.push({ type: 'SET_MISSILE_AUTH', tick: 0, payload: { siteId: site.siteId, auth: 'asset_threat' } });
    return commands;
  }

  const idleSiteAvailable = view.sites.some((site) => site.status === 'green' && site.confirmedInboundCount === 0);
  if (!idleSiteAvailable) return [];
  const commands: CommanderCommand[] = [];
  for (const site of view.sites) {
    const inbound = site.confirmedInboundCount > 0;
    if (!inbound) continue;
    for (const item of ['gunAmmo', 'missiles'] as const) {
      const current = site.inventory[item];
      const allocated = site.allocated[item];
      const belowThirtyPercent = current * 10 < allocated * 3 || (allocated === 0 && current === 0);
      const alreadyOrdered = view.pendingTransfers.some((transfer) => transfer.toSiteId === site.siteId && transfer.item === item);
      const reserve = view.totalPool.reserve[item];
      if (!belowThirtyPercent || alreadyOrdered || reserve <= 0) continue;
      const amount = Math.min(reserve, Math.max(1, Math.ceil(allocated * 0.3)));
      commands.push({ type: 'RETASK_RESERVE', tick: view.tick, payload: { toSiteId: site.siteId, item, amount } });
    }
  }
  return commands;
}

export function missileHappyCommander(view: CommanderView): CommanderCommand[] {
  if (view.tick !== 0) return [];
  const missilesPerSite = Math.floor(view.totalPool.missiles / view.sites.length);
  return view.sites.flatMap((site, index) => [
    { type: 'ALLOCATE' as const, tick: 0, payload: { siteId: site.siteId, gunAmmo: 0, missiles: index === view.sites.length - 1 ? view.totalPool.missiles - missilesPerSite * index : missilesPerSite } },
    { type: 'SET_MISSILE_AUTH' as const, tick: 0, payload: { siteId: site.siteId, auth: 'free' as const } },
  ]);
}

/** Test-only policy with direct access to the generated plan. */
export function oracleCommander(view: CommanderView, raid: RaidPlan): CommanderCommand[] {
  if (view.tick !== 0) return [];
  const allocations = new Map(raid.sites.map((site) => [site.id, { gunAmmo: 0, missiles: 0 }]));
  // Satisfy the capacity-model demand at each site, with any pool surplus
  // held at the designated main-effort site. Scarcity, rather than this
  // test-only oracle, determines whether every computed need can be met.
  let gunRemaining = view.totalPool.gunAmmo;
  const gunPriority = [
    ...raid.sites.filter((site) => site.id === raid.mainEffortSiteId),
    ...raid.sites.filter((site) => site.id !== raid.mainEffortSiteId),
  ];
  for (const site of gunPriority) {
    const amount = Math.min(gunRemaining, raid.siteNeeds[site.id]?.gunAmmo ?? 0);
    allocations.get(site.id)!.gunAmmo = amount;
    gunRemaining -= amount;
  }
  // Any rounds above modeled demand are held at the main effort site.
  allocations.get(raid.mainEffortSiteId)!.gunAmmo += gunRemaining;
  // Missile authority is deliberately limited to main effort; its stock is
  // the site's modeled need plus any remaining missile reserve.
  allocations.get(raid.mainEffortSiteId)!.missiles = view.totalPool.missiles;

  return raid.sites.flatMap((site) => [
    { type: 'ALLOCATE' as const, tick: 0, payload: { siteId: site.id, ...allocations.get(site.id)! } },
    { type: 'SET_MISSILE_AUTH' as const, tick: 0, payload: { siteId: site.id, auth: site.id === raid.mainEffortSiteId ? 'asset_threat' as const : 'hold' as const } },
  ]);
}
