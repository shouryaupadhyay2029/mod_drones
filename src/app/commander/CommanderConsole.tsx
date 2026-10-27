import React, { useEffect, useState } from 'react';
import { CommanderCommand, CommanderSession, CommanderSiteView, CommanderView, MissileAuth, RoePosture, heuristicCommander } from '../../sim/index.js';
import { CommanderSplitTitle } from './CommanderPage.js';

export interface CommanderConsoleProps {
  session: CommanderSession;
  autopilot: boolean;
  onAutopilotChange: (value: boolean) => void;
  onComplete: () => void;
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
      <span aria-hidden="true">⊘</span> OFFLINE
    </span>
  );
}

export function CommanderConsole({ session, autopilot, onAutopilotChange, onComplete }: CommanderConsoleProps): React.JSX.Element {
  const [view, setView] = useState<CommanderView>(() => session.view());
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [selected, setSelected] = useState<string | null>(null);

  const run = (): void => {
    for (let i = 0; i < speed && !session.isComplete(); i++) {
      const commands = autopilot ? heuristicCommander(session.view()) : [];
      session.step(commands);
    }
    setView(session.view());
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

  return (
    <main className="commander-page">
      <header className="commander-heading">
        <p className="commander-kicker">
          VAJRA / COMMAND STAFF / LIVE THEATRE{' '}
          <span className="commander-meta-badge">ACTIVE RAID TELEMETRY</span>
        </p>
        <h1 aria-label="Raid in progress">
          <CommanderSplitTitle text="Raid in progress" />
        </h1>
        <div className="commander-toolbar">
          <strong>
            {String(Math.floor(view.tick / 1200)).padStart(2, '0')}:
            {String(Math.floor((view.tick % 1200) / 20)).padStart(2, '0')}
          </strong>
          {([1, 2, 4] as const).map((v) => (
            <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)}>
              {v}x
            </button>
          ))}
          <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
          <button aria-pressed={autopilot} onClick={() => onAutopilotChange(!autopilot)}>
            Autopilot {autopilot ? 'ON' : 'OFF'}
          </button>
        </div>
      </header>

      <section
        className="commander-panel vj-card-cascade"
        style={{ '--card-index': 1 } as React.CSSProperties}
      >
        <h2>Theatre map</h2>
        <div className="commander-map commander-live-map">
          <div className="commander-map-rings" aria-hidden="true" />
          <div className="commander-map-sweep" aria-hidden="true" />
          {view.sites.map((site, i) => (
            <button
              key={site.siteId}
              className={`commander-map-site status-${site.status} link-${site.linkStatus}`}
              style={{
                left: `${12 + i * (70 / Math.max(1, view.sites.length - 1))}%`,
                top: `${48 + (i % 2 ? 18 : -12)}%`,
              }}
              onClick={() => setSelected(site.siteId)}
            >
              <b>{site.siteId}</b>
              <small className={`commander-map-link link-${site.linkStatus}`}>
                {site.linkStatus === 'nominal'
                  ? '● Live'
                  : site.linkStatus === 'degraded'
                  ? `◐ Delay: ${(site.latencyTicks / 20).toFixed(1)}s`
                  : '⊘ OFFLINE · STALE'}
              </small>
              <span>{site.confirmedInboundCount} inbound</span>
              <small>{site.damagePercent}% damage</small>
            </button>
          ))}
          {view.pendingTransfers.map((transfer, i) => (
            <div key={`${transfer.toSiteId}-${transfer.item}-${i}`} className="commander-transfer" style={{ left: `${20 + i * 12}%` }}>
              → {transfer.toSiteId} · ETA {Math.max(0, transfer.dueTick - view.tick)} ticks
            </div>
          ))}
        </div>
      </section>

      {view.pendingCommands.length > 0 && (
        <section className="commander-panel commander-pending-queue" aria-label="Pending command queue">
          <h2>Pending command queue</h2>
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

      <section className="commander-site-grid">
        {view.sites.map((site, idx) => {
          const isOffline = site.linkStatus === 'offline';
          const sitePending = view.pendingCommands.filter((cmd) => cmd.siteId === site.siteId);
          const lastContactSeconds = (site.dataAgeTicks / 20).toFixed(1);

          return (
            <article
              className={`commander-panel commander-live-card vj-card-cascade link-${site.linkStatus}${isOffline ? ' commander-card-offline' : ''}`}
              key={site.siteId}
              style={{ '--card-index': idx + 2 } as React.CSSProperties}
            >
              {isOffline && <div className="commander-stale-watermark">STALE DATA</div>}
              <header>
                <h2>
                  {site.siteId} / {site.valueUnits} value
                </h2>
                <span className={`commander-status status-${site.status}`}>{site.status}</span>
              </header>
              <div className="commander-link-row">{renderLinkBadge(site)}</div>
              {isOffline && <p className="commander-last-contact">Last contact: {lastContactSeconds} seconds ago</p>}
              {site.linkStatus === 'degraded' && (
                <p className="commander-latency-warning">
                  Telemetry & command latency: {(site.latencyTicks / 20).toFixed(1)}s ({site.latencyTicks} ticks)
                </p>
              )}
              <div className="commander-health">
                <i style={{ width: `${site.damagePercent}%` }} />
              </div>
              <p>
                Damage {site.damagePercent}% · Inbound {site.confirmedInboundCount}
              </p>
              <p>
                Gun {site.inventory.gunAmmo} · Missile {site.inventory.missiles} · Reserve {view.totalPool.reserve.gunAmmo}/
                {view.totalPool.reserve.missiles}
              </p>
              <p>Latest: {site.lastEngagementResult ?? 'No engagement'}</p>

              {sitePending.length > 0 && (
                <div className="commander-site-transmitting">
                  {sitePending.map((cmd, cmdIdx) => (
                    <small key={`${cmd.type}-${cmd.dispatchTick}-${cmdIdx}`}>
                      Transmitting... {cmd.type} ({((Math.max(0, cmd.deliveryTick - view.tick)) / 20).toFixed(1)}s)
                    </small>
                  ))}
                </div>
              )}

              <label>
                ROE
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
                  <option value="tight">Tight</option>
                  <option value="standard">Standard</option>
                  <option value="free">Free</option>
                </select>
              </label>
              <label>
                Missile auth
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
                  <option value="hold">Hold</option>
                  <option value="asset_threat">Asset threat</option>
                  <option value="free">Free</option>
                </select>
              </label>
              <div>
                <button
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
              </div>
            </article>
          );
        })}
      </section>

      {selected && (
        <section className="commander-panel">
          <header>
            <h2>{selected} · radar preview</h2>
            <button onClick={() => setSelected(null)}>Close</button>
          </header>
          <div className="commander-mini-radar">
            {view.sites
              .find((s) => s.siteId === selected)
              ?.operatorView.tracks.map((track) => (
                <span key={track.trackId}>
                  T{track.trackId} · {track.state} · {track.assessedClass ?? 'unclassified'} · {Math.round(track.rangeM)} m
                </span>
              ))}
          </div>
        </section>
      )}
    </main>
  );
}
