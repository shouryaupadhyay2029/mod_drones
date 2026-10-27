/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface CivilianQuadAsciiSimulationProps {
  className?: string;
  style?: React.CSSProperties;
  scrollRootRef?: React.RefObject<HTMLElement | null>;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  nx?: number;
  ny?: number;
  nz?: number;
  kind?: 'body' | 'motor' | 'skid' | 'camera' | 'propeller';
}

interface AssembledPoint3D extends Point3D {
  scatterX: number;
  scatterY: number;
  scatterZ: number;
  startProgress: number;
  endProgress: number;
}

const ASCII_RAMP = ' .:-=+*#%@';

function createMulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubicEaseOut(t: number): number {
  const f = Math.max(0, Math.min(1, t)) - 1.0;
  return f * f * f + 1.0;
}

function generateCivilianQuadModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Streamlined Consumer Body Shell (x in [-0.36, 0.36], z in [-0.52, 0.52], step 0.026)
  for (let z = -0.52; z <= 0.52; z += 0.026) {
    for (let x = -0.36; x <= 0.36; x += 0.026) {
      const nxzSq = (x / 0.36) * (x / 0.36) + (z / 0.52) * (z / 0.52);
      if (nxzSq <= 1.0) {
        // Domed upper shell and flat battery belly
        const topY = 0.14 * (1.0 - 0.65 * nxzSq);
        const bottomY = -0.08;

        // Top shell points
        points.push({
          x,
          y: topY,
          z,
          nx: x * 0.5,
          ny: 0.9,
          nz: z * 0.5,
          kind: 'body',
        });

        // Bottom battery belly points
        points.push({
          x,
          y: bottomY,
          z,
          nx: 0,
          ny: -1.0,
          nz: 0,
          kind: 'body',
        });

        // Side cooling louver ribs & edge enclosure
        if (Math.abs(x) >= 0.30 || Math.abs(z) >= 0.44) {
          for (let y = bottomY + 0.02; y < topY; y += 0.035) {
            points.push({
              x,
              y,
              z,
              nx: Math.sign(x) * 0.8,
              ny: 0.1,
              nz: Math.sign(z) * 0.2,
              kind: 'body',
            });
          }
        }
      }
    }
  }

  // 2. 4 Slim Folding Arms & Exposed Motor Pods & Landing Feet
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.48;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Slim tubular arm (r in [0.26, 1.48], step 0.022, radius 0.035)
    for (let r = 0.26; r <= armLength; r += 0.022) {
      const ax = r * cosA;
      const az = r * sinA;
      const ay = 0.02 - 0.03 * (r / armLength);

      for (let s = 0; s < 8; s++) {
        const ringAngle = (s / 8) * Math.PI * 2;
        const rx = ax + Math.cos(ringAngle) * 0.035;
        const rz = az + Math.sin(ringAngle) * 0.035;
        const ry = ay + Math.sin(ringAngle) * 0.035;

        points.push({
          x: rx,
          y: ry,
          z: rz,
          nx: Math.cos(ringAngle),
          ny: 0.3,
          nz: Math.sin(ringAngle),
          kind: 'body',
        });
      }
    }

    // Cylindrical brushless motor pod at (mx, mz)
    const mx = armLength * cosA;
    const mz = armLength * sinA;

    for (let my = -0.04; my <= 0.14; my += 0.025) {
      for (let s = 0; s < 12; s++) {
        const mAngle = (s / 12) * Math.PI * 2;
        const mr = 0.11;
        points.push({
          x: mx + Math.cos(mAngle) * mr,
          y: my,
          z: mz + Math.sin(mAngle) * mr,
          nx: Math.cos(mAngle),
          ny: 0.2,
          nz: Math.sin(mAngle),
          kind: 'motor',
        });
      }
    }

    // Short landing foot under each motor (y in [-0.18, -0.04])
    for (let fy = -0.18; fy <= -0.04; fy += 0.03) {
      points.push({
        x: mx * 0.95,
        y: fy,
        z: mz * 0.95,
        nx: -cosA * 0.4,
        ny: -0.9,
        nz: -sinA * 0.4,
        kind: 'motor',
      });
    }
  }

  // 3. Tall Photography Landing Skids (signX = -1, +1, sx = signX * 0.38)
  for (const signX of [-1, 1]) {
    const sx = signX * 0.38;

    // Vertical angled struts (y in [-0.42, -0.06], z = ±0.24)
    for (let y = -0.42; y <= -0.06; y += 0.03) {
      for (const sz of [-0.24, 0.24]) {
        points.push({
          x: sx,
          y,
          z: sz,
          nx: signX * 0.9,
          ny: 0.2,
          nz: 0.1,
          kind: 'skid',
        });
      }
    }

    // Horizontal skid bars (z in [-0.48, 0.48], y = -0.42)
    for (let z = -0.48; z <= 0.48; z += 0.035) {
      points.push({
        x: sx,
        y: -0.42,
        z,
        nx: signX * 1.0,
        ny: 0.1,
        nz: 0,
        kind: 'skid',
      });
    }
  }

  // 4. Under-Slung 3-Axis Photography Gimbal & Rectangular Camera Housing
  // Gimbal U-yoke bracket suspended under the nose (z = 0.32, y in [-0.26, -0.08])
  for (let y = -0.26; y <= -0.08; y += 0.03) {
    for (let x = -0.12; x <= 0.12; x += 0.04) {
      points.push({
        x,
        y,
        z: 0.32,
        nx: 0,
        ny: 0.2,
        nz: 0.9,
        kind: 'camera',
      });
    }
  }

  // High-detail cylindrical camera barrel & wide-angle optical lens (center: { x: 0, y: -0.24, z: 0.44 }, radius = 0.13)
  for (let cz = 0.36; cz <= 0.52; cz += 0.025) {
    const rCam = 0.13;
    for (let s = 0; s < 16; s++) {
      const cAngle = (s / 16) * Math.PI * 2;
      points.push({
        x: Math.cos(cAngle) * rCam,
        y: -0.24 + Math.sin(cAngle) * rCam * 0.8,
        z: cz,
        nx: Math.cos(cAngle),
        ny: Math.sin(cAngle) * 0.8,
        nz: 0.3,
        kind: 'camera',
      });
    }
  }

  return points;
}

