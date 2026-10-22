/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface DroneAsciiSimulationProps {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  autoRotate?: boolean;
  rotationSpeed?: number;
  enableMouseRotate?: boolean;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  kind?: 'body' | 'arm' | 'motor' | 'propeller' | 'camera' | 'antenna';
}

const ASCII_RAMP = '   ..:--==++**%%@@##';

// Build the procedural 3D Tactical Drone Model with Rotor Guards & Fuselage
function generateDroneModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Central Fuselage / Carbon-Fiber Body (Dense faceted hull)
  for (let x = -0.4; x <= 0.4; x += 0.03) {
    for (let z = -0.55; z <= 0.55; z += 0.03) {
      // Top and bottom carbon plates
      points.push({ x, y: 0.1, z, kind: 'body' });
      points.push({ x, y: -0.1, z, kind: 'body' });

      // Side structural bulkheads
      if (Math.abs(x) > 0.32 || Math.abs(z) > 0.45) {
        for (let y = -0.1; y <= 0.1; y += 0.03) {
          points.push({ x, y, z, kind: 'body' });
        }
      }
    }
  }

  // 2. High-Capacity Battery Pack & Top Flight Controller Hump
  for (let x = -0.22; x <= 0.22; x += 0.03) {
    for (let z = -0.3; z <= 0.2; z += 0.03) {
      for (let y = 0.1; y <= 0.22; y += 0.03) {
        points.push({ x, y, z, kind: 'body' });
      }
    }
  }

  // 3. Forward Optical Tracking Camera & Gimbal
  for (let phi = 0; phi <= Math.PI; phi += 0.2) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.25) {
      const r = 0.16;
      points.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: -0.06 + r * Math.sin(phi) * Math.sin(theta),
        z: 0.65 + r * Math.cos(phi),
        kind: 'camera',
      });
    }
  }

  // 4. Rear Dual Telemetry Antennas
  for (const ax of [-0.08, 0.08]) {
    for (let y = 0.1; y <= 0.38; y += 0.03) {
      points.push({ x: ax, y, z: -0.58, kind: 'antenna' });
    }
    // Angled antenna tips
    points.push({ x: ax * 1.5, y: 0.42, z: -0.62, kind: 'antenna' });
    points.push({ x: ax * 2.0, y: 0.46, z: -0.66, kind: 'antenna' });
  }

  // 5. Four Carbon-Fiber Motor Arms with Rotor Guards
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.35;
  const guardRadius = 0.52;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Thick reinforced arm truss
    for (let r = 0.28; r <= armLength; r += 0.025) {
      points.push({ x: r * cosA, y: 0.02, z: r * sinA, kind: 'arm' });
      points.push({ x: r * cosA, y: -0.04, z: r * sinA, kind: 'arm' });
      // Diagonal cross-brace
      points.push({ x: r * cosA + 0.03 * -sinA, y: -0.01, z: r * sinA + 0.03 * cosA, kind: 'arm' });
    }

    // Heavy-duty Motor Stator Pod
    const mx = armLength * cosA;
    const mz = armLength * sinA;
    for (let my = -0.12; my <= 0.12; my += 0.03) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.35) {
        const mr = 0.14;
        points.push({
          x: mx + mr * Math.cos(theta),
          y: my,
          z: mz + mr * Math.sin(theta),
          kind: 'motor',
        });
      }
    }

    // 360-Degree Circular Rotor Guard Duct around each motor!
    for (let theta = 0; theta < Math.PI * 2; theta += 0.12) {
      points.push({
        x: mx + guardRadius * Math.cos(theta),
        y: 0.06,
        z: mz + guardRadius * Math.sin(theta),
        kind: 'arm',
      });
      points.push({
        x: mx + guardRadius * Math.cos(theta),
        y: -0.04,
        z: mz + guardRadius * Math.sin(theta),
        kind: 'arm',
      });
    }

    // Guard radial spokes
    for (let spokeAngle = 0; spokeAngle < Math.PI * 2; spokeAngle += Math.PI / 2) {
      for (let gr = 0.14; gr <= guardRadius; gr += 0.04) {
        points.push({
          x: mx + gr * Math.cos(spokeAngle),
          y: 0.01,
          z: mz + gr * Math.sin(spokeAngle),
          kind: 'arm',
        });
      }
    }
  }

  // 6. Tactical Landing Skids
  for (const signX of [-1, 1]) {
    const sx = signX * 0.42;
    // Longitudinal skid tube with curved front tips
    for (let sz = -0.55; sz <= 0.55; sz += 0.03) {
      const tipCurve = sz > 0.45 ? (sz - 0.45) * 0.6 : 0;
      points.push({ x: sx, y: -0.28 + tipCurve, z: sz, kind: 'body' });
    }
    // Front and rear skid vertical landing struts
    for (let sy = -0.28; sy <= -0.1; sy += 0.03) {
      points.push({ x: sx, y: sy, z: 0.3, kind: 'body' });
      points.push({ x: sx, y: sy, z: -0.3, kind: 'body' });
    }
  }

  return points;
}

