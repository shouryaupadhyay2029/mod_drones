import React from 'react';
import { TraineeEnvironmentView } from '../../sim/index.js';
import { TextRoll } from '../components/TextRoll.js';

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
        <span style={styles.bannerBadge}>
          <TextRoll center stagger={0.02}>DISCLAIMER</TextRoll>
        </span>
        <span style={styles.bannerText}>
          TRAINING SIMULATION — generic open-source parameters only
        </span>
        <a href="#/check" style={styles.sysCheckLink}>
          <TextRoll stagger={0.02}>System Check ↗</TextRoll>
        </a>
      </div>

      {/* Action / Telemetry Bar */}
      <div style={styles.actionBar}>
        {/* Left: Mission Info & Clock */}
        <div style={styles.leftGroup}>
          <div style={styles.missionTitle}>
            <TextRoll center stagger={0.03}>{scTitle}</TextRoll>
          </div>
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
                <TextRoll center>1x</TextRoll>
              </button>
              <button
                id="btn-speed-2"
                onClick={() => onSetSpeed(2)}
                style={speed === 2 ? styles.speedActive : styles.speedButton}
              >
                <TextRoll center>2x</TextRoll>
              </button>
              <button
                id="btn-speed-4"
                onClick={() => onSetSpeed(4)}
                style={speed === 4 ? styles.speedActive : styles.speedButton}
              >
                <TextRoll center>4x</TextRoll>
              </button>
            </div>

            {/* Pause / Resume Button */}
            <button
              id="btn-toggle-pause"
              onClick={onTogglePause}
              style={styles.pauseButton}
            >
              <TextRoll center>{isPaused ? '▶ RESUME' : '⏸ PAUSE'}</TextRoll>
            </button>

            {/* Autopilot Toggle */}
            <button
              id="btn-toggle-autopilot"
              onClick={onToggleAutopilot}
              style={autopilot ? styles.autopilotActive : styles.autopilotButton}
            >
              <TextRoll center>{autopilot ? '🤖 AUTOPILOT: ON' : '🤖 AUTOPILOT: OFF'}</TextRoll>
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
    backgroundColor: '#0b0b0b',
    borderBottom: '1px solid #262626',
  },
  banner: {
    backgroundColor: '#000000',
    borderBottom: '1px solid #1a1a1a',
    padding: '6px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  bannerBadge: {
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    padding: '2px 7px',
    borderRadius: '3px',
    fontWeight: 800,
    boxShadow: '0 0 8px rgba(255, 45, 171, 0.4)',
  },
  bannerText: {
    color: '#a1a1aa',
    flex: 1,
  },
  sysCheckLink: {
    color: '#ff2dab',
    textDecoration: 'none',
    fontSize: '11px',
    fontWeight: 600,
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
    backgroundColor: '#121212',
    border: '1px solid rgba(255, 45, 171, 0.35)',
    color: '#ff2dab',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  missionTitle: {
    color: '#ff2dab',
    fontWeight: 800,
    fontSize: '15px',
    letterSpacing: '0.06em',
    fontFamily: 'monospace',
    textShadow: '0 0 10px rgba(255, 45, 171, 0.4)',
  },
  clockBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#000000',
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #262626',
    fontFamily: 'monospace',
  },
  clockLabel: {
    color: '#71717a',
    fontSize: '10px',
    fontWeight: 600,
  },
  clockValue: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 700,
  },
  timeValue: {
    color: '#ff2dab',
    fontSize: '13px',
    fontWeight: 700,
  },
  seedBadge: {
    backgroundColor: '#121212',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #262626',
    fontSize: '11px',
    fontFamily: 'monospace',
    display: 'flex',
    gap: '6px',
  },
  seedLabel: {
    color: '#71717a',
  },
  seedValue: {
    color: '#e4e4e7',
    fontWeight: 600,
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  buttonGroup: {
    display: 'flex',
    backgroundColor: '#000000',
    borderRadius: '4px',
    border: '1px solid #262626',
    overflow: 'hidden',
  },
  speedButton: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  speedActive: {
    backgroundColor: '#ff2dab',
    border: 'none',
    color: '#0b0b0b',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 800,
    fontFamily: 'monospace',
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(255, 45, 171, 0.5)',
  },
  pauseButton: {
    backgroundColor: '#171717',
    border: '1px solid #262626',
    color: '#ffffff',
    padding: '6px 14px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotButton: {
    backgroundColor: '#121212',
    border: '1px solid #262626',
    color: '#a1a1aa',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  autopilotActive: {
    backgroundColor: 'rgba(255, 45, 171, 0.15)',
    border: '1px solid #ff2dab',
    color: '#ff2dab',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    boxShadow: '0 0 8px rgba(255, 45, 171, 0.35)',
  },
};