function createAssembledModel(basePoints: Point3D[]): AssembledPoint3D[] {
  const rng = createMulberry32(0xc411a7);

  return basePoints.map((pt) => {
    let startProgress = 0.0;
    let endProgress = 0.60;

    if (pt.kind === 'motor') {
      startProgress = 0.15;
      endProgress = 0.70;
    } else if (pt.kind === 'skid') {
      startProgress = 0.20;
      endProgress = 0.75;
    } else if (pt.kind === 'camera') {
      startProgress = 0.30;
      endProgress = 0.82;
    }

    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * Math.PI * 0.8;
    const dist = 3.2 + rng() * 3.6;

    let biasX = 0;
    let biasZ = 0;
    if (Math.abs(pt.x) > 0.2 || Math.abs(pt.z) > 0.2) {
      const dir = Math.atan2(pt.z, pt.x);
      biasX = Math.cos(dir) * 2.2;
      biasZ = Math.sin(dir) * 2.2;
    }

    const scatterX = Math.cos(phi) * Math.cos(theta) * dist + biasX;
    const scatterY = Math.sin(phi) * (dist * 0.6);
    const scatterZ = Math.cos(phi) * Math.sin(theta) * dist + biasZ;

    return {
      ...pt,
      scatterX,
      scatterY,
      scatterZ,
      startProgress,
      endProgress,
    };
  });
}

