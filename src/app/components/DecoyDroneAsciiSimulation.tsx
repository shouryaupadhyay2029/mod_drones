/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef, useState } from 'react';

export interface DecoyDroneAsciiSimulationProps {
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
  kind?: 'fuselage' | 'wing' | 'leading_edge' | 'fin' | 'rcs_pod' | 'nozzle' | 'plume' | 'echo';
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

function generateDecoyDroneModel(): Point3D[] {
  const points: Point3D[] = [];

  // 1. Sleek Supersonic-Style Central Fuselage & Sharp Pointed Ogive Nose Cone (z in [-0.96, 1.22])
  for (let z = -0.96; z <= 1.22; z += 0.024) {
    let rx = 0.20;
    let ry = 0.15;
    let yCenter = 0.02;

    if (z > 0.20) {
      // Sharp ogive nose cone tapering to needle point at z = 1.22
      const u = (z - 0.20) / (1.22 - 0.20);
      const profile = Math.pow(Math.max(0, 1.0 - u), 1.15);
      rx = 0.20 * profile;
      ry = 0.15 * profile;
      yCenter = 0.02 * (1.0 - u);
    } else if (z < -0.68) {
      // Slight aft taper toward twin jet nozzles
      const u = (-0.68 - z) / (-0.68 - (-0.96));
      rx = 0.20 * (1.0 - 0.20 * u);
      ry = 0.15 * (1.0 - 0.18 * u);
    }

    const steps = 18;
    for (let s = 0; s < steps; s++) {
      const theta = (s / steps) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const yMod = sinT < 0 ? 0.75 : 1.12;
      points.push({
        x: cosT * rx,
        y: yCenter + sinT * ry * yMod,
        z,
        nx: cosT,
        ny: sinT * yMod,
        nz: z > 0.35 ? 0.55 : (z < -0.7 ? -0.45 : 0.08),
        kind: 'fuselage',
      });
    }
  }

  // 2. True Triangular Swept Clipped Delta Wings (|x| from 0.14 to 1.66)
  // Narrow at the front root (z = +0.58), sweeping sharply back to wide wingtips at z = -0.62.. -0.90
  for (const signX of [-1, 1]) {
    for (let absX = 0.14; absX <= 1.66; absX += 0.024) {
      const u = (absX - 0.14) / (1.66 - 0.14); // 0 at fuselage root, 1 at outer wingtip
      const x = signX * absX;

      // Sharp 50-degree swept leading edge and notched/swept trailing edge (matching 6th thumbnail)
      const zLeading = 0.58 - 1.20 * u;
      const zTrailing = -0.82 - 0.12 * u;
      const chord = Math.max(0.04, zLeading - zTrailing);
      const maxThickness = 0.052 * (1.0 - 0.55 * u);

      for (let z = zTrailing; z <= zLeading; z += 0.024) {
        const cFrac = (zLeading - z) / chord; // 0 at leading edge, 1 at trailing edge
        const camber = Math.sin(cFrac * Math.PI);
        const topY = 0.0 + maxThickness * camber;
        const botY = -0.02 - maxThickness * 0.4 * camber;

        const isLeadingEdge = cFrac < 0.14;
        const isTrailingEdge = cFrac > 0.88;
        const isStrakeRib =
          Math.abs(absX - 0.52) < 0.016 ||
          Math.abs(absX - 0.96) < 0.016 ||
          Math.abs(absX - 1.38) < 0.016;

        // Upper delta wing skin
        points.push({
          x,
          y: topY,
          z,
          nx: isLeadingEdge ? signX * 0.65 : signX * 0.12,
          ny: isLeadingEdge ? 0.55 : 0.92,
          nz: isLeadingEdge ? 0.65 : (isTrailingEdge ? -0.45 : 0.12),
          kind: isLeadingEdge || isStrakeRib ? 'leading_edge' : 'wing',
        });

        // Lower wing skin along edges & structural ribs
        if (isLeadingEdge || isTrailingEdge || isStrakeRib) {
          points.push({
            x,
            y: botY,
            z,
            nx: signX * 0.45,
            ny: -0.75,
            nz: isLeadingEdge ? 0.65 : -0.35,
            kind: isLeadingEdge ? 'leading_edge' : 'wing',
          });
        }
      }
    }

    // 3. Canted Twin Wingtip Ruddervator / Vertical Fins (at outer delta tips |x| ≈ 1.64, z in [-0.94, -0.58])
    for (let h = 0; h <= 1.0; h += 0.06) {
      const fx = signX * (1.64 + h * 0.08);
      const fy = -0.02 + h * 0.40;
      const fzLead = -0.58 - h * 0.16;
      const fzTrail = -0.94 - h * 0.08;

      for (let z = fzTrail; z <= fzLead; z += 0.022) {
        points.push({
          x: fx,
          y: fy,
          z,
          nx: signX * 0.88,
          ny: 0.42,
          nz: 0.22,
          kind: 'fin',
        });
      }
    }
  }

  // 4. Tall Swept Central Dorsal Tail Fin (x = 0, z in [-0.96, -0.32], y rising from 0.14 to 0.56)
  for (let h = 0; h <= 1.0; h += 0.05) {
    const fy = 0.14 + h * 0.42;
    const fzLead = -0.32 - h * 0.36;
    const fzTrail = -0.96 - h * 0.10;
    for (let z = fzTrail; z <= fzLead; z += 0.022) {
      for (const side of [-0.015, 0.015]) {
        points.push({
          x: side,
          y: fy,
          z,
          nx: Math.sign(side) * 0.85,
          ny: 0.45,
          nz: 0.25,
          kind: 'fin',
        });
      }
    }
  }

  // 5. Dorsal Luneberg Radar-Augmentor Dome & Ventral Decoy Pod (center: { x: 0, y: 0.20, z: 0.10 }, radius = 0.13)
  const podCenter = { x: 0, y: 0.20, z: 0.10 };
  const podR = 0.13;
  for (let phi = -Math.PI * 0.3; phi <= Math.PI * 0.5; phi += 0.22) {
    const sliceR = Math.cos(phi) * podR;
    const py = podCenter.y + Math.sin(phi) * podR;
    for (let theta = 0; theta < Math.PI * 2; theta += 0.26) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      points.push({
        x: podCenter.x + cosT * sliceR,
        y: py,
        z: podCenter.z + sinT * sliceR,
        nx: cosT * Math.cos(phi),
        ny: Math.sin(phi),
        nz: sinT * Math.cos(phi),
        kind: 'rcs_pod',
      });
    }
  }

