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
  nx?: number;
  ny?: number;
  nz?: number;
  kind?: 'body' | 'arm' | 'motor' | 'propeller' | 'camera' | 'antenna';
}

interface AssembledPoint3D extends Point3D {
  scatterX: number;
  scatterY: number;
  scatterZ: number;
  startProgress: number;
  endProgress: number;
}

const ASCII_RAMP = ' .:-=+*#%@█';

// All 24 permutations of 4 items for 100% crossing-free 1-to-1 corner matching
const PERMUTATIONS_4 = [
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1],
  [1, 0, 2, 3], [1, 0, 3, 2], [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0],
  [2, 0, 1, 3], [2, 0, 3, 1], [2, 1, 0, 3], [2, 1, 3, 0], [2, 3, 0, 1], [2, 3, 1, 0],
  [3, 0, 1, 2], [3, 0, 2, 1], [3, 1, 0, 2], [3, 1, 2, 0], [3, 2, 0, 1], [3, 2, 1, 0],
];

function matchRotorsToCorners(
  rotors: Array<{ screenX: number; screenY: number }>,
  cols: number,
  rows: number,
) {
  const corners = [
    { x: 0, y: 0 },         // C1: Top-Left
    { x: cols, y: 0 },      // C2: Top-Right
    { x: 0, y: rows },      // C3: Bottom-Left
    { x: cols, y: rows },   // C4: Bottom-Right
  ];

  let bestPerm = PERMUTATIONS_4[0]!;
  let bestCost = Infinity;

  for (let p = 0; p < PERMUTATIONS_4.length; p++) {
    const perm = PERMUTATIONS_4[p]!;
    let cost = 0;
    for (let i = 0; i < 4; i++) {
      const r = rotors[perm[i]!]!;
      const c = corners[i]!;
      const dx = r.screenX - c.x;
      const dy = r.screenY - c.y;
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestPerm = perm;
    }
  }

  return {
    tlPt: rotors[bestPerm[0]!]!,
    trPt: rotors[bestPerm[1]!]!,
    blPt: rotors[bestPerm[2]!]!,
    brPt: rotors[bestPerm[3]!]!,
  };
}

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

function normalize3D(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-6) return [0, 1, 0];
  return [x / len, y / len, z / len];
}

