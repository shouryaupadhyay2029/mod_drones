/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface FixedWingAsciiSimulationProps {
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
  kind?: 'fuselage' | 'wing' | 'winglet' | 'boom' | 'tail' | 'turret' | 'propeller';
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

function generateFixedWingModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Streamlined ISR Fuselage Pod & Bulbous SATCOM Nose Radome (z in [-0.62, 0.94])
  for (let z = -0.62; z <= 0.94; z += 0.026) {
    let rx = 0.21;
    let ry = 0.16;
    let yCenter = 0.02;

    if (z > 0.55) {
      // Tapered bulbous nose radome
      const u = (z - 0.55) / (0.94 - 0.55);
      const profile = Math.sqrt(Math.max(0, 1 - u * u));
      rx = 0.21 * profile;
      ry = 0.15 * profile;
      yCenter = 0.02 - 0.03 * u;
    } else if (z < -0.25) {
      // Tapered rear engine nacelle toward pusher hub
      const u = (-0.25 - z) / (-0.25 - (-0.62));
      rx = 0.21 * (1 - 0.52 * u);
      ry = 0.16 * (1 - 0.45 * u);
      yCenter = 0.03 + 0.02 * u;
    } else {
      // Dorsal SATCOM hump
      const hump = Math.cos(((z - 0.15) / 0.45) * (Math.PI * 0.5));
      ry = 0.16 + 0.04 * Math.max(0, hump);
    }

    const steps = 20;
    for (let s = 0; s < steps; s++) {
      const theta = (s / steps) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      // Flatter belly, arched dorsal spine
      const yMod = sinT < 0 ? 0.78 : 1.08;
      points.push({
        x: cosT * rx,
        y: yCenter + sinT * ry * yMod,
        z,
        nx: cosT,
        ny: sinT * yMod,
        nz: z > 0.65 ? 0.45 : (z < -0.45 ? -0.35 : 0.08),
        kind: 'fuselage',
      });
    }
  }

  // 2. Under-Belly Spherical EO/IR Gimbal Turret Ball (center: { x: 0, y: -0.21, z: 0.42 }, radius = 0.13)
  const turretCenter = { x: 0, y: -0.21, z: 0.42 };
  const turretR = 0.135;
  for (let phi = -Math.PI * 0.5; phi <= Math.PI * 0.35; phi += 0.24) {
    const rSlice = Math.cos(phi) * turretR;
    const py = turretCenter.y + Math.sin(phi) * turretR;
    for (let theta = 0; theta < Math.PI * 2; theta += 0.28) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      points.push({
        x: turretCenter.x + cosT * rSlice,
        y: py,
        z: turretCenter.z + sinT * rSlice,
        nx: cosT * Math.cos(phi),
        ny: Math.sin(phi),
        nz: sinT * Math.cos(phi),
        kind: 'turret',
      });
    }
  }

  // 3. High-Aspect-Ratio Straight Reconnaissance Wings (span x in [-2.12, 2.12])
  for (const signX of [-1, 1]) {
    for (let absX = 0.16; absX <= 2.12; absX += 0.025) {
      const u = (absX - 0.16) / (2.12 - 0.16); // 0 at root, 1 at tip
      const x = signX * absX;

      // Slight backward sweep on leading edge, straight trailing edge
      const zLeading = 0.22 - 0.16 * u;
      const zTrailing = -0.26 + 0.08 * u;
      const chord = zLeading - zTrailing;

      // Subtle high-wing mount + gentle positive dihedral
      const wingBaseY = 0.09 + 0.06 * u;
      const maxThickness = 0.055 * (1 - 0.48 * u);

      for (let z = zTrailing; z <= zLeading; z += 0.024) {
        const cFrac = (zLeading - z) / Math.max(0.01, chord); // 0 at LE, 1 at TE
        // NACA airfoil camber & thickness envelope
        const camber = Math.sin(cFrac * Math.PI) * (1 - 0.35 * cFrac);
        const topY = wingBaseY + maxThickness * camber;
        const botY = wingBaseY - maxThickness * 0.35 * camber;

        const leNx = signX * 0.08;
        const leNz = cFrac < 0.22 ? 0.75 : (cFrac > 0.82 ? -0.45 : 0.1);

        // Upper wing skin
        points.push({
          x,
          y: topY,
          z,
          nx: leNx,
          ny: 0.92,
          nz: leNz,
          kind: 'wing',
        });

        // Lower wing skin & leading/trailing edge thickness
        if (cFrac < 0.22 || cFrac > 0.84 || Math.abs(absX - 0.50) < 0.02 || Math.abs(absX - 1.15) < 0.02 || Math.abs(absX - 1.75) < 0.02) {
          points.push({
            x,
            y: botY,
            z,
            nx: leNx,
            ny: cFrac < 0.18 ? 0.3 : -0.85,
            nz: cFrac < 0.18 ? 0.9 : leNz,
            kind: 'wing',
          });
        }
      }
    }

    // 4. Upturned Aerodynamic Wingtip Winglets (|x| from 2.08 to 2.20, rising y from 0.15 to 0.38)
    for (let w = 0; w <= 1.0; w += 0.08) {
      const wx = signX * (2.08 + w * 0.12);
      const wy = 0.15 + w * 0.23;
      const wzLead = 0.06 - w * 0.10;
      const wzTrail = -0.18 - w * 0.06;
      for (let z = wzTrail; z <= wzLead; z += 0.024) {
        points.push({
          x: wx,
          y: wy,
          z,
          nx: signX * 0.92,
          ny: 0.35,
          nz: 0.15,
          kind: 'winglet',
        });
      }
    }
  }

  // 5. Twin Slender Tail Booms (x = ±0.50, z in [-1.32, -0.08], y = 0.06)
  const boomX = 0.50;
  for (const signX of [-1, 1]) {
    const bx = signX * boomX;
    for (let z = -1.32; z <= -0.08; z += 0.024) {
      const boomRadius = 0.036;
      for (let s = 0; s < 8; s++) {
        const bAngle = (s / 8) * Math.PI * 2;
        points.push({
          x: bx + Math.cos(bAngle) * boomRadius,
          y: 0.06 + Math.sin(bAngle) * boomRadius,
          z,
          nx: Math.cos(bAngle),
          ny: Math.sin(bAngle),
          nz: 0,
          kind: 'boom',
        });
      }
    }

    // 6. Inverted-V / Angled Twin Tail Fins rising from each tail boom (z in [-1.34, -1.04])
    for (let h = 0; h <= 1.0; h += 0.05) {
      // Angles inward toward the top to form an inverted-V / A-tail bridge, plus outward stabilizer
      const tx = signX * (boomX - h * 0.50);
      const ty = 0.06 + h * 0.38;
      const tzLead = -1.04 - h * 0.12;
      const tzTrail = -1.34 - h * 0.06;

      for (let z = tzTrail; z <= tzLead; z += 0.024) {
        points.push({
          x: tx,
          y: ty,
          z,
          nx: signX * 0.65,
          ny: 0.72,
          nz: 0.2,
          kind: 'tail',
        });
      }
    }
  }

  return points;
}

