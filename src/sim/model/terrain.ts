import { Vec3 } from '../core/vec.js';
import { TerrainKind } from './environment.js';

/**
 * Deterministic 2D integer lattice hash using 32-bit integer arithmetic & Math.imul.
 * Returns pseudorandom float in [0, 1).
 */
export function latticeHash2D(ix: number, iy: number, seed = 1337): number {
  let h = Math.imul(ix, 0x1b873593) ^ Math.imul(iy, 0x85ebca6b) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 15), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Standard cubic smoothstep: 3t^2 - 2t^3 for t in [0, 1].
 */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Evaluates a single octave of bilinearly interpolated lattice noise.
 * Returns value in [0, 1].
 */
function sampleOctave(x: number, y: number, wavelengthM: number, seed: number): number {
  const u = x / wavelengthM;
  const v = y / wavelengthM;

  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const fx = smoothstep(u - x0);
  const fy = smoothstep(v - y0);

  const v00 = latticeHash2D(x0, y0, seed);
  const v10 = latticeHash2D(x1, y0, seed);
  const v01 = latticeHash2D(x0, y1, seed);
  const v11 = latticeHash2D(x1, y1, seed);

  const top = (1 - fx) * v00 + fx * v10;
  const bot = (1 - fx) * v01 + fx * v11;

  return (1 - fy) * top + fy * bot;
}

/**
 * Multi-octave procedural terrain noise: 3 octaves (800m, 300m, 100m).
 * Returns normalized value in [0, 1].
 */
function sampleFractalNoise(x: number, y: number, seed: number): number {
  const o1 = sampleOctave(x, y, 800, seed);
  const o2 = sampleOctave(x, y, 300, seed + 101);
  const o3 = sampleOctave(x, y, 100, seed + 202);

  return 0.6 * o1 + 0.28 * o2 + 0.12 * o3;
}

/**
 * Point-to-segment squared distance for explicit terrain features.
 */
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.0001) {
    return apx * apx + apy * apy;
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/**
 * Computes deterministic terrain height MSL (m) at world coordinates (x, y).
 * Coverage: [-8000, 8000]m.
 * Flattens smoothly to 0m within 300m of (0, 0).
 */
export function getTerrainHeight(x: number, y: number, kind: TerrainKind): number {
  // Clamp to scenario coverage envelope
  const cx = Math.max(-8000, Math.min(8000, x));
  const cy = Math.max(-8000, Math.min(8000, y));

  let rawHeight = 0;

  if (kind === 'rural') {
    // Rural: base amplitude 15m, gently rolling flat plains
    const n = sampleFractalNoise(cx, cy, 1001);
    rawHeight = 15 * n;
  } else if (kind === 'hilly') {
    // Hilly: base amplitude 120m
    const n = sampleFractalNoise(cx, cy, 2002);
    rawHeight = 120 * n;

    // Explicit ridge feature: range ~2.0-2.5 km along bearing ~270-300 deg, peak >= 80m
    // Ridge line between A(-2400, 400) and B(-1900, 700) (bearing ~285 deg, range 2.1-2.4 km)
    const distSq = distSqToSegment(cx, cy, -2400, 400, -1900, 700);
    const ridgeRadius = 350;
    if (distSq < ridgeRadius * ridgeRadius) {
      const d = Math.sqrt(distSq);
      const profile = smoothstep(1 - d / ridgeRadius);
      // Guarantee peak ridge adds up to 90m
      const ridgeHeight = 90 * profile;
      rawHeight = Math.max(rawHeight, ridgeHeight);
    }
  } else if (kind === 'urban') {
    // Urban: base amplitude 25m, occasional tall structures (+30-60m blocks)
    const n = sampleFractalNoise(cx, cy, 3003);
    rawHeight = 25 * n;

    // Discrete 60m building grid
    const gx = Math.floor(cx / 60);
    const gy = Math.floor(cy / 60);
    const isBuilding = latticeHash2D(gx, gy, 7777) > 0.82;
    if (isBuilding) {
      const bHeight = 30 + 30 * latticeHash2D(gx, gy, 8888);
      rawHeight += bHeight;
    }
  }

  // Asset vicinity flattening: within 300m of (0,0), smoothly blend height to 0m
  const distFromOrigin = Math.sqrt(cx * cx + cy * cy);
  if (distFromOrigin < 300) {
    const blend = smoothstep(distFromOrigin / 300);
    rawHeight *= blend;
  }

  return rawHeight;
}

/**
 * Computes deterministic surface clutter factor c(x, y) in [0, 1].
 */
export function getClutterFactor(x: number, y: number, kind: TerrainKind): number {
  const gx = Math.floor(x / 100);
  const gy = Math.floor(y / 100);

  if (kind === 'rural') {
    // Rural: clutter 0.1 - 0.3
    const h = latticeHash2D(gx, gy, 4111);
    return 0.1 + 0.2 * h;
  }

  if (kind === 'hilly') {
    // Hilly: clutter 0.2 - 0.5
    const h = latticeHash2D(gx, gy, 4222);
    return 0.2 + 0.3 * h;
  }

  // Urban: clutter 0.6 - 0.9 (dense building returns)
  const h = latticeHash2D(gx, gy, 4333);
  return 0.6 + 0.3 * h;
}

/**
 * Raymarch line-of-sight test from 'from' (radar mast) to 'to' (target).
 * Sample step default 50m.
 * Returns false if ray dips below terrain height at any sampled point.
 */
export function hasLineOfSight(
  from: Vec3,
  to: Vec3,
  kind: TerrainKind,
  sampleStepM = 50
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;

  const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (totalDist <= 1) {
    return true;
  }

  // Target below ground check
  const targetGroundZ = getTerrainHeight(to.x, to.y, kind);
  if (to.z <= targetGroundZ) {
    return false;
  }

  // Raymarch along line of sight
  const numSteps = Math.floor(totalDist / sampleStepM);
  for (let step = 1; step <= numSteps; step++) {
    const distSampled = step * sampleStepM;
    if (distSampled >= totalDist - 5) break;

    const t = distSampled / totalDist;
    const px = from.x + t * dx;
    const py = from.y + t * dy;
    const pz = from.z + t * dz;

    const terrainZ = getTerrainHeight(px, py, kind);
    if (pz <= terrainZ) {
      return false; // Occluded by terrain
    }
  }

  return true;
}
