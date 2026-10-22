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

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: '260px',
        backgroundColor: '#080808',
        borderRadius: '8px',
        border: '1px solid #262626',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Scope Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          display: 'flex',
          gap: '8px',
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setShowEffectorRings((prev) => !prev)}
          style={{
            backgroundColor: showEffectorRings ? 'rgba(212, 255, 63, 0.15)' : '#181818',
            border: showEffectorRings ? '1px solid #d4ff3f' : '1px solid #2a2a2e',
            color: showEffectorRings ? '#d4ff3f' : '#767a8f',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            boxShadow: showEffectorRings ? '0 0 10px rgba(212, 255, 63, 0.3)' : 'none',
          }}
        >
          {showEffectorRings ? 'EFFECTOR RINGS: ON' : 'EFFECTOR RINGS: OFF'}
        </button>

        <span
          style={{
            backgroundColor: '#121212',
            border: '1px solid #2a2a2e',
            color: '#b5b5be',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        >
          SCALE: {scaleM / 1000} km (scroll to zoom)
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onClick={handleClick}
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
