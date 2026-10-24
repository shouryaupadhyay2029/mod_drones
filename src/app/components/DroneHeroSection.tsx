import React from 'react';
import { DroneAsciiSimulation } from './DroneAsciiSimulation.js';

export function DroneHeroSection(): React.JSX.Element {
  return (
    <div style={styles.escortWrapper} aria-label="VAJRA Tactical Drone Presentation">
      <DroneAsciiSimulation
        color="#050505"
        backgroundColor="transparent"
        fontSize={11}
        autoRotate={true}
        rotationSpeed={0.012}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  escortWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    margin: 0,
    padding: 0,
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
};



