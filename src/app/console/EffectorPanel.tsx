import React from 'react';
import { TraineeEffectorsView } from '../../sim/index.js';
import './tactical-console.css';

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

  // Generate 20 round pips for ammo rack
  const totalRounds = 20;
  const currentAmmo = Math.max(0, Math.min(totalRounds, effectors.gun.ammo));

  return (
    <div className="mil-panel">
      {/* Header */}
      <div className="mil-header">
        <div className="mil-header-left">
          <span className={`mil-led ${isJammerReady && isGunReady ? 'mil-led-green' : 'mil-led-amber'}`} />
          <span className="mil-kicker">// SYS.03</span>
          <span className="mil-title">DEFENSE EFFECTORS STATUS</span>
        </div>
        <span className="mil-tag mil-tag-confirmed">ONLINE</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Jammer Card */}
        <div className="mil-cue-card" style={{ gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#181716' }}>RF JAMMER</span>
            <span
              className="mil-tag"
              style={{
                fontSize: '8.5px',
                padding: '1px 5px',
                backgroundColor: isJammerReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                color: isJammerReady ? '#34d399' : '#fbbf24',
                borderColor: isJammerReady ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)',
              }}
            >
              {isJammerReady ? 'READY' : `BUSY (${jammerBusySec}s)`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">RANGE</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>1,500 m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">CYCLE</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>3.0 s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">TARGET</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>RF-Links</span>
            </div>
          </div>
        </div>

        {/* Kinetic Gun Card */}
        <div className="mil-cue-card" style={{ gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#181716' }}>KINETIC GUN</span>
            <span
              className="mil-tag"
              style={{
                fontSize: '8.5px',
                padding: '1px 5px',
                backgroundColor: isGunReady
                  ? 'rgba(16, 185, 129, 0.12)'
                  : effectors.gun.ammo <= 0
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(245, 158, 11, 0.12)',
                color: isGunReady
                  ? '#34d399'
                  : effectors.gun.ammo <= 0
                  ? '#f87171'
                  : '#fbbf24',
                borderColor: isGunReady
                  ? 'rgba(16, 185, 129, 0.35)'
                  : effectors.gun.ammo <= 0
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(245, 158, 11, 0.35)',
              }}
            >
              {effectors.gun.ammo <= 0
                ? 'EMPTY'
                : isGunReady
                ? 'ARMED'
                : `CYCLE (${gunBusySec}s)`}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">AMMO</span>
              <span style={{ color: currentAmmo <= 5 ? '#f87171' : '#34d399', fontWeight: 800 }}>
                {currentAmmo} / 20 rnds
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">RANGE</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>1,000 m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">BURST</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>5 rounds</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tactile Ammo Rack Magazine View */}
      <div className="mil-ammo-grid">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8.5px' }}>
          <span style={{ color: '#58544e', fontWeight: 700, letterSpacing: '0.06em' }}>MAGAZINE TRAY (20 ROUNDS)</span>
          <span style={{ color: currentAmmo <= 5 ? '#f87171' : '#34d399', fontWeight: 800 }}>
            {Math.floor(currentAmmo / 5)} BURSTS AVAILABLE
          </span>
        </div>
        <div className="mil-ammo-rack">
          {Array.from({ length: totalRounds }).map((_, idx) => {
            const isReady = idx < currentAmmo;
            return (
              <div
                key={idx}
                className={`mil-ammo-pip ${isReady ? 'is-ready' : 'is-spent'}`}
                title={`Round ${idx + 1}: ${isReady ? 'Ready' : 'Expended'}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
