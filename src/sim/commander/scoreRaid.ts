// Aggregate commander scoring uses generic training-only cost units.
import { scoreSessionV2 } from '../scoring/doctrine.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { attackerCostUnits, defenderCostUnits } from './costs.js';
import { CommanderSession } from './session.js';
import { RaidScoreReport, SiteRunReport } from './types.js';

export const RAID_SCORE_VERSION = 'raid-1.1' as const;

export const RAID_SCORE_WEIGHTS = {
  assetPreservation: 0.45,
  costExchange: 0.25,
  resourceManagement: 0.10,
  commandDiscipline: 0.10,
  commsResilience: 0.10,
} as const;

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function gradeFor(score: number): RaidScoreReport['grade'] {
  if (score >= 85) return 'Proficient';
  if (score >= 70) return 'Competent';
  if (score >= 50) return 'Marginal';
  return 'Unsatisfactory';
}

export function costExchangeScore(cer: number, destroyed: number, spent: number, hits: number): number {
  if (destroyed === 0) return spent > 0 ? 0 : hits === 0 ? 100 : 0;
  if (cer <= 1) return 100;
  if (cer <= 5) return 100 - (cer - 1) * 10;
  if (cer <= 10) return 60 - (cer - 5) * 6;
  if (cer < 20) return 30 - (cer - 10) * 3;
  return 0;
}

export function preventedDamageForMissileKill(
  siteValueUnits: number,
  timeToImpactSeconds: number,
  hostileStriker: boolean,
  neutralized: boolean,
  jammerCouldCover: boolean,
  gunCouldCover: boolean,
): number {
  return hostileStriker && neutralized && timeToImpactSeconds < 12 && !jammerCouldCover && !gunCouldCover
    ? 0.20 * siteValueUnits
    : 0;
}

export function commanderTotalScore(
  assetPreservation: number,
  costExchange: number,
  resourceManagement: number,
  commandDiscipline: number,
  commsResilience = 100,
): number {
  return Math.round(
    assetPreservation * RAID_SCORE_WEIGHTS.assetPreservation +
    costExchange * RAID_SCORE_WEIGHTS.costExchange +
    resourceManagement * RAID_SCORE_WEIGHTS.resourceManagement +
    commandDiscipline * RAID_SCORE_WEIGHTS.commandDiscipline +
    commsResilience * RAID_SCORE_WEIGHTS.commsResilience,
  );
}

