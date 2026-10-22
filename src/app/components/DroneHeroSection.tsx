import React from 'react';
import { DroneAsciiSimulation } from './DroneAsciiSimulation.js';
import { TextRoll } from './TextRoll.js';

export interface DroneHeroSectionProps {
  onStartMission?: () => void;
  onExploreScenarios?: () => void;
}

export function DroneHeroSection({
  onStartMission,
  onExploreScenarios,
}: DroneHeroSectionProps): React.JSX.Element {
  return (
    <section style={styles.heroSection}>
      {/* Full-Width 3D Tactical Drone ASCII Canvas Container */}
      <div style={styles.canvasWrapper}>
        <DroneAsciiSimulation
          color="#cbb3ed"
          backgroundColor="#0a0b0e"
          fontSize={10}
          autoRotate={true}
          rotationSpeed={0.012}
        />

        {/* Floating Action Capsule (Center Bottom) */}
        <div style={styles.floatingActionCapsule}>
          {onStartMission && (
            <button
              id="hero-btn-start"
              onClick={onStartMission}
              style={styles.btnPrimary}
            >
              <TextRoll center duration={0.3} stagger={0.025}>
                START MISSION
              </TextRoll>
            </button>
          )}

          {onExploreScenarios && (
            <button
              id="hero-btn-explore"
              onClick={onExploreScenarios}
              style={styles.btnSecondary}
            >
              <TextRoll center stagger={0.02}>
                SELECT SCENARIO ↓
              </TextRoll>
            </button>
          )}

          <a href="#/check" style={styles.btnLink}>
            <TextRoll stagger={0.02}>System Check ↗</TextRoll>
          </a>
        </div>

        {/* Floating Bottom Left Telemetry HUD */}
        <div style={styles.floatingBottomLeft}>
          <span style={styles.hudStatItem}>
            <strong style={styles.hudLabel}>MODEL:</strong> 4-Rotor FPV Interceptor
          </span>
          <span style={styles.hudDivider}>•</span>
          <span style={styles.hudStatItem}>
            <strong style={styles.hudLabel}>RCS:</strong> 0.02 m²
          </span>
          <span style={styles.hudDivider}>•</span>
          <span style={styles.hudStatItem}>
            <strong style={styles.hudLabel}>ENGINE:</strong> 20 Hz Deterministic Bit-Parity
          </span>
        </div>

        {/* Floating Bottom Right Interactive Cue */}
        <div style={styles.floatingBottomRight}>
          <span style={styles.dragCueText}>[CLICK & DRAG TO ORBIT 360°]</span>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heroSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#0a0b0e',
    borderBottom: '1px solid rgba(203, 179, 237, 0.14)',
    boxSizing: 'border-box',
    padding: '16px 24px 20px 24px',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '1440px',
    height: '520px',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(203, 179, 237, 0.08)',
  },
  floatingActionCapsule: {
    position: 'absolute',
    bottom: '22px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: 'rgba(17, 19, 25, 0.85)',
    border: '1px solid rgba(203, 179, 237, 0.25)',
    borderRadius: '30px',
    padding: '8px 18px',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(212, 255, 63, 0.15)',
    zIndex: 20,
    fontFamily: 'monospace',
  },
  btnPrimary: {
    padding: '10px 22px',
    backgroundColor: '#d4ff3f',
    color: '#0a0b0e',
    border: 'none',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(212, 255, 63, 0.5)',
    transition: 'all 0.15s ease',
  },
  btnSecondary: {
    padding: '10px 18px',
    backgroundColor: '#161822',
    color: '#ffffff',
    border: '1px solid rgba(203, 179, 237, 0.22)',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnLink: {
    color: '#cbb3ed',
    fontSize: '12px',
    textDecoration: 'none',
    fontWeight: 600,
    padding: '4px 8px',
  },
  floatingBottomLeft: {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(10, 11, 14, 0.75)',
    border: '1px solid rgba(203, 179, 237, 0.14)',
    borderRadius: '6px',
    padding: '6px 12px',
    backdropFilter: 'blur(8px)',
    fontSize: '11px',
    fontFamily: 'monospace',
    zIndex: 10,
    pointerEvents: 'none',
  },
  hudStatItem: {
    color: '#c4c7d4',
  },
  hudLabel: {
    color: '#cbb3ed',
    fontWeight: 700,
  },
  hudDivider: {
    color: '#767a8f',
  },
  floatingBottomRight: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    backgroundColor: 'rgba(10, 11, 14, 0.75)',
    border: '1px solid rgba(203, 179, 237, 0.14)',
    borderRadius: '6px',
    padding: '6px 12px',
    backdropFilter: 'blur(8px)',
    zIndex: 10,
    pointerEvents: 'none',
  },
  dragCueText: {
    color: '#d4ff3f',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },
};
