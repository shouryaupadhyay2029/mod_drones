/* global requestAnimationFrame, cancelAnimationFrame */
import React, { useEffect, useRef } from 'react';

/**
 * CommanderOfficerAscii
 * A uniformed 3D ASCII officer: peaked cap, epaulettes, sam-browne strap, belt, boots.
 * Exactly two poses:
 *   IDLE     - standing at ease with both arms folded across the chest.
 *   SPEAKING - the right forearm (viewer's left) uncrosses a little and gestures.
 */

export interface CommanderOfficerAsciiProps {
  className?: string;
  style?: React.CSSProperties;
  speaking?: boolean;
}

type Kind =
  | 'head' | 'eye' | 'cap' | 'visor' | 'badge' | 'collar'
  | 'torso' | 'belt' | 'epaulette' | 'button' | 'ribbon' | 'strap'
  | 'arm' | 'hand' | 'leg' | 'crease' | 'boot';

interface Point3D {
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  kind: Kind;
}

interface AssembledPoint extends Point3D {
  sx: number; sy: number; sz: number;
  start: number; end: number;
}

type V3 = [number, number, number];

const ASCII_RAMP = ' .:-=+*#%@';
const COLS = 84;
const ROWS = 68;
const DISTANCE = 4.6;
const SCALE_X = 120;
const SCALE_Y = 76;
const ASSEMBLY_SECONDS = 1.6;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const cubicEaseOut = (t: number): number => {
  const f = clamp01(t) - 1;
  return f * f * f + 1;
};
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function createMulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vlen = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function emitTube(
  out: Point3D[], p0: V3, p1: V3, r0: number, r1: number, kind: Kind, stepLen = 0.03, ring = 14,
): void {
  const d = sub(p1, p0);
  const L = vlen(d);
  const dn = norm(d);
  const helper: V3 = Math.abs(dn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(dn, helper));
  const e2 = cross(dn, e1);
  const n = Math.max(1, Math.ceil(L / stepLen));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nx = e1[0] * c + e2[0] * sn;
      const ny = e1[1] * c + e2[1] * sn;
      const nz = e1[2] * c + e2[2] * sn;
      out.push({
        x: p0[0] + d[0] * t + nx * r,
        y: p0[1] + d[1] * t + ny * r,
        z: p0[2] + d[2] * t + nz * r,
        nx, ny, nz, kind,
      });
    }
  }
}

