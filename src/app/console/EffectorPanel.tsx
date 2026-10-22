import React from 'react';
import { TraineeEffectorsView } from '../../sim/index.js';

export interface EffectorPanelProps {
  effectors: TraineeEffectorsView;
  currentTick: number;
}

export function EffectorPanel({
  effectors,
  currentTick,
}: EffectorPanelProps): React.JSX.Element {
  const jammerBusySec = Math.max(
    0,
    Math.ceil((effectors.jammer.busyUntilTick - currentTick) / 20)
  );
  const gunBusySec = Math.max(
    0,
    Math.ceil((effectors.gun.busyUntilTick - currentTick) / 20)
  );

  const isJammerReady = jammerBusySec === 0;
  const isGunReady = gunBusySec === 0 && effectors.gun.ammo > 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>DEFENSE EFFECTORS STATUS</div>
      <div style={styles.grid}>
        {/* Jammer Card */}
        <div style={styles.card}>
          <div style={styles.cardTitleRow}>
            <span style={styles.cardTitle}>RF JAMMER</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: isJammerReady ? '#064e3b' : '#78350f',
                color: isJammerReady ? '#6ee7b7' : '#fcd34d',
              }}
            >
              {isJammerReady ? 'READY' : `ACTIVE (${jammerBusySec}s)`}
            </span>
          </div>
          <div style={styles.cardDetail}>
            <div style={styles.row}>
              <span style={styles.label}>EFFECTIVE RANGE:</span>
              <span style={styles.val}>1,500 m</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>CYCLE DURATION:</span>
              <span style={styles.val}>3.0 s</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>TARGET TYPES:</span>
              <span style={styles.val}>RF-controlled links</span>
            </div>
          </div>
        </div>

        {/* Kinetic Gun Card */}
        <div style={styles.card}>
          <div style={styles.cardTitleRow}>
            <span style={styles.cardTitle}>KINETIC GUN</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: isGunReady
                  ? '#064e3b'
                  : effectors.gun.ammo <= 0
                    ? '#7f1d1d'
                    : '#78350f',
                color: isGunReady
                  ? '#6ee7b7'
                  : effectors.gun.ammo <= 0
                    ? '#fca5a5'
                    : '#fcd34d',
              }}
            >
              {effectors.gun.ammo <= 0
                ? 'OUT OF AMMO'
                : isGunReady
                  ? 'ARMED'
                  : `RELOAD (${gunBusySec}s)`}
            </span>
          </div>
          <div style={styles.cardDetail}>
            <div style={styles.row}>
              <span style={styles.label}>AMMO REMAINING:</span>
              <span
                style={{
                  ...styles.val,
                  color: effectors.gun.ammo <= 5 ? '#f87171' : '#38bdf8',
                  fontWeight: 700,
                }}
              >
                {effectors.gun.ammo} / 20 rounds
              </span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>EFFECTIVE RANGE:</span>
              <span style={styles.val}>1,000 m</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>BURST SIZE:</span>
              <span style={styles.val}>5 rounds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0b111e',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontFamily: 'monospace',
  },
  header: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.05em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  card: {
    backgroundColor: '#030712',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 700,
  },
  statusBadge: {
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 700,
  },
  cardDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#64748b',
  },
  val: {
    color: '#cbd5e1',
  },
};
