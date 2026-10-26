import { CommanderCommand, CommanderSession, generateRaid, heuristicCommander, oracleCommander, scoreRaid } from '../src/sim/index.js';
import { CommanderTier, CommanderView, RaidPlan, RaidScoreReport } from '../src/sim/commander/types.js';

type Allocation = 'even' | 'by_intel' | 'oracle' | 'all_to_main_effort' | 'all_to_wrong_site';
type Policy = { allocation: Allocation; auth: 'hold' | 'asset_threat' | 'free'; roe: 'tight' | 'standard' | 'free'; reserve: 0 | 20 | 40 };
type Metrics = { total: number; preservation: number; cer: number };

const tiers: CommanderTier[] = ['recruit', 'operator', 'veteran'];
const means = (reports: RaidScoreReport[]): Metrics => ({
  total: reports.reduce((sum, report) => sum + report.total, 0) / reports.length,
  preservation: reports.reduce((sum, report) => sum + report.subscores.assetPreservation, 0) / reports.length,
  cer: reports.reduce((sum, report) => sum + report.costLedger.cer, 0) / reports.length,
});

function allocationCommands(raid: RaidPlan, view: CommanderView, allocation: Allocation, reserve: number): CommanderCommand[] {
  const gunBudget = Math.floor(view.totalPool.gunAmmo * (100 - reserve) / 100);
  const missileBudget = Math.floor(view.totalPool.missiles * (100 - reserve) / 100);
  const targets = raid.sites;
  const wrongSiteId = targets.find((site) => site.id !== raid.mainEffortSiteId)?.id ?? raid.mainEffortSiteId;
  const commands: CommanderCommand[] = [];
  if (allocation === 'all_to_main_effort' || allocation === 'all_to_wrong_site') {
    const destination = allocation === 'all_to_main_effort' ? raid.mainEffortSiteId : wrongSiteId;
    for (const site of targets) commands.push({ type: 'ALLOCATE', tick: 0, payload: { siteId: site.id, gunAmmo: site.id === destination ? gunBudget : 0, missiles: site.id === destination ? missileBudget : 0 } });
    return commands;
  }

  const intelWeight = { low: 1, med: 2, high: 3 } as const;
  const totalWeight = targets.reduce((sum, site) => {
    if (allocation === 'even') return sum + 1;
    if (allocation === 'by_intel') return sum + Math.max(1, site.valueUnits * intelWeight[view.intel.find((item) => item.siteId === site.id)?.threatBand ?? 'low']);
    const need = raid.siteNeeds[site.id] ?? { gunAmmo: 0, missiles: 0 };
    return sum + need.gunAmmo + need.missiles;
  }, 0);
  let assignedGun = 0;
  let assignedMissiles = 0;
  for (const [index, site] of targets.entries()) {
    const need = raid.siteNeeds[site.id] ?? { gunAmmo: 0, missiles: 0 };
    const weight = allocation === 'even' ? 1 : allocation === 'by_intel'
      ? Math.max(1, site.valueUnits * intelWeight[view.intel.find((item) => item.siteId === site.id)?.threatBand ?? 'low'])
      : need.gunAmmo + need.missiles;
    const isLast = index === targets.length - 1;
    const gunAmmo = isLast ? gunBudget - assignedGun : Math.floor(gunBudget * weight / Math.max(1, totalWeight));
    const missiles = isLast ? missileBudget - assignedMissiles : Math.floor(missileBudget * weight / Math.max(1, totalWeight));
    assignedGun += gunAmmo;
    assignedMissiles += missiles;
    commands.push({ type: 'ALLOCATE', tick: 0, payload: { siteId: site.id, gunAmmo, missiles } });
  }
  if (allocation === 'oracle') {
    const oracle = oracleCommander(view, raid).filter((command) => command.type === 'ALLOCATE');
    const oracleBySite = new Map(oracle.map((command) => [command.payload.siteId, command.payload]));
    for (const command of commands) {
      if (command.type !== 'ALLOCATE') continue;
      const target = command.payload;
      const oracleTarget = oracleBySite.get(target.siteId);
      if (!oracleTarget) continue;
      const scaledGun = Math.floor(oracleTarget.gunAmmo * (100 - reserve) / 100);
      const scaledMissiles = Math.floor(oracleTarget.missiles * (100 - reserve) / 100);
      target.gunAmmo = scaledGun;
      target.missiles = scaledMissiles;
    }
    const usedGun = commands.reduce((sum, command) => sum + (command.type === 'ALLOCATE' ? command.payload.gunAmmo : 0), 0);
    const usedMissiles = commands.reduce((sum, command) => sum + (command.type === 'ALLOCATE' ? command.payload.missiles : 0), 0);
    const main = commands.find((command) => command.type === 'ALLOCATE' && command.payload.siteId === raid.mainEffortSiteId);
    if (main?.type === 'ALLOCATE') { main.payload.gunAmmo += gunBudget - usedGun; main.payload.missiles += missileBudget - usedMissiles; }
  }
  return commands;
}

function runOne(raid: RaidPlan, policy: Policy, isolateAllocation = false): RaidScoreReport {
  const session = new CommanderSession(raid);
  const view = session.view();
  const commands = allocationCommands(raid, view, policy.allocation, policy.reserve);
  for (const site of raid.sites) {
    commands.push({ type: 'SET_MISSILE_AUTH', tick: 0, payload: { siteId: site.id, auth: policy.auth } });
    commands.push({ type: 'SET_ROE', tick: 0, payload: { siteId: site.id, roe: policy.roe } });
  }
  session.step(commands);
  while (!session.isComplete() && session.tick < 4200) {
    const reserveRetasks = isolateAllocation ? [] : heuristicCommander(session.view()).filter((command) => command.type === 'RETASK_RESERVE');
    session.step(reserveRetasks);
  }
  return scoreRaid(session);
}

const axes: Array<{ factor: string; levels: Array<{ label: string; policy: Policy }> }> = [
  { factor: 'allocation', levels: (['even', 'by_intel', 'oracle', 'all_to_main_effort', 'all_to_wrong_site'] as Allocation[]).map((allocation) => ({ label: allocation, policy: { allocation, auth: 'asset_threat', roe: 'standard', reserve: 20 } })) },
  { factor: 'missileAuth', levels: (['hold', 'asset_threat', 'free'] as const).map((auth) => ({ label: auth, policy: { allocation: 'by_intel', auth, roe: 'standard', reserve: 20 } })) },
  { factor: 'ROE', levels: (['tight', 'standard', 'free'] as const).map((roe) => ({ label: roe, policy: { allocation: 'by_intel', auth: 'asset_threat', roe, reserve: 20 } })) },
  { factor: 'reserve', levels: ([0, 20, 40] as const).map((reserve) => ({ label: `${reserve}%`, policy: { allocation: 'by_intel', auth: 'asset_threat', roe: 'standard', reserve } })) },
];

for (const axis of axes) {
  for (const level of axis.levels) {
    const tierReports: Array<{ tier: CommanderTier; means: Metrics }> = [];
    const perTier = tiers.map((tier) => {
      const reports: RaidScoreReport[] = [];
      for (let seed = 1; seed <= 20; seed++) reports.push(runOne(generateRaid(`lever-${tier}-${seed}`, tier), level.policy, axis.factor === 'allocation'));
      return { tier, means: means(reports) };
    });
    tierReports.push(...perTier);
    console.log(`${axis.factor} ${level.label}`, JSON.stringify(tierReports));
  }
}
