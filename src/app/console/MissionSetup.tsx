import React, { useState } from 'react';

export interface MissionSetupProps {
  onStart: (seed: string) => void;
}

function generateRandomSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 's1';
}

export function MissionSetup({ onStart }: MissionSetupProps): React.JSX.Element {
  const [seedInput, setSeedInput] = useState<string>(() => generateRandomSeed());

  const handleRandomize = () => {
    setSeedInput(generateRandomSeed());
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = seedInput.trim() || 's1';
    onStart(clean);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.missionTag}>MISSION BRIEFING</div>
          <h2 style={styles.title}>Dawn Intrusion</h2>
          <p style={styles.subtitle}>
            Asset Defense Exercise • Radar Surveillance & Threat Interception
          </p>
        </div>

        <div style={styles.briefingBox}>
          <h3 style={styles.briefingHeading}>SITUATION REPORT</h3>
          <p style={styles.briefingText}>
            Early dawn airspace radar contact monitoring. Unidentified radar tracks have been
            detected approaching the protected asset sector. Trainee objective:
          </p>
          <ul style={styles.briefingList}>
            <li>
              <strong>Detect & Acknowledge:</strong> Swiftly acknowledge incoming radar tracks
              (under 3.0s latency for full marks).
            </li>
            <li>
              <strong>Classify:</strong> Assess kinematics, closing rate, altitude, and radar cross
              section (RCS) to classify bird, civilian quadcopter, or hostile drone.
            </li>
            <li>
              <strong>Decide & Engage:</strong> Neutralize confirmed hostile threats with Jammer
              (&le;1.5km) or Gun (&le;1.0km). Exercise strict fire discipline for non-hostiles.
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
                🎲 Random
              </button>
            </div>
            <span style={styles.hint}>
              Same seed always generates the exact same radar noise and flight paths.
            </span>
          </div>

          <button type="submit" id="btn-start-mission" style={styles.buttonStart}>
            START MISSION
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '40px 20px',
    minHeight: 'calc(100vh - 120px)',
  },
  card: {
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '12px',
    maxWidth: '640px',
    width: '100%',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '16px',
  },
  missionTag: {
    color: '#38bdf8',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
    color: '#f8fafc',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#94a3b8',
  },
  briefingBox: {
    backgroundColor: '#030712',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '16px 20px',
  },
  briefingHeading: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    color: '#38bdf8',
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  briefingText: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: '1.5',
  },
  briefingList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    color: '#94a3b8',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    flex: 1,
    backgroundColor: '#030712',
    border: '1px solid #334155',
    color: '#f8fafc',
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
    outline: 'none',
  },
  buttonRandom: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: '#e2e8f0',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: '11px',
    color: '#64748b',
    fontFamily: 'monospace',
  },
  buttonStart: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
};