function createAssembledModel(basePoints: Point3D[]): AssembledPoint3D[] {
  const rng = createMulberry32(0x51a7e2);

  return basePoints.map((pt) => {
    let startProgress = 0.0;
    let endProgress = 0.58;

    if (pt.kind === 'wing' || pt.kind === 'winglet') {
      startProgress = 0.12;
      endProgress = 0.72;
    } else if (pt.kind === 'boom' || pt.kind === 'tail') {
      startProgress = 0.22;
      endProgress = 0.78;
    } else if (pt.kind === 'turret') {
      startProgress = 0.28;
      endProgress = 0.82;
    }

    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * Math.PI * 0.8;
    const dist = 3.0 + rng() * 3.5;

    const scatterX = pt.x + Math.cos(phi) * Math.cos(theta) * dist;
    const scatterY = pt.y + Math.sin(phi) * (dist * 0.55);
    const scatterZ = pt.z + Math.cos(phi) * Math.sin(theta) * dist;

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

export function FixedWingAsciiSimulation({
  scrollRootRef,
}: FixedWingAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [asciiText, setAsciiText] = useState<string>('');

  const assemblyStartTimeRef = useRef<number | null>(null);
  const baseModelRef = useRef<AssembledPoint3D[]>(createAssembledModel(generateFixedWingModel()));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const scrollVelRef = useRef<number>(0);
  const smoothedScrollRef = useRef<number>(0);
  const yawRef = useRef<number>(0.42);
  const pitchRef = useRef<number>(0.50);
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
    const ASSEMBLY_DURATION = 1.55;
    const lightDir: [number, number, number] = [0.48, 0.78, -0.38];

    const render = (now: number) => {
      const currentTime = typeof now === 'number' && now > 0 ? now : performance.now();
      if (assemblyStartTimeRef.current === null) {
        assemblyStartTimeRef.current = currentTime;
      }
      const elapsed = Math.max(0, (currentTime - assemblyStartTimeRef.current) / 1000);
      const globalProgress = Math.min(1.0, elapsed / ASSEMBLY_DURATION);

      // --- SCROLL-DRIVEN ESCORT FLIGHT ---
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

      // Continuous loitering orbit yaw + gentle S-turn wing bank
      yawRef.current += 0.0055;
      const naturalBank = Math.sin(currentTime * 0.0016) * 0.14;
      const targetBank = Math.max(-0.42, Math.min(0.42, naturalBank - scrollDelta * 0.00028));
      bankRef.current += (targetBank - bankRef.current) * 0.12;

      const targetTransX = escortPhase * 36;
      const targetTransY = escortPhase * 10;
      const uavScale = 1.0 - escortPhase * 0.56;
      const glideBob = Math.sin(currentTime * 0.0022) * 0.04;

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${glideBob * 18}px), 0) scale(${uavScale.toFixed(3)})`;
      }

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

      // --- DYNAMIC REAR PUSHER PROPELLER (Vertical X-Y disc at z = -0.66) ---
      const dynamicPoints: Point3D[] = [];
      const assemblyPropEase = cubicEaseOut(Math.min(1.0, globalProgress / 0.65));

      if (assemblyPropEase > 0.01) {
        const propAngle = currentTime * 0.028;
        const hubY = 0.05;
        const hubZ = -0.66;

        // 3-blade rear pusher propeller spinning in vertical X-Y plane
        for (let b = 0; b < 3; b++) {
          const bladeAngle = propAngle + b * ((Math.PI * 2) / 3);
          const cosB = Math.cos(bladeAngle);
          const sinB = Math.sin(bladeAngle);

          for (let r = 0.03; r <= 0.38; r += 0.022) {
            dynamicPoints.push({
              x: r * cosB,
              y: hubY + r * sinB,
              z: hubZ,
              nx: 0,
              ny: 0.4,
              nz: -0.9,
              kind: 'propeller',
            });
          }
        }

        // Pusher rotor tip ring
        for (let s = 0; s < 20; s++) {
          const rAngle = (s / 20) * Math.PI * 2;
          dynamicPoints.push({
            x: Math.cos(rAngle) * 0.38,
            y: hubY + Math.sin(rAngle) * 0.38,
            z: hubZ,
            nx: Math.cos(rAngle),
            ny: Math.sin(rAngle),
            nz: -0.6,
            kind: 'propeller',
          });
        }
      }

      const allPoints = [...computedBasePoints, ...dynamicPoints];

      // --- NON-CLIPPING GRID, CAMERA & Z-BUFFER RENDERING ---
      const cols = 180;
      const rows = 64;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const distance = 4.9;
      const scaleX = 94;
      const scaleY = 46;
      const pitch = pitchRef.current + glideBob;
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

        // 1. Yaw rotation
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;

        // 2. Pitch rotation
        const y2 = posY * cosP - z1 * sinP;
        const z2 = -posY * sinP - z1 * cosP;
        const x2 = x1;

        // 3. Bank / Roll rotation
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

            const diffDot = nnx3 * lightDir[0] + nny3 * lightDir[1] + nnz3 * lightDir[2];
            const diffuse = Math.max(0, diffDot);
            const rim = Math.pow(1.0 - Math.abs(nnz3), 2.3);

            const lightFactor = 0.28 + 0.54 * diffuse + 0.26 * rim;
            let rampIdx = Math.floor(lightFactor * (ASCII_RAMP.length - 1));

            if (pt.kind === 'turret' || pt.kind === 'winglet') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 1);
            } else if (pt.kind === 'propeller') {
              rampIdx = Math.min(ASCII_RAMP.length - 2, Math.max(3, rampIdx));
            }

            const charIndex = Math.max(2, Math.min(ASCII_RAMP.length - 1, rampIdx));
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
  }, [scrollRootRef]);

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
