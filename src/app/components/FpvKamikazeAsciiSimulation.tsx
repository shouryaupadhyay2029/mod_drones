/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface FpvKamikazeAsciiSimulationProps {
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
  kind?: 'frame' | 'battery' | 'motor' | 'camera' | 'antenna' | 'propeller';
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

function generateFpvKamikazeModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Carbon-Fiber Sandwich X-Frame & Standoffs (kind: 'frame')
  // Flat bottom & top carbon plates (x in [-0.26, 0.26], z in [-0.42, 0.42], step 0.026) at y = -0.05 and y = 0.06
  for (let z = -0.42; z <= 0.42; z += 0.026) {
    for (let x = -0.26; x <= 0.26; x += 0.026) {
      if (Math.abs(x) <= 0.24 && Math.abs(z) <= 0.40) {
        // Bottom plate
        points.push({
          x,
          y: -0.05,
          z,
          nx: 0,
          ny: -1,
          nz: 0,
          kind: 'frame',
        });
        // Top plate
        points.push({
          x,
          y: 0.06,
          z,
          nx: 0,
          ny: 1,
          nz: 0,
          kind: 'frame',
        });
      }
    }
  }

  // 6 vertical aluminum standoff pillars connecting y from -0.05 to 0.06 at x = ±0.22, z = -0.36, 0, 0.36
  const standoffXs = [-0.22, 0.22];
  const standoffZs = [-0.36, 0.0, 0.36];
  for (const sx of standoffXs) {
    for (const sz of standoffZs) {
      for (let y = -0.05; y <= 0.06; y += 0.022) {
        for (let s = 0; s < 6; s++) {
          const stAngle = (s / 6) * Math.PI * 2;
          const stRadius = 0.025;
          points.push({
            x: sx + Math.cos(stAngle) * stRadius,
            y,
            z: sz + Math.sin(stAngle) * stRadius,
            nx: Math.cos(stAngle),
            ny: 0,
            nz: Math.sin(stAngle),
            kind: 'frame',
          });
        }
      }
    }
  }

  // 2. Top-Mounted Strapped LiPo Battery Pack & Under-Slung Payload (kind: 'battery')
  // Rectangular LiPo battery block strapped on top of the frame (x in [-0.16, 0.16], y in [0.06, 0.22], z in [-0.26, 0.18], step 0.028)
  for (let z = -0.26; z <= 0.18; z += 0.028) {
    for (let x = -0.16; x <= 0.16; x += 0.028) {
      for (let y = 0.06; y <= 0.22; y += 0.028) {
        if (Math.abs(x) >= 0.14 || Math.abs(z) >= 0.24 || y >= 0.20) {
          points.push({
            x,
            y,
            z,
            nx: Math.abs(x) >= 0.14 ? Math.sign(x) : 0,
            ny: y >= 0.20 ? 1 : 0,
            nz: Math.abs(z) >= 0.24 ? Math.sign(z) : 0,
            kind: 'battery',
          });
        }
      }
    }
  }

  // Compact cylindrical under-slung payload canister (y in [-0.20, -0.05], z in [-0.24, 0.22], radius 0.11)
  for (let z = -0.24; z <= 0.22; z += 0.03) {
    for (let s = 0; s < 10; s++) {
      const cAngle = (s / 10) * Math.PI * 2;
      const cRadius = 0.11;
      for (let y = -0.20; y <= -0.05; y += 0.03) {
        points.push({
          x: Math.cos(cAngle) * cRadius,
          y,
          z,
          nx: Math.cos(cAngle),
          ny: 0,
          nz: Math.sin(cAngle),
          kind: 'battery',
        });
      }
    }
  }

  // 3. 4 Flat Carbon X-Arms & High-KV Brushless Bell Motors (kind: 'motor')
  // 4 diagonal X-arms at angles ±Math.PI / 4 and ±(3 * Math.PI) / 4, r in [0.22, 1.32], step 0.022
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.32;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (let r = 0.22; r <= armLength; r += 0.022) {
      const ax = r * cosA;
      const az = r * sinA;
      const ay = 0.0;

      // Flat carbon cross-section (width = 0.06, thickness = 0.025, NO rotor guards)
      for (let wx = -0.03; wx <= 0.03; wx += 0.02) {
        for (let wy = -0.012; wy <= 0.012; wy += 0.012) {
          const px = ax + wx * (-sinA);
          const pz = az + wx * cosA;
          points.push({
            x: px,
            y: ay + wy,
            z: pz,
            nx: -sinA,
            ny: Math.sign(wy) || 1,
            nz: cosA,
            kind: 'motor',
          });
        }
      }
    }

    // Compact wide brushless motor bells at (mx, mz) = (1.32 * cos(angle), 1.32 * sin(angle)), my in [-0.02, 0.14], radius 0.12 (12 circumferential steps)
    const mx = armLength * cosA;
    const mz = armLength * sinA;
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

  // 4. Up-Tilted Front FPV Camera Cage (kind: 'camera')
  // Front camera cage and wide-angle lens barrel at the nose (z in [0.38, 0.52], y in [-0.02, 0.12], x in [-0.11, 0.11])
  for (let z = 0.38; z <= 0.52; z += 0.025) {
    for (let x = -0.11; x <= 0.11; x += 0.025) {
      for (let y = -0.02; y <= 0.12; y += 0.025) {
        if (Math.abs(x) >= 0.09 || y <= -0.01 || y >= 0.10 || z >= 0.50) {
          points.push({
            x,
            y,
            z,
            nx: Math.abs(x) >= 0.09 ? Math.sign(x) : 0,
            ny: y >= 0.10 ? 1 : (y <= -0.01 ? -1 : 0),
            nz: 1,
            kind: 'camera',
          });
        }
      }
    }
  }

  // 5. Prominent Rear RF Video (5.8GHz Lollipop) & Immortal-T Control-Link Antennas (kind: 'antenna')
  // Tall angled rear SMA coaxial stalk (x = 0, y from 0.06 to 0.50, z from -0.40 to -0.62, step 0.022)
  for (let t = 0; t <= 1.0; t += 0.025) {
    const y = 0.06 + t * 0.44;
    const z = -0.40 - t * 0.22;
    for (let s = 0; s < 6; s++) {
      const aAngle = (s / 6) * Math.PI * 2;
      points.push({
        x: Math.cos(aAngle) * 0.02,
        y,
        z: z + Math.sin(aAngle) * 0.02,
        nx: Math.cos(aAngle),
        ny: 0,
        nz: Math.sin(aAngle),
        kind: 'antenna',
      });
    }
  }

  // Cylindrical/spherical RHCP "lollipop" antenna pod at the tip (center: { x: 0, y: 0.54, z: -0.64 }, radius 0.085)
  const lollyCenter = { x: 0, y: 0.54, z: -0.64 };
  for (let lphi = -Math.PI / 2; lphi <= Math.PI / 2; lphi += 0.3) {
    for (let ltheta = 0; ltheta <= Math.PI * 2; ltheta += 0.3) {
      const lrad = 0.085;
      const lx = lollyCenter.x + lrad * Math.cos(lphi) * Math.cos(ltheta);
      const ly = lollyCenter.y + lrad * Math.sin(lphi);
      const lz = lollyCenter.z + lrad * Math.cos(lphi) * Math.sin(ltheta);
      points.push({
        x: lx,
        y: ly,
        z: lz,
        nx: Math.cos(lphi) * Math.cos(ltheta),
        ny: Math.sin(lphi),
        nz: Math.cos(lphi) * Math.sin(ltheta),
        kind: 'antenna',
      });
    }
  }

  // Horizontal Immortal-T crossfire control dipole bar under the rear tail (x in [-0.44, 0.44], y = -0.02, z = -0.44, step 0.025)
  for (let x = -0.44; x <= 0.44; x += 0.025) {
    for (let s = 0; s < 6; s++) {
      const tAngle = (s / 6) * Math.PI * 2;
      points.push({
        x,
        y: -0.02 + Math.cos(tAngle) * 0.02,
        z: -0.44 + Math.sin(tAngle) * 0.02,
        nx: 0,
        ny: Math.cos(tAngle),
        nz: Math.sin(tAngle),
        kind: 'antenna',
      });
    }
  }

  return points;
}

