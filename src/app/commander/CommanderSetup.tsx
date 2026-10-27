import React, { useMemo, useState } from 'react';
import { CommanderCommand, CommanderTier, MissileAuth, RaidPlan, RoePosture, generateRaid, intelBrief } from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';
import { CommanderBriefing } from './CommanderBriefing.js';

export interface CommanderSetupProps {
  onLaunch: (raid: RaidPlan, commands: CommanderCommand[], autopilot: boolean) => void;
}

export function buildCommanderSetupCommands(
  raid: RaidPlan,
  reserveShare: number,
  weights: number[],
  defaultRoe: RoePosture,
  defaultAuth: MissileAuth,
  roeBySite: Record<string, RoePosture>,
  authBySite: Record<string, MissileAuth>,
): CommanderCommand[] {
  const allocation = (key: 'gunAmmo' | 'missiles'): number[] => {
    const budget = Math.floor(raid.totalPool[key] * (1 - reserveShare));
    const siteWeights = raid.sites.map((_, i) => weights[i] ?? 1);
    const totalWeight = siteWeights.reduce((sum, value) => sum + value, 0) || raid.sites.length;
    let used = 0;
    return raid.sites.map((_, i) => {
      const units =
        i === raid.sites.length - 1
          ? budget - used
          : Math.floor((budget * (siteWeights[i] ?? 1)) / totalWeight);
      used += units;
      return units;
    });
  };
  const guns = allocation('gunAmmo');
  const missiles = allocation('missiles');
  return raid.sites.flatMap((site, i) => [
    {
      type: 'ALLOCATE' as const,
      tick: 0,
      payload: { siteId: site.id, gunAmmo: guns[i] ?? 0, missiles: missiles[i] ?? 0 },
    },
    {
      type: 'SET_ROE' as const,
      tick: 0,
      payload: { siteId: site.id, roe: roeBySite[site.id] ?? defaultRoe },
    },
    {
      type: 'SET_MISSILE_AUTH' as const,
      tick: 0,
      payload: { siteId: site.id, auth: authBySite[site.id] ?? defaultAuth },
    },
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
  const [showBriefing, setShowBriefing] = useState(true);

  const allocations = (key: 'gunAmmo' | 'missiles'): number[] => {
    const pool = raid.totalPool[key];
    const available = Math.floor(pool * (1 - reserveShare));
    const activeWeights = raid.sites.map((_, i) => weights[i] ?? 1);
    const weightTotal = activeWeights.reduce((sum, value) => sum + value, 0) || raid.sites.length;
    let allocated = 0;
    return raid.sites.map((_, i) => {
      const amount =
        i === raid.sites.length - 1
          ? available - allocated
          : Math.floor((available * (activeWeights[i] ?? 1)) / weightTotal);
      allocated += amount;
      return amount;
    });
  };

  const launch = (): void => {
    const commands = buildCommanderSetupCommands(
      raid,
      reserveShare,
      weights,
      roe,
      auth,
      roeBySite,
      authBySite,
    );
    onLaunch(raid, commands, autopilot);
  };

  return (
    <main className="commander-page commander-setup">
      {showBriefing && <CommanderBriefing onClose={() => setShowBriefing(false)} />}
      <header className="commander-heading">
        <div className="commander-heading-left">
          <p className="commander-kicker">
            VAJRA <span className="kicker-sep">/</span> COMMAND STAFF <span className="kicker-sep">/</span> PRE-RAID
          </p>
          <h1 className="commander-title-stack" aria-label="Commander planning">
            <span className="commander-title-line-mask">
              <span className="commander-title-main anim-title-main">Commander</span>
            </span>
            <span className="commander-title-line-mask">
              <span className="commander-title-sub anim-title-sub">planning</span>
            </span>
          </h1>
          <p className="commander-subtitle">
            <span className="commander-bullet">•</span> Allocate the training pool across the{' '}
            <span className="u-accent">theatre</span> before{' '}
            <span className="u-accent">launch.</span>
          </p>
        </div>
        <div className="commander-heading-right">
          <div className="commander-theatre-badge">
            <span className="badge-tag">THEATRE ALLOCATION</span>
            <span className="badge-code">// 43R-TH</span>
          </div>
        </div>
      </header>

      <section className="commander-controls-bar" aria-label="Simulation configuration">
        <div className="commander-control-field">
          <label htmlFor="tier-select">TIER</label>
          <div className="commander-select-wrap">
            <select
              id="tier-select"
              value={tier}
              onChange={(e) => setTier(e.target.value as CommanderTier)}
            >
              <option value="recruit">Recruit</option>
              <option value="operator">Operator</option>
              <option value="veteran">Veteran</option>
            </select>
          </div>
        </div>
        <div className="commander-control-field">
          <label htmlFor="seed-input">SEED</label>
          <div className="commander-input-wrap">
            <input
              id="seed-input"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </div>
        </div>
        <div className="commander-controls-divider" aria-hidden="true" />
        <label className="commander-check">
          <input
            type="checkbox"
            checked={autopilot}
            onChange={(e) => setAutopilot(e.target.checked)}
          />{' '}
          AUTOPILOT <span className="commander-check-sub">(HEURISTIC COMMANDER)</span>
        </label>
      </section>

      <section className="commander-intel-section" aria-label="Intel briefing">
        <div className="commander-section-header">
          <div className="commander-panel-title-wrap">
            <span className="commander-panel-stripe" aria-hidden="true" />
            <h2>INTEL BRIEFING</h2>
          </div>
          <div className="commander-panel-radar-meta">
            <span>GRID 43R-TH</span>
            <span className="commander-meta-sep">|</span>
            <span>RADAR 100km</span>
            <span className="commander-radar-dot" aria-hidden="true" />
          </div>
        </div>

        <div className="commander-intel-body">
          {/* Left Threat Sidebar */}
          <aside className="commander-threat-sidebar">
            <div>
              <span className="commander-threat-heading">THREAT LEVEL</span>
              <ul className="commander-threat-list">
                <li className="threat-item threat-high">
                  <span className="threat-dot" />
                  <div className="threat-meta">
                    <strong>HIGH</strong>
                    <small>{intel.filter((e) => e.threatBand.toLowerCase() === 'high').length} SITE</small>
                  </div>
                </li>
                <li className="threat-item threat-med">
                  <span className="threat-dot" />
                  <div className="threat-meta">
                    <strong>MEDIUM</strong>
                    <small>{intel.filter((e) => e.threatBand.toLowerCase() === 'medium').length} SITE</small>
                  </div>
                </li>
                <li className="threat-item threat-low">
                  <span className="threat-dot" />
                  <div className="threat-meta">
                    <strong>LOW</strong>
                    <small>{intel.filter((e) => e.threatBand.toLowerCase() === 'low').length} SITE</small>
                  </div>
                </li>
              </ul>
            </div>

            <div className="commander-threat-total">
              <span className="threat-total-label">TOTAL ASSETS</span>
              <div className="threat-total-val">
                <strong>{raid.sites.length}</strong>
                <small>SITES</small>
              </div>
            </div>
          </aside>

          {/* Map Surface over High-Resolution Topographic Terrain */}
          <div className="commander-map" aria-label="Theatre site map">
            <div className="commander-map-terrain-overlay" aria-hidden="true" />
            <div className="commander-map-rings" aria-hidden="true" />
            <div className="commander-map-center-cross" aria-hidden="true" />
            <div className="commander-map-sweep-beam" aria-hidden="true" />

            {raid.sites.map((site, idx) => {
              const threatBand = (
                intel.find((entry) => entry.siteId === site.id)?.threatBand ?? 'low'
              ).toLowerCase();
              return (
                <div
                  className={`commander-map-node threat-${threatBand}`}
                  key={site.id}
                  style={{
                    left: `${20 + (maxX === minX ? 0.5 : (site.mapPosKm.x - minX) / (maxX - minX)) * 62}%`,
                    top: `${22 + (maxY === minY ? 0.5 : (site.mapPosKm.y - minY) / (maxY - minY)) * 52}%`,
                    animationDelay: `${0.75 + idx * 0.2}s`,
                  }}
                >
                  <div className="commander-node-ping" />
                  <span className="commander-node-point" />
                  <article className="commander-node-card">
                    <b>{site.id}</b>
                    <span className="node-card-val">{site.valueUnits} value</span>
                    <small className="node-card-threat">{threatBand.toUpperCase()} THREAT</small>
                  </article>
                </div>
              );
            })}
          </div>
        </div>

        {/* Embedded Horizontal Site Dockets */}
        <div className="commander-site-dockets">
          {raid.sites.map((site, sIdx) => {
            const threatBand = (
              intel.find((entry) => entry.siteId === site.id)?.threatBand ?? 'low'
            ).toLowerCase();
            return (
              <div
                className={`commander-site-docket accent-${threatBand}`}
                key={site.id}
                style={{ animationDelay: `${0.85 + sIdx * 0.14}s` }}
              >
                <div className="commander-site-name-wrap">
                  <span className={`commander-threat-dot threat-${threatBand}`} aria-hidden="true" />
                  <b>{site.name}</b>
                </div>
                <span className="commander-site-coord">
                  {site.mapPosKm.x.toFixed(1)}, {site.mapPosKm.y.toFixed(1)} km
                </span>
                <span className="commander-site-value">
                  VALUE <strong>{site.valueUnits}</strong>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="commander-alloc-section" aria-label="Resource allocation">
        <div className="commander-section-header">
          <div className="commander-panel-title-wrap">
            <span className="commander-panel-stripe" aria-hidden="true" />
            <h2>RESOURCE ALLOCATION</h2>
          </div>
        </div>

        <div className="commander-pool-kpis">
          <div className="commander-pool-kpi">
            <span className="commander-kpi-label">GUN AMMUNITION POOL</span>
            <div className="commander-kpi-num">
              <strong>{raid.totalPool.gunAmmo.toLocaleString()}</strong>
              <small>RDS</small>
            </div>
            <div className="commander-kpi-sub">
              <span>Reserve: {Math.floor(raid.totalPool.gunAmmo * reserveShare).toLocaleString()}</span>
              <span>Deployed: {(raid.totalPool.gunAmmo - Math.floor(raid.totalPool.gunAmmo * reserveShare)).toLocaleString()}</span>
            </div>
          </div>
          <div className="commander-pool-kpi">
            <span className="commander-kpi-label">INTERCEPTOR MISSILE POOL</span>
            <div className="commander-kpi-num">
              <strong>{raid.totalPool.missiles}</strong>
              <small>MSL</small>
            </div>
            <div className="commander-kpi-sub">
              <span>Reserve: {Math.floor(raid.totalPool.missiles * reserveShare)}</span>
              <span>Deployed: {raid.totalPool.missiles - Math.floor(raid.totalPool.missiles * reserveShare)}</span>
            </div>
          </div>
        </div>

        <div className="commander-reserve-control">
          <div className="commander-reserve-header">
            <label htmlFor="central-reserve-slider">
              <span>CENTRAL RESERVE COMMITMENT</span>
              <strong>{Math.round(reserveShare * 100)}%</strong>
            </label>
            <span className="commander-reserve-meta">
              Held back at HQ for emergency rush allocation
            </span>
          </div>
          <div className="commander-reserve-slider-wrap">
            <input
              id="central-reserve-slider"
              aria-label="Central reserve"
              type="range"
              min="0"
              max="60"
              value={Math.round(reserveShare * 100)}
              onChange={(e) => setReserveShare(Number(e.target.value) / 100)}
            />
          </div>
        </div>

        <p className="commander-alloc-footnote">
          Each resource uses the same site weight split. Unallocated units remain in central reserve.
        </p>

        <div className="commander-alloc-table">
          {raid.sites.map((site, i) => (
            <div
              className="commander-alloc-row"
              key={site.id}
              style={{ animationDelay: `${1.25 + i * 0.12}s` }}
            >
              <div className="alloc-col-id">
                <b>{site.id}</b>
              </div>
              <div className="alloc-col-ammo">
                <span>Gun {allocations('gunAmmo')[i]}</span>
                <span className="alloc-ammo-sep">·</span>
                <span>Missile {allocations('missiles')[i]}</span>
              </div>
              <div className="alloc-col-weight">
                <label>
                  <span>WEIGHT <strong>{Math.round((weights[i] ?? 1) * 100)}%</strong></span>
                  <input
                    aria-label={`${site.id} allocation weight`}
                    type="range"
                    min="0"
                    max="300"
                    value={Math.round((weights[i] ?? 1) * 100)}
                    onChange={(e) =>
                      setWeights((current) => {
                        const next = raid.sites.map((_, index) => current[index] ?? 1);
                        next[i] = Number(e.target.value) / 100;
                        return next;
                      })
                    }
                  />
                </label>
              </div>
              <div className="alloc-col-roe">
                <label>
                  <span>ROE</span>
                  <select
                    value={roeBySite[site.id] ?? roe}
                    onChange={(e) =>
                      setRoeBySite((current) => ({
                        ...current,
                        [site.id]: e.target.value as RoePosture,
                      }))
                    }
                  >
                    <option value="tight">Tight</option>
                    <option value="standard">Standard</option>
                    <option value="free">Free</option>
                  </select>
                </label>
              </div>
              <div className="alloc-col-auth">
                <label>
                  <span>MISSILE AUTH</span>
                  <select
                    value={authBySite[site.id] ?? auth}
                    onChange={(e) =>
                      setAuthBySite((current) => ({
                        ...current,
                        [site.id]: e.target.value as MissileAuth,
                      }))
                    }
                  >
                    <option value="hold">Hold</option>
                    <option value="asset_threat">Asset threat</option>
                    <option value="free">Free</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="commander-launch-wrap">
          <button className="commander-primary" onClick={launch}>
            <TextRoll center stagger={0.02}>
              LAUNCH RAID
            </TextRoll>
          </button>
        </div>
      </section>
    </main>
  );
}
