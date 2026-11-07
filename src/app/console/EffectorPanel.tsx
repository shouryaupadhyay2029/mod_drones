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

  // Generate 20 burst pips for magazine rack
  const totalBursts = 20;
  const currentAmmo = Math.max(0, Math.min(totalBursts, effectors.gun.ammo));

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
                backgroundColor: isJammerReady ? 'rgba(21, 128, 61, 0.12)' : 'rgba(180, 83, 9, 0.14)',
                color: isJammerReady ? '#15803d' : '#b45309',
                borderColor: isJammerReady ? 'rgba(21, 128, 61, 0.35)' : 'rgba(180, 83, 9, 0.35)',
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
              <span style={{ color: '#181716', fontWeight: 700 }}>2.0 s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">TARGET</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>RF (&gt;800m)</span>
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
                  ? 'rgba(21, 128, 61, 0.12)'
                  : effectors.gun.ammo <= 0
                  ? 'rgba(184, 51, 39, 0.15)'
                  : 'rgba(180, 83, 9, 0.14)',
                color: isGunReady
                  ? '#15803d'
                  : effectors.gun.ammo <= 0
                  ? '#b83327'
                  : '#b45309',
                borderColor: isGunReady
                  ? 'rgba(21, 128, 61, 0.35)'
                  : effectors.gun.ammo <= 0
                  ? 'rgba(184, 51, 39, 0.4)'
                  : 'rgba(180, 83, 9, 0.35)',
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
              <span style={{ color: currentAmmo <= 5 ? '#b83327' : '#15803d', fontWeight: 800 }}>
                {currentAmmo} / 20 bursts
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">RANGE</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>1,000 m</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mil-cue-label">CYCLE</span>
              <span style={{ color: '#181716', fontWeight: 700 }}>0.5 s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tactile Ammo Rack Magazine View */}
      <div className="mil-ammo-grid">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8.5px' }}>
          <span style={{ color: '#58544e', fontWeight: 700, letterSpacing: '0.06em' }}>MAGAZINE TRAY (20 BURSTS)</span>
          <span style={{ color: currentAmmo <= 5 ? '#b83327' : '#15803d', fontWeight: 800 }}>
            {currentAmmo} {currentAmmo === 1 ? 'BURST' : 'BURSTS'} AVAILABLE
          </span>
        </div>
        <div className="mil-ammo-rack">
          {Array.from({ length: totalBursts }).map((_, idx) => {
            const isReady = idx < currentAmmo;
            return (
              <div
                key={idx}
                className={`mil-ammo-pip ${isReady ? 'is-ready' : 'is-spent'}`}
                title={`Burst ${idx + 1}: ${isReady ? 'Ready' : 'Expended'}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