export function FpvKamikazeAsciiSimulation({ scrollRootRef }: FpvKamikazeAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const yawRef = useRef<number>(0.0);
  const animFrameIdRef = useRef<number | null>(null);
  const assembledPointsRef = useRef<AssembledPoint3D[] | []>([]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    startTimeRef.current = performance.now();
    const rawPoints = generateFpvKamikazeModel();
    const rng = createMulberry32(0xf974a2);

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

      // Continuous slow yaw
      yawRef.current += 0.007;
      const yaw = yawRef.current;
      const pitch = 0.62; // Forward-pitched attack posture
      const roll = Math.sin(elapsed * 1.5) * 0.08; // Subtle flight bank

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);

      const cols = 180;
      const rows = 64;
      const distance = 4.5;
      const scaleX = 98;
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
            if (pt.kind === 'antenna' || pt.kind === 'camera') {
              rampIdx += 1;
            }
            rampIdx = Math.min(ASCII_RAMP.length - 2, Math.max(3, rampIdx));

            buffer[projY]![projX] = ASCII_RAMP[rampIdx] ?? '@';
          }
        }
      }

      // Render Dynamic 3-Blade Bullnose Propellers at each of the 4 motor hubs (my = 0.15)
      const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      const armLength = 1.32;
      const propSpeed = currentTime * 0.025; // High RPM blade rotation

      for (const angle of armAngles) {
        const mx = armLength * Math.cos(angle);
        const mz = armLength * Math.sin(angle);
        const my = 0.15;

        // 3 blades at 2*PI/3 intervals + outer tip ring at r = 0.52
        for (let b = 0; b < 3; b++) {
          const bladeAngle = propSpeed + b * ((2 * Math.PI) / 3);
          const bCos = Math.cos(bladeAngle);
          const bSin = Math.sin(bladeAngle);

          for (let r = 0.04; r <= 0.52; r += 0.035) {
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
                buffer[projY]![projX] = r >= 0.48 ? '*' : '=';
              }
            }
          }
        }
      }

      // Emit a subtle expanding/pulsing RF signal ring around the rear antenna tip (0, 0.54, -0.64)
      const rfRingRadius = 0.12 + ((currentTime * 0.0008) % 0.28);
      for (let s = 0; s < 16; s++) {
        const rAngle = (s / 16) * Math.PI * 2;
        const rx = 0 + Math.cos(rAngle) * rfRingRadius;
        const ry = 0.54;
        const rz = -0.64 + Math.sin(rAngle) * rfRingRadius;

        const x1 = rx * cosY - rz * sinY;
        const z1 = rx * sinY + rz * cosY;
        const y1 = ry;

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
            buffer[projY]![projX] = '.';
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

  // Scroll-driven shrink-and-dock to the right side (36vw)
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
  const fpvScale = 1.0 - escortPhase * 0.56;
  const hoverBob = Math.sin(performance.now() * 0.003) * 0.5;

  return (
    <div
      ref={containerRef}
      className="contact-bird-ascii-wrapper"
      style={{
        minHeight: '420px',
        overflow: 'visible',
        pointerEvents: 'none',
        transform: `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${hoverBob * 18}px), 0) scale(${fpvScale.toFixed(3)})`,
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