export function DroneAsciiSimulation({
  className = '',
  style,
  color = '#cbb3e8',
  backgroundColor = '#080808',
  fontSize = 9,
  autoRotate = true,
  rotationSpeed = 0.012,
  enableMouseRotate = true,
}: DroneAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [asciiText, setAsciiText] = useState<string>('');
  const [isRotating, setIsRotating] = useState<boolean>(autoRotate);
  const [activeColor, setActiveColor] = useState<string>(color);
  const [wireframeOnly, setWireframeOnly] = useState<boolean>(false);

  // 3D Angles: start at an engaging isometric top-down angle (~37 deg pitch)
  const anglesRef = useRef({ yaw: 0.5, pitch: 0.62, roll: 0.0 });
  const propAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const baseModelRef = useRef<Point3D[]>(generateDroneModel());

  // Mouse drag listeners
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!enableMouseRotate) return;
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    anglesRef.current.yaw += dx * 0.01;
    anglesRef.current.pitch += dy * 0.01;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const resetOrientation = () => {
    anglesRef.current = { yaw: 0.5, pitch: 0.62, roll: 0.0 };
  };

  useEffect(() => {
    let animId: number;
    const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const armLength = 1.35;

    const render = () => {
      if (isRotating && !isDraggingRef.current) {
        anglesRef.current.yaw += rotationSpeed;
      }
      propAngleRef.current += 0.35; // Rotor spinning

      // Generate dynamic 3-blade spinning propellers per motor
      const dynamicProps: Point3D[] = [];
      const propRadius = 0.48;

      armAngles.forEach((angle, idx) => {
        const mx = armLength * Math.cos(angle);
        const mz = armLength * Math.sin(angle);
        const my = 0.08;
        const dir = idx % 2 === 0 ? 1 : -1;
        const currentPropAngle = propAngleRef.current * dir;

        // Tri-blade propeller (120 degree separation)
        for (let b = 0; b < 3; b++) {
          const bladeAngle = currentPropAngle + (b * (2 * Math.PI)) / 3;
          const cosB = Math.cos(bladeAngle);
          const sinB = Math.sin(bladeAngle);

          for (let r = 0.05; r <= propRadius; r += 0.035) {
            dynamicProps.push({
              x: mx + r * cosB,
              y: my + (r / propRadius) * 0.02,
              z: mz + r * sinB,
              kind: 'propeller',
            });
          }
        }
      });

      // Combine base model + dynamic spinning props
      const allPoints = [...baseModelRef.current, ...dynamicProps];

      // Grid dimensions (cols x rows) - Optimized for wide cinematic hero display
      const cols = 116;
      const rows = 48;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const { yaw, pitch } = anglesRef.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      // Camera & projection parameters
      const distance = 2.85;
      const scaleX = 66;
      const scaleY = 32; // Aspect ratio adjustment for monospace characters

      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i]!;

        // 1. Rotate around Y (Yaw)
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;

        // 2. Rotate around X (Pitch)
        const y2 = pt.y * cosP - z1 * sinP;
        const z2 = pt.y * sinP + z1 * cosP;

        // 3. Translate along Z (camera distance)
        const zFinal = z2 + distance;
        if (zFinal <= 0.1) continue;

        // 4. Perspective projection
        const invZ = 1 / zFinal;
        const screenX = Math.floor(cols / 2 + x1 * invZ * scaleX);
        const screenY = Math.floor(rows / 2 - y2 * invZ * scaleY);

        if (screenX >= 0 && screenX < cols && screenY >= 0 && screenY < rows) {
          const idx = screenY * cols + screenX;

          if (invZ > zBuffer[idx]!) {
            zBuffer[idx] = invZ;

            // Compute lighting / character density
            let charIndex: number;
            if (wireframeOnly) {
              charIndex = pt.kind === 'propeller' ? 9 : 5;
            } else {
              // Depth-based shading gradient with specular highlight on rotors
              const depthNorm = Math.max(0, Math.min(1, (z2 + 1.8) / 3.6));
              const rampIdx = Math.floor(depthNorm * (ASCII_RAMP.length - 1));
              charIndex = pt.kind === 'propeller' ? Math.min(ASCII_RAMP.length - 1, rampIdx + 2) : rampIdx;
            }

            buffer[idx] = ASCII_RAMP[charIndex] || '#';
          }
        }
      }

      // Convert buffer into multi-line ASCII string
      let out = '';
      for (let r = 0; r < rows; r++) {
        out += buffer.slice(r * cols, (r + 1) * cols).join('') + '\n';
      }

      setAsciiText(out);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isRotating, rotationSpeed, wireframeOnly]);

  return (
    <div
      ref={containerRef}
      className={`ascii-sim-wrapper ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '480px',
        backgroundColor: backgroundColor || 'transparent',
        borderRadius: '0',
        border: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        cursor: isDraggingRef.current ? 'grabbing' : 'grab',
        boxShadow: 'none',
        ...style,
      }}
    >
      {/* Top Floating Controls Bar (Skiper UI style) */}
      <div
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          display: 'flex',
          gap: '8px',
          zIndex: 10,
        }}
      >
        <button
          onClick={() => setIsRotating((prev) => !prev)}
          title="Toggle Auto-Rotation"
          style={{
            backgroundColor: '#171717',
            border: '1px solid #262626',
            color: isRotating ? activeColor : '#71717a',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: 'pointer',
            boxShadow: isRotating ? `0 0 8px ${activeColor}30` : 'none',
          }}
        >
          {isRotating ? '⏸ PAUSE ROTATE' : '▶ AUTO-ROTATE'}
        </button>

        <button
          onClick={resetOrientation}
          title="Reset Orientation"
          style={{
            backgroundColor: '#171717',
            border: '1px solid #262626',
            color: '#ffffff',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          ↺ RESET
        </button>

        <button
          onClick={() => setWireframeOnly((prev) => !prev)}
          title="Toggle ASCII Density"
          style={{
            backgroundColor: '#171717',
            border: '1px solid #262626',
            color: wireframeOnly ? activeColor : '#a1a1aa',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          {wireframeOnly ? 'WIREFRAME' : 'SHADED'}
        </button>

        <button
          onClick={() => {
            const nextColor =
              activeColor === '#cbb3e8'
                ? '#d4ff3f'
                : activeColor === '#d4ff3f'
                  ? '#e34234'
                  : '#cbb3e8';
            setActiveColor(nextColor);
          }}
          title="Switch Color Theme (Lavender / Chartreuse / Tomato)"
          style={{
            backgroundColor: '#181818',
            border: `1px solid ${activeColor}`,
            color: activeColor,
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: `0 0 10px ${activeColor}30`,
          }}
        >
          THEME
        </button>
      </div>

      {/* ASCII Output Display */}
      <pre
        style={{
          margin: 0,
          padding: '16px',
          fontFamily: 'Courier New, monospace',
          fontSize: `${fontSize}px`,
          lineHeight: '9px',
          letterSpacing: '1px',
          color: activeColor,
          textShadow: `0 0 6px ${activeColor}40`,
          whiteSpace: 'pre',
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        {asciiText}
      </pre>
    </div>
  );
}