function emitEllipsoid(
  out: Point3D[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number,
  kind: Kind, step = 0.2,
): void {
  for (let v = 0; v <= Math.PI + 1e-6; v += step) {
    const sv = Math.sin(v);
    const cv = Math.cos(v);
    const ring = Math.max(1, Math.round((sv * Math.PI * 2) / step));
    for (let s = 0; s < ring; s++) {
      const u = (s / ring) * Math.PI * 2;
      const ex = sv * Math.cos(u);
      const ey = cv;
      const ez = sv * Math.sin(u);
      const n = norm([ex / rx, ey / ry, ez / rz]);
      out.push({
        x: cx + ex * rx, y: cy + ey * ry, z: cz + ez * rz,
        nx: n[0], ny: n[1], nz: n[2], kind,
      });
    }
  }
}

function torsoHalf(y: number): [number, number] {
  const k = clamp01((y + 0.1) / 0.8);
  let wx = 0.33 + 0.13 * k;
  const wz = 0.17 + 0.05 * clamp01((y + 0.1) / 0.5);
  wx *= 1 - 0.5 * clamp01((y - 0.76) / 0.12);
  return [wx, wz];
}

function surfaceZ(x: number, y: number): number {
  const [wx, wz] = torsoHalf(y);
  return wz * Math.sqrt(Math.max(0, 1 - (x / wx) * (x / wx)));
}

// Fixed arm joints (figure's right arm is at -x = viewer's left).
const ELBOW_R: V3 = [-0.55, 0.16, 0.08];
const ELBOW_L: V3 = [0.55, 0.16, 0.08];
const WRIST_R_CROSSED: V3 = [0.22, 0.28, 0.35];

function generateOfficerModel(): Point3D[] {
  const p: Point3D[] = [];

  // LEGS + CREASES + BOOTS
  for (const sx of [-1, 1]) {
    emitTube(p, [sx * 0.15, -0.4, 0], [sx * 0.15, -1.55, 0], 0.155, 0.115, 'leg', 0.035, 16);
    for (let y = -0.55; y >= -1.5; y -= 0.03) {
      const t = (-0.4 - y) / 1.15;
      const r = 0.155 + (0.115 - 0.155) * t;
      p.push({ x: sx * 0.15, y, z: r + 0.006, nx: 0, ny: 0, nz: 1, kind: 'crease' });
    }
    emitEllipsoid(p, sx * 0.15, -1.63, 0.07, 0.125, 0.075, 0.21, 'boot', 0.2);
  }

  // TORSO RINGS (hips -> shoulders), belt band at the waist
  for (let y = -0.44; y <= 0.88; y += 0.028) {
    const [wx, wz] = torsoHalf(y);
    const ring = 64;
    const isBelt = y >= -0.4 && y <= -0.29;
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const n = norm([c / wx, y > 0.76 ? 0.5 : 0, sn / wz]);
      p.push({
        x: wx * c, y, z: wz * sn,
        nx: n[0], ny: n[1], nz: n[2],
        kind: isBelt ? 'belt' : 'torso',
      });
    }
  }
  // belt buckle
  for (let x = -0.07; x <= 0.07; x += 0.02) {
    for (let y = -0.41; y <= -0.3; y += 0.02) {
      p.push({ x, y, z: torsoHalf(y)[1] + 0.016, nx: 0, ny: 0, nz: 1, kind: 'belt' });
    }
  }
  // shoulder caps
  for (const sx of [-1, 1]) {
    emitEllipsoid(p, sx * 0.47, 0.76, 0, 0.12, 0.11, 0.12, 'torso', 0.22);
  }

  // NECK + COLLAR
  emitTube(p, [0, 0.84, 0], [0, 1.04, 0], 0.085, 0.085, 'head', 0.03, 14);
  emitTube(p, [0, 0.9, 0], [0, 0.96, 0], 0.125, 0.125, 'collar', 0.02, 28);

  // HEAD + FACE
  emitEllipsoid(p, 0, 1.25, 0.01, 0.165, 0.215, 0.185, 'head', 0.13);
  emitTube(p, [0, 1.24, 0.19], [0, 1.17, 0.225], 0.028, 0.026, 'head', 0.02, 8); // nose
  emitTube(p, [-0.11, 1.31, 0.165], [0.11, 1.31, 0.165], 0.018, 0.018, 'head', 0.02, 8); // brow
  emitTube(p, [-0.05, 1.12, 0.175], [0.05, 1.12, 0.175], 0.012, 0.012, 'head', 0.02, 6); // mouth
  emitEllipsoid(p, 0, 1.07, 0.12, 0.07, 0.05, 0.07, 'head', 0.3); // chin
  for (const sx of [-1, 1]) {
    emitEllipsoid(p, sx * 0.17, 1.25, 0, 0.025, 0.05, 0.03, 'head', 0.4); // ears
    emitTube(p, [sx * 0.06, 1.27, 0.18], [sx * 0.065, 1.27, 0.185], 0.014, 0.014, 'eye', 0.01, 6); // eyes
  }

  // PEAKED CAP
  emitTube(p, [0, 1.4, 0], [0, 1.6, 0], 0.205, 0.235, 'cap', 0.03, 36);
  for (let r = 0; r <= 0.235; r += 0.03) {
    const ring = Math.max(1, Math.round(r * 130));
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      p.push({ x: Math.cos(a) * r, y: 1.605, z: Math.sin(a) * r, nx: 0, ny: 1, nz: 0, kind: 'cap' });
    }
  }
  emitTube(p, [0, 1.385, 0], [0, 1.43, 0], 0.212, 0.212, 'collar', 0.02, 36); // cap band
  for (let z = 0.18; z <= 0.42; z += 0.03) {
    const f = (z - 0.18) / 0.24;
    const half = 0.17 * (1 - 0.35 * f);
    const y = 1.385 - 0.06 * f;
    for (let x = -half; x <= half; x += 0.03) {
      p.push({ x, y, z, nx: 0, ny: 0.85, nz: 0.5, kind: 'visor' });
      p.push({ x, y: y - 0.012, z, nx: 0, ny: -0.85, nz: 0.5, kind: 'visor' });
    }
  }
  emitEllipsoid(p, 0, 1.47, 0.222, 0.045, 0.045, 0.012, 'badge', 0.3); // cap badge

  // EPAULETTES + RANK BARS
  for (const sx of [-1, 1]) {
    for (let ax = 0.36; ax <= 0.58; ax += 0.03) {
      const y = 0.835 - (ax - 0.36) * 0.35;
      for (let z = -0.09; z <= 0.09; z += 0.03) {
        p.push({ x: sx * ax, y, z, nx: 0, ny: 1, nz: 0, kind: 'epaulette' });
      }
    }
    for (const bz of [-0.05, 0, 0.05]) {
      for (let ax = 0.38; ax <= 0.56; ax += 0.03) {
        p.push({ x: sx * ax, y: 0.835 - (ax - 0.36) * 0.35 + 0.014, z: bz, nx: 0, ny: 1, nz: 0.2, kind: 'badge' });
      }
    }
  }

  // UPPER ARMS + ELBOWS (forearms handled separately)
  for (const sx of [-1, 1]) {
    emitTube(p, [sx * 0.5, 0.74, 0], [sx * 0.55, 0.16, 0.06], 0.095, 0.08, 'arm', 0.03, 14);
    emitEllipsoid(p, sx * 0.55, 0.16, 0.07, 0.085, 0.085, 0.085, 'arm', 0.3);
  }

  // STATIC LEFT FOREARM + TUCKED HAND (figure's left = viewer's right, behind the other arm)
  emitTube(p, ELBOW_L, [-0.24, 0.2, 0.27], 0.08, 0.062, 'arm', 0.03, 12);
  emitEllipsoid(p, -0.33, 0.2, 0.27, 0.1, 0.07, 0.075, 'hand', 0.3);

  // BUTTONS
  for (const by of [0.72, 0.58, 0.44, 0.02, -0.12]) {
    emitEllipsoid(p, 0, by, torsoHalf(by)[1] + 0.012, 0.022, 0.022, 0.018, 'button', 0.5);
  }
  // RIBBON BAR (figure's left chest = viewer's right) + NAME TAG
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 0.1 + col * 0.065;
      const y = 0.64 + row * 0.035;
      p.push({ x, y, z: surfaceZ(x, y) + 0.012, nx: 0, ny: 0, nz: 1, kind: 'ribbon' });
    }
  }
  for (let x = -0.28; x <= -0.14; x += 0.02) {
    p.push({ x, y: 0.62, z: surfaceZ(x, 0.62) + 0.012, nx: 0, ny: 0, nz: 1, kind: 'ribbon' });
  }
  // SAM BROWNE STRAP (right shoulder -> left hip)
  for (let t = 0; t <= 1; t += 0.012) {
    const cx = -0.38 + 0.62 * t;
    const cy = 0.8 - 1.1 * t;
    for (const w of [-0.025, 0, 0.025]) {
      const x = cx + w * 0.87;
      const y = cy + w * 0.49;
      p.push({ x, y, z: surfaceZ(x, y) + 0.012, nx: 0, ny: 0, nz: 1, kind: 'strap' });
    }
  }

  return p;
}

