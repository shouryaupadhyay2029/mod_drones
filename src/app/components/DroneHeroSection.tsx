import React from 'react';
import { DroneAsciiSimulation } from './DroneAsciiSimulation.js';

export function DroneHeroSection(): React.JSX.Element {
  return (
    <section style={styles.heroSection}>
      {/* Full-Width 3D Tactical Drone ASCII Canvas Container */}
      <div style={styles.canvasWrapper}>
        <DroneAsciiSimulation
          color="#cbb3e8"
          backgroundColor="#080808"
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
    backgroundColor: '#080808',
    borderBottom: '1px solid #262626',
    boxSizing: 'border-box',
    padding: '16px 24px 20px 24px',
  },
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '1440px',
    height: '520px',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(203, 179, 232, 0.08)',
  },
};
