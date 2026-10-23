import React from 'react';

export interface TacticalMarkProps {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

/**
 * Neutral Generic Air-Defense Training Simulation Mark.
 * Strict project rule: No real unit names, military branch designations, or national air force insignia.
 * Generic geometric vector reticle pairing a hardened tactical diamond, interceptor crosshair, and apex chevrons.
 */
export function TacticalMark({
  size = 28,
  color = '#ded7ca',
  style,
}: TacticalMarkProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', ...style }}
    >
      {/* Outer Tactical Octagonal Shield */}
      <polygon
        points="16,2 27,8 27,24 16,30 5,24 5,8"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="rgba(0, 0, 0, 0.25)"
      />
      {/* Inner Concentric Radar Ring */}
      <circle
        cx="16"
        cy="16"
        r="8"
        stroke={color}
        strokeWidth="1"
        strokeDasharray="2 2"
        opacity="0.65"
      />
      {/* Precision Intercept Crosshairs */}
      <line x1="16" y1="5" x2="16" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="20" x2="16" y2="27" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="16" x2="12" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="16" x2="27" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Center Target Diamond Core */}
      <polygon points="16,13.5 18.5,16 16,18.5 13.5,16" fill={color} />
      {/* Upper Chevron / Apex Vector */}
      <polyline
        points="11,10 16,6.5 21,10"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