function createAssembledModel(basePoints: Point3D[]): AssembledPoint3D[] {
  const rng = createMulberry32(0x5a18a); // Deterministic seed for reproducible cinematic scatter

  return basePoints.map((pt) => {
    let startProgress = 0.0;
    let endProgress = 0.50;

    if (pt.kind === 'arm') {
      startProgress = 0.15;
      endProgress = 0.68;
    } else if (pt.kind === 'motor') {
      startProgress = 0.28;
      endProgress = 0.80;
    } else if (pt.kind === 'camera' || pt.kind === 'antenna') {
      startProgress = 0.30;
      endProgress = 0.82;
    }

    // Spherical dispersion in 3D space + directional arm bias
    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * Math.PI * 0.75;
    const dist = 2.6 + rng() * 4.0;

    let biasX = 0;
    let biasZ = 0;
    if (Math.abs(pt.x) > 0.15 || Math.abs(pt.z) > 0.15) {
      const dir = Math.atan2(pt.z, pt.x);
      biasX = Math.cos(dir) * 1.8;
      biasZ = Math.sin(dir) * 1.8;
    }

    const scatterX = Math.cos(phi) * Math.cos(theta) * dist + biasX;
    const scatterY = Math.sin(phi) * (dist * 0.55); // Flatter Y distribution for cinematic widescreen
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

// Build procedural 3D Tactical Drone Model with true surface normals, 3D volume & crisp details
function generateDroneModel(): Point3D[] {
  const points: Point3D[] = [];

  const addPt = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    kind: Point3D['kind'] = 'body',
  ) => {
    const [normX, normY, normZ] = normalize3D(nx, ny, nz);
    points.push({ x, y, z, nx: normX, ny: normY, nz: normZ, kind });
  };

  // 1. Central Fuselage / Carbon-Fiber Body (Dual-deck faceted plates + cooling vents + bevels)
  for (let x = -0.42; x <= 0.42; x += 0.028) {
    for (let z = -0.56; z <= 0.56; z += 0.028) {
      // Octagonal boundary chamfer
      if (Math.abs(x) * 1.25 + Math.abs(z) * 0.95 > 0.88) continue;

      // Upper carbon deck (Facing Up)
      addPt(x, 0.10, z, 0, 1, 0, 'body');

      // Lower carbon deck (Facing Down)
      addPt(x, -0.10, z, 0, -1, 0, 'body');

      // Top Deck Longitudinal Heat Vents
      if (Math.abs(x) > 0.08 && Math.abs(x) < 0.28 && Math.abs(z) < 0.38 && Math.abs(z) > 0.08) {
        if (Math.abs(z % 0.08) < 0.025) {
          addPt(x, 0.125, z, x > 0 ? 0.6 : -0.6, 0.8, 0, 'body');
        }
      }

      // Perimeter structural bulkheads and angled edge bevels
      const isPerimeter =
        Math.abs(x) > 0.30 || Math.abs(z) > 0.46 || (Math.abs(x) * 1.25 + Math.abs(z) * 0.95 > 0.76);
      if (isPerimeter) {
        for (let y = -0.10; y <= 0.10; y += 0.032) {
          addPt(x, y, z, x * 1.8, y * 0.5, z * 1.8, 'body');
        }
      }
    }
  }

  // 2. High-Capacity Battery Pack & Top Avionics Deck Hump
  for (let x = -0.24; x <= 0.24; x += 0.028) {
    for (let z = -0.32; z <= 0.22; z += 0.028) {
      const curve = 1.0 - (x * x) / (0.24 * 0.24) * 0.4;
      const topY = 0.10 + 0.13 * curve;
      for (let y = 0.10; y <= topY; y += 0.028) {
        addPt(x, y, z, x * 1.2, 0.8, z * 0.6, 'body');
      }
    }
  }

  // 2b. Satellite GPS Receiver Puck on Avionics Deck
  for (let theta = 0; theta < Math.PI * 2; theta += 0.26) {
    for (let r = 0.02; r <= 0.095; r += 0.022) {
      const px = r * Math.cos(theta);
      const pz = -0.10 + r * Math.sin(theta);
      addPt(px, 0.24, pz, px * 2, 1.0, (pz + 0.10) * 2, 'body');
    }
  }

  // 3. Forward EO/IR Dual Gimbal Turret (Spherical volume & Dual Lens Assembly)
  const gimbalCenter = { x: 0, y: -0.07, z: 0.68 };
  const gimbalRadius = 0.17;
  for (let phi = 0; phi <= Math.PI; phi += 0.16) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.20) {
      const rx = gimbalRadius * Math.sin(phi) * Math.cos(theta);
      const ry = gimbalRadius * Math.sin(phi) * Math.sin(theta);
      const rz = gimbalRadius * Math.cos(phi);
      addPt(
        gimbalCenter.x + rx,
        gimbalCenter.y + ry,
        gimbalCenter.z + rz,
        rx,
        ry,
        rz,
        'camera',
      );
    }
  }

  // 3b. Primary Optical Camera Lens & Bezel Ring
  for (let theta = 0; theta < Math.PI * 2; theta += 0.18) {
    const lr = 0.085;
    const lx = lr * Math.cos(theta);
    const ly = lr * Math.sin(theta);
    // Outer lens bezel ring
    addPt(
      gimbalCenter.x + lx,
      gimbalCenter.y + ly,
      gimbalCenter.z + gimbalRadius + 0.018,
      lx * 0.8,
      ly * 0.8,
      1.0,
      'camera',
    );
    // Inner optical glass element
    if (theta % 0.36 < 0.18) {
      addPt(
        gimbalCenter.x + lx * 0.5,
        gimbalCenter.y + ly * 0.5,
        gimbalCenter.z + gimbalRadius + 0.025,
        0,
        0,
        1.0,
        'camera',
      );
    }
  }

  // 3c. Secondary Thermal IR Camera Port
  const irCenter = { x: 0.065, y: -0.06, z: 0.85 };
  for (let theta = 0; theta < Math.PI * 2; theta += 0.3) {
    addPt(
      irCenter.x + 0.035 * Math.cos(theta),
      irCenter.y + 0.035 * Math.sin(theta),
      irCenter.z,
      0,
      0,
      1.0,
      'camera',
    );
  }

  // 4. Rear Dual Angled Telemetry & Video Antennas
  for (const sign of [-1, 1]) {
    const ax = sign * 0.10;
    for (let y = 0.10; y <= 0.42; y += 0.028) {
      addPt(ax, y, -0.60, sign * 0.4, 0.7, -0.6, 'antenna');
    }
    // Angled whip antenna tip
    addPt(ax + sign * 0.04, 0.46, -0.65, sign * 0.5, 0.6, -0.6, 'antenna');
    addPt(ax + sign * 0.08, 0.50, -0.70, sign * 0.6, 0.5, -0.6, 'antenna');
  }

  // 5. Four Carbon-Fiber Motor Arms with 4-Spoke Ducted Rotor Guards
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.55;
  const guardRadius = 0.62;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const perpX = -sinA;
    const perpZ = cosA;

    // Reinforced tubular arm trusses
    for (let r = 0.28; r <= armLength; r += 0.024) {
      addPt(r * cosA, 0.03, r * sinA, 0, 1, 0, 'arm');
      addPt(r * cosA, -0.05, r * sinA, 0, -1, 0, 'arm');
      addPt(r * cosA + perpX * 0.038, -0.01, r * sinA + perpZ * 0.038, perpX, 0, perpZ, 'arm');
      addPt(r * cosA - perpX * 0.038, -0.01, r * sinA - perpZ * 0.038, -perpX, 0, -perpZ, 'arm');
    }

    // Heavy-duty Brushless Motor Stator Pod
    const mx = armLength * cosA;
    const mz = armLength * sinA;
    for (let my = -0.12; my <= 0.13; my += 0.028) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.28) {
        const mr = 0.15;
        const cx = mr * Math.cos(theta);
        const cz = mr * Math.sin(theta);
        addPt(mx + cx, my, mz + cz, cx * 1.5, 0.2, cz * 1.5, 'motor');
      }
    }
    // Motor Bell Top Dome Cap & Shaft Bolt
    for (let r = 0.02; r <= 0.145; r += 0.028) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.36) {
        addPt(mx + r * Math.cos(theta), 0.14, mz + r * Math.sin(theta), 0, 1, 0, 'motor');
      }
    }

    // 360-Degree Circular Rotor Guard Duct around each motor
    for (let theta = 0; theta < Math.PI * 2; theta += 0.055) {
      const gx = guardRadius * Math.cos(theta);
      const gz = guardRadius * Math.sin(theta);

      // Upper guard rim (facing upward & outward)
      addPt(mx + gx, 0.08, mz + gz, gx * 0.8, 0.6, gz * 0.8, 'arm');
      // Lower guard rim (facing downward & outward)
      addPt(mx + gx, -0.05, mz + gz, gx * 0.8, -0.6, gz * 0.8, 'arm');
      // Outer duct aerodynamic shroud (facing pure outward for crisp rim light)
      addPt(mx + (guardRadius + 0.022) * Math.cos(theta), 0.015, mz + (guardRadius + 0.022) * Math.sin(theta), gx, 0, gz, 'arm');
    }

    // Guard radial reinforcement spokes (4 spokes per motor at 0°, 90°, 180°, 270°)
    for (let spokeAngle = 0; spokeAngle < Math.PI * 2; spokeAngle += Math.PI / 2) {
      const sc = Math.cos(spokeAngle);
      const ss = Math.sin(spokeAngle);
      for (let gr = 0.15; gr <= guardRadius; gr += 0.038) {
        addPt(mx + gr * sc, 0.01, mz + gr * ss, -ss * 0.5, 0.8, sc * 0.5, 'arm');
      }
    }
  }

  // 6. Tactical Landing Gear Skids & Structural Support Struts
  for (const signX of [-1, 1]) {
    const sx = signX * 0.44;
    // Longitudinal skid tube
    for (let sz = -0.58; sz <= 0.58; sz += 0.028) {
      const tipCurve = Math.abs(sz) > 0.46 ? (Math.abs(sz) - 0.46) * 0.75 : 0;
      addPt(sx, -0.28 + tipCurve, sz, signX * 0.8, -0.6, sz * 0.3, 'body');
    }
    // Vertical mounting legs
    for (let sy = -0.28; sy <= -0.10; sy += 0.028) {
      addPt(sx, sy, 0.30, signX * 0.9, 0, 0.3, 'body');
      addPt(sx, sy, -0.30, signX * 0.9, 0, -0.3, 'body');
    }
    // Angled cross-braces
    for (let t = 0; t <= 1.0; t += 0.2) {
      const bx = sx * (1.0 - t * 0.3);
      const by = -0.10 - t * 0.18;
      addPt(bx, by, 0.0, signX * 0.7, -0.4, 0, 'body');
    }
  }

  return points;
}

