// Aggregate commander scoring uses generic training-only cost units.
import { scoreSessionV2 } from '../scoring/doctrine.js';
import { THREAT_LIBRARY } from '../model/threats.js';
import { attackerCostUnits, defenderCostUnits } from './costs.js';
import { CommanderSession } from './session.js';
import { RaidScoreReport, SiteRunReport } from './types.js';

function clamp(value: number, low = 0, high = 100): number { return Math.max(low, Math.min(high, value)); }
function gradeFor(score: number): RaidScoreReport['grade'] {
  if (score >= 95) return 'Distinguished';
  if (score >= 85) return 'Proficient';
  if (score >= 70) return 'Qualified';
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

export function scoreRaid(session: CommanderSession): RaidScoreReport {
  const siteReports: SiteRunReport[] = [];
  let weightedPreservation = 0;
  let totalValue = 0;
  let totalDestroyed = 0;
  let totalSpent = 0;
  let totalHits = 0;
  let totalFalse = 0;
  const causes = new Set<string>();

  for (const site of session.raid.sites) {
    const engine = session.engineForReport(site.id);
    if (!engine) continue;
    const events = engine.getEvents();
    const hits = events.filter((event) => event.type === 'ASSET_HIT').length;
    const damagePercent = Math.min(100, hits * 20);
    const destroyed = engine.actors.filter((actor) => actor.state === 'neutralized' && THREAT_LIBRARY[actor.classId].hostile).reduce((sum, actor) => sum + attackerCostUnits(actor.classId), 0);
    const engagementEvents = events.filter((event) => event.type === 'ENGAGEMENT_STARTED');
    const spend = engagementEvents.reduce((sum, event) => sum + defenderCostUnits((event.payload?.effector ?? 'gun') as 'gun' | 'jammer' | 'missile'), 0);
    let falseCount = 0;
    for (const event of engagementEvents) {
      const trackId = Number(event.payload?.trackId);
      const track = engine.tracks.find((candidate) => candidate.trackId === trackId);
      const actor = track && engine.actors.find((candidate) => candidate.id === track.actorId);
      if (track?.isGhost || (actor && !THREAT_LIBRARY[actor.classId].hostile)) falseCount++;
    }
    const siteCauses: string[] = [];
    const remainingAmmo = engine.effectorState.gun.ammo + (engine.effectorState.missile?.ammo ?? 0);
    if (hits > 0 && remainingAmmo === 0) siteCauses.push('misallocated_inventory');
    if (hits > 0 && session.raid.sites.some((other) => other.id !== site.id && ((session.engineForReport(other.id)?.effectorState.gun.ammo ?? 0) + (session.engineForReport(other.id)?.effectorState.missile?.ammo ?? 0)) > 0)) siteCauses.push('misallocated_inventory');
    if (falseCount > 0 && site.roe === 'free') siteCauses.push('roe_too_free');
    if (hits > 0 && site.roe === 'tight' && site.inventory.gunAmmo > 0) siteCauses.push('roe_too_tight');
    if (engagementEvents.filter((event) => event.payload?.effector === 'missile').length * 40 > destroyed) siteCauses.push('missile_overuse');
    if (hits > 0 && session.raid.mainEffortSiteId === site.id && site.inventory.gunAmmo + site.inventory.missiles === 0) siteCauses.push('main_effort_undefended');
    for (const cause of siteCauses) causes.add(cause);
    const scoreSession = scoreSessionV2({ actors: engine.actors, tracks: engine.tracks, events, assetHit: hits > 0 });
    siteReports.push({ siteId: site.id, damagePercent, attackerCostDestroyed: destroyed, defenderSpend: spend, hits, falseEngagements: falseCount, causes: [...new Set(siteCauses)], scoreSessionV2: scoreSession });
    weightedPreservation += site.valueUnits * (1 - damagePercent / 100);
    totalValue += site.valueUnits;
    totalDestroyed += destroyed;
    totalSpent += spend;
    totalHits += hits;
    totalFalse += falseCount;
  }

  const assetPreservation = totalValue > 0 ? weightedPreservation / totalValue * 100 : 100;
  const cer = totalDestroyed > 0 ? totalSpent / totalDestroyed : 0;
  const costExchange = costExchangeScore(cer, totalDestroyed, totalSpent, totalHits);
  let resourceManagement = 100;
  if (totalHits > 0) {
    const reserveUnused = session.view().totalPool.reserve.gunAmmo + session.view().totalPool.reserve.missiles;
    const initialReserve = session.raid.totalPool.gunAmmo + session.raid.totalPool.missiles;
    if (reserveUnused > 0 && initialReserve > 0) {
      resourceManagement -= Math.min(50, 50 * reserveUnused / initialReserve);
      causes.add('reserve_unused');
    }
    const drySite = siteReports.some((report) => report.hits > 0 && ((session.engineForReport(report.siteId)?.effectorState.gun.ammo ?? 0) + (session.engineForReport(report.siteId)?.effectorState.missile?.ammo ?? 0)) === 0);
    const stockAtSafeSite = session.raid.sites.some((site) => ((session.engineForReport(site.id)?.effectorState.gun.ammo ?? 0) + (session.engineForReport(site.id)?.effectorState.missile?.ammo ?? 0)) > 0 && (siteReports.find((report) => report.siteId === site.id)?.hits ?? 0) === 0);
    if (drySite && stockAtSafeSite) { resourceManagement -= 35; causes.add('misallocated_inventory'); }
  }
  resourceManagement = clamp(resourceManagement);
  const commandDiscipline = clamp(100 - totalFalse * 5);
  const total = Math.round(assetPreservation * 0.5 + costExchange * 0.3 + resourceManagement * 0.1 + commandDiscipline * 0.1);
  const pendingTransferLate = session.events.some((event) => event.type === 'RESERVE_TRANSFER_ORDERED' && session.events.some((hit) => hit.type === 'SITE_ASSET_HIT' && hit.payload?.siteId === event.payload?.siteId && hit.tick < Number(event.payload?.dueTick ?? 0)));
  if (pendingTransferLate) causes.add('late_retask');
  if (session.view().totalPool.reserve.gunAmmo + session.view().totalPool.reserve.missiles > 0 && totalHits > 0) causes.add('reserve_unused');
  return {
    scoreVersion: 'raid-1.0', total, grade: gradeFor(total),
    subscores: { assetPreservation: Math.round(assetPreservation * 10) / 10, costExchange: Math.round(costExchange * 10) / 10, resourceManagement: Math.round(resourceManagement * 10) / 10, commandDiscipline: Math.round(commandDiscipline * 10) / 10 },
    sites: siteReports, costLedger: { attackerDestroyed: Math.round(totalDestroyed * 100) / 100, defenderSpent: Math.round(totalSpent * 100) / 100, cer: Math.round(cer * 100) / 100 },
    decisionCauses: [...causes], commandTimeline: session.getSessionLog().commands, missionAssetValue: totalValue,
  };
}
