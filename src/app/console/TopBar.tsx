import React from 'react';
import { TraineeEnvironmentView } from '../../sim/index.js';

export interface TopBarProps {
  tick: number;
  speed: 1 | 2 | 4;
  isPaused: boolean;
  autopilot: boolean;
  seed: string;
  phase: 'setup' | 'running' | 'ended';
  scenarioId?: string;
  environment?: TraineeEnvironmentView;
  onTogglePause: () => void;
  onSetSpeed: (speed: 1 | 2 | 4) => void;
  onToggleAutopilot: () => void;
}

function formatClock(tick: number): string {
  const totalSec = Math.floor(tick / 20);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TopBar({
  tick,
  speed,
  isPaused,
  autopilot,
  seed,
  phase,
  scenarioId,
  environment,
  onTogglePause,
  onSetSpeed,
  onToggleAutopilot,
}: TopBarProps): React.JSX.Element {
  const scTitle =
    scenarioId === 'ridge_runner'
      ? 'RIDGE RUNNER'
      : scenarioId === 'city_edge_night'
        ? 'CITY EDGE NIGHT'
        : 'DAWN INTRUSION';

  const envStr = environment
    ? `${environment.timeOfDay} · ${environment.weather} · Vis ${environment.visibilityKm}km · ${environment.terrainKind}`
    : null;

  return (
    <div style={styles.container}>
      {/* Top Banner */}
      <div style={styles.banner}>
        <span style={styles.bannerBadge}>DISCLAIMER</span>
        <span style={styles.bannerText}>
          TRAINING SIMULATION — generic open-source parameters only
        </span>
        <a href="#/check" style={styles.sysCheckLink}>
          System Check ↗
        </a>
      </div>

      {/* Action / Telemetry Bar */}
      <div style={styles.actionBar}>
        {/* Left: Mission Info & Clock */}
        <div style={styles.leftGroup}>
          <div style={styles.missionTitle}>{scTitle}</div>
          {envStr && (
            <div style={styles.envChipBadge}>
              {envStr}
            </div>
          )}
          <div style={styles.clockBox} id="missionClock">
            <span style={styles.clockLabel}>TICK</span>
            <span style={styles.clockValue} id="missionTick">{tick}</span>
            <span style={styles.clockLabel}>TIME</span>
            <span style={styles.timeValue} id="missionTime">{formatClock(tick)}</span>
          </div>
          <div style={styles.seedBadge}>
            <span style={styles.seedLabel}>SEED:</span>
            <span style={styles.seedValue}>{seed}</span>
          </div>
        </div>

        {/* Right: Controls & Speed */}
        {phase === 'running' && (
          <div style={styles.rightGroup}>
            {/* Speed Multiplier Buttons */}
            <div style={styles.buttonGroup}>
              <button
                id="btn-speed-1"
                onClick={() => onSetSpeed(1)}
                style={speed === 1 ? styles.speedActive : styles.speedButton}
              >
                1x
              </button>
              <button
                id="btn-speed-2"
                onClick={() => onSetSpeed(2)}
                style={speed === 2 ? styles.speedActive : styles.speedButton}
              >
                2x
              </button>
              <button
                id="btn-speed-4"
                onClick={() => onSetSpeed(4)}
                style={speed === 4 ? styles.speedActive : styles.speedButton}
              >
                4x
              </button>
            </div>

            {/* Pause / Resume Button */}
            <button
              id="btn-toggle-pause"
              onClick={onTogglePause}
              style={styles.pauseButton}
            >
              {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
            </button>

            {/* Autopilot Toggle */}
            <button
              id="btn-toggle-autopilot"
              onClick={onToggleAutopilot}
              style={autopilot ? styles.autopilotActive : styles.autopilotButton}
            >
              {autopilot ? '🤖 AUTOPILOT: ON' : '🤖 AUTOPILOT: OFF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0b111e',
    borderBottom: '1px solid #1e293b',
  },
  banner: {
    backgroundColor: '#030712',
    borderBottom: '1px solid #1e293b',
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  bannerBadge: {
    backgroundColor: '#f59e0b',
    color: '#000',
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 700,
  },
  bannerText: {
    color: '#94a3b8',
    flex: 1,
  },
  sysCheckLink: {
    color: '#38bdf8',
    textDecoration: 'none',
    fontSize: '11px',
  },
  actionBar: {
    padding: '10px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  envChipBadge: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    color: '#38bdf8',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  missionTitle: {
    color: '#38bdf8',
    fontWeight: 700,
    fontSize: '14px',
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  clockBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#030712',
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #1e293b',
    fontFamily: 'monospace',
  },
  clockLabel: {
    color: '#64748b',
    fontSize: '10px',
    fontWeight: 600,
  },
  clockValue: {
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: 700,
  },
  timeValue: {
    color: '#38bdf8',
    fontSize: '13px',
    fontWeight: 700,
  },
  seedBadge: {
    backgroundColor: '#0f172a',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #1e293b',
    fontSize: '11px',
    fontFamily: 'monospace',
    display: 'flex',
    gap: '6px',
  },
  seedLabel: {
    color: '#64748b',
  },
  seedValue: {
    color: '#cbd5e1',
    fontWeight: 600,
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  buttonGroup: {
    display: 'flex',
    backgroundColor: '#030712',
    borderRadius: '4px',
    border: '1px solid #1e293b',
    overflow: 'hidden',
  },
  speedButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94a3b8',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  speedActive: {
    backgroundColor: '#2563eb',
    border: 'none',
    color: '#fff',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  pauseButton: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#f8fafc',
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotButton: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    color: '#94a3b8',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotActive: {
    backgroundColor: '#065f46',
    border: '1px solid #10b981',
    color: '#a7f3d0',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
};
