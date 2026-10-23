/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface NavMiniAsciiPreviewProps {
  modelType: 'terrain' | 'radar' | 'fpv';
  color?: string;
  backgroundColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  kind?: 'body' | 'propeller' | 'radar' | 'pulse' | 'terrain' | 'corridor';
}

const ASCII_RAMP = '   ..:--==++**%%@@##';

// 1B: 3D Topographic Terrain with Low-Altitude Flight Corridor
function generateTerrainModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Undulating terrain surface grid (ridge lines and valleys)
  for (let x = -1.3; x <= 1.3; x += 0.12) {
    for (let z = -1.2; z <= 1.2; z += 0.12) {
      // Ridges and valleys elevation function
      const y =
        0.32 * Math.sin(x * 2.2) * Math.cos(z * 2.2) +
        0.18 * Math.cos(x * 3.8 + z * 1.5) -
        0.15;
      points.push({ x, y, z, kind: 'terrain' });

      // Secondary slope fill for wireframe ridge depth
      if (Math.abs(Math.sin(x * 2.2 + z)) > 0.6) {
        points.push({ x, y: y - 0.06, z, kind: 'terrain' });
      }
    }
  }

  // 2. Base perimeter border box (topographic contour boundary)
  for (let t = -1.3; t <= 1.3; t += 0.08) {
    points.push({ x: t, y: -0.45, z: -1.2, kind: 'terrain' });
    points.push({ x: t, y: -0.45, z: 1.2, kind: 'terrain' });
    points.push({ x: -1.3, y: -0.45, z: t * 0.92, kind: 'terrain' });
    points.push({ x: 1.3, y: -0.45, z: t * 0.92, kind: 'terrain' });
  }

  // 3. Tactical Low-Altitude Flight Corridor (sinuous path through valleys)
  for (let t = -1.25; t <= 1.25; t += 0.035) {
    const fx = t;
    const fz = 0.42 * Math.sin(t * 2.6);
    const fy = 0.12 + 0.08 * Math.cos(t * 3.2);

    // Main corridor beam line
    points.push({ x: fx, y: fy, z: fz, kind: 'corridor' });
    points.push({ x: fx, y: fy + 0.03, z: fz, kind: 'corridor' });

    // Waypoint vertical laser beacon pylons at key waypoints
    if (Math.abs(t) < 0.04 || Math.abs(t - 0.8) < 0.04 || Math.abs(t + 0.8) < 0.04) {
      for (let py = fy; py <= fy + 0.35; py += 0.04) {
        points.push({ x: fx, y: py, z: fz, kind: 'corridor' });
      }
      // Waypoint diamond beacon
      for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 2) {
        points.push({
          x: fx + 0.06 * Math.cos(ang),
          y: fy + 0.35,
          z: fz + 0.06 * Math.sin(ang),
          kind: 'corridor',
        });
      }
    }
  }

  return points;
}

