import React, { useEffect, useRef, useState } from 'react';
import { TraineeView } from '../../sim/index.js';
import { drawScope } from './radar/drawScope.js';
import { nearestPlot, PlotCandidate, polarToPixel } from './radar/geometry.js';

export interface RadarScopeProps {
  view: TraineeView | null;
  trailHistory: Map<number, Array<{ x: number; y: number; z: number }>>;
  selectedTrackId: number | null;
  onSelectTrack: (trackId: number | null) => void;
}

export function RadarScope({
  view,
  trailHistory,
  selectedTrackId,
  onSelectTrack,
}: RadarScopeProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [scaleM, setScaleM] = useState<number>(6000);
  const [showEffectorRings, setShowEffectorRings] = useState<boolean>(true);

  const viewRef = useRef<TraineeView | null>(view);
  viewRef.current = view;

  const trailHistoryRef = useRef(trailHistory);
  trailHistoryRef.current = trailHistory;

  const selectedTrackIdRef = useRef<number | null>(selectedTrackId);
  selectedTrackIdRef.current = selectedTrackId;

  const scaleMRef = useRef<number>(scaleM);
  scaleMRef.current = scaleM;

  const showEffectorRingsRef = useRef<boolean>(showEffectorRings);
  showEffectorRingsRef.current = showEffectorRings;

  const hoveredTrackIdRef = useRef<number | null>(null);

  // Animation frame rendering loop without triggering React re-renders per tick
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          const displayWidth = Math.floor(rect.width);
          const displayHeight = Math.floor(rect.height);

          if (
            canvas.width !== displayWidth * dpr ||
            canvas.height !== displayHeight * dpr
          ) {
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
          }

          ctx.save();
          ctx.scale(dpr, dpr);
          drawScope(ctx, displayWidth, displayHeight, viewRef.current, {
            scaleM: scaleMRef.current,
            showEffectorRings: showEffectorRingsRef.current,
            selectedTrackId: selectedTrackIdRef.current,
            hoveredTrackId: hoveredTrackIdRef.current,
            trailHistory: trailHistoryRef.current,
          });
          ctx.restore();
        }
      }
      animId = requestAnimationFrame(render);
    };

    const handleWindowResize = () => {
      render();
    };

    window.addEventListener('resize', handleWindowResize);
    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // Handle Zoom via mouse wheel (clamped between 2000m and 8000m)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setScaleM((prev) => {
      const step = e.deltaY < 0 ? -1000 : 1000;
      return Math.max(2000, Math.min(8000, prev + step));
    });
  };

  // Handle Click hit-test (within 14 px)
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickPx = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radiusPx = Math.min(centerX, centerY) - 28;
    const center = { x: centerX, y: centerY };

    const currentView = viewRef.current;
    if (!currentView || !currentView.tracks) {
      onSelectTrack(null);
      return;
    }

    const candidates: PlotCandidate[] = [];
    for (let i = 0; i < currentView.tracks.length; i++) {
      const trk = currentView.tracks[i];
      if (!trk || trk.state === 'dropped') continue;
      const posPx = polarToPixel(
        trk.rangeM,
        trk.bearingDeg,
        center,
        scaleMRef.current,
        radiusPx
      );
      candidates.push({ trackId: trk.trackId, posPx });
    }

    const clickedTrackId = nearestPlot(clickPx, candidates, 14);
    onSelectTrack(clickedTrackId);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mousePx = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radiusPx = Math.min(centerX, centerY) - 28;
    const center = { x: centerX, y: centerY };

    const currentView = viewRef.current;
    if (!currentView || !currentView.tracks) {
      hoveredTrackIdRef.current = null;
      return;
    }

    const candidates: PlotCandidate[] = [];
    for (let i = 0; i < currentView.tracks.length; i++) {
      const trk = currentView.tracks[i];
      if (!trk || trk.state === 'dropped') continue;
      const posPx = polarToPixel(
        trk.rangeM,
        trk.bearingDeg,
        center,
        scaleMRef.current,
        radiusPx
      );
      candidates.push({ trackId: trk.trackId, posPx });
    }

    hoveredTrackIdRef.current = nearestPlot(mousePx, candidates, 14);
  };

  const handleMouseLeave = () => {
    hoveredTrackIdRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: '260px',
        backgroundColor: '#070a0e',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Scope Controls HUD Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '14px',
          right: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
          <button
            onClick={() => setShowEffectorRings((prev) => !prev)}
            style={{
              backgroundColor: showEffectorRings ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.75)',
              border: showEffectorRings ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.12)',
              color: showEffectorRings ? '#38bdf8' : '#94a3b8',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '10.5px',
              fontFamily: 'ui-monospace, monospace',
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              transition: 'all 0.18s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: showEffectorRings ? '#38bdf8' : '#64748b',
                boxShadow: showEffectorRings ? '0 0 6px rgba(56, 189, 248, 0.8)' : 'none',
              }}
            />
            {showEffectorRings ? 'EFFECTOR RINGS: ON' : 'EFFECTOR RINGS: OFF'}
          </button>

          <span
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              borderRadius: '6px',
              padding: '4px 9px',
              fontSize: '10.5px',
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.04em',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            SCALE: {scaleM / 1000} km <span style={{ opacity: 0.5 }}>(scroll to zoom)</span>
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            borderRadius: '6px',
            padding: '4px 9px',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px #10b981',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'ui-monospace, monospace',
              color: 'rgba(226, 232, 240, 0.7)',
              fontWeight: 600,
              letterSpacing: '0.06em',
            }}
          >
            20Hz PULSE-DOPPLER
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          cursor: 'crosshair',
        }}
      />
    </div>
  );
}
