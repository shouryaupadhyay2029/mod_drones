/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface BirdAsciiSimulationProps {
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
  kind?: 'body' | 'wing_inner' | 'wing_outer' | 'feather' | 'head' | 'beak' | 'tail';
}

interface AssembledPoint3D extends Point3D {
  scatterX: number;
  scatterY: number;
  scatterZ: number;
  startProgress: number;
  endProgress: number;
}

const ASCII_RAMP = ' .:-=+*#%@█';

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

function generateBirdBaseModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Sculpted Avian Torso & Breast (z in [-0.52, 0.58], step 0.024)
  for (let z = -0.52; z <= 0.58; z += 0.024) {
    const t = (z + 0.52) / 1.10; // 0 at tail root, 1 at neck
    const rx = 0.24 * Math.sin(Math.PI * Math.pow(t, 0.65));
    const ry = 0.18 * Math.sin(Math.PI * Math.pow(t, 0.65));
    const yOffset = -0.04 * Math.sin(Math.PI * t);

    const slices = 22;
    for (let s = 0; s < slices; s++) {
      const theta = (s / slices) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = cosT * rx;
      const y = sinT * ry + yOffset;

      const len = Math.sqrt(x * x + y * y + 0.001);
      points.push({
        x,
        y,
        z,
        nx: x / len,
        ny: y / len,
        nz: 0.1,
        kind: 'body',
      });
    }
  }

  // 2. Sculpted Raptor Head & Hooked Beak (z in [0.58, 0.96], step 0.02)
  for (let z = 0.58; z <= 0.96; z += 0.02) {
    const isBeak = z > 0.80;
    const slices = 16;
    for (let s = 0; s < slices; s++) {
      const theta = (s / slices) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let x = 0;
      let y = 0;
      let nx = 0;
      let ny = 0;
      let nz = 0;

      if (!isBeak) {
        // Crown & skull (z in [0.58, 0.80]): rounded cranium
        const rx = 0.13;
        const ry = 0.11;
        x = cosT * rx;
        y = sinT * ry + 0.05;
        nx = cosT;
        ny = sinT;
        nz = 0.3;
      } else {
        // Hooked Raptor Beak (z in [0.80, 0.96]): tapers sharply & curves down
        const beakT = (z - 0.80) / (0.96 - 0.80);
        const r = 0.065 * (1 - beakT);
        x = cosT * r;
        y = sinT * r + (0.04 - 0.09 * beakT * beakT);
        nx = cosT;
        ny = sinT;
        nz = 0.5;
      }

      points.push({
        x,
        y,
        z,
        nx,
        ny,
        nz,
        kind: isBeak ? 'beak' : 'head',
      });
    }
  }

  // 3. Broad V-Fanned Tail Feathers (r in [0.0, 0.62] behind z = -0.48, 9 distinct overlapping rectrices)
  for (let r = 0.0; r <= 0.62; r += 0.05) {
    for (let f = -4; f <= 4; f++) {
      const angle = f * 0.13;
      const x = r * Math.sin(angle);
      const z = -0.48 - r * Math.cos(f * 0.12);
      const y = -0.05 * (1 - r / 0.62);

      // Feather vanes width ±0.035
      for (const vaneSign of [-1, 1]) {
        const vaneX = x + vaneSign * 0.035 * Math.cos(angle);
        const vaneY = y + vaneSign * 0.01;
        points.push({
          x: vaneX,
          y: vaneY,
          z,
          nx: vaneSign * 0.2,
          ny: -0.9,
          nz: -0.4,
          kind: 'tail',
        });
      }
    }
  }

  return points;
}