// 2A: Rotating Pulse-Doppler Radar Dish & Antenna Assembly
function generateRadarModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Pedestal Base & Turntable
  for (let y = -0.85; y <= -0.45; y += 0.04) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.35) {
      const r = y < -0.65 ? 0.45 : 0.28;
      points.push({
        x: r * Math.cos(theta),
        y,
        z: r * Math.sin(theta),
        kind: 'body',
      });
    }
  }

  // 2. Twin Elevation Support Yoke Arms
  for (const signX of [-1, 1]) {
    const armX = signX * 0.32;
    for (let y = -0.45; y <= 0.05; y += 0.04) {
      points.push({ x: armX, y, z: 0, kind: 'body' });
      points.push({ x: armX, y, z: -0.06, kind: 'body' });
    }
  }

  // 3. Parabolic Radar Dish Reflector (facing +Z)
  for (let r = 0.08; r <= 0.82; r += 0.05) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.22) {
      const dishX = r * Math.cos(theta);
      const dishY = r * Math.sin(theta);
      const dishZ = -0.32 * (r * r); // Parabolic curvature
      points.push({
        x: dishX,
        y: dishY,
        z: dishZ,
        kind: 'radar',
      });
    }
  }

  // Outer Dish Rim Ring
  for (let theta = 0; theta < Math.PI * 2; theta += 0.1) {
    const rimR = 0.84;
    points.push({
      x: rimR * Math.cos(theta),
      y: rimR * Math.sin(theta),
      z: -0.32 * (rimR * rimR),
      kind: 'radar',
    });
  }

  // 4. Center Feed-Horn Tripod & Waveguide Emitter
  for (let z = 0; z <= 0.52; z += 0.04) {
    // 3 support struts converging on feed horn
    const taper = (0.52 - z) / 0.52;
    for (let a = 0; a < 3; a++) {
      const ang = (a * 2 * Math.PI) / 3;
      points.push({
        x: 0.65 * taper * Math.cos(ang),
        y: 0.65 * taper * Math.sin(ang),
        z: -0.2 + z * 1.38,
        kind: 'radar',
      });
    }
  }

  // Feed Horn Head
  for (let theta = 0; theta < Math.PI * 2; theta += 0.3) {
    points.push({
      x: 0.1 * Math.cos(theta),
      y: 0.1 * Math.sin(theta),
      z: 0.52,
      kind: 'radar',
    });
  }

  return points;
}

// 3A: Hostile FPV Kamikaze Racing Drone (Attack Dive Pitch)
function generateFpvModel(): Point3D[] {
  const points: Point3D[] = [];

  // Forward tilt angle (attack dive pose: ~22 degrees pitch down)
  const attackPitch = -0.38;
  const cosP = Math.cos(attackPitch);
  const sinP = Math.sin(attackPitch);

  const rotatePoint = (x: number, y: number, z: number, kind: Point3D['kind']) => {
    const yRot = y * cosP - z * sinP;
    const zRot = y * sinP + z * cosP;
    points.push({ x, y: yRot, z: zRot, kind });
  };

  // 1. Compact Central Carbon Unibody Plate
  for (let x = -0.22; x <= 0.22; x += 0.035) {
    for (let z = -0.42; z <= 0.42; z += 0.035) {
      rotatePoint(x, 0.05, z, 'body');
      rotatePoint(x, -0.05, z, 'body');
    }
  }

  // 2. High-Capacity Battery Pack & Top Strap
  for (let x = -0.16; x <= 0.16; x += 0.035) {
    for (let z = -0.25; z <= 0.18; z += 0.035) {
      for (let y = 0.06; y <= 0.22; y += 0.04) {
        rotatePoint(x, y, z, 'body');
      }
    }
  }

  // 3. Front Munition Payload (Underslung Shaped Charge / Warhead)
  for (let z = 0.1; z <= 0.65; z += 0.035) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.35) {
      const r = z > 0.5 ? 0.09 * ((0.65 - z) / 0.15) : 0.13; // Tapered detonator tip
      rotatePoint(r * Math.cos(theta), -0.15 + r * Math.sin(theta), z, 'body');
    }
  }
  // Detonator impact probe contact wires
  rotatePoint(0, -0.15, 0.72, 'body');
  rotatePoint(0.04, -0.15, 0.76, 'body');
  rotatePoint(-0.04, -0.15, 0.76, 'body');

  // 4. Tilting High-Speed FPV Camera Head
  for (let theta = 0; theta < Math.PI * 2; theta += 0.3) {
    rotatePoint(0.08 * Math.cos(theta), 0.12 + 0.08 * Math.sin(theta), 0.46, 'body');
  }

  // 5. Rear Long-Range VTX Antenna Pigtail (LHCP Cloverleaf)
  for (let y = 0.15; y <= 0.45; y += 0.035) {
    rotatePoint(-0.02, y, -0.48 - (y - 0.15) * 0.4, 'body');
  }
  // Antenna bulb
  for (let ang = 0; ang < Math.PI * 2; ang += 0.5) {
    rotatePoint(
      -0.02 + 0.08 * Math.cos(ang),
      0.46 + 0.08 * Math.sin(ang),
      -0.6,
      'body'
    );
  }

  // 6. X-Frame Arms & Stator Motors
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLen = 0.95;

  for (const ang of armAngles) {
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);

    for (let r = 0.18; r <= armLen; r += 0.03) {
      rotatePoint(r * cosA, 0.0, r * sinA, 'body');
      rotatePoint(r * cosA + 0.02 * -sinA, -0.02, r * sinA + 0.02 * cosA, 'body');
    }

    // Motor Bell
    const mx = armLen * cosA;
    const mz = armLen * sinA;
    for (let my = -0.06; my <= 0.08; my += 0.03) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.4) {
        rotatePoint(mx + 0.11 * Math.cos(theta), my, mz + 0.11 * Math.sin(theta), 'body');
      }
    }
  }

  return points;
}

