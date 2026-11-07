import React, { useEffect, useRef, useState } from 'react';
import { CommanderCommand, CommanderSession, CommanderSiteView, CommanderView, MissileAuth, RoePosture, heuristicCommander } from '../../sim/index.js';
import { RadarScope } from '../console/RadarScope.js';
import { CommanderSplitTitle } from './CommanderPage.js';
import { playCiwsBurst, playJammer, playRadarBlip, playWarning } from '../audio/synth.js';

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

interface InspectedTrackInfo {
  trackId: number;
  siteId: string;
  rangeM: number;
  altM: number;
  speed: number;
  closingRateMps: number | null;
  rcsBucket: string;
  bearing: number;
  assessedClass: string | null;
  rfSignature: string | null;
  rfStatus: string | null;
  isLocked: boolean;
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

  // Tactical Radar & Combat Telemetry State (keyed per siteId so multi-site track IDs never collide)
  const [trailHistoryBySite] = useState(
    () => new Map<string, Map<number, Array<{ x: number; y: number; z: number }>>>()
  );
  const [emptyTrailMap] = useState(() => new Map<number, Array<{ x: number; y: number; z: number }>>());
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [inspectedTrack, setInspectedTrack] = useState<InspectedTrackInfo | null>(null);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([
    { id: 'init', time: '00:00', text: 'THEATRE C2 DEFENSE GRID SYNCHRONIZED // RADAR SURVEILLANCE ACTIVE', type: 'info' },
  ]);

  const prevTracksRef = useRef<Set<string>>(new Set());
  const prevEngagementRef = useRef<Record<string, string | undefined>>({});
  const prevFiringRef = useRef<Record<string, boolean>>({});
  const prevJammingRef = useRef<Record<string, boolean>>({});

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
      const isFiring = site.operatorView.effectors.gun.busyUntilTick > nextView.tick;
      const isJamming = site.operatorView.effectors.jammer.busyUntilTick > nextView.tick;

      // Audio triggers on effector transitions
      if (isFiring && !prevFiringRef.current[site.siteId]) {
        prevFiringRef.current[site.siteId] = true;
        playCiwsBurst();
      } else if (!isFiring) {
        prevFiringRef.current[site.siteId] = false;
      }

      if (isJamming && !prevJammingRef.current[site.siteId]) {
        prevJammingRef.current[site.siteId] = true;
        playJammer();
      } else if (!isJamming) {
        prevJammingRef.current[site.siteId] = false;
      }

      // 1. Per-site trail history and new contact acquisition
      let siteTrailMap = trailHistoryBySite.get(site.siteId);
      if (!siteTrailMap) {
        siteTrailMap = new Map<number, Array<{ x: number; y: number; z: number }>>();
        trailHistoryBySite.set(site.siteId, siteTrailMap);
      }

