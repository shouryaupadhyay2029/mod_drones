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
                backgroundColor: isJammerReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: isJammerReady ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                color: isJammerReady ? '#34d399' : '#fbbf24',
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
                  ? 'rgba(16, 185, 129, 0.15)'
                  : effectors.gun.ammo <= 0
                    ? 'rgba(244, 63, 94, 0.18)'
                    : 'rgba(245, 158, 11, 0.15)',
                border: isGunReady
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : effectors.gun.ammo <= 0
                    ? '1px solid rgba(244, 63, 94, 0.4)'
                    : '1px solid rgba(245, 158, 11, 0.4)',
                color: isGunReady
                  ? '#34d399'
                  : effectors.gun.ammo <= 0
                    ? '#fb7185'
                    : '#fbbf24',
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
                  color: effectors.gun.ammo <= 5 ? '#fb7185' : '#34d399',
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
    backgroundColor: '#0c1015',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontFamily: 'ui-monospace, monospace',
  },
  header: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#f8fafc',
    letterSpacing: '0.06em',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '8px',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '9px 11px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cardTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  statusBadge: {
    padding: '1px 6px',
    borderRadius: '3px',
    fontSize: '9.5px',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    letterSpacing: '0.04em',
  },
  cardDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '10.5px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#64748b',
    fontSize: '9.5px',
    letterSpacing: '0.02em',
  },
  val: {
    color: '#e2e8f0',
    fontWeight: 600,
  },
};
