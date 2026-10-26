import React, { useMemo, useState } from 'react';
import { CommanderCommand, CommanderTier, MissileAuth, RaidPlan, RoePosture, generateRaid, intelBrief } from '../../sim/index.js';

export interface CommanderSetupProps {
  onLaunch: (raid: RaidPlan, commands: CommanderCommand[], autopilot: boolean) => void;
}

export function buildCommanderSetupCommands(raid: RaidPlan, reserveShare: number, weights: number[], defaultRoe: RoePosture, defaultAuth: MissileAuth, roeBySite: Record<string, RoePosture>, authBySite: Record<string, MissileAuth>): CommanderCommand[] {
  const allocation = (key: 'gunAmmo' | 'missiles'): number[] => {
    const budget = Math.floor(raid.totalPool[key] * (1 - reserveShare));
    const siteWeights = raid.sites.map((_, i) => weights[i] ?? 1);
    const totalWeight = siteWeights.reduce((sum, value) => sum + value, 0) || raid.sites.length;
    let used = 0;
    return raid.sites.map((_, i) => {
      const units = i === raid.sites.length - 1 ? budget - used : Math.floor(budget * (siteWeights[i] ?? 1) / totalWeight);
      used += units;
      return units;
    });
  };
  const guns = allocation('gunAmmo');
  const missiles = allocation('missiles');
  return raid.sites.flatMap((site, i) => [
    { type: 'ALLOCATE' as const, tick: 0, payload: { siteId: site.id, gunAmmo: guns[i] ?? 0, missiles: missiles[i] ?? 0 } },
    { type: 'SET_ROE' as const, tick: 0, payload: { siteId: site.id, roe: roeBySite[site.id] ?? defaultRoe } },
    { type: 'SET_MISSILE_AUTH' as const, tick: 0, payload: { siteId: site.id, auth: authBySite[site.id] ?? defaultAuth } },
  ]);
}

export function CommanderSetup({ onLaunch }: CommanderSetupProps): React.JSX.Element {
  const [tier, setTier] = useState<CommanderTier>('operator');
  const [seed, setSeed] = useState('commander-6b');
  const [autopilot, setAutopilot] = useState(false);
  const raid = useMemo(() => generateRaid(seed || 'commander-6b', tier), [seed, tier]);
  const intel = useMemo(() => intelBrief(raid), [raid]);
  const minX = Math.min(...raid.sites.map((site) => site.mapPosKm.x));
  const maxX = Math.max(...raid.sites.map((site) => site.mapPosKm.x));
  const minY = Math.min(...raid.sites.map((site) => site.mapPosKm.y));
  const maxY = Math.max(...raid.sites.map((site) => site.mapPosKm.y));
  const [reserveShare, setReserveShare] = useState(0.2);
  const [weights, setWeights] = useState<number[]>([]);
  const roe: RoePosture = 'standard';
  const auth: MissileAuth = 'asset_threat';
  const [roeBySite, setRoeBySite] = useState<Record<string, RoePosture>>({});
  const [authBySite, setAuthBySite] = useState<Record<string, MissileAuth>>({});
  const allocations = (key: 'gunAmmo' | 'missiles'): number[] => {
    const pool = raid.totalPool[key];
    const available = Math.floor(pool * (1 - reserveShare));
    const activeWeights = raid.sites.map((_, i) => weights[i] ?? 1);
    const weightTotal = activeWeights.reduce((sum, value) => sum + value, 0) || raid.sites.length;
    let allocated = 0;
    return raid.sites.map((_, i) => {
      const amount = i === raid.sites.length - 1 ? available - allocated : Math.floor(available * (activeWeights[i] ?? 1) / weightTotal);
      allocated += amount;
      return amount;
    });
  };
  const launch = (): void => {
    const commands = buildCommanderSetupCommands(raid, reserveShare, weights, roe, auth, roeBySite, authBySite);
    onLaunch(raid, commands, autopilot);
  };
  return <main className="commander-page commander-setup">
    <header className="commander-heading"><p>VAJRA / COMMAND STAFF / PRE-RAID</p><h1>Commander planning</h1><span>Allocate the training pool across the theatre before launch.</span></header>
    <section className="commander-panel commander-controls">
      <label>Tier<select value={tier} onChange={(e) => setTier(e.target.value as CommanderTier)}><option value="recruit">Recruit</option><option value="operator">Operator</option><option value="veteran">Veteran</option></select></label>
      <label>Seed<input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
      <label className="commander-check"><input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} /> Autopilot (Heuristic Commander)</label>
    </section>
    <section className="commander-panel"><h2>Intel briefing</h2><div className="commander-map" aria-label="Theatre site map">{raid.sites.map((site) => <article className="commander-map-site" key={site.id} style={{ left: `${15 + (maxX === minX ? 0.5 : (site.mapPosKm.x - minX) / (maxX - minX)) * 70}%`, top: `${20 + (maxY === minY ? 0.5 : (site.mapPosKm.y - minY) / (maxY - minY)) * 60}%` }}><b>{site.id}</b><span>{site.valueUnits} value</span><small>{intel.find((entry) => entry.siteId === site.id)?.threatBand.toUpperCase() ?? 'LOW'} THREAT</small></article>)}</div>
      <div className="commander-site-grid">{raid.sites.map((site) => <div className="commander-site-row" key={site.id}><b>{site.name}</b><span>{site.mapPosKm.x.toFixed(1)}, {site.mapPosKm.y.toFixed(1)} km</span><span>VALUE {site.valueUnits}</span></div>)}</div>
    </section>
    <section className="commander-panel"><h2>Resource allocation</h2><div className="commander-pool-summary">Pool: {raid.totalPool.gunAmmo} gun / {raid.totalPool.missiles} missiles</div>
      <label>Central reserve {Math.round(reserveShare * 100)}%<input aria-label="Central reserve" type="range" min="0" max="60" value={Math.round(reserveShare * 100)} onChange={(e) => setReserveShare(Number(e.target.value) / 100)} /></label>
      <p>Each resource uses the same site weight split. Unallocated units remain in central reserve.</p>
      <div className="commander-site-grid">{raid.sites.map((site, i) => <div className="commander-site-row" key={site.id}><b>{site.id}</b><span>Gun {allocations('gunAmmo')[i]} · Missile {allocations('missiles')[i]}</span><label>Allocation weight {Math.round((weights[i] ?? 1) * 100)}%<input aria-label={`${site.id} allocation weight`} type="range" min="0" max="300" value={Math.round((weights[i] ?? 1) * 100)} onChange={(e) => setWeights((current) => { const next = raid.sites.map((_, index) => current[index] ?? 1); next[i] = Number(e.target.value) / 100; return next; })} /></label><label>ROE<select value={roeBySite[site.id] ?? roe} onChange={(e) => setRoeBySite((current) => ({...current, [site.id]: e.target.value as RoePosture}))}><option value="tight">Tight</option><option value="standard">Standard</option><option value="free">Free</option></select></label><label>Missile auth<select value={authBySite[site.id] ?? auth} onChange={(e) => setAuthBySite((current) => ({...current, [site.id]: e.target.value as MissileAuth}))}><option value="hold">Hold</option><option value="asset_threat">Asset threat</option><option value="free">Free</option></select></label></div>)}</div>
      <button className="commander-primary" onClick={launch}>LAUNCH RAID</button>
    </section>
  </main>;
}
