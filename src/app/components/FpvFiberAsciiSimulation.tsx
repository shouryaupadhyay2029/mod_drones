/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface FpvFiberAsciiSimulationProps {
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
  kind?: 'frame' | 'spool' | 'motor' | 'camera' | 'duct' | 'tether' | 'propeller';
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

function generateFpvFiberModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Long Heavy-Lift Fuselage, Carbon Plates & Battery Deck (kind: 'frame')
  for (let z = -0.52; z <= 0.48; z += 0.025) {
    for (let x = -0.28; x <= 0.28; x += 0.025) {
      if (Math.abs(x) <= 0.26 && Math.abs(z) <= 0.48) {
        // Bottom carbon plate
        points.push({ x, y: -0.05, z, nx: 0, ny: -1, nz: 0, kind: 'frame' });
        // Top carbon plate
        points.push({ x, y: 0.07, z, nx: 0, ny: 1, nz: 0, kind: 'frame' });
      }
    }
  }

  // Top LiPo Battery Pack
  for (let z = -0.32; z <= 0.24; z += 0.028) {
    for (let x = -0.17; x <= 0.17; x += 0.028) {
      for (let y = 0.07; y <= 0.21; y += 0.028) {
        if (Math.abs(x) >= 0.15 || Math.abs(z) >= 0.30 || y >= 0.19) {
          points.push({
            x,
            y,
            z,
            nx: Math.abs(x) >= 0.15 ? Math.sign(x) : 0,
            ny: y >= 0.19 ? 1 : 0,
            nz: Math.abs(z) >= 0.30 ? Math.sign(z) : 0,
            kind: 'frame',
          });
        }
      }
    }
  }

  // 2. Massive Under-Slung Cylindrical Fiber-Optic Spool Drum & Payout Bell (kind: 'spool')
  // Fiber-Optic Bobbin Drum (z in [-0.65, 0.35], centerY = -0.18, radius = 0.24, 24 circumferential steps)
  for (let z = -0.65; z <= 0.35; z += 0.02) {
    for (let s = 0; s < 24; s++) {
      const cAngle = (s / 24) * Math.PI * 2;
      const cRadius = 0.24;
      for (let y = -0.38; y <= 0.02; y += 0.024) {
        points.push({
          x: Math.cos(cAngle) * cRadius,
          y,
          z,
          nx: Math.cos(cAngle),
          ny: 0,
          nz: Math.sin(cAngle),
          kind: 'spool',
        });
      }
    }
  }

  // 4 thick external structural cage ribs (radius = 0.27 at z = -0.55, -0.25, 0.05, 0.30)
  const ribZs = [-0.55, -0.25, 0.05, 0.30];
  for (const rz of ribZs) {
    for (let s = 0; s < 28; s++) {
      const rAngle = (s / 28) * Math.PI * 2;
      const ribRadius = 0.27;
      for (let ry = -0.39; ry <= 0.03; ry += 0.022) {
        points.push({
          x: Math.cos(rAngle) * ribRadius,
          y: ry,
          z: rz + Math.sin(rAngle) * 0.015,
          nx: Math.cos(rAngle),
          ny: 0,
          nz: Math.sin(rAngle),
          kind: 'spool',
        });
      }
    }
  }

  // Rear conical fiber payout bell (z in [-0.82, -0.65])
  for (let z = -0.82; z <= -0.65; z += 0.02) {
    const tFrac = (z - (-0.82)) / (-0.65 - (-0.82)); // 0 at nozzle tip, 1 at spool
    const coneRadius = 0.06 + tFrac * 0.18;
    for (let s = 0; s < 16; s++) {
      const nAngle = (s / 16) * Math.PI * 2;
      points.push({
        x: Math.cos(nAngle) * coneRadius,
        y: -0.18 + Math.sin(nAngle) * coneRadius * 0.5,
        z,
        nx: Math.cos(nAngle),
        ny: 0.2,
        nz: -1,
        kind: 'spool',
      });
    }
  }

  // 3. Forward Tapered Electro-Optical Seeker Nose Cone & Lens (kind: 'camera')
  // Forward tapered electro-optical seeker nose cone (z in [0.35, 0.78], tapering radius from 0.18 down to 0.04 with a bright optical lens ring at z = 0.78)
  for (let z = 0.35; z <= 0.78; z += 0.022) {
    const tFrac = (0.78 - z) / (0.78 - 0.35); // 1 at base, 0 at lens tip
    const noseRadius = 0.04 + tFrac * 0.14;
    for (let s = 0; s < 16; s++) {
      const nAngle = (s / 16) * Math.PI * 2;
      for (let ny = -0.05; ny <= 0.12; ny += 0.025) {
        points.push({
          x: Math.cos(nAngle) * noseRadius,
          y: ny,
          z,
          nx: Math.cos(nAngle),
          ny: ny >= 0.10 ? 1 : 0,
          nz: 1,
          kind: 'camera',
        });
      }
    }
  }
  // Bright optical lens ring at z = 0.78
  for (let s = 0; s < 12; s++) {
    const lAngle = (s / 12) * Math.PI * 2;
    points.push({
      x: Math.cos(lAngle) * 0.05,
      y: 0.02 + Math.sin(lAngle) * 0.05,
      z: 0.78,
      nx: 0,
      ny: 0,
      nz: 1,
      kind: 'camera',
    });
  }

  // 4. 4 Heavy Carbon Arms, Twin Parallel Truss Beams & Circular Shrouded Rotor Ducts (kind: 'motor', 'duct')
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.38;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Twin parallel truss beams connecting fuselage to arm/duct
    for (const offsetSign of [-0.04, 0.04]) {
      for (let r = 0.24; r <= armLength; r += 0.025) {
        const bx = r * cosA + offsetSign * (-sinA);
        const bz = r * sinA + offsetSign * cosA;
        for (let wy = -0.015; wy <= 0.015; wy += 0.015) {
          points.push({
            x: bx,
            y: 0.0 + wy,
            z: bz,
            nx: -sinA,
            ny: 1,
            nz: cosA,
            kind: 'motor',
          });
        }
      }
    }

    // Circular Shrouded Rotor Duct Ring at motor hub (radius = 0.56, y in [0.04, 0.18], 36 circumferential steps, kind: 'duct')
    const mx = armLength * cosA;
    const mz = armLength * sinA;
    for (let dy = 0.04; dy <= 0.18; dy += 0.025) {
      for (let s = 0; s < 36; s++) {
        const dAngle = (s / 36) * Math.PI * 2;
        const ductRadius = 0.56;
        points.push({
          x: mx + Math.cos(dAngle) * ductRadius,
          y: dy,
          z: mz + Math.sin(dAngle) * ductRadius,
          nx: Math.cos(dAngle),
          ny: dy >= 0.16 ? 1 : 0,
          nz: Math.sin(dAngle),
          kind: 'duct',
        });
      }
    }

    // Brushless motor bell at center of duct (mx, mz), my in [-0.02, 0.14], radius 0.12
    for (let my = -0.02; my <= 0.14; my += 0.025) {
      for (let s = 0; s < 12; s++) {
        const mAngle = (s / 12) * Math.PI * 2;
        const mRadius = 0.12;
        points.push({
          x: mx + Math.cos(mAngle) * mRadius,
          y: my,
          z: mz + Math.sin(mAngle) * mRadius,
          nx: Math.cos(mAngle),
          ny: 0,
          nz: Math.sin(mAngle),
          kind: 'motor',
        });
      }
    }
  }

  return points;
}