function assemble(base: Point3D[]): AssembledPoint[] {
  const rng = createMulberry32(0x0ff1ce5);
  return base.map((pt) => {
    const theta = rng() * Math.PI * 2;
    const phi = (rng() - 0.5) * Math.PI * 0.9;
    const dist = 2.2 + rng() * 3.2;
    const start = 0.04 + 0.46 * clamp01((pt.y + 1.7) / 3.45);
    return {
      ...pt,
      sx: Math.cos(phi) * Math.cos(theta) * dist,
      sy: Math.sin(phi) * dist * 0.7,
      sz: Math.cos(phi) * Math.sin(theta) * dist,
      start,
      end: Math.min(1, start + 0.46),
    };
  });
}

const OFFICER: AssembledPoint[] = assemble(generateOfficerModel());

const LIGHT: V3 = norm([0.45, 0.78, -0.42]);

const FIXED_IDX: Partial<Record<Kind, number>> = {
  eye: 9, badge: 9, button: 9, belt: 8, crease: 8, strap: 8, ribbon: 8, epaulette: 8, collar: 8,
};

/** Pure frame renderer: returns the ASCII frame for a given time / entrance progress / gesture blend. */
export function renderOfficerFrame(tMs: number, progress: number, blend: number): string {
  const yaw = Math.sin(tMs * 0.0006) * 0.1;
  const pitch = 0.1;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const breath = Math.sin(tMs * 0.0015) * 0.008;

  const buffer: string[] = new Array(COLS * ROWS).fill(' ');
  const zBuffer: number[] = new Array(COLS * ROWS).fill(-Infinity);
  const kindBuf: Kind[] = new Array(COLS * ROWS).fill('torso');

  const plot = (x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: Kind): void => {
    const yb = y > -0.3 ? y + breath * (y + 0.3) : y;
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y2 = yb * cosP - z1 * sinP;
    const z2 = -yb * sinP - z1 * cosP;
    const zFinal = z2 + DISTANCE;
    if (zFinal <= 0.1) return;
    const invZ = 1 / zFinal;
    const px = Math.floor(COLS / 2 + x1 * invZ * SCALE_X);
    const py = Math.floor(ROWS / 2 - y2 * invZ * SCALE_Y);
    if (px < 0 || px >= COLS || py < 0 || py >= ROWS) return;
    const idx = py * COLS + px;
    if (invZ <= zBuffer[idx]!) return;
    zBuffer[idx] = invZ;
    kindBuf[idx] = kind;

    const nl = Math.hypot(nx, ny, nz) || 1;
    const ax = nx / nl;
    const ay = ny / nl;
    const az = nz / nl;
    const nx1 = ax * cosY - az * sinY;
    const nz1 = ax * sinY + az * cosY;
    const ny2 = ay * cosP - nz1 * sinP;
    const nz2 = -ay * sinP - nz1 * cosP;
    const diffuse = Math.max(0, nx1 * LIGHT[0] + ny2 * LIGHT[1] + nz2 * LIGHT[2]);
    const rim = Math.pow(1 - Math.min(1, Math.abs(nz2)), 2.2);
    // Dark ink on a light page: shadowed / edge pixels get the densest glyphs.
    const shade = clamp01(0.12 + 0.55 * (1 - diffuse) + 0.5 * rim);
    let ri = 3 + Math.floor(shade * 6.99);
    const fixed = FIXED_IDX[kind];
    if (fixed !== undefined) ri = Math.max(ri, fixed);
    buffer[idx] = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, ri)] || '@';
  };

  for (let i = 0; i < OFFICER.length; i++) {
    const pt = OFFICER[i]!;
    let inv = 0;
    if (progress < 1) {
      const localT = clamp01((progress - pt.start) / Math.max(0.001, pt.end - pt.start));
      inv = 1 - cubicEaseOut(localT);
    }
    plot(pt.x + pt.sx * inv, pt.y + pt.sy * inv, pt.z + pt.sz * inv, pt.nx, pt.ny, pt.nz, pt.kind);
  }

  // DYNAMIC right forearm + hand (the only moving part)
  const dyn: Point3D[] = [];
  const crossedDir = norm(sub(WRIST_R_CROSSED, ELBOW_R));
  const gestureDir: V3 = norm([0.22, 0.6, 0.78]);
  const f = blend * (0.3 + 0.22 * Math.sin(tMs * 0.0045));
  const dir = norm([
    crossedDir[0] * (1 - f) + gestureDir[0] * f,
    crossedDir[1] * (1 - f) + gestureDir[1] * f,
    crossedDir[2] * (1 - f) + gestureDir[2] * f,
  ]);
  const forearmLen = vlen(sub(WRIST_R_CROSSED, ELBOW_R));
  const wrist: V3 = [
    ELBOW_R[0] + dir[0] * forearmLen,
    ELBOW_R[1] + dir[1] * forearmLen,
    ELBOW_R[2] + dir[2] * forearmLen,
  ];
  emitTube(dyn, ELBOW_R, wrist, 0.08, 0.062, 'arm', 0.03, 12);
  const handC: V3 = [wrist[0] + dir[0] * 0.1, wrist[1] + dir[1] * 0.1, wrist[2] + dir[2] * 0.1];
  emitEllipsoid(dyn, handC[0], handC[1], handC[2], 0.078, 0.078, 0.078, 'hand', 0.35);
  if (blend > 0.5) {
    const side = norm(cross(dir, [0, 0, 1]));
    for (let k = -1.5; k <= 1.5; k += 1) {
      const base: V3 = [
        handC[0] + dir[0] * 0.07 + side[0] * k * 0.03,
        handC[1] + dir[1] * 0.07 + side[1] * k * 0.03,
        handC[2] + dir[2] * 0.07 + side[2] * k * 0.03,
      ];
      const tip: V3 = [
        base[0] + (dir[0] + side[0] * k * 0.2) * 0.12,
        base[1] + (dir[1] + side[1] * k * 0.2) * 0.12,
        base[2] + (dir[2] + side[2] * k * 0.2) * 0.12,
      ];
      emitTube(dyn, base, tip, 0.014, 0.011, 'hand', 0.03, 5);
    }
  }
  const dynEase = cubicEaseOut(clamp01((progress - 0.3) / 0.5));
  const dynInv = progress < 1 ? 1 - dynEase : 0;
  for (let i = 0; i < dyn.length; i++) {
    const pt = dyn[i]!;
    const o = dynInv * 5;
    plot(
      pt.x + (hash(i) - 0.5) * o, pt.y + (hash(i + 977) - 0.5) * o, pt.z + (hash(i + 1913) - 0.5) * o,
      pt.nx, pt.ny, pt.nz, pt.kind,
    );
  }

  // Depth-edge pass: outline the nearer surface wherever it sits clearly in front of a farther one
  // (separates folded arms from the chest, chin from neck, visor from face).
  const edge: boolean[] = new Array(COLS * ROWS).fill(false);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const z0 = zBuffer[i]!;
      if (z0 === -Infinity) continue;
      const k0 = kindBuf[i]!;
      if (k0 !== 'arm' && k0 !== 'hand' && k0 !== 'visor' && k0 !== 'cap') continue;
      const neighbours = [
        c > 0 ? i - 1 : -1,
        c < COLS - 1 ? i + 1 : -1,
        r > 0 ? i - COLS : -1,
        r < ROWS - 1 ? i + COLS : -1,
      ];
      for (const ni of neighbours) {
        if (ni < 0) continue;
        const z1 = zBuffer[ni]!;
        if (z1 !== -Infinity && z1 < z0 * 0.97) {
          edge[i] = true;
          break;
        }
      }
    }
  }
  for (let i = 0; i < edge.length; i++) {
    if (edge[i]) buffer[i] = '@';
  }

  let out = '';
  for (let r = 0; r < ROWS; r++) {
    out += buffer.slice(r * COLS, (r + 1) * COLS).join('') + '\n';
  }
  return out;
}

