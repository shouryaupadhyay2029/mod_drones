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
  // Athletic military V-taper: slender belted waist, broad squared chest
  const k = clamp01((y + 0.35) / 1.05);
  let wx = 0.31 + 0.21 * Math.pow(k, 0.85);
  const wz = 0.17 + 0.05 * k;
  if (y > 0.76) {
    wx *= 1 - 0.45 * clamp01((y - 0.76) / 0.14);
  }
  return [wx, wz];
}

function surfaceZ(x: number, y: number): number {
  const [wx, wz] = torsoHalf(y);
  return wz * Math.sqrt(Math.max(0, 1 - (x / wx) * (x / wx)));
}

// Fixed arm joints (figure's right arm is at -x = viewer's left).
const ELBOW_R: V3 = [-0.56, 0.13, 0.10];
const ELBOW_L: V3 = [0.56, 0.11, 0.06];
const WRIST_R_CROSSED: V3 = [0.24, 0.25, 0.36];

function generateOfficerModel(): Point3D[] {
  const p: Point3D[] = [];

  // LEGS + BOOTS ("At Ease" Stance: angled outward ~11° with negative space)
  for (const sx of [-1, 1]) {
    const hip: V3 = [sx * 0.16, -0.42, 0];
    const knee: V3 = [sx * 0.21, -0.98, 0];
    const ankle: V3 = [sx * 0.26, -1.54, 0];
    emitTube(p, hip, knee, 0.155, 0.125, 'leg', 0.035, 16);
    emitTube(p, knee, ankle, 0.125, 0.105, 'leg', 0.035, 16);
    // Trouser crease along the leg vector
    const legVec = sub(ankle, hip);
    for (let t = 0; t <= 1; t += 0.03) {
      const y = hip[1] + legVec[1] * t;
      const x = hip[0] + legVec[0] * t;
      const r = 0.155 + (0.105 - 0.155) * t;
      p.push({ x, y, z: r + 0.006, nx: 0, ny: 0, nz: 1, kind: 'crease' });
    }
    // Polished dress boots with distinct toe cap
    emitEllipsoid(p, sx * 0.27, -1.62, 0.07, 0.125, 0.075, 0.22, 'boot', 0.2);
    emitEllipsoid(p, sx * 0.28, -1.63, 0.17, 0.085, 0.055, 0.09, 'boot', 0.25);
  }

  // TORSO RINGS (belted waist -> broad chest)
  for (let y = -0.44; y <= 0.78; y += 0.026) {
    const [wx, wz] = torsoHalf(y);
    const ring = 64;
    const isBelt = y >= -0.44 && y <= -0.28;
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const n = norm([c / wx, 0, sn / wz]);
      p.push({
        x: wx * c, y, z: wz * sn,
        nx: n[0], ny: n[1], nz: n[2],
        kind: isBelt ? 'belt' : 'torso',
      });
    }
  }
  // Brass belt buckle
  for (let x = -0.07; x <= 0.07; x += 0.02) {
    for (let y = -0.41; y <= -0.3; y += 0.02) {
      p.push({ x, y, z: torsoHalf(y)[1] + 0.016, nx: 0, ny: 0, nz: 1, kind: 'belt' });
    }
  }
  // Shoulder deltoid caps
  for (const sx of [-1, 1]) {
    emitEllipsoid(p, sx * 0.52, 0.78, 0, 0.12, 0.11, 0.12, 'torso', 0.22);
  }

  // NECK + STANDING MANDARIN COLLAR
  emitTube(p, [0, 0.88, 0], [0, 1.02, 0], 0.085, 0.085, 'head', 0.03, 14);
  emitTube(p, [0, 0.90, 0], [0, 0.98, 0], 0.118, 0.118, 'collar', 0.02, 28);
  // Collar gorget / rank patches
  for (const sx of [-1, 1]) {
    p.push({ x: sx * 0.07, y: 0.94, z: 0.119, nx: sx * 0.4, ny: 0, nz: 0.9, kind: 'badge' });
  }

  // HEAD + CRISP FACIAL FEATURES
  emitEllipsoid(p, 0, 1.20, 0, 0.155, 0.19, 0.17, 'head', 0.13);
  // Strong jawline and chin
  emitEllipsoid(p, 0, 1.05, 0.12, 0.08, 0.05, 0.08, 'head', 0.25); // chin
  emitTube(p, [0, 1.23, 0.175], [0, 1.15, 0.215], 0.026, 0.024, 'head', 0.018, 8); // nose
  emitTube(p, [-0.10, 1.28, 0.165], [0.10, 1.28, 0.165], 0.016, 0.016, 'head', 0.02, 8); // brow
  emitTube(p, [-0.045, 1.11, 0.165], [0.045, 1.11, 0.165], 0.012, 0.012, 'head', 0.02, 6); // mouth
  for (const sx of [-1, 1]) {
    emitEllipsoid(p, sx * 0.16, 1.20, 0, 0.025, 0.045, 0.03, 'head', 0.35); // ears
    emitTube(p, [sx * 0.055, 1.25, 0.172], [sx * 0.065, 1.25, 0.176], 0.013, 0.013, 'eye', 0.01, 6); // eyes
  }

  // AUTHENTIC PEAKED SERVICE CAP (Flared Crown + Angled Visor + Gold Crest)
  emitTube(p, [0, 1.32, 0], [0, 1.38, 0], 0.21, 0.212, 'collar', 0.02, 36); // cap band
  // Flared crown rising and expanding outward
  for (let y = 1.38; y <= 1.56; y += 0.025) {
    const t = (y - 1.38) / 0.18;
    const r = 0.212 + 0.076 * Math.sin(t * Math.PI * 0.5);
    const cz = 0.03 * t;
    const ring = 36;
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      p.push({
        x: Math.cos(a) * r,
        y,
        z: cz + Math.sin(a) * r,
        nx: Math.cos(a) * 0.8,
        ny: 0.35,
        nz: Math.sin(a) * 0.8,
        kind: 'cap',
      });
    }
  }
  // Cap top disk (dished crown cover)
  for (let r = 0; r <= 0.288; r += 0.025) {
    const ring = Math.max(1, Math.round(r * 120));
    for (let s = 0; s < ring; s++) {
      const a = (s / ring) * Math.PI * 2;
      p.push({
        x: Math.cos(a) * r,
        y: 1.565,
        z: 0.03 + Math.sin(a) * r,
        nx: 0, ny: 1, nz: 0,
        kind: 'cap',
      });
    }
  }
  // Curved visor sweeping forward and slanting downward
  for (let z = 0.17; z <= 0.41; z += 0.025) {
    const f = (z - 0.17) / 0.24;
    const half = 0.18 * (1 - 0.3 * f);
    const vy = 1.34 - 0.08 * f;
    for (let x = -half; x <= half; x += 0.025) {
      p.push({ x, y: vy, z, nx: 0, ny: 0.85, nz: 0.52, kind: 'visor' });
      p.push({ x, y: vy - 0.012, z, nx: 0, ny: -0.85, nz: 0.52, kind: 'visor' });
    }
  }
  // Golden Cap Badge
  emitEllipsoid(p, 0, 1.41, 0.224, 0.045, 0.045, 0.012, 'badge', 0.25);
  // Gold chin strap along the visor seam
  for (let a = -0.85; a <= 0.85; a += 0.08) {
    p.push({
      x: Math.sin(a) * 0.21,
      y: 1.34,
      z: Math.cos(a) * 0.21,
      nx: 0, ny: 0, nz: 1,
      kind: 'badge',
    });
  }

  // EPAULETTES + GOLD RANK STARS
  for (const sx of [-1, 1]) {
    for (let ax = 0.36; ax <= 0.58; ax += 0.03) {
      const y = 0.79;
      for (let z = -0.09; z <= 0.09; z += 0.03) {
        p.push({ x: sx * ax, y, z, nx: 0, ny: 1, nz: 0, kind: 'epaulette' });
      }
    }
    for (const bz of [-0.05, 0, 0.05]) {
      for (let ax = 0.40; ax <= 0.54; ax += 0.04) {
        p.push({ x: sx * ax, y: 0.805, z: bz, nx: 0, ny: 1, nz: 0.2, kind: 'badge' });
      }
    }
  }

  // UPPER ARMS (sloping downward to resting elbows)
  for (const sx of [-1, 1]) {
    const end = sx === -1 ? ELBOW_R : ELBOW_L;
    emitTube(p, [sx * 0.52, 0.75, 0], end, 0.095, 0.08, 'arm', 0.03, 14);
    emitEllipsoid(p, end[0], end[1], end[2], 0.085, 0.085, 0.085, 'arm', 0.3);
  }

  // STATIC LEFT FOREARM + HAND (inner folded layer across chest)
  emitTube(p, ELBOW_L, [-0.24, 0.19, 0.26], 0.08, 0.062, 'arm', 0.03, 12);
  emitEllipsoid(p, -0.33, 0.19, 0.26, 0.09, 0.065, 0.075, 'hand', 0.3);

  // BRASS BUTTONS
  for (const by of [0.70, 0.56, 0.42, 0.02, -0.14]) {
    emitEllipsoid(p, 0, by, torsoHalf(by)[1] + 0.012, 0.022, 0.022, 0.018, 'button', 0.5);
  }
  // RIBBON RACK (officer's left chest = viewer's right) + NAME TAG
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
  // SAM BROWNE CROSS-STRAP (right shoulder -> left hip)
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

  // DYNAMIC right forearm + hand
  const dyn: Point3D[] = [];
  const crossedDir = norm(sub(WRIST_R_CROSSED, ELBOW_R));
  const gestureDir: V3 = [0.36 - ELBOW_R[0], 0.40 - ELBOW_R[1], 0.65 - ELBOW_R[2]];
  const gestureDirNorm = norm(gestureDir);
  const f = blend * (0.3 + 0.22 * Math.sin(tMs * 0.0045));
  const dir = norm([
    crossedDir[0] * (1 - f) + gestureDirNorm[0] * f,
    crossedDir[1] * (1 - f) + gestureDirNorm[1] * f,
    crossedDir[2] * (1 - f) + gestureDirNorm[2] * f,
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
  // hand resting over left bicep in idle pose
  if (blend < 0.25) {
    emitEllipsoid(dyn, 0.34, 0.25, 0.36, 0.082, 0.075, 0.078, 'hand', 0.32);
  } else if (blend > 0.5) {
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
  // (crisply outlines crossed arms over the chest, hands over biceps, visor over face, and boots over floor).
  const edge: boolean[] = new Array(COLS * ROWS).fill(false);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const z0 = zBuffer[i]!;
      if (z0 === -Infinity) continue;
      const k0 = kindBuf[i]!;
      if (k0 !== 'arm' && k0 !== 'hand' && k0 !== 'visor' && k0 !== 'cap' && k0 !== 'boot') continue;
      const neighbours = [
        c > 0 ? i - 1 : -1,
        c < COLS - 1 ? i + 1 : -1,
        r > 0 ? i - COLS : -1,
        r < ROWS - 1 ? i + COLS : -1,
      ];
      for (const ni of neighbours) {
        if (ni < 0) continue;
        const z1 = zBuffer[ni]!;
        if (z1 !== -Infinity && z1 < z0 * 0.965) {
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
