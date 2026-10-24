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

  // 1. Central Fuselage / Carbon-Fiber Body (Dual-deck faceted plates)
  for (let x = -0.42; x <= 0.42; x += 0.03) {
    for (let z = -0.56; z <= 0.56; z += 0.03) {
      // Octagonal boundary chamfer
      if (Math.abs(x) * 1.25 + Math.abs(z) * 0.95 > 0.88) continue;

      // Upper carbon deck (Facing Up)
      addPt(x, 0.10, z, 0, 1, 0, 'body');

      // Lower carbon deck (Facing Down)
      addPt(x, -0.10, z, 0, -1, 0, 'body');

      // Perimeter structural bulkheads
      const isPerimeter =
        Math.abs(x) > 0.30 || Math.abs(z) > 0.46 || (Math.abs(x) * 1.25 + Math.abs(z) * 0.95 > 0.76);
      if (isPerimeter) {
        for (let y = -0.10; y <= 0.10; y += 0.035) {
          addPt(x, y, z, x * 1.5, 0, z * 1.5, 'body');
        }
      }
    }
  }

  // 2. High-Capacity Battery Pack & Top Avionics Hump
  for (let x = -0.24; x <= 0.24; x += 0.03) {
    for (let z = -0.32; z <= 0.22; z += 0.03) {
      const curve = 1.0 - (x * x) / (0.24 * 0.24) * 0.4;
      const topY = 0.10 + 0.13 * curve;
      for (let y = 0.10; y <= topY; y += 0.03) {
        addPt(x, y, z, x, 0.8, z * 0.5, 'body');
      }
    }
  }

  // 2b. Satellite GPS Receiver Puck on Avionics Deck
  for (let theta = 0; theta < Math.PI * 2; theta += 0.3) {
    for (let r = 0.02; r <= 0.09; r += 0.025) {
      addPt(r * Math.cos(theta), 0.24, -0.10 + r * Math.sin(theta), 0, 1, 0, 'body');
    }
  }

  // 3. Forward Optical Tracking Camera & Gimbal Turret (Spherical volume)
  const gimbalCenter = { x: 0, y: -0.07, z: 0.68 };
  const gimbalRadius = 0.17;
  for (let phi = 0; phi <= Math.PI; phi += 0.18) {
    for (let theta = 0; theta < Math.PI * 2; theta += 0.22) {
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
  // Camera optical lens ring
  for (let theta = 0; theta < Math.PI * 2; theta += 0.2) {
    const lr = 0.08;
    addPt(
      gimbalCenter.x + lr * Math.cos(theta),
      gimbalCenter.y + lr * Math.sin(theta),
      gimbalCenter.z + gimbalRadius + 0.02,
      0,
      0,
      1,
      'camera',
    );
  }

  // 4. Rear Dual Angled Telemetry & Video Antennas
  for (const sign of [-1, 1]) {
    const ax = sign * 0.10;
    for (let y = 0.10; y <= 0.40; y += 0.03) {
      addPt(ax, y, -0.60, sign * 0.3, 0.7, -0.6, 'antenna');
    }
    // Angled whip antenna tip
    addPt(ax + sign * 0.04, 0.44, -0.65, sign * 0.5, 0.6, -0.6, 'antenna');
    addPt(ax + sign * 0.08, 0.48, -0.70, sign * 0.6, 0.5, -0.6, 'antenna');
  }

  // 5. Four Carbon-Fiber Motor Arms with Ducted Rotor Guards
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const armLength = 1.55;
  const guardRadius = 0.62;

  for (const angle of armAngles) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const perpX = -sinA;
    const perpZ = cosA;

    // Reinforced tubular arm trusses
    for (let r = 0.28; r <= armLength; r += 0.025) {
      addPt(r * cosA, 0.03, r * sinA, 0, 1, 0, 'arm');
      addPt(r * cosA, -0.05, r * sinA, 0, -1, 0, 'arm');
      addPt(r * cosA + perpX * 0.035, -0.01, r * sinA + perpZ * 0.035, perpX, 0, perpZ, 'arm');
      addPt(r * cosA - perpX * 0.035, -0.01, r * sinA - perpZ * 0.035, -perpX, 0, -perpZ, 'arm');
    }

    // Heavy-duty Brushless Motor Stator Pod
    const mx = armLength * cosA;
    const mz = armLength * sinA;
    for (let my = -0.12; my <= 0.13; my += 0.03) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.3) {
        const mr = 0.15;
        const cx = mr * Math.cos(theta);
        const cz = mr * Math.sin(theta);
        addPt(mx + cx, my, mz + cz, cx, 0.2, cz, 'motor');
      }
    }
    // Motor Bell Top Dome Cap
    for (let r = 0.03; r <= 0.14; r += 0.03) {
      for (let theta = 0; theta < Math.PI * 2; theta += 0.4) {
        addPt(mx + r * Math.cos(theta), 0.14, mz + r * Math.sin(theta), 0, 1, 0, 'motor');
      }
    }

    // 360-Degree Circular Rotor Guard Duct around each motor (high-density continuous rim)
    for (let theta = 0; theta < Math.PI * 2; theta += 0.06) {
      const gx = guardRadius * Math.cos(theta);
      const gz = guardRadius * Math.sin(theta);

      // Upper guard rim
      addPt(mx + gx, 0.08, mz + gz, gx * 0.8, 0.6, gz * 0.8, 'arm');
      // Lower guard rim
      addPt(mx + gx, -0.05, mz + gz, gx * 0.8, -0.6, gz * 0.8, 'arm');
      // Outer duct aerodynamic shroud
      addPt(mx + (guardRadius + 0.02) * Math.cos(theta), 0.015, mz + (guardRadius + 0.02) * Math.sin(theta), gx, 0, gz, 'arm');
    }

    // Guard radial reinforcement spokes (4 spokes per motor)
    for (let spokeAngle = 0; spokeAngle < Math.PI * 2; spokeAngle += Math.PI / 2) {
      const sc = Math.cos(spokeAngle);
      const ss = Math.sin(spokeAngle);
      for (let gr = 0.15; gr <= guardRadius; gr += 0.04) {
        addPt(mx + gr * sc, 0.01, mz + gr * ss, -ss, 0.8, sc, 'arm');
      }
    }
  }

  // 6. Tactical Landing Skids
  for (const signX of [-1, 1]) {
    const sx = signX * 0.44;
    for (let sz = -0.58; sz <= 0.58; sz += 0.03) {
      const tipCurve = sz > 0.46 ? (sz - 0.46) * 0.75 : 0;
      addPt(sx, -0.28 + tipCurve, sz, signX * 0.7, -0.5, 0, 'body');
    }
    for (let sy = -0.28; sy <= -0.10; sy += 0.03) {
      addPt(sx, sy, 0.30, signX, 0, 0, 'body');
      addPt(sx, sy, -0.30, signX, 0, 0, 'body');
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
    if (!containerRef.current || !preRef.current) return;
    const cont = containerRef.current.getBoundingClientRect();
    const pre = preRef.current.getBoundingClientRect();
    const c1 = card1Ref.current?.getBoundingClientRect();
    const c2 = card2Ref.current?.getBoundingClientRect();
    const c3 = card3Ref.current?.getBoundingClientRect();
    const c4 = card4Ref.current?.getBoundingClientRect();

    const standoff = 24;

    const c1Pos = c1
      ? { x: c1.right - cont.left + standoff, y: c1.top - cont.top + c1.height / 2 }
      : { x: 310, y: 90 };
    const c2Pos = c2
      ? { x: c2.left - cont.left - standoff, y: c2.top - cont.top + c2.height / 2 }
      : { x: cont.width - 310, y: 90 };
    const c3Pos = c3
      ? { x: c3.right - cont.left + standoff, y: c3.top - cont.top + c3.height / 2 }
      : { x: 310, y: cont.height - 90 };
    const c4Pos = c4
      ? { x: c4.left - cont.left - standoff, y: c4.top - cont.top + c4.height / 2 }
      : { x: cont.width - 310, y: cont.height - 90 };

    const isPopulated = pre.width > 200 && pre.height > 150;
    const preWidth = isPopulated ? pre.width : Math.min(cont.width, 1080);
    const preHeight = isPopulated ? pre.height : Math.min(cont.height, 640);
    const preLeft = isPopulated ? pre.left - cont.left : (cont.width - preWidth) / 2;
    const preTop = isPopulated ? pre.top - cont.top : (cont.height - preHeight) / 2;

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

      if (isRotating && !isDraggingRef.current) {
        const swirlBoost = (1.0 - globalProgress) * 0.018;
        anglesRef.current.yaw += rotationSpeed + swirlBoost;
      }
      propAngleRef.current += 0.38;

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

      // Aerodynamic bank and pitch response while scrolling
      const bankAngle = Math.max(-0.45, Math.min(0.45, -scrollDelta * 0.00028));
      const climbPitch = Math.max(-0.35, Math.min(0.35, scrollDelta * 0.00018));
      dynamicBankRef.current += (bankAngle - dynamicBankRef.current) * 0.12;
      dynamicPitchRef.current += (climbPitch - dynamicPitchRef.current) * 0.12;

      // Hero exit progress: begins immediately as soon as user scrolls even a tiny bit!
      // At sTop = 0: heroExit = 0.
      // By sP = 0.04 (approx 150-200px of scrolling), heroExit = 1.0 (completely faded out).
      const heroExit = Math.min(1.0, Math.max(0, sP / 0.035));
      const hudHeroOpacity = Math.max(0, 1.0 - heroExit);
      if (svgRef.current) {
        svgRef.current.style.opacity = String(hudHeroOpacity * (globalProgress >= 0.7 ? 1 : 0));
        svgRef.current.style.pointerEvents = hudHeroOpacity < 0.05 ? 'none' : 'auto';
      }
      if (card1Ref.current) {
        card1Ref.current.style.opacity = String(hudHeroOpacity);
        card1Ref.current.style.transform = `translate3d(0, ${-heroExit * 80}px, 0)`;
        card1Ref.current.style.pointerEvents = hudHeroOpacity < 0.05 ? 'none' : 'auto';
      }
      if (card2Ref.current) {
        card2Ref.current.style.opacity = String(hudHeroOpacity);
        card2Ref.current.style.transform = `translate3d(0, ${-heroExit * 80}px, 0)`;
        card2Ref.current.style.pointerEvents = hudHeroOpacity < 0.05 ? 'none' : 'auto';
      }
      if (card3Ref.current) {
        card3Ref.current.style.opacity = String(hudHeroOpacity);
        card3Ref.current.style.transform = `translate3d(0, ${-heroExit * 80}px, 0)`;
        card3Ref.current.style.pointerEvents = hudHeroOpacity < 0.05 ? 'none' : 'auto';
      }
      if (card4Ref.current) {
        card4Ref.current.style.opacity = String(hudHeroOpacity);
        card4Ref.current.style.transform = `translate3d(0, ${-heroExit * 80}px, 0)`;
        card4Ref.current.style.pointerEvents = hudHeroOpacity < 0.05 ? 'none' : 'auto';
      }

      // Dynamic Flight Path: Translate, Scale, and Float
      // Hero (sP = 0): Center, scale 1.0, 0px X, 0px Y
      // As user scrolls: drone descends into flight motion, shrinks in size down to ~0.42,
      // and escorts the user alongside the content on the right flank!
      // In Manifesto (sP ~ 0.04..0.25): escortPhase ramps 0 -> 1.0.
      const escortPhase = Math.min(1.0, Math.max(0, sP / 0.06));
      const footerExit = Math.min(1.0, Math.max(0, (sP - 0.88) / 0.08));
      const overallDroneOpacity = Math.max(0, 1.0 - footerExit * 0.95);

      // Flank translation:
      // Hero: 0vw, 0vh
      // Escort mode: drifts to right flank (+30vw) and hovers at an accessible viewing height (-4vh)
      const targetTransX = escortPhase * 30; // vw
      const targetTransY = escortPhase * -4; // vh
      const droneScale = 1.0 - escortPhase * 0.58; // 1.0 -> 0.42 scale

      // Dynamic flying bob & aerodynamic bank wobble while moving
      const flightWobble = Math.sin(currentTime * 0.003) * (escortPhase > 0.2 ? 8 : 3);

      if (preRef.current) {
        preRef.current.style.transform = `translate3d(calc(${targetTransX}vw + 0px), calc(${targetTransY}vh + ${flightWobble}px), 0) scale(${droneScale.toFixed(3)})`;
        preRef.current.style.opacity = overallDroneOpacity.toFixed(3);
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

      const basePitch = anglesRef.current.pitch + dynamicPitchRef.current;
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

      const hudProgress = Math.min(1.0, Math.max(0, (globalProgress - 0.70) / 0.30));
      const hudOpacity = cubicEaseOut(hudProgress);
      if (svgRef.current) {
        svgRef.current.style.opacity = String(hudOpacity);
      }

      // Update SVG HUD Leader Lines (Orthogonal Dogleg Geometry spanning the screen)
      if (lineTlRef.current) {
        const doglegX = c1.x + 44;
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
        const doglegX = c2.x - 44;
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
        const doglegX = c3.x + 44;
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
        const doglegX = c4.x - 44;
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

      // 2. Render ASCII 3D Point Cloud with Volumetric Directional Lighting
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

            // Lambertian diffuse lighting dot product: N · L
            const dot = nx2 * lightDir[0] + ny2 * lightDir[1] + nz2 * lightDir[2];
            const diffuse = Math.max(0, dot);

            // Depth modulation (closer surfaces have bolder ink presence)
            const depthNorm = Math.max(0, Math.min(1, (z2 + 1.8) / 3.6));

            // Combined 3D lighting model: 62% directional light + 38% depth
            const ambient = 0.28;
            const lightFactor = ambient + (1.0 - ambient) * diffuse;
            const combinedIntensity = 0.62 * lightFactor + 0.38 * depthNorm;

            const minInk = 3;
            let rampIdx = minInk + Math.floor(combinedIntensity * (ASCII_RAMP.length - 1 - minInk));

            if (pt.kind === 'propeller') {
              rampIdx = Math.min(ASCII_RAMP.length - 1, rampIdx + 2);
            } else if (pt.kind === 'camera') {
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

        {/* Top-Left Leader Line & Reticle */}
        <path
          ref={lineTlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringTlRef} r="9" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotTlRef} r="3" fill="#d35623" />

        {/* Top-Right Leader Line & Reticle */}
        <path
          ref={lineTrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringTrRef} r="9" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotTrRef} r="3" fill="#d35623" />

        {/* Bottom-Left Leader Line & Reticle */}
        <path
          ref={lineBlRef}
          className="hero-leader-line"
          stroke="url(#lineGradLeft)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringBlRef} r="9" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotBlRef} r="3" fill="#d35623" />

        {/* Bottom-Right Leader Line & Reticle */}
        <path
          ref={lineBrRef}
          className="hero-leader-line"
          stroke="url(#lineGradRight)"
          strokeWidth="1.6"
          fill="none"
        />
        <circle ref={ringBrRef} r="9" fill="none" stroke="#d35623" strokeWidth="1" strokeDasharray="2 2" />
        <circle ref={dotBrRef} r="3" fill="#d35623" />
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
          pointerEvents: 'auto',
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
          pointerEvents: 'auto',
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
          pointerEvents: 'auto',
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
          pointerEvents: 'auto',
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