export function CommanderOfficerAscii({ className, style, speaking = false }: CommanderOfficerAsciiProps): React.JSX.Element {
  const preRef = useRef<HTMLPreElement | null>(null);
  const speakingRef = useRef(speaking);
  const blendRef = useRef(0);
  speakingRef.current = speaking;

  useEffect(() => {
    let raf = 0;
    let startTime: number | null = null;
    const loop = (now: number): void => {
      if (startTime === null) startTime = now;
      const progress = Math.min(1, (now - startTime) / 1000 / ASSEMBLY_SECONDS);
      blendRef.current += ((speakingRef.current ? 1 : 0) - blendRef.current) * 0.08;
      if (preRef.current) preRef.current.textContent = renderOfficerFrame(now, progress, blendRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: 'relative', width: '100%', minHeight: '520px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'visible', pointerEvents: 'none',
      }}
    >
      <pre
        ref={preRef}
        className={className}
        aria-hidden="true"
        style={{
          display: 'inline-block', width: 'fit-content', margin: '0 auto', padding: 0,
          fontFamily: 'Consolas, "Cascadia Code", "SF Mono", Menlo, ui-monospace, monospace',
          fontSize: '9px', fontWeight: 800, lineHeight: '9px', letterSpacing: '0.3px',
          color: '#181716', textShadow: '0 0 10px rgba(168,51,34,0.18)',
          whiteSpace: 'pre', pointerEvents: 'none', userSelect: 'none',
          ...style,
        }}
      />
    </div>
  );
}
