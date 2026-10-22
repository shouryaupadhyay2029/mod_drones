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

const ASCII_RAMP = ' .:-=+*#%@█';

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
  color = '#050505',
  backgroundColor = 'transparent',
  fontSize = 10,
  autoRotate = true,
  rotationSpeed = 0.012,
  enableMouseRotate = true,
}: DroneAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Card DOM refs to get exact pixel anchor coordinates
  const card1Ref = useRef<HTMLDivElement | null>(null);
  const card2Ref = useRef<HTMLDivElement | null>(null);
  const card3Ref = useRef<HTMLDivElement | null>(null);
  const card4Ref = useRef<HTMLDivElement | null>(null);

  const [asciiText, setAsciiText] = useState<string>('');
  const [isRotating, setIsRotating] = useState<boolean>(autoRotate);
  const [activeColor, setActiveColor] = useState<string>(color);
  const [wireframeOnly, setWireframeOnly] = useState<boolean>(false);

  // SVG HUD Leader Line direct DOM refs for 60fps synchronous tracking without React re-renders
  const lineTlRef = useRef<SVGPathElement | null>(null);
  const lineTrRef = useRef<SVGPathElement | null>(null);
  const lineBlRef = useRef<SVGPathElement | null>(null);
  const lineBrRef = useRef<SVGPathElement | null>(null);

  const dotTlRef = useRef<SVGCircleElement | null>(null);
  const dotTrRef = useRef<SVGCircleElement | null>(null);
  const dotBlRef = useRef<SVGCircleElement | null>(null);
  const dotBrRef = useRef<SVGCircleElement | null>(null);

  const ringTlRef = useRef<SVGCircleElement | null>(null);
  const ringTrRef = useRef<SVGCircleElement | null>(null);
  const ringBlRef = useRef<SVGCircleElement | null>(null);
  const ringBrRef = useRef<SVGCircleElement | null>(null);

  const pinTlRef = useRef<SVGCircleElement | null>(null);
  const pinTrRef = useRef<SVGCircleElement | null>(null);
  const pinBlRef = useRef<SVGCircleElement | null>(null);
  const pinBrRef = useRef<SVGCircleElement | null>(null);

  // Layout cache to avoid layout thrashing during 60fps RAF loop
  const layoutRef = useRef({
    c1: { x: 280, y: 80 },
    c2: { x: 720, y: 80 },
    c3: { x: 280, y: 520 },
    c4: { x: 720, y: 520 },
    preLeft: 0,
    preTop: 0,
    preWidth: 800,
    preHeight: 480,
  });

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

  // Recompute layout bounds when window resizes or component mounts
  const updateLayoutBounds = () => {
    if (!containerRef.current || !preRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();
    const pre = preRef.current.getBoundingClientRect();
    const c1 = card1Ref.current?.getBoundingClientRect();
    const c2 = card2Ref.current?.getBoundingClientRect();
    const c3 = card3Ref.current?.getBoundingClientRect();
    const c4 = card4Ref.current?.getBoundingClientRect();

    const c1Pos = c1
      ? { x: c1.right - cont.left, y: c1.top - cont.top + c1.height / 2 }
      : { x: 275, y: 80 };
    const c2Pos = c2
      ? { x: c2.left - cont.left, y: c2.top - cont.top + c2.height / 2 }
      : { x: cont.width - 275, y: 80 };
    const c3Pos = c3
      ? { x: c3.right - cont.left, y: c3.top - cont.top + c3.height / 2 }
      : { x: 275, y: cont.height - 80 };
    const c4Pos = c4
      ? { x: c4.left - cont.left, y: c4.top - cont.top + c4.height / 2 }
      : { x: cont.width - 275, y: cont.height - 80 };

    layoutRef.current = {
      c1: c1Pos,
      c2: c2Pos,
      c3: c3Pos,
      c4: c4Pos,
      preLeft: pre.left - cont.left,
      preTop: pre.top - cont.top,
      preWidth: pre.width > 0 ? pre.width : 800,
      preHeight: pre.height > 0 ? pre.height : 480,
    };

    if (svgRef.current) {
      svgRef.current.setAttribute('viewBox', `0 0 ${cont.width} ${cont.height}`);
    }

    if (pinTlRef.current) {
      pinTlRef.current.setAttribute('cx', String(c1Pos.x));
      pinTlRef.current.setAttribute('cy', String(c1Pos.y));
    }
    if (pinTrRef.current) {
      pinTrRef.current.setAttribute('cx', String(c2Pos.x));
      pinTrRef.current.setAttribute('cy', String(c2Pos.y));
    }
    if (pinBlRef.current) {
      pinBlRef.current.setAttribute('cx', String(c3Pos.x));
      pinBlRef.current.setAttribute('cy', String(c3Pos.y));
    }
    if (pinBrRef.current) {
      pinBrRef.current.setAttribute('cx', String(c4Pos.x));
      pinBrRef.current.setAttribute('cy', String(c4Pos.y));
    }
  };

  useEffect(() => {
    updateLayoutBounds();
    const handleResize = () => updateLayoutBounds();
    window.addEventListener('resize', handleResize);
    // Extra pass after DOM settle
    const timer = setTimeout(updateLayoutBounds, 120);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, []);

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

      // 1. Calculate projected 2D coordinates of the 4 rotor hubs for leader lines
      const projectedRotors: Array<{ screenX: number; screenY: number }> = [];
      for (const angle of armAngles) {
        const mx = armLength * Math.cos(angle);
        const my = 0.08;
        const mz = armLength * Math.sin(angle);

        const x1 = mx * cosY - mz * sinY;
        const z1 = mx * sinY + mz * cosY;

        const y2 = my * cosP - z1 * sinP;
        const z2 = my * sinP + z1 * cosP;

        const zFinal = z2 + distance;
        const invZ = 1 / Math.max(0.1, zFinal);
        const screenX = cols / 2 + x1 * invZ * scaleX;
        const screenY = rows / 2 - y2 * invZ * scaleY;

        projectedRotors.push({ screenX, screenY });
      }

      // Sort rotors into quadrants to prevent leader lines from crossing as the drone rotates
      const sortedByX = [...projectedRotors].sort((a, b) => a.screenX - b.screenX);
      const leftTwo = sortedByX.slice(0, 2).sort((a, b) => a.screenY - b.screenY);
      const rightTwo = sortedByX.slice(2, 4).sort((a, b) => a.screenY - b.screenY);

      const tlPt = leftTwo[0] || { screenX: 30, screenY: 15 };
      const blPt = leftTwo[1] || { screenX: 30, screenY: 33 };
      const trPt = rightTwo[0] || { screenX: 86, screenY: 15 };
      const brPt = rightTwo[1] || { screenX: 86, screenY: 33 };

      const { c1, c2, c3, c4, preLeft, preTop, preWidth, preHeight } = layoutRef.current;

      const rTL = {
        x: preLeft + (tlPt.screenX / cols) * preWidth,
        y: preTop + (tlPt.screenY / rows) * preHeight,
      };
      const rBL = {
        x: preLeft + (blPt.screenX / cols) * preWidth,
        y: preTop + (blPt.screenY / rows) * preHeight,
      };
      const rTR = {
        x: preLeft + (trPt.screenX / cols) * preWidth,
        y: preTop + (trPt.screenY / rows) * preHeight,
      };
      const rBR = {
        x: preLeft + (brPt.screenX / cols) * preWidth,
        y: preTop + (brPt.screenY / rows) * preHeight,
      };

      // Update SVG HUD Leader Lines (Seamless Dogleg Orthogonal Geometry)
      if (lineTlRef.current) {
        const doglegX = c1.x + 36;
        lineTlRef.current.setAttribute('d', `M ${c1.x} ${c1.y} L ${doglegX} ${c1.y} L ${rTL.x} ${rTL.y}`);
      }
      if (dotTlRef.current) {
        dotTlRef.current.setAttribute('cx', String(rTL.x));
        dotTlRef.current.setAttribute('cy', String(rTL.y));
      }
      if (ringTlRef.current) {
        ringTlRef.current.setAttribute('cx', String(rTL.x));
        ringTlRef.current.setAttribute('cy', String(rTL.y));
      }

      if (lineTrRef.current) {
        const doglegX = c2.x - 36;
        lineTrRef.current.setAttribute('d', `M ${c2.x} ${c2.y} L ${doglegX} ${c2.y} L ${rTR.x} ${rTR.y}`);
      }
      if (dotTrRef.current) {
        dotTrRef.current.setAttribute('cx', String(rTR.x));
        dotTrRef.current.setAttribute('cy', String(rTR.y));
      }
      if (ringTrRef.current) {
        ringTrRef.current.setAttribute('cx', String(rTR.x));
        ringTrRef.current.setAttribute('cy', String(rTR.y));
      }

      if (lineBlRef.current) {
        const doglegX = c3.x + 36;
        lineBlRef.current.setAttribute('d', `M ${c3.x} ${c3.y} L ${doglegX} ${c3.y} L ${rBL.x} ${rBL.y}`);
      }
      if (dotBlRef.current) {
        dotBlRef.current.setAttribute('cx', String(rBL.x));
        dotBlRef.current.setAttribute('cy', String(rBL.y));
      }
      if (ringBlRef.current) {
        ringBlRef.current.setAttribute('cx', String(rBL.x));
        ringBlRef.current.setAttribute('cy', String(rBL.y));
      }

      if (lineBrRef.current) {
        const doglegX = c4.x - 36;
        lineBrRef.current.setAttribute('d', `M ${c4.x} ${c4.y} L ${doglegX} ${c4.y} L ${rBR.x} ${rBR.y}`);
      }
      if (dotBrRef.current) {
        dotBrRef.current.setAttribute('cx', String(rBR.x));
        dotBrRef.current.setAttribute('cy', String(rBR.y));
      }
      if (ringBrRef.current) {
        ringBrRef.current.setAttribute('cx', String(rBR.x));
        ringBrRef.current.setAttribute('cy', String(rBR.y));
      }

      // 2. Render ASCII 3D Point Cloud
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
              charIndex = pt.kind === 'propeller' ? 9 : 6;
            } else {
              // Depth-based shading gradient with specular highlight on rotors
              // Minimum base ink is index 4 ('=') so even far-away surfaces have solid dark ink presence
              const depthNorm = Math.max(0, Math.min(1, (z2 + 1.6) / 3.2));
              const minInk = 4;
              const rampIdx = minInk + Math.floor(depthNorm * (ASCII_RAMP.length - 1 - minInk));
              charIndex = pt.kind === 'propeller' ? Math.min(ASCII_RAMP.length - 1, rampIdx + 2) : rampIdx;
            }

            buffer[idx] = ASCII_RAMP[charIndex] || '█';
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
        minHeight: '560px',
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
      {/* Centered Top Floating Controls Bar */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '8px',
          zIndex: 10,
          backgroundColor: 'rgba(222, 215, 202, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: '4px 6px',
          borderRadius: '8px',
          border: '1px solid rgba(45, 40, 35, 0.14)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        <button
          onClick={() => setIsRotating((prev) => !prev)}
          title="Toggle Auto-Rotation"
          style={{
            backgroundColor: '#eae5dc',
            border: '1px solid rgba(45, 40, 35, 0.25)',
            color: isRotating ? '#181716' : '#78746c',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          }}
        >
          {isRotating ? '⏸ PAUSE' : '▶ ROTATE'}
        </button>

        <button
          onClick={resetOrientation}
          title="Reset Orientation"
          style={{
            backgroundColor: '#eae5dc',
            border: '1px solid rgba(45, 40, 35, 0.25)',
            color: '#181716',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          }}
        >
          ↺ RESET
        </button>

        <button
          onClick={() => setWireframeOnly((prev) => !prev)}
          title="Toggle ASCII Density"
          style={{
            backgroundColor: '#eae5dc',
            border: '1px solid rgba(45, 40, 35, 0.25)',
            color: wireframeOnly ? '#8e5b5d' : '#181716',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          }}
        >
          {wireframeOnly ? 'WIREFRAME' : 'SHADED'}
        </button>

        <button
          onClick={() => {
            const nextColor =
              activeColor === '#050505'
                ? '#381417' // Deep Dark Terracotta Ink
                : activeColor === '#381417'
                  ? '#0d1829' // Deep Tactical Navy Ink
                  : activeColor === '#0d1829'
                    ? '#241030' // Deep Obsidian Plum Ink
                    : activeColor === '#241030'
                      ? '#10240e' // Deep Tactical Olive Ink
                      : '#050505';
            setActiveColor(nextColor);
          }}
          title="Switch Color Theme"
          style={{
            backgroundColor: '#eae5dc',
            border: `1.5px solid ${activeColor}`,
            color: activeColor,
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          }}
        >
          THEME
        </button>
      </div>

      {/* SVG Tactical HUD Overlay with Animated Leader Lines & Targeting Reticles */}
      <svg
        ref={svgRef}
        className="hero-hud-svg"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      >
        <defs>
          <linearGradient id="lineGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d35623" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#d35623" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="lineGradRight" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#d35623" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#d35623" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Card Connection Boundary Pins */}
        <circle ref={pinTlRef} r="3" fill="#d35623" />
        <circle ref={pinTrRef} r="3" fill="#d35623" />
        <circle ref={pinBlRef} r="3" fill="#d35623" />
        <circle ref={pinBrRef} r="3" fill="#d35623" />

        {/* Top-Left Leader Line & Reticle */}
        <path
          ref={lineTlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringTlRef} r="8" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotTlRef} r="3" fill="#d35623" />

        {/* Top-Right Leader Line & Reticle */}
        <path
          ref={lineTrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringTrRef} r="8" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotTrRef} r="3" fill="#d35623" />

        {/* Bottom-Left Leader Line & Reticle */}
        <path
          ref={lineBlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringBlRef} r="8" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotBlRef} r="3" fill="#d35623" />

        {/* Bottom-Right Leader Line & Reticle */}
        <path
          ref={lineBrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringBrRef} r="8" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotBrRef} r="3" fill="#d35623" />
      </svg>

      {/* Feature Card 1: Top-Left (Radar Tracking) */}
      <div
        ref={card1Ref}
        className="hero-feature-card"
        style={{
          position: 'absolute',
          top: '24px',
          left: '28px',
          width: '245px',
          backgroundColor: '#eae5dc',
          border: '1px solid rgba(45, 40, 35, 0.18)',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 4px 14px rgba(45, 40, 35, 0.06)',
          zIndex: 8,
          pointerEvents: 'auto',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#d35623',
            }}
          >
            01 // RADAR TRACKING
          </span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d35623' }} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.01em' }}>
          Pulse-Doppler Telemetry
        </div>
        <div style={{ fontSize: '11px', color: '#58544e', lineHeight: 1.35, marginBottom: '6px' }}>
          20Hz scan kinematics, micro-RCS signature classification & velocity vectors.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '9.5px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.14)',
            paddingTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>ACC: ±0.3m</span>
          <span>SCAN: 50ms</span>
        </div>
      </div>

      {/* Feature Card 2: Top-Right (Layered Defense) */}
      <div
        ref={card2Ref}
        className="hero-feature-card"
        style={{
          position: 'absolute',
          top: '24px',
          right: '28px',
          width: '245px',
          backgroundColor: '#eae5dc',
          border: '1px solid rgba(45, 40, 35, 0.18)',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 4px 14px rgba(45, 40, 35, 0.06)',
          zIndex: 8,
          pointerEvents: 'auto',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#d35623',
            }}
          >
            02 // LAYERED DEFENSE
          </span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d35623' }} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.01em' }}>
          Dual Hard/Soft Kill
        </div>
        <div style={{ fontSize: '11px', color: '#58544e', lineHeight: 1.35, marginBottom: '6px' }}>
          1,500m RF directional jamming paired with 1,000m high-rate 30mm CIWS.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '9.5px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.14)',
            paddingTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>JAM: 1,500m</span>
          <span>CIWS: 30mm</span>
        </div>
      </div>

      {/* Feature Card 3: Bottom-Left (Zero Leakage) */}
      <div
        ref={card3Ref}
        className="hero-feature-card"
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '28px',
          width: '245px',
          backgroundColor: '#eae5dc',
          border: '1px solid rgba(45, 40, 35, 0.18)',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 4px 14px rgba(45, 40, 35, 0.06)',
          zIndex: 8,
          pointerEvents: 'auto',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#d35623',
            }}
          >
            03 // ZERO LEAKAGE
          </span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d35623' }} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.01em' }}>
          TraineeView Isolation
        </div>
        <div style={{ fontSize: '11px', color: '#58544e', lineHeight: 1.35, marginBottom: '6px' }}>
          Cryptographic air-gap preventing ground truth leakage and sensor spoofing.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '9.5px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.14)',
            paddingTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>AIR-GAP: SECURE</span>
          <span>LEAKAGE: 0.0%</span>
        </div>
      </div>

      {/* Feature Card 4: Bottom-Right (Deterministic Core) */}
      <div
        ref={card4Ref}
        className="hero-feature-card"
        style={{
          position: 'absolute',
          bottom: '24px',
          right: '28px',
          width: '245px',
          backgroundColor: '#eae5dc',
          border: '1px solid rgba(45, 40, 35, 0.18)',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 4px 14px rgba(45, 40, 35, 0.06)',
          zIndex: 8,
          pointerEvents: 'auto',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#d35623',
            }}
          >
            04 // DETERMINISTIC CORE
          </span>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d35623' }} />
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.01em' }}>
          Bit-Exact Replay Engine
        </div>
        <div style={{ fontSize: '11px', color: '#58544e', lineHeight: 1.35, marginBottom: '6px' }}>
          PRNG-seeded physics simulation guaranteeing identical scenario reproduction.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '9.5px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.14)',
            paddingTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>SEED: DETERMINISTIC</span>
          <span>REPLAY: 100%</span>
        </div>
      </div>

      {/* ASCII Output Display */}
      <pre
        ref={preRef}
        style={{
          margin: 0,
          padding: '16px',
          fontFamily: 'Consolas, "Cascadia Code", "SF Mono", Menlo, ui-monospace, monospace',
          fontSize: `${fontSize}px`,
          fontWeight: 800,
          lineHeight: '10px',
          letterSpacing: '0.5px',
          color: activeColor,
          textShadow: '0 0 1px rgba(0, 0, 0, 0.45)',
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
