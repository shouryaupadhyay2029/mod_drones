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
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    boxSizing: 'border-box',
    padding: '0 0 16px 0',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    height: '600px',
    borderRadius: '0',
    border: 'none',
    boxShadow: 'none',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
};