export function CivilianQuadAsciiSimulation({
  scrollRootRef,
}: CivilianQuadAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [asciiText, setAsciiText] = useState<string>('');

  const assemblyStartTimeRef = useRef<number | null>(null);
  const baseModelRef = useRef<AssembledPoint3D[]>(createAssembledModel(generateCivilianQuadModel()));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const scrollVelRef = useRef<number>(0);
  const smoothedScrollRef = useRef<number>(0);
  const yawRef = useRef<number>(0.35);
  const pitchRef = useRef<number>(0.58);
  const bankRef = useRef<number>(0);

  useEffect(() => {
    if (containerRef.current) {
      if (scrollRootRef && scrollRootRef.current) {
        scrollerRef.current = scrollRootRef.current;
      } else {
        scrollerRef.current = containerRef.current.closest<HTMLElement>('[data-scroll-root]');
      }
    }

    let animId: number;
    const ASSEMBLY_DURATION = 1.6;
    const lightDir: [number, number, number] = [0.5, 0.8, -0.3];

    const render = (now: number) => {
      const currentTime = typeof now === 'number' && now > 0 ? now : performance.now();
      if (assemblyStartTimeRef.current === null) {
        assemblyStartTimeRef.current = currentTime;
      }
      const elapsed = Math.max(0, (currentTime - assemblyStartTimeRef.current) / 1000);
      const globalProgress = Math.min(1.0, elapsed / ASSEMBLY_DURATION);

      // --- SCROLL-DRIVEN COMPANION FLIGHT ---
      let scrollProgress = 0;
      let scrollDelta = 0;
      if (!scrollerRef.current && containerRef.current) {
        if (scrollRootRef && scrollRootRef.current) {
          scrollerRef.current = scrollRootRef.current;
        } else {
          scrollerRef.current = containerRef.current.closest<HTMLElement>('[data-scroll-root]');
        }
      }
      if (scrollerRef.current) {
        const scroller = scrollerRef.current;
        const sTop = scroller.scrollTop;
        const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        scrollProgress = Math.min(1.0, Math.max(0, sTop / maxScroll));

        const dt = Math.max(0.001, (currentTime - lastScrollTimeRef.current) / 1000);
        const rawVel = (sTop - lastScrollTopRef.current) / dt;
        lastScrollTopRef.current = sTop;
        lastScrollTimeRef.current = currentTime;

        scrollVelRef.current += (rawVel - scrollVelRef.current) * 0.15;
        scrollDelta = scrollVelRef.current;
      }

      smoothedScrollRef.current += (scrollProgress - smoothedScrollRef.current) * 0.10;
      const sP = smoothedScrollRef.current;
      const rawEscort = Math.min(1.0, Math.max(0, sP / 0.06));
      const escortPhase = rawEscort * rawEscort * (3 - 2 * rawEscort);

      // Slow idle yaw rotation + bank on scroll velocity
      yawRef.current += 0.006;
      const targetBank = Math.max(-0.4, Math.min(0.4, -scrollDelta * 0.0003));
      bankRef.current += (targetBank - bankRef.current) * 0.12;

      // Companion flight positioning transform
      const targetTransX = escortPhase * 36;
      const targetTransY = escortPhase * 10;
      const quadScale = 1.0 - escortPhase * 0.56;
      const hoverBob = Math.sin(currentTime * 0.0028) * 0.06;

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${hoverBob * 20}px), 0) scale(${quadScale.toFixed(3)})`;
      }

      // --- 3D CIVILIAN QUADCOPTER BASE POINTS ---
      const basePoints = baseModelRef.current;
      const computedBasePoints: Point3D[] = new Array(basePoints.length);

      for (let i = 0; i < basePoints.length; i++) {
        const pt = basePoints[i]!;
        let localT = 0;
        if (globalProgress >= pt.endProgress) {
          localT = 1.0;
        } else if (globalProgress > pt.startProgress) {
          localT = (globalProgress - pt.startProgress) / (pt.endProgress - pt.startProgress);
        }
        const ease = cubicEaseOut(localT);
        const inv = 1.0 - ease;

        computedBasePoints[i] = {
          x: pt.x + pt.scatterX * inv,
          y: pt.y + pt.scatterY * inv,
          z: pt.z + pt.scatterZ * inv,
          nx: pt.nx,
          ny: pt.ny,
          nz: pt.nz,
          kind: pt.kind,
        };
      }

      // --- DYNAMIC 2-BLADE OPEN PROPELLERS & HOVER KINEMATICS ---
      const dynamicPoints: Point3D[] = [];
      const assemblyPropEase = cubicEaseOut(Math.min(1.0, globalProgress / 0.65));

      if (assemblyPropEase > 0.01) {
        const propAngle = currentTime * 0.024;
        const armLength = 1.48;
        const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
        const propDirs = [1, -1, 1, -1];

        for (let idx = 0; idx < 4; idx++) {
          const angle = armAngles[idx]!;
          const dir = propDirs[idx]!;
          const mx = armLength * Math.cos(angle);
          const mz = armLength * Math.sin(angle);
          const my = 0.16;

          // 2-Blade High-Aspect Open Propellers
          for (let b = 0; b < 2; b++) {
            const bladeAngle = propAngle * dir + b * Math.PI;
            const cosB = Math.cos(bladeAngle);
            const sinB = Math.sin(bladeAngle);

            for (let r = 0.04; r <= 0.58; r += 0.024) {
              const bx = mx + r * cosB;
              const bz = mz + r * sinB;

              // Subtle blade chord width
              for (const wSign of [-1, 1]) {
                const wx = bx + wSign * 0.03 * (-sinB);
                const wz = bz + wSign * 0.03 * cosB;

                dynamicPoints.push({
                  x: wx,
                  y: my,
                  z: wz,
                  nx: 0,
                  ny: 1.0,
                  nz: 0,
                  kind: 'propeller',
                });
              }
            }
          }

          // Motion-blur disc ring at r = 0.56
          const ringSteps = 16;
          for (let s = 0; s < ringSteps; s++) {
            const rAngle = (s / ringSteps) * Math.PI * 2;
            dynamicPoints.push({
              x: mx + Math.cos(rAngle) * 0.56,
              y: my,
              z: mz + Math.sin(rAngle) * 0.56,
              nx: Math.cos(rAngle),
              ny: 0.8,
              nz: Math.sin(rAngle),
              kind: 'propeller',
            });
          }
        }
      }

      // Merge base model and propellers
      const allPoints = [...computedBasePoints, ...dynamicPoints];

      // --- NON-CLIPPING GRID, CAMERA & RENDERING ---
      const cols = 180;
      const rows = 64;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const distance = 4.6;
      const scaleX = 98;
      const scaleY = 46;
      const pitch = pitchRef.current + hoverBob;
      const yaw = yawRef.current;
      const bank = bankRef.current;

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosB = Math.cos(bank);
      const sinB = Math.sin(bank);

      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i]!;
        const posY = pt.y;

        // Yaw rotation
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;

        // Pitch & Isometric depth sign
        const y2 = posY * cosP - z1 * sinP;
        const z2 = -posY * sinP - z1 * cosP;
        const x2 = x1;

        // Bank / Roll rotation
        const x3 = x2 * cosB - y2 * sinB;
        const y3 = x2 * sinB + y2 * cosB;
        const z3 = z2;

        const zFinal = z3 + distance;
        if (zFinal <= 0.1) continue;

        const invZ = 1 / zFinal;
        const screenX = Math.floor(cols / 2 + x3 * invZ * scaleX);
        const screenY = Math.floor(rows / 2 - y3 * invZ * scaleY);

        if (screenX >= 0 && screenX < cols && screenY >= 0 && screenY < rows) {
          const idx = screenY * cols + screenX;

          if (invZ > zBuffer[idx]!) {
            zBuffer[idx] = invZ;

            // Rotate surface normals
            const origNx = pt.nx ?? 0;
            const origNy = pt.ny ?? 1;
            const origNz = pt.nz ?? 0;

            const nnx1 = origNx * cosY - origNz * sinY;
            const nnz1 = origNx * sinY + origNz * cosY;
            const nny2 = origNy * cosP - nnz1 * sinP;
            const nnz2 = -origNy * sinP - nnz1 * cosP;
            const nnx2 = nnx1;

            const nnx3 = nnx2 * cosB - nny2 * sinB;
            const nny3 = nnx2 * sinB + nny2 * cosB;
            const nnz3 = nnz2;

            // Lambertian diffuse lighting + rim lighting
            const diffDot = nnx3 * lightDir[0] + nny3 * lightDir[1] + nnz3 * lightDir[2];
            const diffuse = Math.max(0, diffDot);
            const rim = Math.pow(1.0 - Math.abs(nnz3), 2.5);

            const lightFactor = 0.25 + 0.52 * diffuse + 0.23 * rim;
            let rampIdx = Math.floor(lightFactor * (ASCII_RAMP.length - 1));
            if (pt.kind === 'propeller') {
              rampIdx = Math.min(ASCII_RAMP.length - 2, Math.max(3, rampIdx));
            }
            const charIndex = Math.max(1, Math.min(ASCII_RAMP.length - 1, rampIdx));

            buffer[idx] = ASCII_RAMP[charIndex] || '@';
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
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '420px',
        backgroundColor: 'transparent',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      <pre
        ref={preRef}
        style={{
          display: 'inline-block',
          width: 'fit-content',
          margin: '0 auto',
          padding: 0,
          fontFamily: 'Consolas, "Cascadia Code", "SF Mono", Menlo, ui-monospace, monospace',
          fontSize: '11px',
          fontWeight: 800,
          lineHeight: '11px',
          letterSpacing: '0.4px',
          color: '#fff4ec',
          textShadow: '0 0 12px rgba(211,86,35,0.35)',
          whiteSpace: 'pre',
          pointerEvents: 'none',
          textAlign: 'center',
          transition: 'none',
        }}
      >
        {asciiText}
      </pre>
    </div>
  );
}
