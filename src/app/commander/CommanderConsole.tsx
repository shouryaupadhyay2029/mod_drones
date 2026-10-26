import React, { useEffect, useState } from 'react';
import { CommanderCommand, CommanderSession, CommanderView, MissileAuth, RoePosture, heuristicCommander } from '../../sim/index.js';

export interface CommanderConsoleProps { session: CommanderSession; autopilot: boolean; onAutopilotChange: (value: boolean) => void; onComplete: () => void; }
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
  useEffect(() => { if (paused) return; const timer = window.setInterval(run, 50); return () => window.clearInterval(timer); }, [paused, speed, autopilot, session]);
  const send = (command: CommanderCommand): void => { session.enqueue({ ...command, tick: session.tick }); session.step(); setView(session.view()); };
  return <main className="commander-page">
    <header className="commander-heading"><p>VAJRA / COMMAND STAFF / LIVE THEATRE</p><h1>Raid in progress</h1><div className="commander-toolbar"><strong>{String(Math.floor(view.tick / 1200)).padStart(2, '0')}:{String(Math.floor((view.tick % 1200) / 20)).padStart(2, '0')}</strong>{([1,2,4] as const).map((v) => <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{v}x</button>)}<button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button><button aria-pressed={autopilot} onClick={() => onAutopilotChange(!autopilot)}>Autopilot {autopilot ? 'ON' : 'OFF'}</button></div></header>
    <section className="commander-panel"><h2>Theatre map</h2><div className="commander-map commander-live-map">{view.sites.map((site, i) => <button key={site.siteId} className={`commander-map-site status-${site.status}`} style={{ left: `${12 + i * (70 / Math.max(1, view.sites.length - 1))}%`, top: `${48 + (i % 2 ? 18 : -12)}%` }} onClick={() => setSelected(site.siteId)}><b>{site.siteId}</b><span>{site.confirmedInboundCount} inbound</span><small>{site.damagePercent}% damage</small></button>)}{view.pendingTransfers.map((transfer, i) => <div key={`${transfer.toSiteId}-${transfer.item}-${i}`} className="commander-transfer" style={{ left: `${20 + i * 12}%` }}>→ {transfer.toSiteId} · ETA {Math.max(0, transfer.dueTick - view.tick)} ticks</div>)}</div></section>
    <section className="commander-site-grid">{view.sites.map((site) => <article className="commander-panel commander-live-card" key={site.siteId}><header><h2>{site.siteId} / {site.valueUnits} value</h2><span className={`commander-status status-${site.status}`}>{site.status}</span></header><div className="commander-health"><i style={{ width: `${site.damagePercent}%` }} /></div><p>Damage {site.damagePercent}% · Inbound {site.confirmedInboundCount}</p><p>Gun {site.inventory.gunAmmo} · Missile {site.inventory.missiles} · Reserve {view.totalPool.reserve.gunAmmo}/{view.totalPool.reserve.missiles}</p><p>Latest: {site.lastEngagementResult ?? 'No engagement'}</p><label>ROE<select value={session.raid.sites.find((s) => s.id === site.siteId)?.roe ?? 'standard'} onChange={(e) => send({type:'SET_ROE',tick:session.tick,payload:{siteId:site.siteId,roe:e.target.value as RoePosture}})}><option value="tight">Tight</option><option value="standard">Standard</option><option value="free">Free</option></select></label><label>Missile auth<select value={session.raid.sites.find((s) => s.id === site.siteId)?.missileAuth ?? 'hold'} onChange={(e) => send({type:'SET_MISSILE_AUTH',tick:session.tick,payload:{siteId:site.siteId,auth:e.target.value as MissileAuth}})}><option value="hold">Hold</option><option value="asset_threat">Asset threat</option><option value="free">Free</option></select></label><div><button disabled={view.totalPool.reserve.gunAmmo < 5} title={view.totalPool.reserve.gunAmmo < 5 ? 'Reserve has fewer than 5 gun units' : ''} onClick={() => send({type:'RETASK_RESERVE',tick:session.tick,payload:{toSiteId:site.siteId,item:'gunAmmo',amount:5}})}>+5 Gun from reserve</button><button disabled={view.totalPool.reserve.missiles < 1} title={view.totalPool.reserve.missiles < 1 ? 'No missile in reserve' : ''} onClick={() => send({type:'RETASK_RESERVE',tick:session.tick,payload:{toSiteId:site.siteId,item:'missiles',amount:1}})}>+1 Missile from reserve</button></div></article>)}</section>
    {selected && <section className="commander-panel"><header><h2>{selected} · radar preview</h2><button onClick={() => setSelected(null)}>Close</button></header><div className="commander-mini-radar">{view.sites.find((s) => s.siteId === selected)?.operatorView.tracks.map((track) => <span key={track.trackId}>T{track.trackId} · {track.state} · {track.assessedClass ?? 'unclassified'} · {Math.round(track.rangeM)} m</span>)}</div></section>}
  </main>;
}
