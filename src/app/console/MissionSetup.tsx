import React, { useState } from 'react';
import { DroneHeroSection } from '../components/DroneHeroSection.js';
import { TextRoll } from '../components/TextRoll.js';

export interface MissionSetupProps {
  onStart: (seed: string, scenarioId?: string) => void;
}

interface ScenarioOption {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  chips: string[];
}

const SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    id: 'dawn_intrusion',
    title: 'Dawn Intrusion',
    subtitle: 'Standard Baseline Scenario',
    description:
      'Single hostile FPV ingress with civilian quadcopter transit and avian clutter in rural conditions.',
    chips: ['Rural', 'Clear', 'Dusk', 'EW: None'],
  },
  {
    id: 'ridge_runner',
    title: 'Ridge Runner',
    subtitle: 'Terrain Masking & Low Visibility',
    description:
      'Dual hostile FPV ingress utilizing terrain ridge masking in hilly fog conditions with light EW.',
    chips: ['Hilly', 'Fog', 'Vis 2km', 'Dusk', 'EW: Light'],
  },
  {
    id: 'city_edge_night',
    title: 'City Edge Night',
    subtitle: 'Dense Urban Clutter & Heavy EW',
    description:
      'High-altitude reconnaissance UAV and low-altitude fast strike drone in dense urban clutter with rain and heavy EW.',
    chips: ['Urban', 'Rain', 'Vis 5km', 'Night', 'EW: Heavy'],
  },
];

function generateRandomSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 's1';
}

