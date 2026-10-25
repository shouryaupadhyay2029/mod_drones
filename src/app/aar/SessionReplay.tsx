import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createReplay,
  RadarShadowGrid,
  ReplayFrame,
  ScoreReportV2,
  SessionLog,
  RADAR_MAX_RANGE_M,
  RADAR_RCS_REF,
  THREAT_LIBRARY,
} from '../../sim/index.js';
import { worldToCanvas } from './mapGeometry.js';

const MAP_SIZE = 640;
const WORLD_BOUNDS = { minX: -8000, maxX: 8000, minY: -8000, maxY: 8000, width: MAP_SIZE, height: MAP_SIZE };
const GRID_STEP = 500;

function formatTime(tick: number): string {
  const seconds = Math.floor(tick / 20);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function eventLabel(event: { type: string; payload: Record<string, unknown> }): string {
  const id = event.payload.actorId ?? event.payload.trackId ?? '';
  return `${event.type.replaceAll('_', ' ')} ${String(id)}`.trim();
}

export function SessionReplay({ sessionLog, report, title = 'SESSION FLIGHT REVIEW' }: {
  sessionLog: SessionLog;
  report: ScoreReportV2;
  title?: string;
}): React.JSX.Element {
  const replay = useMemo(() => createReplay(sessionLog), [sessionLog]);
  const terrainGrid = useMemo(() => replay.terrainGrid(250), [replay]);
  const [frame, setFrame] = useState<ReplayFrame>(() => replay.frame());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [altitude, setAltitude] = useState(60);
  const [shadow, setShadow] = useState<RadarShadowGrid>(() => replay.radarShadow(60, GRID_STEP));
  const [selectedActorId, setSelectedActorId] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const indexedEvents = useMemo(() => frame.events.map((event) => ({ ...event, label: eventLabel(event) })), [frame.events]);
  const selectedClass = frame.actors.find((actor) => actor.id === selectedActorId)?.classId ?? frame.actors[0]?.classId ?? 'fpv_kamikaze';
  const weatherFactor = frame.env.weather === 'haze' ? 0.97 : frame.env.weather === 'fog' ? 0.95 : frame.env.weather === 'rain' ? 0.85 : 1;
  const radarRange = RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(THREAT_LIBRARY[selectedClass].rcsM2 / RADAR_RCS_REF)) * weatherFactor;

  const seek = (tick: number) => {
    const next = replay.seek(tick);
    setFrame(next);
  };

  useEffect(() => {
    setFrame(replay.seek(0));
    setPlaying(false);
  }, [replay]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      const next = Math.min(replay.totalTicks, replay.frame().tick + speed);
      seek(next);
      if (next >= replay.totalTicks) setPlaying(false);
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, speed, replay]);

  useEffect(() => {
    setShadow(replay.radarShadow(altitude, GRID_STEP));
  }, [altitude, replay]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.isContentEditable) return;
      event.preventDefault();
      seek(frame.tick + (event.key === 'ArrowLeft' ? -20 : 20));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [frame.tick]);

  useEffect(() => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, rect.height);
    const terrainLayer = document.createElement('canvas');
    terrainLayer.width = terrainGrid.width;
    terrainLayer.height = terrainGrid.height;
    const terrainContext = terrainLayer.getContext('2d');
    if (!terrainContext) return;
    for (let row = 0; row < terrainGrid.height; row++) {
      for (let col = 0; col < terrainGrid.width; col++) {
        const index = row * terrainGrid.width + col;
        const east = terrainGrid.heights[row * terrainGrid.width + Math.min(terrainGrid.width - 1, col + 1)] ?? 0;
        const south = terrainGrid.heights[Math.min(terrainGrid.height - 1, row + 1) * terrainGrid.width + col] ?? 0;
        const relief = Math.max(0, Math.min(1, 0.5 + (terrainGrid.heights[index]! - east + south) / 180));
        const clutter = terrainGrid.clutter[index] ?? 0;
        terrainContext.fillStyle = `rgba(${42 + Math.round(clutter * 70)}, ${53 + Math.round(clutter * 55)}, ${43 + Math.round(relief * 42)}, ${0.14 + relief * 0.2})`;
        terrainContext.fillRect(col, row, 1, 1);
      }
    }
    context.imageSmoothingEnabled = true;
    context.drawImage(terrainLayer, 0, 0, rect.width, rect.height);
    const shadowLayer = document.createElement('canvas');
    shadowLayer.width = shadow.width;
    shadowLayer.height = shadow.height;
    const shadowContext = shadowLayer.getContext('2d');
    if (!shadowContext) return;
    for (let row = 0; row < shadow.height; row++) {
      for (let col = 0; col < shadow.width; col++) {
        const index = row * shadow.width + col;
        if (shadow.blocked[index]) {
          shadowContext.fillStyle = 'rgba(43, 42, 38, .22)';
          shadowContext.fillRect(col, row, 1, 1);
        }
      }
    }
    context.drawImage(shadowLayer, 0, 0, rect.width, rect.height);
  }, [shadow, terrainGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, rect.height);
    context.clearRect(0, 0, rect.width, rect.height);
    const point = (p: { x: number; y: number }) => worldToCanvas(p, { ...WORLD_BOUNDS, width: rect.width, height: rect.height });
    const center = point({ x: 0, y: 0 });
    const ring = (radius: number, color: string, dash: number[] = []) => {
      context.beginPath();
      context.setLineDash(dash);
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.arc(center.x, center.y, radius * rect.width / 16000, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    };
    ring(1000, 'rgba(165,76,45,.8)');
    ring(1500, 'rgba(82,111,15,.8)', [5, 4]);
    ring(radarRange, 'rgba(45,107,117,.75)', [2, 4]);
    context.fillStyle = '#a54c2d';
    context.fillRect(center.x - 4, center.y - 4, 8, 8);

    for (const trail of frame.trails) {
      for (let index = 1; index < trail.points.length; index++) {
        const previous = trail.points[index - 1];
        const current = trail.points[index];
        if (!previous || !current) continue;
        const from = point(previous);
        const to = point(current);
        const fade = Math.max(0.04, (index / trail.points.length) * 0.32);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.strokeStyle = `rgba(171,70,40,${fade})`;
        context.lineWidth = 2;
        context.stroke();
      }
    }
    for (const track of frame.tracks) {
      const screen = point(track.estPos);
      if (track.actorId !== null) {
        const actor = frame.actors.find((item) => item.id === track.actorId);
        if (actor) {
          const truth = point(actor.pos);
          context.beginPath(); context.moveTo(screen.x, screen.y); context.lineTo(truth.x, truth.y);
          context.strokeStyle = 'rgba(32,30,26,.45)'; context.lineWidth = 1; context.stroke();
        }
      }
      context.beginPath(); context.arc(screen.x, screen.y, track.isGhost ? 5 : 4, 0, Math.PI * 2);
      context.strokeStyle = track.isGhost ? '#a54c2d' : '#29261f'; context.lineWidth = 1.5; context.stroke();
      if (track.isGhost) { context.setLineDash([2, 2]); context.stroke(); context.setLineDash([]); }
    }
    for (const actor of frame.actors) {
      const screen = point(actor.pos);
      context.beginPath(); context.arc(screen.x, screen.y, actor.id === selectedActorId ? 5 : 3.5, 0, Math.PI * 2);
      context.fillStyle = actor.state === 'neutralized' ? '#647c2d' : actor.state === 'impacted' ? '#a43b2a' : '#a54c2d'; context.fill();
    }
    for (const event of frame.events.filter((item) => ['ENGAGEMENT_STARTED', 'ENGAGEMENT_RESOLVED', 'ASSET_HIT'].includes(item.type))) {
      const actor = frame.actors.find((item) => item.id === event.payload.actorId);
      const track = frame.tracks.find((item) => item.trackId === event.payload.trackId);
      const pos = actor?.pos ?? track?.estPos;
      if (!pos) continue;
      const screen = point(pos);
      context.fillStyle = event.type === 'ASSET_HIT' ? '#9f3328' : event.type === 'ENGAGEMENT_RESOLVED' && event.payload.result === 'hit' ? '#647c2d' : '#24221e';
      context.fillRect(screen.x - 3, screen.y - 3, 6, 6);
    }
  }, [frame, shadow, radarRange, replay, terrainGrid, selectedActorId]);

  const eventTicks = useMemo(() => frame.events.filter((event) => ['ENGAGEMENT_STARTED', 'ENGAGEMENT_RESOLVED', 'ASSET_HIT'].includes(event.type)), [frame.events]);
  return <section className="aar-replay" aria-label="Session replay">
    <div className="aar-replay-heading"><div><span className="aar-kpi-label">AFTER ACTION REVIEW</span><h2>{title}</h2></div><strong>{report.total} · {report.grade}</strong></div>
    <div className="aar-replay-layout">
      <div className="aar-map-column">
        <div className="aar-map-stack" aria-label="Terrain and track replay map">
          <canvas ref={terrainCanvasRef} className="aar-replay-map aar-replay-terrain" aria-hidden="true" />
          <canvas ref={canvasRef} className="aar-replay-map aar-replay-overlay" aria-label="Terrain and track replay map" />
        </div>
        <div className="aar-map-legend"><span><i className="aar-dot aar-truth" /> TRUE CONTACT</span><span><i className="aar-dot aar-track" /> TRACK</span><span><i className="aar-dot aar-ghost" /> GHOST</span><span>RANGE RINGS: GUN 1 KM · JAMMER 1.5 KM · RADAR {Math.round(radarRange / 100) / 10} KM</span></div>
        <label className="aar-slider-label">RADAR SHADOW ALTITUDE <strong>{altitude} M AGL</strong><input type="range" min="20" max="150" step="5" value={altitude} onChange={(event) => setAltitude(Number(event.target.value))} /></label>
        <div className="aar-replay-controls">
          <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? 'PAUSE' : 'PLAY'}</button>
          {[1, 2, 4, 8].map((value) => <button type="button" className={speed === value ? 'active' : ''} key={value} onClick={() => setSpeed(value)}>{value}×</button>)}
          <span>{formatTime(frame.tick)} / {formatTime(replay.totalTicks)}</span>
        </div>
        <div className="aar-timeline-wrap">
          <input aria-label="Replay timeline" type="range" min="0" max={replay.totalTicks} value={frame.tick} onChange={(event) => seek(Number(event.target.value))} />
          <div className="aar-timeline-markers">{eventTicks.map((event, index) => <button key={`${event.type}-${event.tick}-${index}`} title={eventLabel(event)} style={{ left: `${(event.tick / Math.max(1, replay.totalTicks)) * 100}%` }} onClick={() => seek(event.tick)} />)}</div>
        </div>
      </div>
      <aside className="aar-replay-side">
        <div className="aar-replay-card"><h3>CONTACTS · {frame.actors.length}</h3>{frame.actors.map((actor) => <button type="button" key={actor.id} className={selectedActorId === actor.id ? 'selected' : ''} onClick={() => setSelectedActorId(actor.id)}><span>{actor.classId.replaceAll('_', ' ')}</span><small>{actor.state.replaceAll('_', ' ')}</small></button>)}</div>
        <div className="aar-replay-card aar-event-list"><h3>EVENTS THROUGH {formatTime(frame.tick)}</h3>{indexedEvents.slice(-30).reverse().map((event, index) => <button key={`${event.type}-${event.tick}-${index}`} onClick={() => seek(event.tick)}><time>{formatTime(event.tick)}</time><span>{event.label}</span></button>)}</div>
        <div className="aar-replay-card"><h3>SCORING · {report.total} / 100</h3><p className="aar-replay-grade">{report.grade}</p>
          {report.perContact.map((contact) => <div className="aar-cause-row" key={contact.actorId}><strong>{contact.classId.replaceAll('_', ' ')} · {contact.totalScore}</strong>{contact.decisionPath.map((node) => <small key={node.id}><b>{node.cause ?? 'observed'}</b> · {node.answer}</small>)}</div>)}
          {report.unobservable.map((contact) => <div className="aar-cause-row" key={`unobservable-${contact.actorId}`}><strong>{contact.classId.replaceAll('_', ' ')} · unobservable</strong>{contact.decisionPath.map((node) => <small key={node.id}><b>{node.cause ?? 'observed'}</b> · {node.answer}</small>)}</div>)}
          {report.missionDecisionPath.map((node, index) => <div className="aar-cause-row" key={`mission-${node.id}-${index}`}><strong>MISSION DECISION</strong><small><b>{node.cause ?? 'observed'}</b> · {node.answer}</small></div>)}
        </div>
      </aside>
    </div>
  </section>;
}