function createAssembledModel(basePoints: Point3D[]): AssembledPoint3D[] {
  const rng = createMulberry32(0xb17d45);

  return basePoints.map((pt) => {
    let startProgress = 0.0;
    let endProgress = 0.55;

    if (pt.kind === 'wing_inner') {
      startProgress = 0.12;
      endProgress = 0.65;
    } else if (pt.kind === 'wing_outer' || pt.kind === 'feather') {
      startProgress = 0.22;
      endProgress = 0.75;
    } else if (pt.kind === 'head' || pt.kind === 'beak') {
      startProgress = 0.28;
      endProgress = 0.80;
    } else if (pt.kind === 'tail') {
      startProgress = 0.10;
      endProgress = 0.60;
    }

    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * Math.PI * 0.8;
    const dist = 3.0 + rng() * 3.5;

    let biasX = 0;
    let biasZ = 0;
    if (Math.abs(pt.x) > 0.2 || Math.abs(pt.z) > 0.2) {
      const dir = Math.atan2(pt.z, pt.x);
      biasX = Math.cos(dir) * 2.0;
      biasZ = Math.sin(dir) * 2.0;
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

export function BirdAsciiSimulation({
  scrollRootRef,
}: BirdAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [asciiText, setAsciiText] = useState<string>('');

  const assemblyStartTimeRef = useRef<number | null>(null);
  const baseModelRef = useRef<AssembledPoint3D[]>(createAssembledModel(generateBirdBaseModel()));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const scrollVelRef = useRef<number>(0);
  const smoothedScrollRef = useRef<number>(0);
  const yawRef = useRef<number>(0.3);
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
      yawRef.current += 0.008;
      const targetBank = Math.max(-0.4, Math.min(0.4, -scrollDelta * 0.0003));
      bankRef.current += (targetBank - bankRef.current) * 0.12;

      // Companion flight positioning transform
      const targetTransX = escortPhase * 36;
      const targetTransY = escortPhase * 10;
      const birdScale = 1.0 - escortPhase * 0.56;
      const flightBob = Math.sin(currentTime * 0.004) * (escortPhase > 0.1 ? 4 : 2);

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${flightBob}px), 0) scale(${birdScale.toFixed(3)})`;
      }

      // --- 3D AVIAN POINT CLOUD & KINEMATICS ---
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

      // --- 2. FULL 3D ARTICULATED FEATHERED WINGS (Replace dynamicPoints block) ---
      const dynamicPoints: Point3D[] = [];
      const assemblyWingEase = cubicEaseOut(Math.min(1.0, globalProgress / 0.7));

      if (assemblyWingEase > 0.01) {
        const flapPhase = currentTime * 0.0052;

        for (const signX of [-1, 1]) {
          // Sample span s in [0.16, 2.15] with dense step 0.028
          for (let s = 0.16; s <= 2.15; s += 0.028) {
            const sNorm = (s - 0.16) / 1.99;

            // Gull-Wing Articulated Flap Wave
            let wingYVal = 0;
            if (s <= 0.95) {
              const armAngle = Math.sin(flapPhase) * 0.38;
              wingYVal = s * Math.sin(armAngle) * assemblyWingEase;
            } else {
              const wristAngle = Math.sin(flapPhase - 0.65) * 0.52;
              const innerWristY = 0.95 * Math.sin(Math.sin(flapPhase) * 0.38);
              wingYVal = (innerWristY + (s - 0.95) * Math.sin(wristAngle)) * assemblyWingEase;
            }

            // Natural Raptor Planform (Forward-Arched Wrist + Swept Tip)
            const zLead = 0.22 + 0.26 * Math.sin(Math.PI * Math.min(1, sNorm * 1.35)) - 0.58 * Math.pow(sNorm, 1.85);
            const chord = 0.68 * Math.sin(Math.PI * (0.15 + 0.78 * (1 - sNorm * 0.65)));

            // 3D Cambered Airfoil Surface (s <= 1.55)
            if (s <= 1.55) {
              for (let c = 0.0; c <= 1.0; c += 0.035) {
                const camberY = 0.065 * Math.sin(Math.PI * c) * (1 - sNorm * 0.4);
                const ptZ = zLead - c * chord;
                const ptY = wingYVal + camberY;
                const ptX = s * signX;

                const kind = c < 0.35 ? 'wing_inner' : 'wing_outer';
                const nx = signX * (c < 0.35 ? 0.3 : 0.2);
                const ny = 0.9;
                const nz = c < 0.25 ? 0.4 : 0.1;

                dynamicPoints.push({
                  x: ptX,
                  y: ptY,
                  z: ptZ,
                  nx,
                  ny,
                  nz,
                  kind,
                });
              }
            } else {
              // 7 Splayed Slotted Primary Feathers at Wingtip (s > 1.35)
              const wristX = signX * 1.32;
              const wristZ = 0.22 + 0.26 * Math.sin(Math.PI * Math.min(1, ((1.32 - 0.16) / 1.99) * 1.35)) - 0.58 * Math.pow((1.32 - 0.16) / 1.99, 1.85);

              for (let p = 0; p <= 6; p++) {
                const sweepAngle = (0.08 - p * 0.13);
                const pLen = 0.82 - p * 0.055;
                const rSteps = 8;
                for (let rStep = 0; rStep <= rSteps; rStep++) {
                  const featherR = (rStep / rSteps) * pLen;
                  const tipUp = 0.09 * Math.pow(featherR / pLen, 2) * (1 + Math.sin(flapPhase) * 0.4);

                  const fx = wristX + (s - 1.32) * signX + featherR * Math.sin(sweepAngle) * signX;
                  const fz = wristZ - featherR * Math.cos(sweepAngle);
                  const fy = wingYVal + tipUp;

                  for (const vaneW of [-0.028, 0.0, 0.028]) {
                    dynamicPoints.push({
                      x: fx + vaneW * signX,
                      y: fy,
                      z: fz,
                      nx: signX * 0.3,
                      ny: 0.85,
                      nz: 0.2,
                      kind: 'feather',
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Merge base model points and dynamic articulated wings
      const allPoints = [...computedBasePoints, ...dynamicPoints];

      // --- 3. ROTATE SURFACE NORMS & FIX CAMERA PERSPECTIVE ---
      const cols = 180;
      const rows = 64;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const distance = 4.8;
      const scaleX = 96;
      const scaleY = 46;
      const pitch = 0.62;
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

        // Pitch & Isometric depth sign (y2 = posY * cosP - z1 * sinP; z2 = -posY * sinP - z1 * cosP;)
        const y2 = posY * cosP - z1 * sinP;
        const z2 = -posY * sinP - z1 * cosP;
        const x2 = x1;

        // Bank / Roll rotation around camera z-axis
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

            // Rotate surface normals (nx, ny, nz) by yaw, pitch, and bank
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

            // Lambertian diffuse lighting with rotated normals
            const diffDot = nnx3 * lightDir[0] + nny3 * lightDir[1] + nnz3 * lightDir[2];
            const diffuse = Math.max(0, diffDot);

            // Rim lighting edge pop
            const rim = Math.pow(1.0 - Math.abs(nnz3), 2.5);

            const lightFactor = 0.3 + 0.55 * diffuse + 0.25 * rim;
            const rampIdx = Math.floor(lightFactor * (ASCII_RAMP.length - 1));
            const charIndex = Math.max(0, Math.min(ASCII_RAMP.length - 1, rampIdx));

            buffer[idx] = ASCII_RAMP[charIndex] || '█';
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
        }}
      >
        {asciiText}
      </pre>
    </div>
  );
}