export function MissionSetup({ onStart }: MissionSetupProps): React.JSX.Element {
  const [selectedScenario, setSelectedScenario] = useState<string>('dawn_intrusion');
  const [seedInput, setSeedInput] = useState<string>(() => generateRandomSeed());

  const handleRandomize = () => {
    setSeedInput(generateRandomSeed());
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = seedInput.trim() || 's1';
    onStart(clean, selectedScenario);
  };

  const activeScenario =
    SCENARIO_OPTIONS.find((s) => s.id === selectedScenario) || SCENARIO_OPTIONS[0]!;

  return (
    <div style={styles.container}>
      {/* Skiper14-Inspired 3D ASCII Drone Hero Section */}
      <DroneHeroSection
        onStartMission={() => onStart(seedInput.trim() || 's1', selectedScenario)}
        onExploreScenarios={() => {
          const el = document.getElementById('scenario-selection-card');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <div id="scenario-selection-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.missionTag}>MISSION SELECTION & BRIEFING</div>
          <h2 style={styles.title}>
            <TextRoll center stagger={0.025}>{activeScenario.title}</TextRoll>
          </h2>
          <p style={styles.subtitle}>
            Asset Defense Exercise • Radar Surveillance & Threat Interception
          </p>
        </div>

        {/* Scenario Selection Cards */}
        <div style={styles.scenarioList}>
          {SCENARIO_OPTIONS.map((sc) => {
            const isSelected = sc.id === selectedScenario;
            return (
              <div
                key={sc.id}
                onClick={() => setSelectedScenario(sc.id)}
                style={{
                  ...styles.scenarioCard,
                  borderColor: isSelected ? '#ff2dab' : '#262626',
                  backgroundColor: isSelected ? 'rgba(255, 45, 171, 0.08)' : '#171717',
                  boxShadow: isSelected ? '0 0 12px rgba(255, 45, 171, 0.25)' : 'none',
                }}
              >
                <div style={styles.scenarioCardHeader}>
                  <input
                    type="radio"
                    name="scenarioPicker"
                    checked={isSelected}
                    onChange={() => setSelectedScenario(sc.id)}
                    style={{ cursor: 'pointer', accentColor: '#ff2dab' }}
                  />
                  <span style={styles.scenarioCardTitle}>
                    <TextRoll stagger={0.02}>{sc.title}</TextRoll>
                  </span>
                </div>
                <div style={styles.scenarioCardSubtitle}>{sc.subtitle}</div>
                <div style={styles.chipsRow}>
                  {sc.chips.map((chip, idx) => (
                    <span key={idx} style={styles.chipTag}>
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.briefingBox}>
          <h3 style={styles.briefingHeading}>SITUATION REPORT</h3>
          <p style={styles.briefingText}>{activeScenario.description}</p>
          <ul style={styles.briefingList}>
            <li>
              <strong>Detect & Acknowledge:</strong> Swiftly acknowledge incoming radar tracks
              (under 3.0s latency for full marks).
            </li>
            <li>
              <strong>Classify:</strong> Assess kinematics, closing rate, altitude, and radar cross
              section (RCS) to classify bird, civilian quadcopter, hostile FPV, recon UAV, or clutter.
            </li>
            <li>
              <strong>Decide & Engage:</strong> Neutralize confirmed hostile threats with Jammer
              (&le;1.5km) or Gun (&le;1.0km). Exercise strict fire discipline for non-hostiles and clutter blips.
            </li>
          </ul>
        </div>

        <form onSubmit={handleStart} style={styles.form}>
          <div style={styles.inputGroup}>
            <label htmlFor="missionSeed" style={styles.label}>
              SIMULATION SEED
            </label>
            <div style={styles.inputRow}>
              <input
                id="missionSeed"
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                style={styles.input}
                placeholder="Enter seed (e.g. s1, 42, delta-9)"
              />
              <button
                type="button"
                onClick={handleRandomize}
                style={styles.buttonRandom}
              >
                🎲 <TextRoll stagger={0.02}>Random</TextRoll>
              </button>
            </div>
            <span style={styles.hint}>
              Same seed always generates the exact same radar noise and flight paths.
            </span>
          </div>

          <button type="submit" id="btn-start-mission" style={styles.buttonStart}>
            <TextRoll center duration={0.32} stagger={0.025}>START MISSION</TextRoll>
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    padding: '0 0 50px 0',
    backgroundColor: '#0b0b0b',
    overflowY: 'auto',
    width: '100%',
  },
  card: {
    width: '100%',
    maxWidth: '800px',
    backgroundColor: '#121212',
    border: '1px solid #262626',
    borderRadius: '10px',
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.8)',
    marginTop: '36px',
  },
  header: {
    borderBottom: '1px solid #262626',
    paddingBottom: '12px',
  },
  missionTag: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#ff2dab',
    letterSpacing: '0.1em',
    marginBottom: '4px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '22px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '12px',
    color: '#a1a1aa',
  },
  scenarioList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  scenarioCard: {
    border: '1px solid',
    borderRadius: '6px',
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    transition: 'all 0.15s ease',
  },
  scenarioCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  scenarioCardTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#ffffff',
  },
  scenarioCardSubtitle: {
    fontSize: '10px',
    color: '#a1a1aa',
    marginLeft: '24px',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
    marginLeft: '24px',
  },
  chipTag: {
    fontSize: '9px',
    backgroundColor: '#181818',
    color: '#ff2dab',
    border: '1px solid rgba(255, 45, 171, 0.3)',
    padding: '2px 5px',
    borderRadius: '3px',
    fontWeight: 600,
  },
  briefingBox: {
    backgroundColor: '#080808',
    border: '1px solid #262626',
    borderRadius: '6px',
    padding: '12px 16px',
  },
  briefingHeading: {
    margin: '0 0 6px 0',
    fontSize: '11px',
    fontWeight: 700,
    color: '#ff2dab',
    letterSpacing: '0.08em',
  },
  briefingText: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    lineHeight: '1.4',
    color: '#f4f4f5',
  },
  briefingList: {
    margin: 0,
    paddingLeft: '18px',
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#a1a1aa',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.05em',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#080808',
    border: '1px solid #262626',
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: 'monospace',
    outline: 'none',
  },
  buttonRandom: {
    padding: '8px 14px',
    backgroundColor: '#171717',
    border: '1px solid #262626',
    borderRadius: '6px',
    color: '#ff2dab',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  hint: {
    fontSize: '11px',
    color: '#71717a',
    fontStyle: 'italic',
  },
  buttonStart: {
    padding: '12px 18px',
    backgroundColor: '#ff2dab',
    color: '#0b0b0b',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(255, 45, 171, 0.45)',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    marginTop: '4px',
  },
};
