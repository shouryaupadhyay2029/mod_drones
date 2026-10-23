import React from 'react';
import { DroneAsciiSimulation } from './DroneAsciiSimulation.js';

export function DroneHeroSection(): React.JSX.Element {
  return (
    <section style={styles.heroSection}>
      {/* Full-Width 3D Tactical Drone ASCII Canvas Container — Seamless with page background */}
      <div style={styles.canvasWrapper}>
        <DroneAsciiSimulation
          color="#050505"
          backgroundColor="transparent"
          fontSize={11}
          autoRotate={true}
          rotationSpeed={0.012}
        />
      </div>

      {/* Scroll cue into the "What is VAJRA?" story */}
      <div className="vj-scroll-cue" aria-hidden="true">
        <span>SCROLL</span>
        <i />
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  heroSection: {
    width: '100%',
    height: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    boxSizing: 'border-box',
    padding: 0,
    margin: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    flex: 1,
    minHeight: 'calc(100vh - 68px)',
    borderRadius: '0',
    border: 'none',
    boxShadow: 'none',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
