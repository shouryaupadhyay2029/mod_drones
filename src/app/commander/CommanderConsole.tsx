import React, { useEffect, useRef, useState } from 'react';
import { CommanderCommand, CommanderSession, CommanderSiteView, CommanderView, MissileAuth, RoePosture, heuristicCommander } from '../../sim/index.js';
import { RadarScope } from '../console/RadarScope.js';
import { CommanderSplitTitle } from './CommanderPage.js';

export interface CommanderConsoleProps {
  session: CommanderSession;
  autopilot: boolean;
  onAutopilotChange: (value: boolean) => void;
  onComplete: () => void;
}

interface CombatLogEntry {
  id: string;
  time: string;
  text: string;
  type: 'detect' | 'ciws' | 'jam' | 'kill' | 'warn' | 'info';
}

function renderLinkBadge(site: CommanderSiteView): React.JSX.Element {
  if (site.linkStatus === 'nominal') {
    return (
      <span className="commander-link-indicator link-nominal" title="Comms link nominal">
        <span aria-hidden="true">●</span> NOMINAL · Live data
      </span>
    );
  }
  if (site.linkStatus === 'degraded') {
    const delaySec = (site.latencyTicks / 20).toFixed(1);
    return (
      <span className="commander-link-indicator link-degraded" title="Comms link degraded">
        <span aria-hidden="true">◐</span> DEGRADED · Delay: {delaySec}s
      </span>
    );
  }
  return (
    <span className="commander-link-indicator link-offline" title="Comms link offline">
      <span aria-hidden="true">⊘</span> OFFLINE · STALE DATA
    </span>
  );
}

