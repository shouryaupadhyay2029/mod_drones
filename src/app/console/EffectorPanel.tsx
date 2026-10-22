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
                backgroundColor: isJammerReady ? 'rgba(255, 45, 171, 0.15)' : '#262626',
                border: isJammerReady ? '1px solid #ff2dab' : '1px solid #3f3f46',
                color: isJammerReady ? '#ff2dab' : '#fcd34d',
                boxShadow: isJammerReady ? '0 0 8px rgba(255, 45, 171, 0.3)' : 'none',
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
                  ? 'rgba(255, 45, 171, 0.15)'
                  : effectors.gun.ammo <= 0
                    ? '#261515'
                    : '#262626',
                border: isGunReady
                  ? '1px solid #ff2dab'
                  : effectors.gun.ammo <= 0
                    ? '1px solid #ef4444'
                    : '1px solid #3f3f46',
                color: isGunReady
                  ? '#ff2dab'
                  : effectors.gun.ammo <= 0
                    ? '#fca5a5'
                    : '#fcd34d',
                boxShadow: isGunReady ? '0 0 8px rgba(255, 45, 171, 0.3)' : 'none',
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
                  color: effectors.gun.ammo <= 5 ? '#f87171' : '#ff2dab',
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
    backgroundColor: '#121212',
    border: '1px solid #262626',
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
    color: '#ff2dab',
    letterSpacing: '0.06em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  card: {
    backgroundColor: '#080808',
    border: '1px solid #262626',
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
    color: '#ffffff',
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
    color: '#a1a1aa',
  },
  val: {
    color: '#ffffff',
  },
};