  // 6. Twin Rear Micro-Turbojet Exhaust Nozzles (x = ±0.10, y = 0.01, z in [-1.12, -0.94], radius = 0.078)
  for (const nozzleX of [-0.10, 0.10]) {
    for (let z = -1.12; z <= -0.94; z += 0.022) {
      const nozzleR = 0.078;
      for (let s = 0; s < 12; s++) {
        const theta = (s / 12) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        points.push({
          x: nozzleX + cosT * nozzleR,
          y: 0.01 + sinT * nozzleR,
          z,
          nx: cosT,
          ny: sinT,
          nz: -0.65,
          kind: 'nozzle',
        });
      }
    }
  }

  return points;
}

function createAssembledModel(basePoints: Point3D[]): AssembledPoint3D[] {
  const rng = createMulberry32(0xd3c07a);

  return basePoints.map((pt) => {
    let startProgress = 0.0;
    let endProgress = 0.58;

    if (pt.kind === 'wing' || pt.kind === 'leading_edge') {
      startProgress = 0.12;
      endProgress = 0.72;
    } else if (pt.kind === 'fin' || pt.kind === 'nozzle') {
      startProgress = 0.22;
      endProgress = 0.78;
    } else if (pt.kind === 'rcs_pod') {
      startProgress = 0.28;
      endProgress = 0.84;
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

export function DecoyDroneAsciiSimulation({
  scrollRootRef,
}: DecoyDroneAsciiSimulationProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [asciiText, setAsciiText] = useState<string>('');

  const assemblyStartTimeRef = useRef<number | null>(null);
  const baseModelRef = useRef<AssembledPoint3D[]>(createAssembledModel(generateDecoyDroneModel()));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);
  const scrollVelRef = useRef<number>(0);
  const smoothedScrollRef = useRef<number>(0);
  const yawRef = useRef<number>(0.55);
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
    const ASSEMBLY_DURATION = 1.55;
    const lightDir: [number, number, number] = [0.45, 0.78, -0.42];

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

      // Continuous 360° orbit yaw + agile delta-wing bank
      yawRef.current += 0.0065;
      const naturalBank = Math.sin(currentTime * 0.002) * 0.16;
      const targetBank = Math.max(-0.45, Math.min(0.45, naturalBank - scrollDelta * 0.0003));
      bankRef.current += (targetBank - bankRef.current) * 0.12;

      const targetTransX = escortPhase * 36;
      const targetTransY = escortPhase * 10;
      const decoyScale = 1.0 - escortPhase * 0.56;
      const hoverBob = Math.sin(currentTime * 0.0026) * 0.045;

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${hoverBob * 18}px), 0) scale(${decoyScale.toFixed(3)})`;
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

      // --- DYNAMIC TWIN JET EXHAUST PLUMES & SYNTHETIC RADAR ECHO RINGS ---
      const dynamicPoints: Point3D[] = [];
      const assemblyEase = cubicEaseOut(Math.min(1.0, globalProgress / 0.7));

      if (assemblyEase > 0.05) {
        // 1. Twin flickering booster plumes behind z = -1.12 down to -1.72
        for (const nozzleX of [-0.10, 0.10]) {
          for (let z = -1.14; z >= -1.72; z -= 0.028) {
            const distRear = Math.abs(z - (-1.14));
            const coneR = Math.max(0.01, 0.068 * (1.0 - distRear / 0.62));
            for (let s = 0; s < 6; s++) {
              const pAngle = (s / 6) * Math.PI * 2 + currentTime * 0.018 + distRear * 8;
              dynamicPoints.push({
                x: nozzleX + Math.cos(pAngle) * coneR,
                y: 0.01 + Math.sin(pAngle) * coneR,
                z,
                nx: Math.cos(pAngle),
                ny: 0.7,
                nz: -0.7,
                kind: 'plume',
              });
            }
          }
        }

        // 2. Expanding synthetic radar-echo rings around the dorsal Luneberg RCS dome (0, 0.20, 0.10)
        for (let ringIdx = 0; ringIdx < 2; ringIdx++) {
          const ringPhase = ((currentTime * 0.0007 + ringIdx * 0.5) % 1.0);
          const ringRadius = 0.22 + ringPhase * 0.58;
          const steps = 28;
          for (let s = 0; s < steps; s++) {
            const theta = (s / steps) * Math.PI * 2;
            dynamicPoints.push({
              x: Math.cos(theta) * ringRadius,
              y: 0.20 + Math.sin(theta * 2) * 0.02,
              z: 0.10 + Math.sin(theta) * ringRadius,
              nx: Math.cos(theta),
              ny: 0.85,
              nz: Math.sin(theta),
              kind: 'echo',
            });
          }
        }
      }

      const allPoints = [...computedBasePoints, ...dynamicPoints];

      // --- NON-CLIPPING GRID, CAMERA & Z-BUFFER RENDERING ---
      const cols = 180;
      const rows = 64;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const distance = 4.6;
      const scaleX = 96;
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
            const rim = Math.pow(1.0 - Math.abs(nnz3), 2.2);

            const lightFactor = 0.30 + 0.54 * diffuse + 0.26 * rim;
            let rampIdx = Math.floor(lightFactor * (ASCII_RAMP.length - 1));

            if (pt.kind === 'rcs_pod' || pt.kind === 'leading_edge') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 2);
            } else if (pt.kind === 'fin' || pt.kind === 'nozzle' || pt.kind === 'plume') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 1);
            } else if (pt.kind === 'echo') {
              rampIdx = Math.min(ASCII_RAMP.length - 2, Math.max(4, rampIdx));
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