export function DroneAsciiSimulation({
  className = '',
  style,
  color = '#050505',
  backgroundColor = 'transparent',
  fontSize = 11,
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
  const isRotating = autoRotate;
  const activeColor = color;

  // SVG HUD Leader Line direct DOM refs for 60fps synchronous tracking
  const lineTlRef = useRef<SVGPathElement | null>(null);
  const lineTrRef = useRef<SVGPathElement | null>(null);
  const lineBlRef = useRef<SVGPathElement | null>(null);
  const lineBrRef = useRef<SVGPathElement | null>(null);

  const reticleTlRef = useRef<SVGGElement | null>(null);
  const reticleTrRef = useRef<SVGGElement | null>(null);
  const reticleBlRef = useRef<SVGGElement | null>(null);
  const reticleBrRef = useRef<SVGGElement | null>(null);

  // Layout cache to avoid layout thrashing during 60fps loop
  const layoutRef = useRef({
    c1: { x: 310, y: 90 },
    c2: { x: 1100, y: 90 },
    c3: { x: 310, y: 650 },
    c4: { x: 1100, y: 650 },
    preLeft: 0,
    preTop: 0,
    preWidth: 1040,
    preHeight: 620,
  });

  // 3D Angles: start at an engaging isometric top-down perspective (~36 deg pitch)
  const anglesRef = useRef({ yaw: 0.5, pitch: 0.62, roll: 0.0 });
  const propAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const baseModelRef = useRef<AssembledPoint3D[]>(createAssembledModel(generateDroneModel()));
  const assemblyStartTimeRef = useRef<number | null>(null);

  // Scroll tracking refs for companion flight mechanics
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(performance.now());
  const scrollVelRef = useRef<number>(0);
  const smoothedScrollRef = useRef<number>(0);
  const dynamicBankRef = useRef<number>(0);
  const dynamicPitchRef = useRef<number>(0);
  const wasScrolledRef = useRef<boolean>(false);

  // Mouse drag listeners for interactive 3D inspection
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

  // Recompute layout bounds when window resizes or component mounts
  const updateLayoutBounds = () => {
    if (!containerRef.current) return;
    const contW = containerRef.current.clientWidth || window.innerWidth;
    const contH = containerRef.current.clientHeight || Math.max(400, window.innerHeight - 68);

    const c1 = card1Ref.current;
    const c2 = card2Ref.current;
    const c3 = card3Ref.current;
    const c4 = card4Ref.current;
    const pre = preRef.current;

    const standoff = 24;

    const c1Pos = c1 && c1.offsetWidth > 50
      ? { x: c1.offsetLeft + c1.offsetWidth + standoff, y: c1.offsetTop + c1.offsetHeight / 2 }
      : { x: 338, y: 86 };

    const c2Pos = c2 && c2.offsetWidth > 50
      ? { x: c2.offsetLeft - standoff, y: c2.offsetTop + c2.offsetHeight / 2 }
      : { x: contW - 338, y: 86 };

    const c3Pos = c3 && c3.offsetWidth > 50
      ? { x: c3.offsetLeft + c3.offsetWidth + standoff, y: c3.offsetTop + c3.offsetHeight / 2 }
      : { x: 338, y: contH - 86 };

    const c4Pos = c4 && c4.offsetWidth > 50
      ? { x: c4.offsetLeft - standoff, y: c4.offsetTop + c4.offsetHeight / 2 }
      : { x: contW - 338, y: contH - 86 };

    const preWidth = pre && pre.offsetWidth > 200 ? pre.offsetWidth : Math.min(contW, 1080);
    const preHeight = pre && pre.offsetHeight > 150 ? pre.offsetHeight : Math.min(contH, 640);
    const preLeft = pre && pre.offsetWidth > 200 ? pre.offsetLeft : (contW - preWidth) / 2;
    const preTop = pre && pre.offsetHeight > 150 ? pre.offsetTop : (contH - preHeight) / 2;

    layoutRef.current = {
      c1: c1Pos,
      c2: c2Pos,
      c3: c3Pos,
      c4: c4Pos,
      preLeft,
      preTop,
      preWidth,
      preHeight,
    };

    if (svgRef.current) {
      svgRef.current.setAttribute('viewBox', `0 0 ${contW} ${contH}`);
    }
  };

  useEffect(() => {
    updateLayoutBounds();
    const handleResize = () => updateLayoutBounds();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateLayoutBounds());
      if (containerRef.current) resizeObserver.observe(containerRef.current);
      if (preRef.current) resizeObserver.observe(preRef.current);
    }

    const timer = setTimeout(updateLayoutBounds, 120);

    // Bind closest scroll root container
    if (containerRef.current) {
      scrollerRef.current = containerRef.current.closest<HTMLElement>('[data-scroll-root]');
    }

    const handleReassemble = () => {
      assemblyStartTimeRef.current = performance.now();
    };
    window.addEventListener('mod:reassemble-drone', handleReassemble);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mod:reassemble-drone', handleReassemble);
      if (resizeObserver) resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let animId: number;
    const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const armLength = 1.55;
    const ASSEMBLY_DURATION = 1.8;

    // Key directional studio light vector (Top-Left-Front)
    const lightDir: [number, number, number] = [0.45, 0.80, -0.40];

    const render = (now: number) => {
      const currentTime = typeof now === 'number' && now > 0 ? now : performance.now();
      if (assemblyStartTimeRef.current === null) {
        assemblyStartTimeRef.current = currentTime;
      }
      const elapsed = Math.max(0, (currentTime - assemblyStartTimeRef.current) / 1000);
      const globalProgress = Math.min(1.0, elapsed / ASSEMBLY_DURATION);

      if (layoutRef.current.preWidth < 200 && preRef.current && preRef.current.offsetWidth > 200) {
        updateLayoutBounds();
      }

      // --- SCROLL-DRIVEN FLIGHT KINEMATICS & COMPANION NAVIGATION ---
      let scrollProgress = 0;
      let scrollDelta = 0;
      if (!scrollerRef.current) {
        scrollerRef.current = document.querySelector<HTMLElement>('[data-scroll-root]');
      }
      if (scrollerRef.current) {
        const scroller = scrollerRef.current;
        const sTop = scroller.scrollTop;
        const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        scrollProgress = Math.min(1.0, Math.max(0, sTop / maxScroll));

        const nowScrollTime = currentTime;
        const dt = Math.max(0.001, (nowScrollTime - lastScrollTimeRef.current) / 1000);
        const rawVel = (sTop - lastScrollTopRef.current) / dt;
        lastScrollTopRef.current = sTop;
        lastScrollTimeRef.current = nowScrollTime;

        // Smooth scroll velocity (damped inertia)
        scrollVelRef.current += (rawVel - scrollVelRef.current) * 0.14;
        scrollDelta = scrollVelRef.current;
      }

      // Smooth lerp smoothedScrollRef towards actual scroll progress
      smoothedScrollRef.current += (scrollProgress - smoothedScrollRef.current) * 0.10;
      const sP = smoothedScrollRef.current;

      // When returning to hero top, restore layout bounds so leader lines connect with 100% precision
      if (sP <= 0.005) {
        if (wasScrolledRef.current) {
          wasScrolledRef.current = false;
          updateLayoutBounds();
        }
      } else {
        wasScrolledRef.current = true;
      }

      // Escort phase ramps up immediately when scrolling starts (0 to 1 over first 5% of scroll)
      const escortPhase = Math.min(1.0, Math.max(0, sP / 0.05));

      if (isRotating && !isDraggingRef.current) {
        const swirlBoost = (1.0 - globalProgress) * 0.018;
        anglesRef.current.yaw += rotationSpeed + swirlBoost;
      }

      // Propeller spin accelerates dynamically when escorting and flying
      const propSpeed = 0.38 + escortPhase * 0.24 + Math.min(0.4, Math.abs(scrollDelta) * 0.001);
      propAngleRef.current += propSpeed;

      // Aerodynamic bank and pitch response while scrolling
      const bankAngle = Math.max(-0.45, Math.min(0.45, -scrollDelta * 0.00028));
      const climbPitch = Math.max(-0.35, Math.min(0.35, scrollDelta * 0.00018));
      dynamicBankRef.current += (bankAngle - dynamicBankRef.current) * 0.12;
      dynamicPitchRef.current += (climbPitch - dynamicPitchRef.current) * 0.12;

      // Hero exit progress: begins immediately as soon as user scrolls even a tiny bit!
      // At sTop = 0: heroExit = 0.
      // By sP = 0.02 (approx 60-80px of scrolling), heroExit = 1.0 (completely faded out).
      const heroExit = Math.min(1.0, Math.max(0, sP / 0.02));
      const hudHeroOpacity = Math.max(0, 1.0 - heroExit);

      // Hero HUD entrance during initial assembly
      const hudAssemblyProgress = Math.min(1.0, Math.max(0, (globalProgress - 0.70) / 0.30));
      const hudAssemblyEase = cubicEaseOut(hudAssemblyProgress);

      // Combined HUD opacity: only visible in Hero; fades out smoothly on scroll
      const activeHudOpacity = hudAssemblyEase * hudHeroOpacity;
      const isHudHidden = activeHudOpacity <= 0.005;

      if (svgRef.current) {
        if (isHudHidden) {
          svgRef.current.style.visibility = 'hidden';
          svgRef.current.style.opacity = '0';
        } else {
          svgRef.current.style.visibility = 'visible';
          svgRef.current.style.opacity = activeHudOpacity.toFixed(3);
        }
        svgRef.current.style.pointerEvents = 'none';
      }

      const updateFeatureCard = (card: HTMLDivElement | null, dirX: number) => {
        if (!card) return;
        if (isHudHidden) {
          card.style.visibility = 'hidden';
          card.style.opacity = '0';
          card.style.pointerEvents = 'none';
        } else {
          card.style.visibility = 'visible';
          card.style.opacity = activeHudOpacity.toFixed(3);
          card.style.transform = `translate3d(${dirX * heroExit * 40}px, ${-heroExit * 60}px, 0)`;
          card.style.pointerEvents = 'none';
          if (heroExit > 0.001) {
            card.style.animation = 'none';
          }
        }
      };

      updateFeatureCard(card1Ref.current, -1);
      updateFeatureCard(card2Ref.current, 1);
      updateFeatureCard(card3Ref.current, -1);
      updateFeatureCard(card4Ref.current, 1);

      // Dynamic Flight Path: Translate, Scale, and Float
      // Hero (sP = 0): Center, scale 1.0, 0px X, 0px Y
      // As user scrolls: drone descends into flight motion, shrinks in size down to ~0.40,
      // and escorts the user alongside the content on the right flank all the way down to the footer!
      // Footer entry: sP 0.85 → 0.95 — drone transitions to bright orange so it stays
      // visible against the dark footer background instead of vanishing.
      const footerEnter = Math.min(1.0, Math.max(0, (sP - 0.85) / 0.10));
      const overallDroneOpacity = 1.0; // never fade out — color change handles visibility

      // Lerp color channels: normal (#050505) → vivid orange (#ff6b1a) in footer
      const cr = Math.round(5   + footerEnter * (255 - 5));   // 5   → 255
      const cg = Math.round(5   + footerEnter * (107 - 5));   // 5   → 107
      const cb = Math.round(5   + footerEnter * (26  - 5));   // 5   → 26
      const droneColor = `rgb(${cr},${cg},${cb})`;

      // Flank translation:
      // Hero: 0vw, 0vh
      // Escort mode: drifts to right flank (34vw), and in Section 4 (sP > 0.45) glides further to the right margin (38.5vw)
      // to comfortably clear the operational manual cards and avoid any overlap!
      const section4Shift = Math.min(1.0, Math.max(0, (sP - 0.45) / 0.15));
      const targetTransX = escortPhase * (34 + section4Shift * 4.5); // vw: 34vw in S2/S3 -> 38.5vw in S4
      const targetTransY = escortPhase * (29 + sP * 4); // vh: positioned at the level of the scroll cue (~29-33vh)
      const droneScale = 1.0 - escortPhase * 0.65; // 1.0 -> 0.35 scale

      // Dynamic flying bob & aerodynamic bank wobble while moving
      const flightWobble = Math.sin(currentTime * 0.0035) * (escortPhase > 0.2 ? 5 : 3);

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${flightWobble}px), 0) scale(${droneScale.toFixed(3)})`;
        preRef.current.style.opacity = overallDroneOpacity.toFixed(3);
        preRef.current.style.color = droneColor;
        // In footer: add a warm glow shadow so orange pops against dark background
        preRef.current.style.textShadow = footerEnter > 0.05
          ? `0 0 ${Math.round(6 * footerEnter)}px rgba(255,107,26,${(0.6 * footerEnter).toFixed(2)})`
          : '0 0 1px rgba(0,0,0,0.35)';
      }

      // Generate dynamic 3-blade spinning propellers cleanly contained inside ducted guards
      const dynamicProps: Point3D[] = [];
      const propRadius = 0.40;

      const propProgress = Math.min(1.0, Math.max(0, (globalProgress - 0.50) / 0.50));
      const propEase = cubicEaseOut(propProgress);

      if (propEase > 0.02) {
        armAngles.forEach((angle, idx) => {
          const mx = armLength * Math.cos(angle);
          const mz = armLength * Math.sin(angle);
          const my = 0.10;
          const dir = idx % 2 === 0 ? 1 : -1;
          const currentPropAngle = propAngleRef.current * dir;
          const currentPropRadius = propRadius * propEase;

          // Tri-blade propeller with aerodynamic twist
          for (let b = 0; b < 3; b++) {
            const bladeAngle = currentPropAngle + (b * (2 * Math.PI)) / 3;
            const cosB = Math.cos(bladeAngle);
            const sinB = Math.sin(bladeAngle);

            for (let r = 0.06; r <= currentPropRadius; r += 0.035) {
              dynamicProps.push({
                x: mx + r * cosB,
                y: my + (r / propRadius) * 0.02,
                z: mz + r * sinB,
                nx: -sinB * 0.4,
                ny: 0.9,
                nz: cosB * 0.4,
                kind: 'propeller',
              });
            }
          }
        });
      }

      // Compute 3D point positions with scatter-and-reassemble interpolation
      const basePoints = baseModelRef.current;
      const computedBasePoints: Point3D[] = new Array(basePoints.length);

      if (globalProgress >= 1.0) {
        for (let i = 0; i < basePoints.length; i++) {
          computedBasePoints[i] = basePoints[i]!;
        }
      } else {
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
      }

      const allPoints = [...computedBasePoints, ...dynamicProps];

      // Expanded Grid Dimensions: Full Widescreen Tactical Hero Display
      const cols = 156;
      const rows = 58;
      const buffer: string[] = new Array(cols * rows).fill(' ');
      const zBuffer: number[] = new Array(cols * rows).fill(-Infinity);

      const escortPitchBias = escortPhase * 0.10;
      const basePitch = anglesRef.current.pitch + dynamicPitchRef.current + escortPitchBias;
      const effectivePitch = Math.max(0.15, Math.min(1.25, basePitch));
      const effectiveYaw = anglesRef.current.yaw + dynamicBankRef.current * 0.45;
      const cosY = Math.cos(effectiveYaw);
      const sinY = Math.sin(effectiveYaw);
      const cosP = Math.cos(effectivePitch);
      const sinP = Math.sin(effectivePitch);

      // Camera projection parameters scaled for wide full-screen presence
      const distance = 3.0;
      const scaleX = 92;
      const scaleY = 44;

      // 1. Calculate projected coordinates of the 4 rotor hubs for leader lines
      const projectedRotors: Array<{ screenX: number; screenY: number }> = [];
      for (const angle of armAngles) {
        const mx = armLength * Math.cos(angle);
        const my = 0.10;
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

      // Mathematical 1-to-1 Minimum Distance Pairing: NEVER crosses and always unique!
      const { tlPt, trPt, blPt, brPt } = matchRotorsToCorners(projectedRotors, cols, rows);

      const { c1, c2, c3, c4, preLeft, preTop, preWidth, preHeight } = layoutRef.current;

      const originX = preLeft;
      const originY = preTop;

      const rTL = {
        x: originX + (tlPt.screenX / cols) * preWidth,
        y: originY + (tlPt.screenY / rows) * preHeight,
      };
      const rBL = {
        x: originX + (blPt.screenX / cols) * preWidth,
        y: originY + (blPt.screenY / rows) * preHeight,
      };
      const rTR = {
        x: originX + (trPt.screenX / cols) * preWidth,
        y: originY + (trPt.screenY / rows) * preHeight,
      };
      const rBR = {
        x: originX + (brPt.screenX / cols) * preWidth,
        y: originY + (brPt.screenY / rows) * preHeight,
      };

      // Update SVG HUD Leader Lines & Tactical Reticles (only when HUD is active and visible)
      if (!isHudHidden) {
        const reticleAngle = (currentTime * 0.002) % (Math.PI * 2);

        const updateReticleGroup = (
          pathEl: SVGPathElement | null,
          reticleEl: SVGGElement | null,
          cardPos: { x: number; y: number },
          rotorPt: { x: number; y: number },
          isRightSide: boolean,
        ) => {
          if (!pathEl || !reticleEl) return;
          const doglegOffset = isRightSide ? -44 : 44;
          const doglegX = cardPos.x + doglegOffset;
          pathEl.setAttribute(
            'd',
            `M ${cardPos.x} ${cardPos.y} L ${doglegX} ${cardPos.y} L ${rotorPt.x} ${rotorPt.y}`,
          );
          reticleEl.setAttribute(
            'transform',
            `translate(${rotorPt.x}, ${rotorPt.y}) rotate(${(reticleAngle * 180) / Math.PI})`,
          );
        };

        updateReticleGroup(lineTlRef.current, reticleTlRef.current, c1, rTL, false);
        updateReticleGroup(lineTrRef.current, reticleTrRef.current, c2, rTR, true);
        updateReticleGroup(lineBlRef.current, reticleBlRef.current, c3, rBL, false);
        updateReticleGroup(lineBrRef.current, reticleBrRef.current, c4, rBR, true);
      }

      // 2. Render ASCII 3D Point Cloud with Volumetric Directional Lighting & Blinn-Phong Specular Rim Highlights
      for (let i = 0; i < allPoints.length; i++) {
        const pt = allPoints[i]!;

        // Rotate position
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.x * sinY + pt.z * cosY;

        const y2 = pt.y * cosP - z1 * sinP;
        const z2 = pt.y * sinP + z1 * cosP;

        const zFinal = z2 + distance;
        if (zFinal <= 0.1) continue;

        // Perspective projection
        const invZ = 1 / zFinal;
        const screenX = Math.floor(cols / 2 + x1 * invZ * scaleX);
        const screenY = Math.floor(rows / 2 - y2 * invZ * scaleY);

        if (screenX >= 0 && screenX < cols && screenY >= 0 && screenY < rows) {
          const idx = screenY * cols + screenX;

          if (invZ > zBuffer[idx]!) {
            zBuffer[idx] = invZ;

            // Rotate surface normal to world camera space
            const nx = pt.nx ?? 0;
            const ny = pt.ny ?? 1;
            const nz = pt.nz ?? 0;

            const nx1 = nx * cosY - nz * sinY;
            const nz1 = nx * sinY + nz * cosY;

            const ny2 = ny * cosP - nz1 * sinP;
            const nz2 = ny * sinP + nz1 * cosP;
            const nx2 = nx1;

            // 1. Lambertian Diffuse Lighting: N · L
            const diffDot = nx2 * lightDir[0] + ny2 * lightDir[1] + nz2 * lightDir[2];
            const diffuse = Math.max(0, diffDot);

            // 2. Blinn-Phong Specular Rim Highlight (V = [0, 0, -1] viewing vector into screen)
            // Halfway vector H = normalize(L + V) where V = (0, 0, -1)
            const hx = lightDir[0];
            const hy = lightDir[1];
            const hz = lightDir[2] - 1.0;
            const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
            const normHx = hLen > 1e-6 ? hx / hLen : 0;
            const normHy = hLen > 1e-6 ? hy / hLen : 0;
            const normHz = hLen > 1e-6 ? hz / hLen : -1;

            const ndotH = nx2 * normHx + ny2 * normHy + nz2 * normHz;
            const specular = Math.pow(Math.max(0, ndotH), 16); // Sharp carbon-fiber highlight exponent

            // 3. Rim Lighting edge pop (grazing angles where normal is perpendicular to view vector)
            const rim = Math.pow(1.0 - Math.abs(nz2), 3.0);

            // Depth modulation (closer surfaces have bolder ink presence)
            const depthNorm = Math.max(0, Math.min(1, (z2 + 1.8) / 3.6));

            // Combined 3D lighting model: Diffuse + Specular + Rim + Depth
            const ambient = 0.24;
            const lightFactor = ambient + 0.52 * diffuse + 0.35 * specular + 0.22 * rim;
            const combinedIntensity = 0.58 * lightFactor + 0.42 * depthNorm;

            const minInk = 3;
            let rampIdx = minInk + Math.floor(combinedIntensity * (ASCII_RAMP.length - 1 - minInk));

            if (pt.kind === 'propeller') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 2);
            } else if (pt.kind === 'camera') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 2);
            } else if (pt.kind === 'motor') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 1);
            }

            if (globalProgress < 0.65) {
              const fragmentFactor = Math.floor((0.65 - globalProgress) * 4);
              rampIdx = Math.max(1, rampIdx - fragmentFactor);
            }

            const charIndex = Math.max(1, Math.min(ASCII_RAMP.length - 1, rampIdx));
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
  }, [isRotating, rotationSpeed]);

  return (
    <div
      ref={containerRef}
      className={`ascii-sim-wrapper ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={() => {
        assemblyStartTimeRef.current = performance.now();
      }}
      onWheel={(e) => {
        const scroller = scrollerRef.current || document.querySelector<HTMLElement>('[data-scroll-root]');
        if (scroller) {
          scroller.scrollTop += e.deltaY;
        }
      }}
      title="VAJRA // Double-click to re-assemble drone • Click & drag to rotate in 3D"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 68px)',
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
        pointerEvents: 'none',
        ...style,
      }}
    >
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
        {/* Connection Pins removed for ultra-clean minimalist look */}

        {/* Top-Left Leader Line & Rotating Targeting Reticle */}
        <path
          ref={lineTlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <g ref={reticleTlRef}>
          <circle r="11" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="3 3" />
          <circle r="6" fill="none" stroke="#d35623" strokeWidth="0.8" opacity="0.7" />
          <line x1="-15" y1="0" x2="-8" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="8" y1="0" x2="15" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="-15" x2="0" y2="-8" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="8" x2="0" y2="15" stroke="#d35623" strokeWidth="1.2" />
          <circle r="2.5" fill="#d35623" />
        </g>

        {/* Top-Right Leader Line & Rotating Targeting Reticle */}
        <path
          ref={lineTrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <g ref={reticleTrRef}>
          <circle r="11" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="3 3" />
          <circle r="6" fill="none" stroke="#d35623" strokeWidth="0.8" opacity="0.7" />
          <line x1="-15" y1="0" x2="-8" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="8" y1="0" x2="15" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="-15" x2="0" y2="-8" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="8" x2="0" y2="15" stroke="#d35623" strokeWidth="1.2" />
          <circle r="2.5" fill="#d35623" />
        </g>

        {/* Bottom-Left Leader Line & Rotating Targeting Reticle */}
        <path
          ref={lineBlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <g ref={reticleBlRef}>
          <circle r="11" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="3 3" />
          <circle r="6" fill="none" stroke="#d35623" strokeWidth="0.8" opacity="0.7" />
          <line x1="-15" y1="0" x2="-8" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="8" y1="0" x2="15" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="-15" x2="0" y2="-8" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="8" x2="0" y2="15" stroke="#d35623" strokeWidth="1.2" />
          <circle r="2.5" fill="#d35623" />
        </g>

        {/* Bottom-Right Leader Line & Rotating Targeting Reticle */}
        <path
          ref={lineBrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <g ref={reticleBrRef}>
          <circle r="11" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="3 3" />
          <circle r="6" fill="none" stroke="#d35623" strokeWidth="0.8" opacity="0.7" />
          <line x1="-15" y1="0" x2="-8" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="8" y1="0" x2="15" y2="0" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="-15" x2="0" y2="-8" stroke="#d35623" strokeWidth="1.2" />
          <line x1="0" y1="8" x2="0" y2="15" stroke="#d35623" strokeWidth="1.2" />
          <circle r="2.5" fill="#d35623" />
        </g>
      </svg>

      {/* Feature 1: Top-Left (Radar Tracking) — Anchored to outer top-left screen quadrant */}
      <div
        ref={card1Ref}
        className="hero-feature-card anim-curved-slide-left anim-delay-3"
        style={{
          position: 'absolute',
          top: '36px',
          left: '44px',
          width: '270px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '0',
          padding: '4px 0',
          boxShadow: 'none',
          zIndex: 8,
          pointerEvents: 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#d35623',
            }}
          >
            01 // RADAR TRACKING
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.015em' }}>
          Pulse-Doppler Telemetry
        </div>
        <div style={{ fontSize: '11.5px', color: '#58544e', lineHeight: 1.45, marginBottom: '8px' }}>
          20Hz scan kinematics, micro-RCS signature classification & velocity vectors.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.22)',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            letterSpacing: '0.04em',
          }}
        >
          <span>ACC: ±0.3m</span>
          <span>SCAN: 50ms</span>
        </div>
      </div>

      {/* Feature 2: Top-Right (Layered Defense) — Anchored to outer top-right screen quadrant */}
      <div
        ref={card2Ref}
        className="hero-feature-card anim-curved-slide-right anim-delay-4"
        style={{
          position: 'absolute',
          top: '36px',
          right: '44px',
          width: '270px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '0',
          padding: '4px 0',
          boxShadow: 'none',
          zIndex: 8,
          pointerEvents: 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#d35623',
            }}
          >
            02 // LAYERED DEFENSE
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.015em' }}>
          Dual Hard/Soft Kill
        </div>
        <div style={{ fontSize: '11.5px', color: '#58544e', lineHeight: 1.45, marginBottom: '8px' }}>
          1,500m RF directional jamming paired with 1,000m high-rate 30mm CIWS.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.22)',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            letterSpacing: '0.04em',
          }}
        >
          <span>JAM: 1,500m</span>
          <span>CIWS: 30mm</span>
        </div>
      </div>

      {/* Feature 3: Bottom-Left (Zero Leakage) — Anchored to outer bottom-left screen quadrant */}
      <div
        ref={card3Ref}
        className="hero-feature-card anim-curved-slide-left anim-delay-5"
        style={{
          position: 'absolute',
          bottom: '36px',
          left: '44px',
          width: '270px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '0',
          padding: '4px 0',
          boxShadow: 'none',
          zIndex: 8,
          pointerEvents: 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#d35623',
            }}
          >
            03 // ZERO LEAKAGE
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.015em' }}>
          TraineeView Isolation
        </div>
        <div style={{ fontSize: '11.5px', color: '#58544e', lineHeight: 1.45, marginBottom: '8px' }}>
          Cryptographic air-gap preventing ground truth leakage and sensor spoofing.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.22)',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            letterSpacing: '0.04em',
          }}
        >
          <span>AIR-GAP: SECURE</span>
          <span>LEAKAGE: 0.0%</span>
        </div>
      </div>

      {/* Feature 4: Bottom-Right (Deterministic Core) — Anchored to outer bottom-right screen quadrant */}
      <div
        ref={card4Ref}
        className="hero-feature-card anim-curved-slide-right anim-delay-6"
        style={{
          position: 'absolute',
          bottom: '36px',
          right: '44px',
          width: '270px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '0',
          padding: '4px 0',
          boxShadow: 'none',
          zIndex: 8,
          pointerEvents: 'none',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#d35623',
            }}
          >
            04 // DETERMINISTIC CORE
          </span>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#181716', marginBottom: '4px', letterSpacing: '-0.015em' }}>
          Bit-Exact Replay Engine
        </div>
        <div style={{ fontSize: '11.5px', color: '#58544e', lineHeight: 1.45, marginBottom: '8px' }}>
          PRNG-seeded physics simulation guaranteeing identical scenario reproduction.
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#7a746b',
            borderTop: '1px dashed rgba(45, 40, 35, 0.22)',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            letterSpacing: '0.04em',
          }}
        >
          <span>SEED: DETERMINISTIC</span>
          <span>REPLAY: 100%</span>
        </div>
      </div>

      {/* ASCII Output Display — Pixel-aligned Monospace Canvas */}
      <pre
        ref={preRef}
        style={{
          display: 'inline-block',
          width: 'fit-content',
          margin: '0 auto',
          padding: 0,
          fontFamily: 'Consolas, "Cascadia Code", "SF Mono", Menlo, ui-monospace, monospace',
          fontSize: `${fontSize}px`,
          fontWeight: 800,
          lineHeight: `${fontSize}px`,
          letterSpacing: '0.4px',
          color: activeColor,
          textShadow: '0 0 1px rgba(0, 0, 0, 0.35)',
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