export function NavMiniAsciiPreview({
  modelType,
  color,
  backgroundColor = 'transparent',
  className = '',
  style,
}: NavMiniAsciiPreviewProps): React.JSX.Element {
  const [asciiText, setAsciiText] = useState<string>('');
  const anglesRef = useRef({ yaw: 0.0, pitch: 0.0 });
  const pulsePhaseRef = useRef(0);
  const propAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // High-contrast tactical theme colors per model type on orange background
  const themeColor =
    color ||
    (modelType === 'terrain'
      ? '#ffd480' // Warm luminous gold terrain contours
      : modelType === 'radar'
        ? '#d4ff3f' // Precision tactical lime phosphor radar sweep
        : '#ffffff'); // Crisp pure-white FPV quadrotor wireframe

  // Load static point model
  const basePointsRef = useRef<Point3D[]>([]);
  useEffect(() => {
    if (modelType === 'terrain') {
      basePointsRef.current = generateTerrainModel();
      anglesRef.current = { yaw: 0.4, pitch: 0.58 };
    } else if (modelType === 'radar') {
      basePointsRef.current = generateRadarModel();
      anglesRef.current = { yaw: 0.3, pitch: 0.32 };
    } else {
      basePointsRef.current = generateFpvModel();
      anglesRef.current = { yaw: 0.55, pitch: 0.4 };
    }
  }, [modelType]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    anglesRef.current.yaw += dx * 0.012;
    anglesRef.current.pitch += dy * 0.012;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    let animId: number;

    const render = () => {
      // Auto-rotation
      if (!isDraggingRef.current) {
        anglesRef.current.yaw += modelType === 'radar' ? 0.024 : 0.014;
      }
      pulsePhaseRef.current += 0.06;
      propAngleRef.current += 0.45;

      const dynamicPoints: Point3D[] = [];

      // 1. Radar expanding pulsed wavefronts
      if (modelType === 'radar') {
        const pulseCycle = (pulsePhaseRef.current % 3) / 3;
        for (let ring = 0; ring < 3; ring++) {
          const rProg = (pulseCycle + ring / 3) % 1;
          const beamZ = 0.55 + rProg * 1.4;
          const beamRadius = 0.15 + rProg * 0.65;

          // 120-degree forward radiating beam arc
          for (let theta = -Math.PI / 3; theta <= Math.PI / 3; theta += 0.18) {
            dynamicPoints.push({
              x: beamRadius * Math.sin(theta),
              y: beamRadius * Math.cos(theta) * 0.7,
              z: beamZ,
              kind: 'pulse',
            });
          }
        }
      }

      // 2. FPV Spinning 3-Blade Rotors
      if (modelType === 'fpv') {
        const attackPitch = -0.38;
        const cosP = Math.cos(attackPitch);
        const sinP = Math.sin(attackPitch);
        const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
        const armLen = 0.95;
        const propR = 0.38;

        armAngles.forEach((ang, idx) => {
          const mx = armLen * Math.cos(ang);
          const mz = armLen * Math.sin(ang);
          const my = 0.07;
          const dir = idx % 2 === 0 ? 1 : -1;
          const curProp = propAngleRef.current * dir;

          for (let b = 0; b < 3; b++) {
            const bAng = curProp + (b * (2 * Math.PI)) / 3;
            const cosB = Math.cos(bAng);
            const sinB = Math.sin(bAng);

            for (let r = 0.05; r <= propR; r += 0.06) {
              const lx = mx + r * cosB;
              const ly = my;
              const lz = mz + r * sinB;
              // Apply frame attack pitch
              const yRot = ly * cosP - lz * sinP;
              const zRot = ly * sinP + lz * cosP;
              dynamicPoints.push({ x: lx, y: yRot, z: zRot, kind: 'propeller' });
            }
          }
        });
      }

      const allPoints = [...basePointsRef.current, ...dynamicPoints];

      // Compact grid for dropdown preview cards
      const cols = 56;
      const rows = 20;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const { yaw, pitch } = anglesRef.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      // Camera parameters
      const distance = modelType === 'terrain' ? 3.0 : 2.5;
      const scaleX = 35;
      const scaleY = 16;

      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i]!;

        // Rotate Y
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;

        // Rotate X
        const y2 = pt.y * cosP - z1 * sinP;
        const z2 = pt.y * sinP + z1 * cosP;

        const zFinal = z2 + distance;
        if (zFinal <= 0.1) continue;

        const invZ = 1 / zFinal;
        const screenX = Math.floor(cols / 2 + x1 * invZ * scaleX);
        const screenY = Math.floor(rows / 2 - y2 * invZ * scaleY);

        if (screenX >= 0 && screenX < cols && screenY >= 0 && screenY < rows) {
          const idx = screenY * cols + screenX;

          if (invZ > zBuffer[idx]!) {
            zBuffer[idx] = invZ;

            let charIndex: number;
            if (pt.kind === 'corridor') {
              charIndex = 14; // High-intensity flight corridor
            } else if (pt.kind === 'pulse') {
              charIndex = 11; // Radar pulse wave
            } else if (pt.kind === 'propeller') {
              charIndex = 12;
            } else {
              const depthNorm = Math.max(0, Math.min(1, (z2 + 1.4) / 2.8));
              charIndex = Math.floor(depthNorm * (ASCII_RAMP.length - 1));
            }

            buffer[idx] = ASCII_RAMP[charIndex] || '#';
          }
        }
      }

      let out = '';
      for (let r = 0; r < rows; r++) {
        out += buffer.slice(r * cols, (r + 1) * cols).join('') + '\n';
      }

      setAsciiText(out);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [modelType]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`nav-mini-ascii-preview ${className}`}
      style={{
        width: '100%',
        height: '136px',
        backgroundColor,
        borderRadius: '6px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        border: 'none',
        position: 'relative',
        ...style,
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'Courier New, monospace',
          fontSize: '7.5px',
          lineHeight: '7.5px',
          color: themeColor,
          whiteSpace: 'pre',
          textAlign: 'center',
          letterSpacing: '-0.02em',
          textShadow: `0 0 8px ${themeColor}60`,
        }}
      >
        {asciiText}
      </pre>

      {/* Subtle corner badge */}
      <span
        style={{
          position: 'absolute',
          bottom: '5px',
          right: '7px',
          fontSize: '8px',
          fontFamily: 'monospace',
          color: themeColor,
          opacity: 0.65,
          letterSpacing: '0.06em',
          pointerEvents: 'none',
        }}
      >
        {modelType === 'terrain'
          ? 'TERRAIN 3D'
          : modelType === 'radar'
            ? 'RADAR 3D'
            : 'FPV 3D'}
      </span>
    </div>
  );
}