      for (const track of site.operatorView.tracks) {
        const history = siteTrailMap.get(track.trackId) ?? [];
        history.push({ ...track.estimatedPosition });
        if (history.length > 25) history.shift();
        siteTrailMap.set(track.trackId, history);

        const detectKey = `${site.siteId}:${track.trackId}`;
        if (!prevTracksRef.current.has(detectKey)) {
          prevTracksRef.current.add(detectKey);
          playRadarBlip();
          setCombatLog((prev) => [
            ...prev.slice(-14),
            {
              id: `${nextView.tick}-${site.siteId}-${track.trackId}-detect`,
              time: currentTime,
              text: `${site.siteId} RADAR: ACQUIRED RADAR CONTACT T${track.trackId} (R: ${Math.round(track.rangeM)}m, ALT: ${Math.round(track.altitudeM)}m)`,
              type: 'detect',
            },
          ]);
        }

        // Terminal lock alert (deduplicated per siteId:trackId)
        if (track.terminal_lock) {
          const lockKey = `${site.siteId}:${track.trackId}:lock`;
          if (!prevTracksRef.current.has(lockKey)) {
            prevTracksRef.current.add(lockKey);
            playWarning();
            setCombatLog((prev) => [
              ...prev.slice(-14),
              {
                id: `${nextView.tick}-${site.siteId}-${track.trackId}-lock`,
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

  // Aggregate theatre telemetry
  const totalInbound = view.sites.reduce((acc, s) => acc + s.operatorView.tracks.length, 0);
  const avgDamage = Math.round(view.sites.reduce((acc, s) => acc + s.damagePercent, 0) / Math.max(1, view.sites.length));

  return (
    <main className="commander-page commander-live-console">
      {/* Tactical C2 Cockpit Header */}
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
            <h2>THEATRE RADAR TELEMETRY &amp; TACTICAL TRACKING</h2>
          </div>
          <div className="commander-panel-radar-meta">
            <span>GRID 43R-TH</span>
            <span className="commander-meta-sep">|</span>
            <span className="theatre-readout-inbound">{totalInbound} ACTIVE THREATS</span>
            <span className="commander-meta-sep">|</span>
            <span className="theatre-readout-dmg">AVG DMG: {avgDamage}%</span>
            <span className="commander-radar-dot" aria-hidden="true" />
          </div>
        </div>

        <div className="commander-map commander-live-map" aria-label="Live tactical theatre map">
          <div className="commander-map-terrain-overlay" aria-hidden="true" />

          {/* Tactical MGRS Coordinate Grid (Replaces arbitrary rings & central sweep) */}
          <svg className="commander-map-tactical-grid" aria-hidden="true">
            <defs>
              <pattern id="mgrs-grid-pattern" width="70" height="70" patternUnits="userSpaceOnUse">
                <path d="M 70 0 L 0 0 0 70" fill="none" stroke="rgba(45, 40, 35, 0.16)" strokeWidth="1" strokeDasharray="3,4" />
                <circle cx="70" cy="70" r="1.5" fill="rgba(45, 40, 35, 0.35)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mgrs-grid-pattern)" />
          </svg>

          {/* Perimeter Coordinate Ticks */}
          <div className="theatre-grid-ticks-top" aria-hidden="true">
            <span>GR 43R-TH 10</span>
            <span>GR 43R-TH 20</span>
            <span>GR 43R-TH 30</span>
            <span>GR 43R-TH 40</span>
            <span>GR 43R-TH 50</span>
          </div>
          <div className="theatre-grid-ticks-left" aria-hidden="true">
            <span>34°16'N</span>
            <span>34°14'N</span>
            <span>34°12'N</span>
            <span>34°10'N</span>
          </div>

          {/* Military True North Compass Rose */}
          <div className="theatre-compass-rose" aria-hidden="true" title="Grid North Alignment">
            <span className="compass-icon">▲</span>
            <span className="compass-text">N · 000°</span>
          </div>

          {/* Tactical Scale Ruler */}
          <div className="theatre-scale-ruler" aria-hidden="true" title="Ground Distance Scale">
            <div className="scale-segments">
              <span className="scale-seg-fill" />
              <span className="scale-seg-open" />
            </div>
            <div className="scale-labels">
              <span>0</span>
              <span>3 KM</span>
              <span>6 KM</span>
            </div>
          </div>

          {/* Sector Boundary Markers */}
          <div className="theatre-sector-zone zone-west" aria-hidden="true">
            <span className="sector-tag">SECTOR 01 // WEST FLANK</span>
          </div>
          <div className="theatre-sector-zone zone-center" aria-hidden="true">
            <span className="sector-tag">SECTOR 02 // CENTRAL PASS</span>
          </div>
          <div className="theatre-sector-zone zone-east" aria-hidden="true">
            <span className="sector-tag">SECTOR 03 // EAST RIDGE</span>
          </div>

          {/* Military Microwave Inter-Site Data Links with Status Telemetry */}
          <svg className="commander-map-datalinks" aria-hidden="true">
            {view.sites.map((s, idx) => {
              if (idx === 0) return null;
              const prevSite = view.sites[idx - 1];
              if (!prevSite) return null;
              const prevPlan = raidSites.find((p) => p.id === prevSite.siteId);
              const currPlan = raidSites.find((p) => p.id === s.siteId);
              const x1 = prevPlan ? (maxX === minX ? 35 : 20 + ((prevPlan.mapPosKm.x - minX) / (maxX - minX)) * 60) : 35;
              const y1 = prevPlan ? (maxY === minY ? 45 : 22 + ((prevPlan.mapPosKm.y - minY) / (maxY - minY)) * 54) : 45;
              const x2 = currPlan ? (maxX === minX ? 65 : 20 + ((currPlan.mapPosKm.x - minX) / (maxX - minX)) * 60) : 65;
              const y2 = currPlan ? (maxY === minY ? 45 : 22 + ((currPlan.mapPosKm.y - minY) / (maxY - minY)) * 54) : 45;
              const isDegraded = s.linkStatus === 'degraded' || prevSite.linkStatus === 'degraded';
              const isOffline = s.linkStatus === 'offline' || prevSite.linkStatus === 'offline';
              const linkStatus = isOffline ? 'broken' : isDegraded ? 'degraded' : 'nominal';
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;

              return (
                <g key={`datalink-${prevSite.siteId}-${s.siteId}`}>
                  <line
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    className={`datalink-beam link-${linkStatus}`}
                  />
                  <text
                    x={`${midX}%`}
                    y={`${midY - 2.5}%`}
                    className={`datalink-label label-${linkStatus}`}
                    textAnchor="middle"
                  >
                    {linkStatus === 'broken' ? 'LINK SEVERED (EW)' : linkStatus === 'degraded' ? 'MW-LINK DEGRADED' : 'MW-LINK NOMINAL'}
                  </text>
                </g>
              );
            })}
          </svg>

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
                {/* Tactical Radar Detection Bubble with Range Horizon Rings */}
                <div
                  className={`commander-site-dome ${hasTracks ? 'has-inbound' : ''}`}
                  style={{ left: `${siteX}%`, top: `${siteY}%` }}
                >
                  {/* Dynamic Sector Radar Sweep (synchronized with 20Hz sim) */}
                  <div
                    className="site-local-radar-sweep"
                    style={{ transform: `rotate(${site.operatorView.radarSweepDeg}deg)` }}
                    aria-hidden="true"
                  />
                  <div className="site-dome-ring ring-outer" title="Radar Horizon: 6,000 m">
                    <span className="dome-ring-label label-outer">RADAR 6.0km</span>
                  </div>
                  <div className="site-dome-ring ring-inner" title="CIWS Kinetic Envelope: 1,200 m">
                    <span className="dome-ring-label label-inner">CIWS 1.2km</span>
                  </div>
                </div>

                {/* Live Hostile Drone Blips with Range & Trajectory Vector */}
                {site.operatorView.tracks.map((track) => {
                  const dx = (track.estimatedPosition.x / 6000) * 120;
                  const dy = (-track.estimatedPosition.y / 6000) * 120;
                  const droneLeft = `calc(${siteX}% + ${dx}px)`;
                  const droneTop = `calc(${siteY}% + ${dy}px)`;
                  const isTrackInspected =
                    inspectedTrack?.siteId === site.siteId && inspectedTrack?.trackId === track.trackId;
                  const heading = track.courseDeg ?? ((track.bearingDeg + 180) % 360);
                  const speed = track.speedMps ?? 0;
                  const courseRad = (heading * Math.PI) / 180;
                  const vecLen = Math.min(22, Math.max(10, speed * 0.7));
                  const vecX = Math.sin(courseRad) * vecLen;
                  const vecY = -Math.cos(courseRad) * vecLen;
                  const trackCallsign = `${site.siteId}-T${track.trackId}`;
                  const buildInspectedInfo = (): InspectedTrackInfo => ({
                    trackId: track.trackId,
                    siteId: site.siteId,
                    rangeM: Math.round(track.rangeM),
                    altM: Math.round(track.altitudeM),
                    speed: Math.round(track.speedMps ?? 0),
                    closingRateMps: track.closingRateMps !== undefined ? Math.round(track.closingRateMps) : null,
                    rcsBucket: track.rcsBucket,
                    bearing: Math.round(track.bearingDeg),
                    assessedClass: track.assessedClass ?? null,
                    rfSignature: track.rfSignature ?? null,
                    rfStatus: track.rfStatus ?? null,
                    isLocked: Boolean(track.terminal_lock),
                  });

                  return (
                    <div
                      key={`drone-${site.siteId}-${track.trackId}`}
                      className={`commander-map-drone ${track.terminal_lock ? 'is-locked' : ''} ${isTrackInspected ? 'is-inspected' : ''}`}
                      style={{ left: droneLeft, top: droneTop }}
                      title={`${trackCallsign} · Range: ${Math.round(track.rangeM)}m · Alt: ${Math.round(track.altitudeM)}m`}
                      onClick={() => setInspectedTrack(buildInspectedInfo())}
                      onMouseEnter={() => setInspectedTrack(buildInspectedInfo())}
                    >
                      {/* Inbound Approach Line to targeted base */}
                      <svg className="drone-vector-line" aria-hidden="true">
                        <line x1="0" y1="0" x2={-dx} y2={-dy} />
                      </svg>

                      {/* Forward Velocity Vector (Course Predictor) */}
                      <svg className="drone-course-vector" aria-hidden="true">
                        <line x1="0" y1="0" x2={vecX} y2={vecY} />
                        <circle cx={vecX} cy={vecY} r="2.2" />
                      </svg>

                      {/* Tactical Selection Reticle Corner Brackets when inspected */}
                      {isTrackInspected && (
                        <div className="target-bracket-reticle" aria-hidden="true">
                          <span className="bracket-corner tl" />
                          <span className="bracket-corner tr" />
                          <span className="bracket-corner bl" />
                          <span className="bracket-corner br" />
                        </div>
                      )}

                      <span className="drone-threat-symbol">◆</span>
                      <div className="drone-hud-tag">
                        <b>{trackCallsign}</b>
                        <small>{(track.rangeM / 1000).toFixed(1)}km · {Math.round(track.altitudeM)}m</small>
                        {track.terminal_lock && <span className="drone-lock-pill">OPTICAL LOCK</span>}
                      </div>
                    </div>
                  );
                })}

                {/* Kinetic CIWS Tracer Stream directed at active threat */}
                {isFiring && (() => {
                  const targetTrack = [...site.operatorView.tracks].sort((a, b) => a.rangeM - b.rangeM)[0];
                  if (!targetTrack) return null;
                  const tdx = (targetTrack.estimatedPosition.x / 6000) * 120;
                  const tdy = (-targetTrack.estimatedPosition.y / 6000) * 120;
                  return (
                    <div className="commander-ciws-tracer-layer" style={{ left: `${siteX}%`, top: `${siteY}%` }}>
                      <svg className="tracer-line-svg" aria-hidden="true">
                        <line x1="0" y1="0" x2={tdx} y2={tdy} className="tracer-stream-line" />
                        <circle cx={tdx} cy={tdy} r="5" className="tracer-impact-flash" />
                      </svg>
                      <div className="tracer-muzzle-ring" />
                      <span className="tracer-stream-badge" style={{ left: `${tdx * 0.5}px`, top: `${tdy * 0.5}px` }}>
                        35MM CIWS ENGAGING {site.siteId}-T{targetTrack.trackId}
                      </span>
                    </div>
                  );
                })()}

                {/* Directional RF Electronic Countermeasure Jamming Conical Wave */}
                {isJamming && (() => {
                  const targetTrack = site.operatorView.tracks[0];
                  const rotDeg = targetTrack
                    ? (Math.atan2(targetTrack.estimatedPosition.x, -targetTrack.estimatedPosition.y) * 180) / Math.PI
                    : site.operatorView.radarSweepDeg;
                  return (
                    <div className="commander-rf-jammer-layer" style={{ left: `${siteX}%`, top: `${siteY}%` }}>
                      <div className="jammer-wavefield" style={{ transform: `rotate(${rotDeg}deg)` }}>
                        <div className="jammer-arc arc-1" />
                        <div className="jammer-arc arc-2" />
                        <div className="jammer-arc arc-3" />
                      </div>
                      <span className="jammer-active-badge">RF JAMMING ACTIVE // 2.4/5.8GHz</span>
                    </div>
                  );
                })()}

                {/* Site Node Beacon Anchor (Tactical, High-Contrast Bastion) */}
                <div
                  className={`commander-live-site-node accent-${threatBand} status-${site.status}`}
                  style={{ left: `${siteX}%`, top: `${siteY}%` }}
                >
                  <div className="site-node-ping" />
                  <button
                    type="button"
                    className="site-beacon-btn"
                    onClick={() => setSelected(site.siteId)}
                    title={`Click to inspect ${site.siteId} live radar PPI scope`}
                  >
                    <span className="site-beacon-id">{site.siteId}</span>
                  </button>

                  <div
                    className="site-bunker-plate"
                    onClick={() => setSelected(site.siteId)}
                    title="Click to Inspect Sector Radar PPI Scope"
                  >
                    <div className="bunker-plate-row">
                      <span className="bunker-name">{plan?.name ? plan.name.replace('Training Site ', 'S') : site.siteId}</span>
                      <span className="bunker-val">{plan?.valueUnits ?? 100}V</span>
                    </div>
                    <div className="bunker-plate-status">
                      <span className={`bunker-stat ${hasTracks ? 'is-threat' : 'is-clear'}`}>
                        {hasTracks ? `▲ ${site.operatorView.tracks.length} INBOUND` : '● SECURE'}
                      </span>
                      <span className="bunker-dmg">{site.damagePercent}% DMG</span>
                    </div>
                    <div className="bunker-plate-ammo">
                      <span>GUN: {site.inventory.gunAmmo}</span>
                      <span>MSL: {site.inventory.missiles}</span>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* Tactical Map Symbology Legend Bar */}
          <div className="theatre-map-legend-bar" aria-label="Map symbology legend">
            <span className="legend-chip"><span className="legend-dot dot-site">●</span> SITES ({view.sites.length})</span>
            <span className="legend-chip"><span className="legend-dot dot-threat">◆</span> INBOUND BLIPS ({totalInbound})</span>
            <span className="legend-chip"><span className="legend-dot dot-radar">○</span> RADAR 6.0km</span>
            <span className="legend-chip"><span className="legend-dot dot-ciws">○</span> CIWS 1.2km</span>
            <span className="legend-chip"><span className="legend-dot dot-mw">┈┈</span> MW DATA-LINK</span>
            <span className="legend-sep">|</span>
            <span className="legend-hint">CLICK ANY CONTACT (◆ S#-T#) FOR REAL-TIME SENSOR FUSION &amp; ROE GUIDANCE</span>
          </div>

          {/* Pending Reserve Transfers across the map with animated cargo flight vector */}
          {view.pendingTransfers.map((transfer, i) => (
            <div key={`${transfer.toSiteId}-${transfer.item}-${i}`} className="commander-transfer" style={{ left: `${20 + i * 15}%` }}>
              <span className="transfer-icon">✈</span> DISPATCHING {transfer.item === 'gunAmmo' ? 'GUN AMMO' : 'MISSILE'} TO <b>{transfer.toSiteId}</b> · ETA {Math.max(0, transfer.dueTick - view.tick)}t
            </div>
          ))}

          {/* Interactive Tactical Target Dossier Overlay on Map */}
          <div className="commander-dossier-panel" aria-label="Target telemetry dossier">
            {inspectedTrack ? (
              <div className="dossier-card">
                <div className="dossier-title-bar">
                  <span className="dossier-sym">◆</span>
                  <span className="dossier-id">CONTACT {inspectedTrack.siteId}-T{inspectedTrack.trackId} // SENSOR FUSION DOSSIER</span>
                  <span className={`dossier-threat-level ${inspectedTrack.isLocked ? 'is-critical' : 'is-hostile'}`}>
                    {inspectedTrack.isLocked ? 'CRITICAL THREAT' : 'AIRSPACE INTRUDER'}
                  </span>
                  <button type="button" className="dossier-close-btn" onClick={() => setInspectedTrack(null)}>✕</button>
                </div>
                <div className="dossier-data-grid">
                  <div className="dossier-data-cell">
                    <small>RANGE / BEARING</small>
                    <b>{inspectedTrack.rangeM} m · {inspectedTrack.bearing}°</b>
                  </div>
                  <div className="dossier-data-cell">
                    <small>ALTITUDE AGL</small>
                    <b>{inspectedTrack.altM} m</b>
                  </div>
                  <div className="dossier-data-cell">
                    <small>VELOCITY / CLOSING</small>
                    <b>
                      {inspectedTrack.speed} m/s
                      {inspectedTrack.closingRateMps !== null ? ` (${inspectedTrack.closingRateMps} m/s)` : ''}
                    </b>
                  </div>
                  <div className="dossier-data-cell">
                    <small>SECTOR / RCS</small>
                    <b>SITE {inspectedTrack.siteId} · {inspectedTrack.rcsBucket.toUpperCase()}</b>
                  </div>
                  <div className="dossier-data-cell full">
                    <small>CLASSIFICATION</small>
                    <b className="threat-class">
                      {inspectedTrack.assessedClass && inspectedTrack.assessedClass !== 'unknown'
                        ? inspectedTrack.assessedClass.replace(/_/g, ' ').toUpperCase()
                        : 'UNCLASSIFIED BOGEY (ANALYZING CUES)'}
                    </b>
                  </div>
                  <div className="dossier-data-cell full">
                    <small>RF DATALINK / SENSOR FUSION</small>
                    <b>
                      {inspectedTrack.rfSignature && inspectedTrack.rfSignature !== 'none'
                        ? `${inspectedTrack.rfSignature.replace(/_/g, ' ').toUpperCase()} (EMITTING)`
                        : inspectedTrack.rfStatus === 'ambiguous'
                        ? 'AMBIGUOUS RF STROBE · CROSS-CHECK RCS & ALTITUDE'
                        : 'NO RF EMISSION (FIBER FPV / FAKE DECOY / BIOLOGICAL)'}
                    </b>
                  </div>
                  <div className="dossier-data-cell full">
                    <small>ENGAGEMENT DIRECTIVE</small>
                    <b className={inspectedTrack.isLocked ? 'is-urgent' : 'is-nominal'}>
                      {inspectedTrack.isLocked
                        ? '⚠ TERMINAL OPTICAL DIVE (<800m) — RF Jammer Ineffective, Kinetic CIWS / SAM Required!'
                        : inspectedTrack.assessedClass === 'bird' || inspectedTrack.assessedClass === 'clutter'
                        ? '● NON-HOSTILE / CLUTTER — Hold fire to conserve battery ammunition'
                        : inspectedTrack.assessedClass === 'commercial_quad'
                        ? '● CIVILIAN QUADCOPTER — Strict ROE Hold Fire (engaging incurs collateral penalty)'
                        : inspectedTrack.assessedClass === 'decoy_drone'
                        ? '● FAKE DECOY LURE (Med RCS + Low Alt + Silent) — Conserve Gun & SAM reserves'
                        : '▲ MONITOR CLOSING RATE & RCS — Standard/Tight ROE filters decoys; replenish Gun/SAM if low'}
                    </b>
                  </div>
                </div>
              </div>
            ) : (
              <div className="dossier-standby-pill">
                <span className="dossier-crosshair">⌖</span>
                <span className="dossier-prompt">
                  CLICK HOSTILE BLIP (◆ S#-T#) FOR REAL-TIME SENSOR FUSION &amp; ROE GUIDANCE
                </span>
              </div>
            )}
          </div>
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
          const isFiring = site.operatorView.effectors.gun.busyUntilTick > view.tick;
          const isJamming = site.operatorView.effectors.jammer.busyUntilTick > view.tick;
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
                  Telemetry &amp; command latency: {(site.latencyTicks / 20).toFixed(1)}s ({site.latencyTicks} ticks)
                </p>
              )}

              {/* Effector Readiness Status Strip */}
              <div className="commander-effector-strip">
                <div className={`effector-indicator ${isFiring ? 'is-firing' : site.inventory.gunAmmo > 0 ? 'is-ready' : 'is-depleted'}`}>
                  <span className="eff-code">GDF-005 35MM</span>
                  <span className="eff-state">{isFiring ? 'BURST FIRING' : site.inventory.gunAmmo > 0 ? 'READY' : 'EMPTY'}</span>
                </div>
                <div className={`effector-indicator ${isJamming ? 'is-jamming' : 'is-standby'}`}>
                  <span className="eff-code">DIR-RF JAMMER</span>
                  <span className="eff-state">{isJamming ? 'ACTIVE EMISSION' : 'STANDBY'}</span>
                </div>
                <div className={`effector-indicator ${site.inventory.missiles > 0 ? 'is-armed' : 'is-empty'}`}>
                  <span className="eff-code">SAM INTERCEPTOR</span>
                  <span className="eff-state">{site.inventory.missiles > 0 ? `${site.inventory.missiles} ARMED` : 'EMPTY'}</span>
                </div>
              </div>

              {/* Damage & Threat Overview */}
              <div className="commander-site-stats-row">
                <div className={`commander-threat-chip ${hasInbound ? 'is-danger' : 'is-secure'}`}>
                  {hasInbound ? `▲ ${site.operatorView.tracks.length} ACTIVE CONTACTS` : '● AIRSPACE CLEAR'}
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
                    onClick={() => {
                      setSelected(s.siteId);
                      setSelectedTrackId(null);
                    }}
                  >
                    SWITCH TO {s.siteId}
                  </button>
                ))}
                <button
                  type="button"
                  className="radar-modal-close"
                  onClick={() => {
                    setSelected(null);
                    setSelectedTrackId(null);
                  }}
                  aria-label="Close radar scope"
                >
                  ✕ CLOSE SCOPE
                </button>
              </div>
            </header>
            <div className="radar-modal-canvas-wrap">
              <RadarScope
                view={selectedSite.operatorView}
                trailHistory={trailHistoryBySite.get(selectedSite.siteId) ?? emptyTrailMap}
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