export function FpvFiberAsciiSimulation({ scrollRootRef }: FpvFiberAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const yawRef = useRef<number>(0.0);
  const animFrameIdRef = useRef<number | null>(null);
  const assembledPointsRef = useRef<AssembledPoint3D[] | []>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
    const rawPoints = generateFpvFiberModel();
    const rng = createMulberry32(0x8e41f0);

    const assembled: AssembledPoint3D[] = rawPoints.map((pt) => {
      const startProgress = 0.1 + rng() * 0.4;
      const endProgress = startProgress + 0.35 + rng() * 0.3;
      const scatterDist = 1.6 + rng() * 2.2;
      const scatterAngle = rng() * Math.PI * 2;
      const scatterElevation = (rng() - 0.5) * Math.PI;

      return {
        ...pt,
        scatterX: pt.x + Math.cos(scatterElevation) * Math.cos(scatterAngle) * scatterDist,
        scatterY: pt.y + Math.sin(scatterElevation) * scatterDist * 0.8,
        scatterZ: pt.z + Math.cos(scatterElevation) * Math.sin(scatterAngle) * scatterDist,
        startProgress: Math.min(0.85, startProgress),
        endProgress: Math.min(1.0, endProgress),
      };
    });

    assembledPointsRef.current = assembled;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderLoop = (currentTime: number) => {
      if (!isMounted) return;

      const elapsed = (currentTime - startTimeRef.current) / 1000.0;
      const assembleProgress = cubicEaseOut(elapsed / 1.5);

      // Slow continuous yaw
      yawRef.current += 0.006;
      const yaw = yawRef.current;
      const pitch = 0.54; // Steady level-forward pitch
      const roll = Math.sin(elapsed * 1.2) * 0.06; // Scroll-velocity / subtle bank

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);

      const cols = 180;
      const rows = 64;
      const distance = 4.6;
      const scaleX = 96;
      const scaleY = 46;

      const buffer: string[][] = Array.from({ length: rows }, () => Array(cols).fill(' '));
      const zBuffer: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-Infinity));

      const points = assembledPointsRef.current;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i]!;
        const pLocal = assembleProgress >= 1.0 ? 1.0 : Math.max(0, Math.min(1, (assembleProgress - pt.startProgress) / (pt.endProgress - pt.startProgress)));
        const easedP = cubicEaseOut(pLocal);

        const curX = pt.scatterX + (pt.x - pt.scatterX) * easedP;
        const curY = pt.scatterY + (pt.y - pt.scatterY) * easedP;
        const curZ = pt.scatterZ + (pt.z - pt.scatterZ) * easedP;

        // 3D Rotation Order: Yaw first, Pitch second, Roll third
        // 1. Yaw
        const x1 = curX * cosY - curZ * sinY;
        const z1 = curX * sinY + curZ * cosY;
        const y1 = curY;

        // 2. Pitch
        const y2 = y1 * cosP - z1 * sinP;
        const z2 = -y1 * sinP - z1 * cosP;
        const x2 = x1;

        // 3. Roll/Bank
        const x3 = x2 * cosR - y2 * sinR;
        const y3 = x2 * sinR + y2 * cosR;
        const z3 = z2 + distance;

        if (z3 <= 0.2) continue;

        const invZ = 1.0 / z3;
        const projX = Math.floor(cols / 2 + (x3 * invZ) * scaleX);
        const projY = Math.floor(rows / 2 - (y3 * invZ) * scaleY);

        if (projX >= 0 && projX < cols && projY >= 0 && projY < rows) {
          if (invZ > zBuffer[projY]![projX]!) {
            zBuffer[projY]![projX] = invZ;

            const nx = pt.nx ?? 0;
            const ny = pt.ny ?? 1;
            const nz = pt.nz ?? 0;

            // Rotate normal with same order
            const n1x = nx * cosY - nz * sinY;
            const n1z = nx * sinY + nz * cosY;
            const n1y = ny;

            const n2y = n1y * cosP - n1z * sinP;
            const n2z = -n1y * sinP - n1z * cosP;
            const n2x = n1x;

            const n3x = n2x * cosR - n2y * sinR;
            const n3y = n2x * sinR + n2y * cosR;
            const n3z = n2z;

            const diffuse = Math.max(0, n3x * 0.45 + n3y * 0.75 + n3z * -0.48);
            const rim = Math.pow(1.0 - Math.abs(n3z), 2.2);
            const lightFactor = 0.32 + 0.52 * diffuse + 0.28 * rim;

            let rampIdx = Math.floor(lightFactor * (ASCII_RAMP.length - 1));
            if (pt.kind === 'spool' || pt.kind === 'duct' || pt.kind === 'camera') {
              rampIdx += 2;
            }
            rampIdx = Math.min(ASCII_RAMP.length - 2, Math.max(3, rampIdx));

            buffer[projY]![projX] = ASCII_RAMP[rampIdx] ?? '@';
          }
        }
      }

      // Render Dynamic 3-Blade Propellers inside the 4 Shrouded Ducts (my = 0.15)
      const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      const armLength = 1.38;
      const propSpeed = currentTime * 0.035;

      for (const angle of armAngles) {
        const mx = armLength * Math.cos(angle);
        const mz = armLength * Math.sin(angle);
        const my = 0.15;

        for (let b = 0; b < 3; b++) {
          const bladeAngle = propSpeed + b * ((2 * Math.PI) / 3);
          const bCos = Math.cos(bladeAngle);
          const bSin = Math.sin(bladeAngle);

          for (let r = 0.04; r <= 0.52; r += 0.03) {
            const px = mx + r * bCos;
            const pz = mz + r * bSin;
            const py = my;

            const x1 = px * cosY - pz * sinY;
            const z1 = px * sinY + pz * cosY;
            const y1 = py;

            const y2 = y1 * cosP - z1 * sinP;
            const z2 = -y1 * sinP - z1 * cosP;
            const x2 = x1;

            const x3 = x2 * cosR - y2 * sinR;
            const y3 = x2 * sinR + y2 * cosR;
            const z3 = z2 + distance;

            if (z3 <= 0.2) continue;
            const invZ = 1.0 / z3;
            const projX = Math.floor(cols / 2 + (x3 * invZ) * scaleX);
            const projY = Math.floor(rows / 2 - (y3 * invZ) * scaleY);

            if (projX >= 0 && projX < cols && projY >= 0 && projY < rows) {
              if (invZ > zBuffer[projY]![projX]!) {
                zBuffer[projY]![projX] = invZ;
                const charVal = r >= 0.48 ? '#' : '=';
                buffer[projY]![projX] = charVal;
              }
            }
          }
        }
      }

      // Render High-Visibility Unspooling Helical Fiber-Optic Cable Trail (3x3 cluster per step, animated pulse '@')
      for (let z = -0.82; z >= -1.95; z -= 0.015) {
        const pulseCycle = (currentTime * 0.005) % 1.0;
        const distFromNozzle = Math.abs(z - (-0.82));
        const isPulse = Math.abs((distFromNozzle % 0.3) - (pulseCycle * 0.3)) < 0.02;

        const tx = Math.sin(z * 8.0 + currentTime * 0.008) * 0.07 * distFromNozzle;
        const ty = -0.18 - distFromNozzle * 0.12 + Math.cos(z * 6.0 + currentTime * 0.007) * 0.04;
        const tz = z;

        // Render 3x3 cluster for thickness
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const cx = tx + ox * 0.015;
            const cy = ty + oy * 0.015;
            const cz = tz;

            const x1 = cx * cosY - cz * sinY;
            const z1 = cx * sinY + cz * cosY;
            const y1 = cy;

            const y2 = y1 * cosP - z1 * sinP;
            const z2 = -y1 * sinP - z1 * cosP;
            const x2 = x1;

            const x3 = x2 * cosR - y2 * sinR;
            const y3 = x2 * sinR + y2 * cosR;
            const z3 = z2 + distance;

            if (z3 <= 0.2) continue;
            const invZ = 1.0 / z3;
            const projX = Math.floor(cols / 2 + (x3 * invZ) * scaleX);
            const projY = Math.floor(rows / 2 - (y3 * invZ) * scaleY);

            if (projX >= 0 && projX < cols && projY >= 0 && projY < rows) {
              if (invZ > zBuffer[projY]![projX]!) {
                zBuffer[projY]![projX] = invZ;
                buffer[projY]![projX] = isPulse ? '@' : (ox === 0 && oy === 0 ? '#' : '*');
              }
            }
          }
        }
      }

      if (preRef.current) {
        preRef.current.textContent = buffer.map((row) => row.join('')).join('\n');
      }

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isMounted = false;
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  // Scroll progress from scrollRootRef
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  useEffect(() => {
    const rootEl = scrollRootRef?.current ?? containerRef.current?.closest('[data-scroll-root]') ?? window;

    const handleScroll = () => {
      let currentScrollTop = 0;
      let maxScroll = 1;

      if (rootEl === window) {
        currentScrollTop = window.scrollY || document.documentElement.scrollTop;
        maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      } else if (rootEl instanceof HTMLElement) {
        currentScrollTop = rootEl.scrollTop;
        maxScroll = rootEl.scrollHeight - rootEl.clientHeight;
      }

      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, currentScrollTop / maxScroll)) : 0;
      setScrollProgress(progress);
    };

    rootEl.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      rootEl.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRootRef]);

  const escortPhase = Math.min(1, Math.max(0, scrollProgress / 0.06));
  const targetTransX = escortPhase * 36;
  const targetTransY = escortPhase * 10;
  const fiberScale = 1.0 - escortPhase * 0.56;
  const hoverBob = Math.sin(performance.now() * 0.003) * 0.5;

  return (
    <div
      ref={containerRef}
      className="contact-bird-ascii-wrapper"
      style={{
        minHeight: '420px',
        overflow: 'visible',
        pointerEvents: 'none',
        transform: `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${hoverBob * 18}px), 0) scale(${fiberScale.toFixed(3)})`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 'fit-content',
          fontSize: '11px',
          lineHeight: '11px',
          letterSpacing: '0.4px',
          color: '#fff4ec',
          textShadow: '0 0 12px rgba(211,86,35,0.35)',
          whiteSpace: 'pre',
          margin: 0,
        }}
      />
    </div>
  );
}
