import React from 'react';
import { DroneAsciiSimulation } from './DroneAsciiSimulation.js';

export function DroneHeroSection(): React.JSX.Element {
  return (
    <>
      {/* 100vh Hero Spacer for naturally initiating the scroll journey */}
      <section style={styles.heroSpacer} aria-label="VAJRA Tactical Drone Presentation">
        {/* Scroll cue into the "What is VAJRA?" story */}
        <div className="vj-scroll-cue" aria-hidden="true">
          <span>SCROLL</span>
          <i />
        </div>
      </section>

      {/* Floating Escort 3D Tactical Drone ASCII Canvas */}
      <div style={styles.floatingDroneLayer} aria-hidden="true">
        <DroneAsciiSimulation
          color="#050505"
          backgroundColor="transparent"
          fontSize={11}
          autoRotate={true}
          rotationSpeed={0.012}
        />
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heroSpacer: {
    width: '100%',
    height: '100vh',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
    border: 'none',
    boxSizing: 'border-box',
    padding: 0,
    margin: 0,
    position: 'relative',
    pointerEvents: 'none',
  },
  floatingDroneLayer: {
    position: 'fixed',
    top: '68px',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: 'calc(100vh - 68px)',
    pointerEvents: 'none',
    zIndex: 14,
    overflow: 'visible',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