export function scoreRaid(session: CommanderSession): RaidScoreReport {
  const siteReports: SiteRunReport[] = [];
  let weightedPreservation = 0;
  let totalValue = 0;
  let totalDestroyed = 0;
  let totalPreventedDamage = 0;
  let totalSpent = 0;
  const totalSpendByEffector = { gun: 0, jammer: 0, missile: 0 };
  let totalHits = 0;
  let totalFalse = 0;
  let commsResilience = 100;
  const causes = new Set<string>();

  const droppedCommands = session
    .getSessionLog()
    .commands.filter((cmd) => cmd.rejected && cmd.reason === 'Link offline')
    .map((cmd) => ({
      tick: cmd.tick,
      siteId: cmd.siteId,
      type: cmd.type,
      reason: cmd.reason ?? 'Link offline',
    }));

  if (droppedCommands.length > 0) {
    commsResilience -= droppedCommands.length * 10;
    causes.add('command_dropped_offline');
  }

  for (const site of session.raid.sites) {
    const engine = session.engineForReport(site.id);
    if (!engine) continue;
    const events = engine.getEvents();
    const hits = events.filter((event) => event.type === 'ASSET_HIT').length;
    const damagePercent = Math.min(100, hits * 20);
    const destroyed = engine.actors
      .filter((actor) => actor.state === 'neutralized' && THREAT_LIBRARY[actor.classId].hostile)
      .reduce((sum, actor) => sum + attackerCostUnits(actor.classId), 0);
    const engagementEvents = events.filter((event) => event.type === 'ENGAGEMENT_STARTED');
    const spend = engagementEvents.reduce(
      (sum, event) => sum + defenderCostUnits((event.payload?.effector ?? 'gun') as 'gun' | 'jammer' | 'missile'),
      0,
    );
    const spendByEffector = { gun: 0, jammer: 0, missile: 0 };
    for (const event of engagementEvents) {
      const effector = event.payload?.effector;
      if (effector === 'gun' || effector === 'jammer' || effector === 'missile') {
        spendByEffector[effector] += defenderCostUnits(effector);
      }
    }

    let preventedDamageUnits = 0;
    const resolvedEvents = events.filter(
      (event) => event.type === 'ENGAGEMENT_RESOLVED' && event.payload?.effector === 'missile' && event.payload?.result === 'hit',
    );
    for (const resolved of resolvedEvents) {
      const trackId = Number(resolved.payload?.trackId);
      const start = engagementEvents.find(
        (event) => event.payload?.effector === 'missile' && Number(event.payload?.trackId) === trackId && event.tick <= resolved.tick,
      );
      const track = engine.tracks.find((candidate) => candidate.trackId === trackId);
      const actor = track && engine.actors.find((candidate) => candidate.id === track.actorId);
      if (!start || !actor || actor.role !== 'striker' || !THREAT_LIBRARY[actor.classId].hostile || actor.state !== 'neutralized' || actor.speed <= 0) {
        continue;
      }
      const flightSeconds = (resolved.tick - start.tick) / 20;
      const rangeAtLaunch = (actor.neutralizedDistanceToAsset ?? 0) + actor.speed * flightSeconds;
      const timeToImpact = rangeAtLaunch / actor.speed;
      const priorStarts = engagementEvents.filter((event) => event.tick < start.tick);
      const jammerBusy = priorStarts.some(
        (event) => event.payload?.effector === 'jammer' && Number(event.payload?.resolveTick ?? event.tick) > start.tick,
      );
      const gunBusy = priorStarts.some(
        (event) => event.payload?.effector === 'gun' && Number(event.payload?.resolveTick ?? event.tick) > start.tick,
      );
      const gunAmmoAtLaunch = site.inventory.gunAmmo - priorStarts.filter((event) => event.payload?.effector === 'gun').length;
      const jammerCouldCover = THREAT_LIBRARY[actor.classId].rfControlled && rangeAtLaunch <= 1500 && !jammerBusy;
      const gunCouldCover = rangeAtLaunch <= 1000 && gunAmmoAtLaunch > 0 && !gunBusy;
      preventedDamageUnits += preventedDamageForMissileKill(
        site.valueUnits,
        timeToImpact,
        actor.role === 'striker' && THREAT_LIBRARY[actor.classId].hostile,
        actor.state === 'neutralized',
        jammerCouldCover,
        gunCouldCover,
      );
    }

    let falseCount = 0;
    let offlineFalseCount = 0;
    const siteSessionEngagements = session.events.filter(
      (event) => event.type === 'SITE_ENGAGEMENT_STARTED' && event.payload?.siteId === site.id,
    );
    for (const event of engagementEvents) {
      const trackId = Number(event.payload?.trackId);
      const track = engine.tracks.find((candidate) => candidate.trackId === trackId);
      const actor = track && engine.actors.find((candidate) => candidate.id === track.actorId);
      const isFalse = Boolean(track?.isGhost || (actor && !THREAT_LIBRARY[actor.classId].hostile));
      if (isFalse) {
        falseCount++;
        const matchingSiteEvent = siteSessionEngagements.find(
          (se) => se.tick === event.tick && Number(se.payload?.trackId) === trackId,
        );
        if (matchingSiteEvent?.payload?.linkStatus === 'offline') {
          offlineFalseCount++;
        }
      }
    }

    const offlineHits = session.events.filter(
      (event) =>
        event.type === 'SITE_ASSET_HIT' &&
        event.payload?.siteId === site.id &&
        event.payload?.linkStatus === 'offline',
    ).length;

    const siteCauses: string[] = [];
    const remainingAmmo = engine.effectorState.gun.ammo + (engine.effectorState.missile?.ammo ?? 0);
    if (hits > 0 && remainingAmmo === 0) siteCauses.push('misallocated_inventory');
    if (
      hits > 0 &&
      session.raid.sites.some(
        (other) =>
          other.id !== site.id &&
          (session.engineForReport(other.id)?.effectorState.gun.ammo ?? 0) +
            (session.engineForReport(other.id)?.effectorState.missile?.ammo ?? 0) >
            0,
      )
    ) {
      siteCauses.push('misallocated_inventory');
    }
    if (falseCount > 0 && site.roe === 'free') siteCauses.push('roe_too_free');
    if (hits > 0 && site.roe === 'tight' && site.inventory.gunAmmo > 0) siteCauses.push('roe_too_tight');
    if (engagementEvents.filter((event) => event.payload?.effector === 'missile').length * 40 > destroyed) {
      siteCauses.push('missile_overuse');
    }
    if (hits > 0 && session.raid.mainEffortSiteId === site.id && site.inventory.gunAmmo + site.inventory.missiles === 0) {
      siteCauses.push('main_effort_undefended');
    }

    // Comms Resilience evaluation for this site while offline
    if (offlineHits > 0) {
      commsResilience -= offlineHits * 20;
      siteCauses.push('offline_asset_hit');
      if (remainingAmmo === 0) {
        commsResilience -= 15;
        siteCauses.push('offline_ammo_exhausted');
      }
      if (site.roe === 'tight' && site.inventory.gunAmmo > 0) {
        commsResilience -= 15;
        siteCauses.push('offline_roe_too_tight');
      }
    }
    if (offlineFalseCount > 0 && site.roe === 'free') {
      commsResilience -= offlineFalseCount * 15;
      siteCauses.push('offline_roe_too_free');
    }
    if (droppedCommands.some((cmd) => cmd.siteId === site.id)) {
      siteCauses.push('command_dropped_offline');
    }

    for (const cause of siteCauses) causes.add(cause);
    const scoreSession = scoreSessionV2({ actors: engine.actors, tracks: engine.tracks, events, assetHit: hits > 0 });
    siteReports.push({
      siteId: site.id,
      damagePercent,
      attackerCostDestroyed: destroyed,
      preventedDamageUnits,
      defenderSpend: spend,
      defenderSpendByEffector: spendByEffector,
      hits,
      falseEngagements: falseCount,
      causes: [...new Set(siteCauses)],
      scoreSessionV2: scoreSession,
    });
    weightedPreservation += site.valueUnits * (1 - damagePercent / 100);
    totalValue += site.valueUnits;
    totalDestroyed += destroyed;
    totalPreventedDamage += preventedDamageUnits;
    totalSpent += spend;
    totalSpendByEffector.gun += spendByEffector.gun;
    totalSpendByEffector.jammer += spendByEffector.jammer;
    totalSpendByEffector.missile += spendByEffector.missile;
    totalHits += hits;
    totalFalse += falseCount;
  }

  const assetPreservation = totalValue > 0 ? (weightedPreservation / totalValue) * 100 : 100;
  const costDenominator = totalDestroyed + totalPreventedDamage;
  const cer = costDenominator > 0 ? totalSpent / costDenominator : 0;
  const costExchange = costExchangeScore(cer, costDenominator, totalSpent, totalHits);
  let resourceManagement = 100;
  if (totalHits > 0) {
    const reserveUnused = session.view().totalPool.reserve.gunAmmo + session.view().totalPool.reserve.missiles;
    const initialReserve = session.raid.totalPool.gunAmmo + session.raid.totalPool.missiles;
    if (reserveUnused > 0 && initialReserve > 0) {
      resourceManagement -= Math.min(50, (50 * reserveUnused) / initialReserve);
      causes.add('reserve_unused');
    }
    const drySite = siteReports.some(
      (report) =>
        report.hits > 0 &&
        (session.engineForReport(report.siteId)?.effectorState.gun.ammo ?? 0) +
          (session.engineForReport(report.siteId)?.effectorState.missile?.ammo ?? 0) ===
          0,
    );
    const stockAtSafeSite = session.raid.sites.some(
      (site) =>
        (session.engineForReport(site.id)?.effectorState.gun.ammo ?? 0) +
          (session.engineForReport(site.id)?.effectorState.missile?.ammo ?? 0) >
          0 && (siteReports.find((report) => report.siteId === site.id)?.hits ?? 0) === 0,
    );
    if (drySite && stockAtSafeSite) {
      resourceManagement -= 35;
      causes.add('misallocated_inventory');
    }
  }
  resourceManagement = clamp(resourceManagement);
  const commandDiscipline = clamp(100 - totalFalse * 5);
  commsResilience = clamp(commsResilience);
  const total = commanderTotalScore(
    assetPreservation,
    costExchange,
    resourceManagement,
    commandDiscipline,
    commsResilience,
  );
  const pendingTransferLate = session.events.some(
    (event) =>
      event.type === 'RESERVE_TRANSFER_ORDERED' &&
      session.events.some(
        (hit) =>
          hit.type === 'SITE_ASSET_HIT' &&
          hit.payload?.siteId === event.payload?.siteId &&
          hit.tick < Number(event.payload?.dueTick ?? 0),
      ),
  );
  if (pendingTransferLate) causes.add('late_retask');
  if (session.view().totalPool.reserve.gunAmmo + session.view().totalPool.reserve.missiles > 0 && totalHits > 0) {
    causes.add('reserve_unused');
  }
  return {
    scoreVersion: RAID_SCORE_VERSION,
    total,
    grade: gradeFor(total),
    subscores: {
      assetPreservation: Math.round(assetPreservation * 10) / 10,
      costExchange: Math.round(costExchange * 10) / 10,
      resourceManagement: Math.round(resourceManagement * 10) / 10,
      commandDiscipline: Math.round(commandDiscipline * 10) / 10,
      commsResilience: Math.round(commsResilience * 10) / 10,
    },
    sites: siteReports,
    costLedger: {
      attackerDestroyed: Math.round(totalDestroyed * 100) / 100,
      preventedDamageUnits: Math.round(totalPreventedDamage * 100) / 100,
      defenderSpent: Math.round(totalSpent * 100) / 100,
      defenderSpendByEffector: {
        gun: Math.round(totalSpendByEffector.gun * 100) / 100,
        jammer: Math.round(totalSpendByEffector.jammer * 100) / 100,
        missile: Math.round(totalSpendByEffector.missile * 100) / 100,
      },
      cer: Math.round(cer * 100) / 100,
    },
    decisionCauses: [...causes],
    droppedCommands,
    commandTimeline: session.getSessionLog().commands,
    missionAssetValue: totalValue,
  };
}