export function CommanderConsole({ session, autopilot, onAutopilotChange, onComplete }: CommanderConsoleProps): React.JSX.Element {
  const [view, setView] = useState<CommanderView>(() => session.view());
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [selected, setSelected] = useState<string | null>(null);

  // Tactical Radar & Combat Telemetry State
  const [trailHistory] = useState(() => new Map<number, Array<{ x: number; y: number; z: number }>>());
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([
    { id: 'init', time: '00:00', text: 'THEATRE C2 DEFENSE GRID SYNCHRONIZED // RADAR SURVEILLANCE ACTIVE', type: 'info' },
  ]);

  const prevTracksRef = useRef<Set<number>>(new Set());
  const prevEngagementRef = useRef<Record<string, string | undefined>>({});

  const raidSites = session.raid.sites;
  const minX = Math.min(...raidSites.map((s) => s.mapPosKm.x));
  const maxX = Math.max(...raidSites.map((s) => s.mapPosKm.x));
  const minY = Math.min(...raidSites.map((s) => s.mapPosKm.y));
  const maxY = Math.max(...raidSites.map((s) => s.mapPosKm.y));

  const run = (): void => {
    for (let i = 0; i < speed && !session.isComplete(); i++) {
      const commands = autopilot ? heuristicCommander(session.view()) : [];
      session.step(commands);
    }
    const nextView = session.view();
    setView(nextView);

    const currentTime = `${String(Math.floor(nextView.tick / 1200)).padStart(2, '0')}:${String(Math.floor((nextView.tick % 1200) / 20)).padStart(2, '0')}`;

    // Accumulate combat log & track history
    for (const site of nextView.sites) {
      // 1. Trail history and new threat acquisition
      for (const track of site.operatorView.tracks) {
        const history = trailHistory.get(track.trackId) ?? [];
        history.push({ ...track.estimatedPosition });
        if (history.length > 25) history.shift();
        trailHistory.set(track.trackId, history);

        if (!prevTracksRef.current.has(track.trackId)) {
          prevTracksRef.current.add(track.trackId);
          setCombatLog((prev) => [
            ...prev.slice(-14),
            {
              id: `${nextView.tick}-${track.trackId}-detect`,
              time: currentTime,
              text: `${site.siteId} RADAR: ACQUIRED HOSTILE TRACK T${track.trackId} (R: ${Math.round(track.rangeM)}m, ALT: ${Math.round(track.altitudeM)}m)`,
              type: 'detect',
            },
          ]);
        }

        // Terminal lock alert
        if (track.terminal_lock) {
          const lockKey = `${track.trackId}-lock`;
          if (!prevTracksRef.current.has(Number(lockKey))) {
            setCombatLog((prev) => [
              ...prev.slice(-14),
              {
                id: `${nextView.tick}-${track.trackId}-lock`,
                time: currentTime,
                text: `${site.siteId} ALERT: TRACK T${track.trackId} ACTIVATED OPTICAL TERMINAL LOCK! RF IMMUNE -> KINETIC CIWS ONLY!`,
                type: 'warn',
              },
            ]);
          }
        }
      }

      // 2. Engagement events
      const engResult = site.lastEngagementResult;
      if (engResult && engResult !== prevEngagementRef.current[site.siteId]) {
        prevEngagementRef.current[site.siteId] = engResult;
        const isKill = engResult.toLowerCase().includes('hit') || engResult.toLowerCase().includes('destroy');
        setCombatLog((prev) => [
          ...prev.slice(-14),
          {
            id: `${nextView.tick}-${site.siteId}-engage`,
            time: currentTime,
            text: `${site.siteId} ENGAGEMENT: ${engResult.toUpperCase()}`,
            type: isKill ? 'kill' : 'ciws',
          },
        ]);
      }
    }

    if (session.isComplete()) onComplete();
  };

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(run, 50);
    return () => window.clearInterval(timer);
  }, [paused, speed, autopilot, session]);

  const send = (command: CommanderCommand): void => {
    session.enqueue({ ...command, tick: session.tick });
    session.step();
    setView(session.view());
  };

  const selectedSite = selected ? view.sites.find((s) => s.siteId === selected) : null;

  return (
    <main className="commander-page commander-live-console">
      <header className="commander-heading">
        <div className="commander-heading-left">
          <p className="commander-kicker">
            VAJRA <span className="kicker-sep">/</span> COMMAND STAFF <span className="kicker-sep">/</span> LIVE THEATRE{' '}
            <span className="commander-meta-badge">SYNCHRONIZED AIRSPACE TELEMETRY</span>
          </p>
          <h1 aria-label="Raid in progress">
            <CommanderSplitTitle text="Raid in progress" />
          </h1>
        </div>
        <div className="commander-toolbar">
          <div className="commander-time-clock">
            <span className="clock-label">MET:</span>
            <strong>
              {String(Math.floor(view.tick / 1200)).padStart(2, '0')}:
              {String(Math.floor((view.tick % 1200) / 20)).padStart(2, '0')}
            </strong>
          </div>
          <div className="commander-speed-group" aria-label="Simulation speed">
            {([1, 2, 4] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`commander-speed-btn ${speed === v ? 'is-active' : ''}`}
                aria-pressed={speed === v}
                onClick={() => setSpeed(v)}
              >
                {v}x
              </button>
            ))}
          </div>
          <button
            type="button"
            className="commander-pause-btn"
            onClick={() => setPaused(!paused)}
          >
            {paused ? '▶ RESUME' : '❚❚ PAUSE'}
          </button>
          <button
            type="button"
            className={`commander-autopilot-btn ${autopilot ? 'is-active' : ''}`}
            aria-pressed={autopilot}
            onClick={() => onAutopilotChange(!autopilot)}
          >
            <span className="autopilot-dot" />
            AUTOPILOT {autopilot ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      {/* Main Theatre Topographic Live Radar Map */}
      <section className="commander-panel commander-live-map-section vj-card-cascade" style={{ '--card-index': 1 } as React.CSSProperties}>
        <div className="commander-section-header">
          <div className="commander-panel-title-wrap">
            <span className="commander-panel-stripe" aria-hidden="true" />
            <h2>THEATRE RADAR TELEMETRY & TACTICAL TRACKING</h2>
          </div>
          <div className="commander-panel-radar-meta">
            <span>GRID 43R-TH</span>
            <span className="commander-meta-sep">|</span>
            <span>AIRSPACE MONITORING</span>
            <span className="commander-radar-dot" aria-hidden="true" />
          </div>
        </div>

        <div className="commander-map commander-live-map" aria-label="Live tactical theatre map">
          <div className="commander-map-terrain-overlay" aria-hidden="true" />
          <div className="commander-map-rings" aria-hidden="true" />
          <div className="commander-map-center-cross" aria-hidden="true" />
          <div className="commander-map-sweep-beam" aria-hidden="true" />

          {/* Render each site and its live drone radar tracks */}
          {view.sites.map((site) => {
            const plan = raidSites.find((p) => p.id === site.siteId);
            const siteX = plan ? (maxX === minX ? 50 : 20 + ((plan.mapPosKm.x - minX) / (maxX - minX)) * 60) : 50;
            const siteY = plan ? (maxY === minY ? 50 : 22 + ((plan.mapPosKm.y - minY) / (maxY - minY)) * 54) : 50;
            const isFiring = site.operatorView.effectors.gun.busyUntilTick > view.tick;
            const isJamming = site.operatorView.effectors.jammer.busyUntilTick > view.tick;
            const hasTracks = site.operatorView.tracks.length > 0;
            const threatBand = (site.threatBand || 'low').toLowerCase();

            return (
              <React.Fragment key={site.siteId}>
                {/* Tactical Radar Detection Bubble */}
                <div
                  className={`commander-site-dome ${hasTracks ? 'has-inbound' : ''}`}
                  style={{ left: `${siteX}%`, top: `${siteY}%` }}
                >
                  <div className="site-dome-ring ring-outer" />
                  <div className="site-dome-ring ring-inner" />
                  <div
                    className="site-dome-sweep"
                    style={{ transform: `rotate(${site.operatorView.radarSweepDeg}deg)` }}
                  />
                </div>

                {/* Live Hostile Drone Blips with Range & Trajectory Vector */}
                {site.operatorView.tracks.map((track) => {
                  const dx = (track.estimatedPosition.x / 6000) * 85;
                  const dy = (-track.estimatedPosition.y / 6000) * 85;
                  const droneLeft = `calc(${siteX}% + ${dx}px)`;
                  const droneTop = `calc(${siteY}% + ${dy}px)`;

                  return (
                    <div
                      key={`drone-${site.siteId}-${track.trackId}`}
                      className={`commander-map-drone ${track.terminal_lock ? 'is-locked' : ''}`}
                      style={{ left: droneLeft, top: droneTop }}
                      title={`Target T${track.trackId} · Range: ${Math.round(track.rangeM)}m · Alt: ${Math.round(track.altitudeM)}m`}
                    >
                      <svg className="drone-vector-line" aria-hidden="true">
                        <line x1="0" y1="0" x2={-dx} y2={-dy} />
                      </svg>
                      <span className="drone-threat-symbol">◆</span>
                      <div className="drone-hud-tag">
                        <b>T{track.trackId}</b>
                        <small>{Math.round(track.rangeM)}m</small>
                        {track.terminal_lock && <span className="drone-lock-pill">OPTICAL LOCK</span>}
                      </div>
                    </div>
                  );
                })}

                {/* Gun Tracer & Jammer Cone Visuals */}
                {isFiring && (
                  <div className="commander-tracer-burst" style={{ left: `${siteX}%`, top: `${siteY}%` }}>
                    <span className="tracer-flash" />
                    <span className="tracer-tag">35MM CIWS FIRING</span>
                  </div>
                )}
                {isJamming && (
                  <div className="commander-jammer-cone" style={{ left: `${siteX}%`, top: `${siteY}%` }}>
                    <span className="jammer-wave" />
                    <span className="jammer-tag">RF JAMMER ACTIVE</span>
                  </div>
                )}

                {/* Site Node HUD Anchor */}
                <div
                  className={`commander-live-site-node accent-${threatBand} status-${site.status}`}
                  style={{ left: `${siteX}%`, top: `${siteY}%` }}
                >
                  <div className="site-node-ping" />
                  <button
                    type="button"
                    className="site-node-card-btn"
                    onClick={() => setSelected(site.siteId)}
                    title="Click to inspect live radar PPI scope"
                  >
                    <div className="site-card-top">
                      <span className={`site-status-dot status-${site.status}`} />
                      <b>{site.siteId}</b>
                      <small className="site-link-badge">
                        {site.linkStatus === 'nominal' ? 'LIVE' : site.linkStatus === 'degraded' ? `${(site.latencyTicks / 20).toFixed(1)}s` : 'OFFLINE'}
                      </small>
                    </div>
                    <div className="site-card-body">
                      <span className={`site-threat-metric ${hasTracks ? 'is-hostile' : 'is-clear'}`}>
                        {hasTracks ? `▲ ${site.operatorView.tracks.length} INBOUND` : '● AIRSPACE CLEAR'}
                      </span>
                      <span className="site-damage-metric">DMG: {site.damagePercent}%</span>
                    </div>
                    <span className="site-card-cta">INSPECT RADAR ↗</span>
                  </button>
                </div>
              </React.Fragment>
            );
          })}

          {/* Pending Reserve Transfers across the map */}
          {view.pendingTransfers.map((transfer, i) => (
            <div key={`${transfer.toSiteId}-${transfer.item}-${i}`} className="commander-transfer" style={{ left: `${20 + i * 15}%` }}>
              <span className="transfer-icon">✈</span> DISPATCHING {transfer.item === 'gunAmmo' ? 'GUN AMMO' : 'MISSILE'} TO <b>{transfer.toSiteId}</b> · ETA {Math.max(0, transfer.dueTick - view.tick)}t
            </div>
          ))}
        </div>

        {/* Real-Time Combat Event Ticker */}
        <div className="commander-combat-ticker" aria-label="Combat event telemetry">
          <div className="ticker-header">
            <span className="ticker-pulse" />
            <span>THEATRE COMBAT TELEMETRY // REAL-TIME INTERCEPT LEDGER</span>
          </div>
          <div className="ticker-list">
            {combatLog.slice(-6).map((log) => (
              <div key={log.id} className={`ticker-item type-${log.type}`}>
                <span className="ticker-time">[{log.time}]</span>
                <span className="ticker-text">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pending Transmission Command Queue */}
      {view.pendingCommands.length > 0 && (
        <section className="commander-panel commander-pending-queue" aria-label="Pending command queue">
          <h2>Pending command queue (Radio link transmitting)</h2>
          <div className="commander-pending-list">
            {view.pendingCommands.map((cmd, idx) => (
              <div className="commander-transmitting-row" key={`${cmd.siteId}-${cmd.type}-${cmd.dispatchTick}-${idx}`}>
                <span className="commander-transmitting-pill">Transmitting...</span>
                <span>
                  {cmd.type} → <b>{cmd.siteId}</b>
                </span>
                <span>
                  Delivering at T+{cmd.deliveryTick} ({((Math.max(0, cmd.deliveryTick - view.tick)) / 20).toFixed(1)}s remaining)
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tactile Rack-Mounted Sector Cards */}
      <section className="commander-site-grid" aria-label="Site operations">
        {view.sites.map((site, idx) => {
          const isOffline = site.linkStatus === 'offline';
          const sitePending = view.pendingCommands.filter((cmd) => cmd.siteId === site.siteId);
          const lastContactSeconds = (site.dataAgeTicks / 20).toFixed(1);
          const hasInbound = site.operatorView.tracks.length > 0;

          return (
            <article
              className={`commander-panel commander-live-card vj-card-cascade link-${site.linkStatus}${isOffline ? ' commander-card-offline' : ''}`}
              key={site.siteId}
              style={{ '--card-index': idx + 2 } as React.CSSProperties}
            >
              {isOffline && <div className="commander-stale-watermark">STALE DATA // COMMS OFFLINE</div>}
              <header className="commander-live-card-header">
                <div>
                  <h2>
                    {site.siteId} <span className="site-card-subval">/ {site.valueUnits} ASSET VALUE</span>
                  </h2>
                </div>
                <span className={`commander-status status-${site.status}`}>{site.status.toUpperCase()}</span>
              </header>

              <div className="commander-link-row">{renderLinkBadge(site)}</div>

              {isOffline && <p className="commander-last-contact">Last contact: {lastContactSeconds} seconds ago</p>}
              {site.linkStatus === 'degraded' && (
                <p className="commander-latency-warning">
                  Telemetry & command latency: {(site.latencyTicks / 20).toFixed(1)}s ({site.latencyTicks} ticks)
                </p>
              )}

              {/* Damage & Threat Overview */}
              <div className="commander-site-stats-row">
                <div className={`commander-threat-chip ${hasInbound ? 'is-danger' : 'is-secure'}`}>
                  {hasInbound ? `▲ ${site.operatorView.tracks.length} INBOUND HOSTILE` : '● AIRSPACE CLEAR'}
                </div>
                <div className="commander-damage-readout">
                  DAMAGE: <b>{site.damagePercent}%</b>
                </div>
              </div>

              <div className="commander-health">
                <i style={{ width: `${site.damagePercent}%` }} />
              </div>

              {/* Ammo Stock Chips */}
              <div className="commander-card-ammo-chips">
                <div className="card-ammo-chip">
                  <span className="chip-tag">GUN AMMO</span>
                  <strong className="chip-num">{site.inventory.gunAmmo}</strong>
                  <small>RDS</small>
                </div>
                <div className="card-ammo-chip">
                  <span className="chip-tag">INTERCEPTOR</span>
                  <strong className="chip-num">{site.inventory.missiles}</strong>
                  <small>MSL</small>
                </div>
                <div className="card-ammo-chip reserve-chip">
                  <span className="chip-tag">HQ RESERVE</span>
                  <strong className="chip-num">{view.totalPool.reserve.gunAmmo}/{view.totalPool.reserve.missiles}</strong>
                </div>
              </div>

              <p className="commander-latest-engagement">
                <span>LATEST REPORT:</span> <b>{site.lastEngagementResult ?? 'No contact engaged'}</b>
              </p>

              {sitePending.length > 0 && (
                <div className="commander-site-transmitting">
                  {sitePending.map((cmd, cmdIdx) => (
                    <small key={`${cmd.type}-${cmd.dispatchTick}-${cmdIdx}`}>
                      Transmitting... {cmd.type} ({((Math.max(0, cmd.deliveryTick - view.tick)) / 20).toFixed(1)}s)
                    </small>
                  ))}
                </div>
              )}

              {/* Command Controls */}
              <div className="commander-card-controls">
                <label>
                  <span>ROE</span>
                  <select
                    disabled={isOffline}
                    value={session.raid.sites.find((s) => s.id === site.siteId)?.roe ?? 'standard'}
                    onChange={(e) =>
                      send({
                        type: 'SET_ROE',
                        tick: session.tick,
                        payload: { siteId: site.siteId, roe: e.target.value as RoePosture },
                      })
                    }
                  >
                    <option value="tight">Tight (Strict Confirm)</option>
                    <option value="standard">Standard (Balanced)</option>
                    <option value="free">Free (Autonomous)</option>
                  </select>
                </label>
                <label>
                  <span>Missile auth</span>
                  <select
                    disabled={isOffline}
                    value={session.raid.sites.find((s) => s.id === site.siteId)?.missileAuth ?? 'hold'}
                    onChange={(e) =>
                      send({
                        type: 'SET_MISSILE_AUTH',
                        tick: session.tick,
                        payload: { siteId: site.siteId, auth: e.target.value as MissileAuth },
                      })
                    }
                  >
                    <option value="hold">Hold (Locked)</option>
                    <option value="asset_threat">Asset Threat (Terminal)</option>
                    <option value="free">Free (Full Air Defense)</option>
                  </select>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="commander-card-actions">
                <button
                  type="button"
                  className="card-action-btn"
                  disabled={isOffline || view.totalPool.reserve.gunAmmo < 5}
                  title={
                    isOffline
                      ? 'Site link is offline'
                      : view.totalPool.reserve.gunAmmo < 5
                      ? 'Reserve has fewer than 5 gun units'
                      : ''
                  }
                  onClick={() =>
                    send({
                      type: 'RETASK_RESERVE',
                      tick: session.tick,
                      payload: { toSiteId: site.siteId, item: 'gunAmmo', amount: 5 },
                    })
                  }
                >
                  +5 Gun from reserve
                </button>
                <button
                  type="button"
                  className="card-action-btn"
                  disabled={isOffline || view.totalPool.reserve.missiles < 1}
                  title={
                    isOffline
                      ? 'Site link is offline'
                      : view.totalPool.reserve.missiles < 1
                      ? 'No missile in reserve'
                      : ''
                  }
                  onClick={() =>
                    send({
                      type: 'RETASK_RESERVE',
                      tick: session.tick,
                      payload: { toSiteId: site.siteId, item: 'missiles', amount: 1 },
                    })
                  }
                >
                  +1 Missile from reserve
                </button>
                <button
                  type="button"
                  className="card-inspect-btn"
                  onClick={() => setSelected(site.siteId)}
                >
                  INSPECT RADAR PPI SCOPE ↗
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {/* Full Graphical Plan Position Indicator (PPI) Radar Scope Modal */}
      {selected && selectedSite && (
        <section className="commander-radar-modal" aria-label="Tactical radar display">
          <div className="commander-radar-modal-backdrop" onClick={() => setSelected(null)} />
          <div className="commander-radar-modal-dialog">
            <header className="radar-modal-header">
              <div className="radar-modal-title">
                <span className="radar-live-dot" />
                <h3>{selectedSite.siteId} // TACTICAL PLAN POSITION INDICATOR (PPI)</h3>
                <span className="radar-modal-badge">{selectedSite.valueUnits} VALUE · {selectedSite.operatorView.tracks.length} INBOUND TRACKS</span>
              </div>
              <div className="radar-modal-actions">
                {view.sites.map((s) => (
                  <button
                    key={s.siteId}
                    type="button"
                    className={`radar-switch-btn ${s.siteId === selected ? 'is-active' : ''}`}
                    onClick={() => setSelected(s.siteId)}
                  >
                    SWITCH TO {s.siteId}
                  </button>
                ))}
                <button
                  type="button"
                  className="radar-modal-close"
                  onClick={() => setSelected(null)}
                  aria-label="Close radar scope"
                >
                  ✕ CLOSE SCOPE
                </button>
              </div>
            </header>
            <div className="radar-modal-canvas-wrap">
              <RadarScope
                view={selectedSite.operatorView}
                trailHistory={trailHistory}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                scenarioId="dense_air_picture"
              />
            </div>
            <footer className="radar-modal-footer">
              <div className="radar-footer-stat">
                <span>AMMUNITION:</span> <b>{selectedSite.inventory.gunAmmo} RDS</b>
              </div>
              <div className="radar-footer-stat">
                <span>MISSILES:</span> <b>{selectedSite.inventory.missiles} MSL</b>
              </div>
              <div className="radar-footer-stat">
                <span>ROE POSTURE:</span> <b>{session.raid.sites.find((s) => s.id === selectedSite.siteId)?.roe.toUpperCase()}</b>
              </div>
              <div className="radar-footer-stat">
                <span>MISSILE AUTH:</span> <b>{session.raid.sites.find((s) => s.id === selectedSite.siteId)?.missileAuth.toUpperCase()}</b>
              </div>
            </footer>
          </div>
        </section>
      )}
    </main>
  );
}