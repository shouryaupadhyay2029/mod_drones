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
  keyMoments,
} from '../../sim/index.js';
import { worldToCanvas, canvasToWorld } from './mapGeometry.js';

const MAP_SIZE = 680;
const WORLD_BOUNDS = { minX: -8000, maxX: 8000, minY: -8000, maxY: 8000, width: MAP_SIZE, height: MAP_SIZE };
const GRID_STEP = 500;

function formatTime(tick: number): string {
  const seconds = Math.floor(tick / 20);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const tenths = Math.floor((tick % 20) / 2);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

function formatTimeSec(tick: number): string {
  const seconds = Math.floor(tick / 20);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function eventLabel(event: { type: string; payload: Record<string, unknown> }): string {
  const id = event.payload.actorId ?? event.payload.trackId ?? '';
  return `${event.type.replaceAll('_', ' ')} ${String(id)}`.trim();
}

function formatClassLabel(classId: string): string {
  switch (classId) {
    case 'fpv_kamikaze':
      return 'FPV Kamikaze Strike';
    case 'fpv_fiber':
      return 'Jam-Resistant Fiber FPV';
    case 'fixed_wing_recon':
      return 'Fixed-Wing Recon UAV';
    case 'commercial_quad':
      return 'Civilian Quadcopter';
    case 'decoy_drone':
      return 'Low-Cost Decoy Drone';
    case 'bird':
      return 'Avian Biological';
    case 'clutter':
      return 'Atmospheric Clutter';
    default:
      return classId.replaceAll('_', ' ');
  }
}

export function SessionReplay({
  sessionLog,
  report,
  title = 'SESSION FLIGHT REVIEW',
  onFork,
  comparisonLog,
}: {
  sessionLog: SessionLog;
  report: ScoreReportV2;
  title?: string;
  onFork?: (tick: number) => void;
  comparisonLog?: SessionLog;
}): React.JSX.Element {
  const replay = useMemo(() => createReplay(sessionLog), [sessionLog]);
  const comparisonReplay = useMemo(() => (comparisonLog ? createReplay(comparisonLog) : null), [comparisonLog]);
  const moments = useMemo(() => keyMoments(report, sessionLog), [report, sessionLog]);
  const terrainGrid = useMemo(() => replay.terrainGrid(250), [replay]);

  const [frame, setFrame] = useState<ReplayFrame>(() => replay.frame());
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [altitude, setAltitude] = useState(45);
  const [shadow, setShadow] = useState<RadarShadowGrid>(() => replay.radarShadow(45, GRID_STEP));
  const [selectedActorId, setSelectedActorId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'contacts' | 'events' | 'scoring'>('contacts');
  const [contactFilter, setContactFilter] = useState<'all' | 'hostile' | 'civilian' | 'clutter'>('all');
  const [hoveredActorId, setHoveredActorId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);

  const indexedEvents = useMemo(
    () => frame.events.map((event) => ({ ...event, label: eventLabel(event) })),
    [frame.events]
  );

  const selectedClass =
    frame.actors.find((actor) => actor.id === selectedActorId)?.classId ??
    frame.actors[0]?.classId ??
    'fpv_kamikaze';

  const weatherFactor =
    frame.env.weather === 'haze' ? 0.97 : frame.env.weather === 'fog' ? 0.95 : frame.env.weather === 'rain' ? 0.85 : 1;

  const radarRange =
    RADAR_MAX_RANGE_M * Math.sqrt(Math.sqrt(THREAT_LIBRARY[selectedClass].rcsM2 / RADAR_RCS_REF)) * weatherFactor;

  // Percentage of shadow occlusion
  const shadowBlockedRatio = useMemo(() => {
    if (!shadow || shadow.blocked.length === 0) return 0;
    const blockedCount = shadow.blocked.filter(Boolean).length;
    return Math.round((blockedCount / shadow.blocked.length) * 100);
  }, [shadow]);

  const seek = (tick: number) => {
    const clamped = Math.max(0, Math.min(replay.totalTicks, tick));
    const next = replay.seek(clamped);
    setFrame(next);
  };

  useEffect(() => {
    setFrame(replay.seek(0));
    setPlaying(false);
  }, [replay]);

  useEffect(() => {
    if (!playing) return undefined;
    const intervalMs = Math.max(16, Math.round(50 / speed));
    const stepTicks = speed >= 4 ? 4 : speed >= 2 ? 2 : 1;
    const timer = window.setInterval(() => {
      const next = Math.min(replay.totalTicks, replay.frame().tick + stepTicks);
      seek(next);
      if (next >= replay.totalTicks) setPlaying(false);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, speed, replay]);

  useEffect(() => {
    setShadow(replay.radarShadow(altitude, GRID_STEP));
  }, [altitude, replay]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.isContentEditable) return;
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        setPlaying((p) => !p);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(frame.tick - (event.shiftKey ? 100 : 20));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(frame.tick + (event.shiftKey ? 100 : 20));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [frame.tick, playing]);

  // 1. Terrain & Radar Shadow Layer
  useEffect(() => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, rect.height);

    // Dark Tactical Scope Background
    const bgGrad = context.createRadialGradient(
      rect.width / 2,
      rect.height / 2,
      10,
      rect.width / 2,
      rect.height / 2,
      rect.width / 2
    );
    bgGrad.addColorStop(0, '#0a121c');
    bgGrad.addColorStop(0.7, '#070d15');
    bgGrad.addColorStop(1, '#04080e');
    context.fillStyle = bgGrad;
    context.fillRect(0, 0, rect.width, rect.height);

    // Shaded Relief Topography
    const terrainLayer = document.createElement('canvas');
    terrainLayer.width = terrainGrid.width;
    terrainLayer.height = terrainGrid.height;
    const terrainContext = terrainLayer.getContext('2d');
    if (terrainContext) {
      for (let row = 0; row < terrainGrid.height; row++) {
        for (let col = 0; col < terrainGrid.width; col++) {
          const index = row * terrainGrid.width + col;
          const east = terrainGrid.heights[row * terrainGrid.width + Math.min(terrainGrid.width - 1, col + 1)] ?? 0;
          const south = terrainGrid.heights[Math.min(terrainGrid.height - 1, row + 1) * terrainGrid.width + col] ?? 0;
          const h = terrainGrid.heights[index] ?? 0;
          const slope = Math.max(-1, Math.min(1, (h - east + south) / 120));
          const relief = Math.max(0, Math.min(1, 0.45 + slope * 0.4));
          const clutter = terrainGrid.clutter[index] ?? 0;

          // Mil-spec topographic elevation palette (dark slate-cyan with subtle hill shading)
          const r = Math.round(12 + relief * 20);
          const g = Math.round(22 + relief * 32 + clutter * 15);
          const b = Math.round(28 + relief * 40);
          const alpha = 0.25 + relief * 0.35;
          terrainContext.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          terrainContext.fillRect(col, row, 1, 1);
        }
      }
      context.imageSmoothingEnabled = true;
      context.drawImage(terrainLayer, 0, 0, rect.width, rect.height);
    }

    // Shaded Radar Shadow (Line of Sight Occlusion)
    const shadowLayer = document.createElement('canvas');
    shadowLayer.width = shadow.width;
    shadowLayer.height = shadow.height;
    const shadowContext = shadowLayer.getContext('2d');
    if (shadowContext) {
      for (let row = 0; row < shadow.height; row++) {
        for (let col = 0; col < shadow.width; col++) {
          const index = row * shadow.width + col;
          if (shadow.blocked[index]) {
            // Subtle hatched amber-crimson occlusion
            shadowContext.fillStyle = (row + col) % 3 === 0 ? 'rgba(180, 50, 35, 0.28)' : 'rgba(120, 30, 20, 0.18)';
            shadowContext.fillRect(col, row, 1, 1);
          }
        }
      }
      context.drawImage(shadowLayer, 0, 0, rect.width, rect.height);
    }

    // Subtle tactical grid lines (every 2 km)
    context.strokeStyle = 'rgba(70, 110, 130, 0.12)';
    context.lineWidth = 1;
    const stepPx = (rect.width / 16) * 2; // 2 km per grid square
    for (let x = 0; x <= rect.width; x += stepPx) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, rect.height);
      context.stroke();
    }
    for (let y = 0; y <= rect.height; y += stepPx) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(rect.width, y);
      context.stroke();
    }

    context.restore();
  }, [shadow, terrainGrid]);

  // 2. High-Tech Tactical Overlays (Compass, Rings, Contacts, Tracks, Weapons)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, rect.height);

    const point = (p: { x: number; y: number }) =>
      worldToCanvas(p, { ...WORLD_BOUNDS, width: rect.width, height: rect.height });
    const center = point({ x: 0, y: 0 });
    const scaleFactor = rect.width / 16000;

    // A. Azimuth Compass Ring & Cardinal Bearings
    const maxRadius = rect.width * 0.485;
    context.beginPath();
    context.arc(center.x, center.y, maxRadius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(100, 150, 175, 0.35)';
    context.lineWidth = 1;
    context.stroke();

    context.font = '9px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(140, 180, 205, 0.7)';

    for (let deg = 0; deg < 360; deg += 10) {
      const rad = ((deg - 90) * Math.PI) / 180;
      const isMajor = deg % 30 === 0;
      const tickLen = isMajor ? 7 : 3;
      const outerX = center.x + Math.cos(rad) * maxRadius;
      const outerY = center.y + Math.sin(rad) * maxRadius;
      const innerX = center.x + Math.cos(rad) * (maxRadius - tickLen);
      const innerY = center.y + Math.sin(rad) * (maxRadius - tickLen);

      context.beginPath();
      context.moveTo(innerX, innerY);
      context.lineTo(outerX, outerY);
      context.strokeStyle = isMajor ? 'rgba(140, 180, 205, 0.6)' : 'rgba(100, 150, 175, 0.25)';
      context.lineWidth = isMajor ? 1.5 : 1;
      context.stroke();

      if (deg % 30 === 0) {
        const textDist = maxRadius - 16;
        const tx = center.x + Math.cos(rad) * textDist;
        const ty = center.y + Math.sin(rad) * textDist;
        const label = deg === 0 ? '000 N' : deg === 90 ? '090 E' : deg === 180 ? '180 S' : deg === 270 ? '270 W' : `${String(deg).padStart(3, '0')}`;
        context.fillText(label, tx, ty);
      }
    }

    // B. Concentric Range Rings with Metric Callouts
    const drawRing = (
      radiusM: number,
      color: string,
      label: string,
      dash: number[] = [],
      lineWidth = 1
    ) => {
      const rPx = radiusM * scaleFactor;
      context.beginPath();
      context.setLineDash(dash);
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.arc(center.x, center.y, rPx, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);

      if (label) {
        context.font = '8px monospace';
        context.fillStyle = color;
        context.textAlign = 'left';
        context.fillText(label, center.x + 6, center.y - rPx + 4);
      }
    };

    // Metric Distance Grid Rings
    [2000, 3000, 4000, 5000, 6000].forEach((dist) => {
      drawRing(dist, 'rgba(70, 110, 130, 0.2)', `${dist / 1000} KM`, [2, 6], 0.8);
    });

    // Operational Effector Envelopes
    drawRing(1000, '#e05338', '1.0 KM CIWS KINETIC ENVELOPE', [4, 3], 1.5);
    drawRing(1500, '#d97706', '1.5 KM RF JAMMER SOFT-KILL', [5, 4], 1.5);
    drawRing(radarRange, '#0284c7', `RADAR HORIZON (${(radarRange / 1000).toFixed(1)} KM)`, [3, 4], 1.2);

    // Crosshairs centered on asset
    context.strokeStyle = 'rgba(100, 150, 175, 0.25)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(center.x - 24, center.y);
    context.lineTo(center.x + 24, center.y);
    context.moveTo(center.x, center.y - 24);
    context.lineTo(center.x, center.y + 24);
    context.stroke();

    // Defended Base Asset (Origin 0,0)
    context.fillStyle = '#ef4444';
    context.fillRect(center.x - 4, center.y - 4, 8, 8);
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.strokeRect(center.x - 5, center.y - 5, 10, 10);
    context.font = 'bold 9px monospace';
    context.fillStyle = '#f87171';
    context.textAlign = 'center';
    context.fillText('DEFENDED ASSET', center.x, center.y + 16);

    // C. Historical Comparison Trails (if What-If Fork is active)
    if (comparisonReplay) {
      const originalFrame = comparisonReplay.seek(Math.min(frame.tick, comparisonReplay.totalTicks));
      context.setLineDash([5, 4]);
      for (const trail of originalFrame.trails) {
        for (let i = 1; i < trail.points.length; i++) {
          const prev = trail.points[i - 1];
          const curr = trail.points[i];
          if (!prev || !curr) continue;
          const from = point(prev);
          const to = point(curr);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.strokeStyle = 'rgba(120, 130, 140, 0.4)';
          context.lineWidth = 2;
          context.stroke();
        }
      }
      context.setLineDash([]);
    }

    // D. Ingress Trajectory Trails (Luminescent Gradient)
    for (const trail of frame.trails) {
      const actor = frame.actors.find((a) => a.id === trail.actorId);
      const isSelected = trail.actorId === selectedActorId || trail.actorId === hoveredActorId;
      const isHostile = actor?.role === 'hostile';
      const isNeutral = actor?.role === 'neutral';

      for (let i = 1; i < trail.points.length; i++) {
        const prev = trail.points[i - 1];
        const curr = trail.points[i];
        if (!prev || !curr) continue;
        const from = point(prev);
        const to = point(curr);
        const progress = i / trail.points.length;
        const alpha = isSelected
          ? Math.max(0.2, progress * 0.85)
          : Math.max(0.08, progress * 0.45);

        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.strokeStyle = isHostile
          ? `rgba(239, 68, 68, ${alpha})`
          : isNeutral
            ? `rgba(14, 165, 233, ${alpha})`
            : `rgba(148, 163, 184, ${alpha})`;
        context.lineWidth = isSelected ? 2.5 : 1.5;
        context.stroke();
      }
    }

    // E. Trainee Radar Tracks vs Ground Truth Offset Lines
    for (const track of frame.tracks) {
      const screen = point(track.estPos);

      // Tie-line connecting radar estimate to ground truth position
      if (track.actorId !== null) {
        const actor = frame.actors.find((item) => item.id === track.actorId);
        if (actor) {
          const truth = point(actor.pos);
          context.beginPath();
          context.setLineDash([2, 3]);
          context.moveTo(screen.x, screen.y);
          context.lineTo(truth.x, truth.y);
          context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          context.lineWidth = 1;
          context.stroke();
          context.setLineDash([]);
        }
      }

      // Radar Track Box
      if (track.isGhost) {
        context.beginPath();
        context.setLineDash([3, 3]);
        context.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
        context.strokeStyle = '#d97706';
        context.lineWidth = 1.5;
        context.stroke();
        context.setLineDash([]);

        context.font = '8px monospace';
        context.fillStyle = '#d97706';
        context.textAlign = 'center';
        context.fillText('GHOST', screen.x, screen.y - 9);
      } else {
        context.strokeStyle = 'rgba(45, 212, 191, 0.85)';
        context.lineWidth = 1.5;
        context.strokeRect(screen.x - 5, screen.y - 5, 10, 10);

        context.font = '8px monospace';
        context.fillStyle = '#2dd4bf';
        context.textAlign = 'left';
        context.fillText(`T${track.trackId}`, screen.x + 7, screen.y + 3);
      }
    }

    // F. Ground Truth Contacts (Actors in 3D Airspace)
    for (const actor of frame.actors) {
      const screen = point(actor.pos);
      const isSelected = actor.id === selectedActorId || actor.id === hoveredActorId;
      const isHostile = actor.role === 'hostile';
      const isNeutral = actor.role === 'neutral';
      const rangeM = Math.round(Math.sqrt(actor.pos.x * actor.pos.x + actor.pos.y * actor.pos.y));

      // Active / Neutralized / Impacted state colors
      const baseColor =
        actor.state === 'neutralized'
          ? '#22c55e'
          : actor.state === 'impacted'
            ? '#dc2626'
            : isHostile
              ? '#ef4444'
              : isNeutral
                ? '#0ea5e9'
                : '#94a3b8';

      // Velocity Vector (3 seconds projection)
      context.beginPath();
      context.moveTo(screen.x, screen.y);
      // approximate heading vector from position
      const headingAngle = Math.atan2(-actor.pos.y, -actor.pos.x);
      const vecLen = Math.max(12, Math.min(30, 18));
      const endX = screen.x + Math.cos(headingAngle) * vecLen;
      const endY = screen.y + Math.sin(headingAngle) * vecLen;
      context.lineTo(endX, endY);
      context.strokeStyle = baseColor;
      context.lineWidth = 1.5;
      context.stroke();

      // Heading arrow head
      context.beginPath();
      context.arc(endX, endY, 2, 0, Math.PI * 2);
      context.fillStyle = baseColor;
      context.fill();

      // Target Glyph
      if (isHostile) {
        // Sharp hostile chevron
        context.beginPath();
        context.arc(screen.x, screen.y, isSelected ? 6 : 4.5, 0, Math.PI * 2);
        context.fillStyle = baseColor;
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1;
        context.stroke();
      } else if (isNeutral) {
        // Civilian diamond
        const size = isSelected ? 6 : 4.5;
        context.beginPath();
        context.moveTo(screen.x, screen.y - size);
        context.lineTo(screen.x + size, screen.y);
        context.lineTo(screen.x, screen.y + size);
        context.lineTo(screen.x - size, screen.y);
        context.closePath();
        context.fillStyle = baseColor;
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 1;
        context.stroke();
      } else {
        // Biological circle
        context.beginPath();
        context.arc(screen.x, screen.y, isSelected ? 5 : 3.5, 0, Math.PI * 2);
        context.fillStyle = baseColor;
        context.fill();
      }

      // Neutralized Cross
      if (actor.state === 'neutralized') {
        context.strokeStyle = '#22c55e';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(screen.x - 7, screen.y - 7);
        context.lineTo(screen.x + 7, screen.y + 7);
        context.moveTo(screen.x + 7, screen.y - 7);
        context.lineTo(screen.x - 7, screen.y + 7);
        context.stroke();
      }

      // Selection Halo & Full Telemetry Tag
      if (isSelected) {
        context.strokeStyle = '#fbbf24';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(screen.x, screen.y, 11, 0, Math.PI * 2);
        context.stroke();

        // High-Tech HUD Callout Box
        const tagX = screen.x + 14;
        const tagY = screen.y - 20;
        context.fillStyle = 'rgba(7, 13, 21, 0.9)';
        context.strokeStyle = '#fbbf24';
        context.lineWidth = 1;
        context.fillRect(tagX, tagY, 130, 40);
        context.strokeRect(tagX, tagY, 130, 40);

        context.font = 'bold 8.5px monospace';
        context.fillStyle = '#ffffff';
        context.textAlign = 'left';
        context.fillText(`ACTOR #${actor.id} [${actor.classId.toUpperCase()}]`, tagX + 5, tagY + 11);

        context.font = '8px monospace';
        context.fillStyle = '#94a3b8';
        context.fillText(`R: ${rangeM}m · ALT: ${Math.round(actor.pos.z)}m AGL`, tagX + 5, tagY + 23);

        const stateColor = actor.state === 'neutralized' ? '#4ade80' : actor.state === 'impacted' ? '#f87171' : '#38bdf8';
        context.fillStyle = stateColor;
        context.fillText(`STATUS: ${actor.state.toUpperCase()}`, tagX + 5, tagY + 34);
      }
    }

    // G. Active Effector Engagements (Jammer Beam / Kinetic Cannon Bursts)
    for (const event of frame.events) {
      if (event.type === 'ENGAGEMENT_STARTED' && event.tick <= frame.tick && frame.tick <= event.tick + 60) {
        const actor = frame.actors.find((item) => item.id === event.payload.actorId);
        if (actor) {
          const targetScreen = point(actor.pos);
          const isJammer = event.payload.effector === 'jammer';

          context.beginPath();
          context.moveTo(center.x, center.y);
          context.lineTo(targetScreen.x, targetScreen.y);
          context.strokeStyle = isJammer ? 'rgba(217, 119, 6, 0.85)' : 'rgba(239, 68, 68, 0.9)';
          context.lineWidth = isJammer ? 3 : 2;
          context.setLineDash(isJammer ? [6, 4] : [12, 6]);
          context.stroke();
          context.setLineDash([]);

          context.font = 'bold 8px monospace';
          context.fillStyle = isJammer ? '#fbbf24' : '#f87171';
          context.textAlign = 'center';
          context.fillText(
            isJammer ? '⚡ RF JAMMER SOFT-KILL' : '💥 30mm CIWS BURST',
            (center.x + targetScreen.x) / 2,
            (center.y + targetScreen.y) / 2 - 8
          );
        }
      }

      // Detonation / Hit / Breach Markers
      if (['ENGAGEMENT_RESOLVED', 'ASSET_HIT'].includes(event.type) && Math.abs(event.tick - frame.tick) < 30) {
        const actor = frame.actors.find((item) => item.id === event.payload.actorId);
        const pos = actor?.pos ?? (event.type === 'ASSET_HIT' ? { x: 0, y: 0 } : null);
        if (pos) {
          const s = point(pos);
          const isHit = event.type === 'ASSET_HIT';
          context.beginPath();
          context.arc(s.x, s.y, isHit ? 18 : 12, 0, Math.PI * 2);
          context.strokeStyle = isHit ? '#ef4444' : '#22c55e';
          context.lineWidth = 2;
          context.stroke();
        }
      }
    }

    context.restore();
  }, [frame, shadow, radarRange, comparisonReplay, selectedActorId, hoveredActorId]);

  // Click on map to select contact
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = canvasToWorld({ x, y }, { ...WORLD_BOUNDS, width: rect.width, height: rect.height });

    let closestActor: number | null = null;
    let closestDist = 450; // click radius in meters
    for (const actor of frame.actors) {
      const dx = actor.pos.x - world.x;
      const dy = actor.pos.y - world.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestActor = actor.id;
      }
    }
    setSelectedActorId(closestActor);
  };

  const eventTicks = useMemo(
    () =>
      frame.events.filter((event) =>
        ['ENGAGEMENT_STARTED', 'ENGAGEMENT_RESOLVED', 'ASSET_HIT'].includes(event.type)
      ),
    [frame.events]
  );

  const filteredActors = useMemo(() => {
    if (contactFilter === 'all') return frame.actors;
    if (contactFilter === 'hostile') return frame.actors.filter((a) => a.role === 'hostile');
    if (contactFilter === 'civilian') return frame.actors.filter((a) => a.role === 'neutral');
    return frame.actors.filter((a) => a.classId === 'bird' || a.classId === 'clutter');
  }, [frame.actors, contactFilter]);

  return (
    <section className="aar-replay tactical-replay-shell" aria-label="Session replay">
      {/* Header Bar */}
      <div className="aar-replay-heading">
        <div>
          <span className="aar-kpi-label">AFTER ACTION REVIEW</span>
          <h2>{title}</h2>
          <div className="tactical-subline">
            SYNCHRONIZED AIRSPACE RECONSTRUCTION // GROUND TRUTH VS TRAINEE RADAR SCOPE
          </div>
        </div>
        <div className="tactical-badge-group">
          <span className="tactical-digest-pill">20Hz DETERMINISTIC</span>
          <strong className="tactical-grade-pill">
            SCORE: {report.total} · GRADE {report.grade}
          </strong>
        </div>
      </div>

      <div className="aar-replay-layout">
        {/* Left Column: Scope Map + Controls */}
        <div className="aar-map-column">
          <div className="aar-map-stack-wrapper">
            <div className="aar-map-stack" aria-label="Terrain and track replay map">
              <canvas ref={terrainCanvasRef} className="aar-replay-map aar-replay-terrain" aria-hidden="true" />
              <canvas
                ref={canvasRef}
                className="aar-replay-map aar-replay-overlay"
                aria-label="Terrain and track replay map"
                onClick={handleCanvasClick}
                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
              />
            </div>
            {/* Tactical Screen Corner Accents */}
            <div className="scope-corner-tl" />
            <div className="scope-corner-tr" />
            <div className="scope-corner-bl" />
            <div className="scope-corner-br" />
          </div>

          {/* Map Legend */}
          <div className="aar-map-legend">
            <span>
              <i className="aar-dot aar-truth" /> TRUE CONTACT
            </span>
            <span>
              <i className="aar-dot aar-track" /> TRACK
            </span>
            <span>
              <i className="aar-dot aar-ghost" /> GHOST
            </span>
            <span>
              RANGE RINGS: GUN 1 KM · JAMMER 1.5 KM · RADAR {Math.round(radarRange / 100) / 10} KM
            </span>
          </div>

          {/* Radar Shadow Line-Of-Sight (LOS) Analysis Enclosure */}
          <div className="radar-shadow-panel">
            <div className="radar-shadow-header">
              <label className="aar-slider-label">
                <span>RADAR SHADOW ALTITUDE</span>
                <strong>{altitude} M AGL</strong>
                <input
                  type="range"
                  min="20"
                  max="150"
                  step="5"
                  value={altitude}
                  onChange={(event) => setAltitude(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="radar-shadow-stats">
              <div className="shadow-stat-item">
                <span className="shadow-stat-lbl">RADAR MAST:</span>
                <span className="shadow-stat-val">15m AGL</span>
              </div>
              <div className="shadow-stat-item">
                <span className="shadow-stat-lbl">AIRSPACE MASKED:</span>
                <span className="shadow-stat-val" style={{ color: shadowBlockedRatio > 30 ? '#dc2626' : '#d97706' }}>
                  {shadowBlockedRatio}% TERRAIN SHADOW
                </span>
              </div>
              <div className="shadow-preset-pills">
                <button type="button" className={altitude === 25 ? 'active' : ''} onClick={() => setAltitude(25)}>
                  NOE 25m
                </button>
                <button type="button" className={altitude === 45 ? 'active' : ''} onClick={() => setAltitude(45)}>
                  LOW 45m
                </button>
                <button type="button" className={altitude === 80 ? 'active' : ''} onClick={() => setAltitude(80)}>
                  STD 80m
                </button>
                <button type="button" className={altitude === 120 ? 'active' : ''} onClick={() => setAltitude(120)}>
                  HIGH 120m
                </button>
              </div>
            </div>
          </div>

          {/* C2 Playback Console Controls */}
          <div className="tactical-playback-strip">
            <div className="playback-btns-left">
              <button
                type="button"
                className="step-btn"
                onClick={() => seek(frame.tick - 100)}
                title="Step backward 5 seconds"
              >
                ⏮ -5s
              </button>
              <button
                type="button"
                className="step-btn"
                onClick={() => seek(frame.tick - 20)}
                title="Step backward 1 second"
              >
                ◀ -1s
              </button>
              <button
                type="button"
                className="play-toggle-btn"
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? '⏸ PAUSE' : '▶ PLAY'}
              </button>
              <button
                type="button"
                className="step-btn"
                onClick={() => seek(frame.tick + 20)}
                title="Step forward 1 second"
              >
                +1s ▶
              </button>
              <button
                type="button"
                className="step-btn"
                onClick={() => seek(frame.tick + 100)}
                title="Step forward 5 seconds"
              >
                +5s ▶▶
              </button>
            </div>

            <div className="playback-speed-group">
              {[1, 2, 4, 8].map((value) => (
                <button
                  type="button"
                  className={speed === value ? 'active' : ''}
                  key={value}
                  onClick={() => setSpeed(value)}
                >
                  {value}x
                </button>
              ))}
            </div>

            <div className="playback-time-badge">
              <span className="live-clock-time">
                {formatTimeSec(frame.tick)} / {formatTimeSec(replay.totalTicks)}
              </span>
              <span className="live-clock-tick">TICK {frame.tick}</span>
            </div>
          </div>

          {/* Scrubber Timeline */}
          <div className="aar-timeline-wrap">
            <input
              aria-label="Replay timeline"
              type="range"
              min="0"
              max={replay.totalTicks}
              value={frame.tick}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <div className="aar-timeline-markers">
              {eventTicks.map((event, index) => (
                <button
                  key={`${event.type}-${event.tick}-${index}`}
                  title={eventLabel(event)}
                  style={{
                    left: `${(event.tick / Math.max(1, replay.totalTicks)) * 100}%`,
                    backgroundColor: event.type === 'ASSET_HIT' ? '#ef4444' : event.type === 'ENGAGEMENT_STARTED' ? '#f59e0b' : '#22c55e',
                  }}
                  onClick={() => seek(event.tick)}
                />
              ))}
            </div>
          </div>

          {/* What-If Fork Section */}
          {comparisonReplay && (
            <p className="aar-branch-legend">
              <i /> Original true path: dashed; fork true path: solid
            </p>
          )}

          {onFork && (
            <div className="tactical-fork-card">
              <button className="aar-fork-current" type="button" onClick={() => onFork(frame.tick)}>
                FORK HERE · {formatTime(frame.tick)}
              </button>
              <div className="aar-command-forks" aria-label="Fork before trainee commands">
                <h3>TRAINEE COMMANDS</h3>
                {sessionLog.commands.length === 0 ? (
                  <p className="aar-muted">No recorded trainee commands in this session.</p>
                ) : (
                  sessionLog.commands.map((command, index) => (
                    <button
                      type="button"
                      key={`${command.tick}-${command.type}-${index}`}
                      onClick={() => onFork(command.tick)}
                    >
                      <time>{formatTime(command.tick)}</time>
                      <span>
                        Fork before this command · {command.type.replaceAll('_', ' ')}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Intelligence Station */}
        <aside className="aar-replay-side">
          {/* Sidebar Tabs */}
          <div className="tactical-tab-bar">
            <button
              type="button"
              className={activeTab === 'contacts' ? 'active' : ''}
              onClick={() => setActiveTab('contacts')}
            >
              CONTACTS ({frame.actors.length})
            </button>
            <button
              type="button"
              className={activeTab === 'events' ? 'active' : ''}
              onClick={() => setActiveTab('events')}
            >
              TACTICAL LOG
            </button>
            <button
              type="button"
              className={activeTab === 'scoring' ? 'active' : ''}
              onClick={() => setActiveTab('scoring')}
            >
              DOCTRINE SCORING
            </button>
          </div>

          {/* TAB 1: Order of Battle Contacts Deck */}
          <div style={{ display: activeTab === 'contacts' ? 'flex' : 'none', flexDirection: 'column', gap: '10px' }}>
            <div className="aar-replay-card contact-deck-container">
              <div className="contact-deck-header">
                <h3>CONTACTS · {frame.actors.length}</h3>
                <div className="contact-filter-chips">
                  <button
                    type="button"
                    className={contactFilter === 'all' ? 'active' : ''}
                    onClick={() => setContactFilter('all')}
                  >
                    ALL ({frame.actors.length})
                  </button>
                  <button
                    type="button"
                    className={contactFilter === 'hostile' ? 'active' : ''}
                    onClick={() => setContactFilter('hostile')}
                  >
                    HOSTILE ({frame.actors.filter((a) => a.role === 'hostile').length})
                  </button>
                  <button
                    type="button"
                    className={contactFilter === 'civilian' ? 'active' : ''}
                    onClick={() => setContactFilter('civilian')}
                  >
                    CIVILIAN
                  </button>
                  <button
                    type="button"
                    className={contactFilter === 'clutter' ? 'active' : ''}
                    onClick={() => setContactFilter('clutter')}
                  >
                    CLUTTER
                  </button>
                </div>
              </div>

              <div className="contact-card-list">
                {filteredActors.map((actor) => {
                  const rangeM = Math.round(
                    Math.sqrt(actor.pos.x * actor.pos.x + actor.pos.y * actor.pos.y)
                  );
                  const isSelected = selectedActorId === actor.id;
                  const isHostile = actor.role === 'hostile';
                  const track = frame.tracks.find((t) => t.actorId === actor.id);

                  return (
                    <div
                      key={actor.id}
                      className={`contact-item-card ${isSelected ? 'selected' : ''} ${isHostile ? 'hostile' : 'neutral'}`}
                      onClick={() => setSelectedActorId(actor.id)}
                      onMouseEnter={() => setHoveredActorId(actor.id)}
                      onMouseLeave={() => setHoveredActorId(null)}
                    >
                      <div className="contact-item-top">
                        <span className="contact-id-tag">
                          {isHostile ? '▲' : '◆'} T{actor.id}
                        </span>
                        <span className="contact-class-name">
                          {formatClassLabel(actor.classId)}
                        </span>
                        <span
                          className={`contact-status-badge status-${actor.state}`}
                        >
                          {actor.state.toUpperCase()}
                        </span>
                      </div>

                      <div className="contact-telemetry-row">
                        <span>RNG: {rangeM}m</span>
                        <span>ALT: {Math.round(actor.pos.z)}m</span>
                        <span>
                          EVAL:{' '}
                          <b style={{ color: track?.assessedClass === actor.classId ? '#15803d' : '#b91c1c' }}>
                            {track?.assessedClass ? track.assessedClass.toUpperCase() : 'UNASSESSED'}
                          </b>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TAB 2: Tactical Event Stream & Key Moments */}
          <div style={{ display: activeTab === 'events' ? 'flex' : 'none', flexDirection: 'column', gap: '10px' }}>
            <div className="aar-replay-card aar-event-list-panel">
              {/* Key Moments Banner */}
              <div className="aar-key-moments">
                <h3>KEY MOMENTS</h3>
                {moments.length === 0 ? (
                  <p className="aar-muted">No flagged decision moments in this report.</p>
                ) : (
                  moments.map((moment) => (
                    <article key={`${moment.actorId}-${moment.cause}`}>
                      <time>{formatTime(moment.tick)}</time>
                      <p>{moment.text}</p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="moment-jump-btn"
                          onClick={() => seek(moment.tick)}
                        >
                          Jump to moment
                        </button>
                        {onFork && (
                          <button
                            type="button"
                            className="moment-fork-btn"
                            onClick={() => onFork(moment.forkTick)}
                          >
                            Replay from 5s before · {formatTime(moment.forkTick)}
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>

              {/* Event Log Stream */}
              <h3 style={{ marginTop: '14px' }}>
                EVENTS THROUGH {formatTime(frame.tick)} ({indexedEvents.length})
              </h3>
              <div className="event-stream-container">
                {indexedEvents
                  .slice(-35)
                  .reverse()
                  .map((event, index) => {
                    const isImpact = event.type === 'ASSET_HIT';
                    const isEngage = event.type === 'ENGAGEMENT_STARTED';
                    const isResolve = event.type === 'ENGAGEMENT_RESOLVED';

                    return (
                      <button
                        key={`${event.type}-${event.tick}-${index}`}
                        className={`event-stream-item ${isImpact ? 'event-impact' : isEngage ? 'event-engage' : isResolve ? 'event-resolve' : ''}`}
                        onClick={() => seek(event.tick)}
                      >
                        <time>{formatTime(event.tick)}</time>
                        <span className="event-body-text">{event.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* TAB 3: Doctrine Scoring Tree */}
          <div style={{ display: activeTab === 'scoring' ? 'flex' : 'none', flexDirection: 'column', gap: '10px' }}>
            <div className="aar-replay-card">
              <h3>SCORING · {report.total} / 100</h3>
              <p className="aar-replay-grade">{report.grade}</p>
              {report.perContact.map((contact) => (
                <div className="aar-cause-row" key={contact.actorId}>
                  <strong>
                    {formatClassLabel(contact.classId)} · {contact.totalScore} pts
                  </strong>
                  {contact.decisionPath.map((node) => (
                    <small key={node.id}>
                      <b>{node.cause ?? 'observed'}</b> · {node.answer}
                    </small>
                  ))}
                </div>
              ))}
              {report.unobservable.map((contact) => (
                <div className="aar-cause-row" key={`unobservable-${contact.actorId}`}>
                  <strong>{formatClassLabel(contact.classId)} · unobservable</strong>
                  {contact.decisionPath.map((node) => (
                    <small key={node.id}>
                      <b>{node.cause ?? 'observed'}</b> · {node.answer}
                    </small>
                  ))}
                </div>
              ))}
              {report.missionDecisionPath.map((node, index) => (
                <div className="aar-cause-row" key={`mission-${node.id}-${index}`}>
                  <strong>MISSION DECISION</strong>
                  <small>
                    <b>{node.cause ?? 'observed'}</b> · {node.answer}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
