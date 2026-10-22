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
      {/* Left Column: Briefing & Skiper14 Style Typography */}
      <div style={styles.leftCol}>
        {/* Category breadcrumb */}
        <div style={styles.breadcrumbRow}>
          <span style={styles.categoryTag}>
            MoD Simulator • Defense AI • Ascii Tactical Simulation
          </span>
        </div>

        {/* Section tag */}
        <div style={styles.tagBadge}>
          <span style={styles.tagText}>ASCII SIMULATION // FPV THREAT</span>
        </div>

        {/* Hero Title */}
        <h1 style={styles.headline}>
          A stunning ASCII art effect that renders 3D tactical drones in real-time.
        </h1>

        {/* Description */}
        <p style={styles.subtext}>
          Defend high-value assets against autonomous FPV kamikaze drones, low-RCS quadcopters,
          and hostile EW reconnaissance swarms. Features real-time interactive 3D rotation,
          customizable styling, and smooth physical kinematics.
        </p>

        {/* Action Buttons */}
        <div style={styles.btnRow}>
          {onStartMission && (
            <button
              id="hero-btn-start"
              onClick={onStartMission}
              style={styles.btnPrimary}
            >
              <TextRoll center duration={0.32} stagger={0.025}>
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

        {/* Tactical Telemetry Metrics */}
        <div style={styles.statsRow}>
          <div style={styles.statBox}>
            <span style={styles.statLabel}>SIM ENGINE</span>
            <span style={styles.statVal}>20 Hz Fixed</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statLabel}>FPV MODEL</span>
            <span style={styles.statVal}>4-Rotor 3D</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statLabel}>EFFECTORS</span>
            <span style={styles.statVal}>Jammer + Gun</span>
          </div>
          <div style={styles.statBox}>
            <span style={styles.statLabel}>DETERMINISM</span>
            <span style={styles.statVal}>100% Bit-Parity</span>
          </div>
        </div>
      </div>

      {/* Right Column: Interactive 3D ASCII Simulation */}
      <div style={styles.rightCol}>
        <DroneAsciiSimulation
          color="#ff2dab"
          backgroundColor="#0b0b0b"
          fontSize={10}
          autoRotate={true}
          rotationSpeed={0.012}
        />
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heroSection: {
    display: 'grid',
    gridTemplateColumns: 'minmax(420px, 1fr) minmax(460px, 1.1fr)',
    gap: '32px',
    alignItems: 'center',
    padding: '36px 32px',
    backgroundColor: '#0b0b0b',
    borderBottom: '1px solid #262626',
    width: '100%',
    maxWidth: '1440px',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    fontFamily: 'monospace',
  },
  breadcrumbRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryTag: {
    color: '#71717a',
    fontSize: '12px',
    fontWeight: 500,
    letterSpacing: '0.04em',
  },
  tagBadge: {
    alignSelf: 'flex-start',
  },
  tagText: {
    color: '#ff2dab',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  headline: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 800,
    lineHeight: '1.25',
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  subtext: {
    margin: 0,
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#a1a1aa',
    maxWidth: '560px',
  },
  btnRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  btnPrimary: {
    padding: '12px 22px',
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(255, 45, 171, 0.45)',
    transition: 'all 0.15s ease',
  },
  btnSecondary: {
    padding: '12px 18px',
    backgroundColor: '#171717',
    color: '#ffffff',
    border: '1px solid #262626',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnLink: {
    color: '#ff2dab',
    fontSize: '12px',
    textDecoration: 'none',
    fontWeight: 600,
    marginLeft: '6px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
    marginTop: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #1a1a1a',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '6px',
    padding: '8px 10px',
  },
  statLabel: {
    color: '#71717a',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  statVal: {
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700,
  },
  rightCol: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
};
