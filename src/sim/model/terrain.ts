import { DEG_TO_RAD, dCos, dSin } from '../core/dmath.js';
import { Rng } from '../core/rng.js';
import { Vec3 } from '../core/vec.js';
import { TerrainKind } from './environment.js';

export interface TerrainFeature {
  kind: 'ridge';
  bearingDeg: number;
  rangeM: number;
  lengthM: number;
  widthM: number;
  heightM: number;
}

export interface TerrainMap {
  heightAt(x: number, y: number): number;
  clutterAt(x: number, y: number): number;
}

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
 * Generates procedural terrain map with height and clutter evaluators.
 * Extent: +/-8000 m.
 */
export function generateTerrain(
  kind: TerrainKind,
  terrainRng: Rng,
  features: TerrainFeature[] = []
): TerrainMap {
  const baseSeed = Math.floor(terrainRng.next() * 1000000);

  // Pre-calculate segment endpoints for ridge features
  const preparedRidges = features
    .filter((f) => f.kind === 'ridge')
    .map((f) => {
      const rad = f.bearingDeg * DEG_TO_RAD;
      const rcx = f.rangeM * dSin(rad);
      const rcy = f.rangeM * dCos(rad);
      // Perpendicular direction to bearing
      const dirX = -dCos(rad);
      const dirY = dSin(rad);
      const halfL = f.lengthM / 2;
      return {
        ax: rcx - halfL * dirX,
        ay: rcy - halfL * dirY,
        bx: rcx + halfL * dirX,
        by: rcy + halfL * dirY,
        halfWidth: f.widthM / 2,
        heightM: f.heightM,
      };
    });

  function heightAt(x: number, y: number): number {
    const cx = Math.max(-8000, Math.min(8000, x));
    const cy = Math.max(-8000, Math.min(8000, y));

    let height = 0;

    if (kind === 'rural') {
      // rural: height 0-30 m, flat open plains
      const n = sampleFractalNoise(cx, cy, baseSeed + 111);
      height = 30 * n * n;
    } else if (kind === 'hilly') {
      // hilly: 0-180 m with ridge emphasis
      // Low base topography (0-15m) so valleys remain open
      const n = sampleFractalNoise(cx, cy, baseSeed + 222);
      height = 15 * n * n;

      for (let i = 0; i < preparedRidges.length; i++) {
        const r = preparedRidges[i]!;
        const dSq = distSqToSegment(cx, cy, r.ax, r.ay, r.bx, r.by);
        if (dSq < r.halfWidth * r.halfWidth) {
          const d = Math.sqrt(dSq);
          const profile = smoothstep(1 - d / r.halfWidth);
          const rH = r.heightM * profile;
          if (rH > height) {
            height = rH;
          }
        }
      }
    } else if (kind === 'urban') {
      // urban: ground 0-8 m plus 100 m blocks, every 3rd row/column a street,
      // building probability 0.55, building height 10-45 m
      const ground = 8 * sampleFractalNoise(cx, cy, baseSeed + 333);
      const gx = Math.floor(cx / 100);
      const gy = Math.floor(cy / 100);
      const isStreet = Math.abs(gx) % 3 === 0 || Math.abs(gy) % 3 === 0;

      let bHeight = 0;
      if (!isStreet) {
        const bProb = latticeHash2D(gx, gy, baseSeed + 500);
        if (bProb < 0.55) {
          bHeight = 10 + 35 * latticeHash2D(gx, gy, baseSeed + 600);
        }
      }
      height = ground + bHeight;
    }

    // Flatten smoothly to 0 m within 300 m of the asset
    const distOrigin = Math.sqrt(cx * cx + cy * cy);
    if (distOrigin < 300) {
      const blend = smoothstep(distOrigin / 300);
      height *= blend;
    }

    return height;
  }

  function clutterAt(x: number, y: number): number {
    const cx = Math.max(-8000, Math.min(8000, x));
    const cy = Math.max(-8000, Math.min(8000, y));

    if (kind === 'rural') {
      return 0.05;
    } else if (kind === 'hilly') {
      return 0.1;
    } else if (kind === 'urban') {
      const gx = Math.floor(cx / 100);
      const gy = Math.floor(cy / 100);
      const isStreet = Math.abs(gx) % 3 === 0 || Math.abs(gy) % 3 === 0;
      if (!isStreet) {
        const bProb = latticeHash2D(gx, gy, baseSeed + 500);
        if (bProb < 0.55) {
          return 0.6;
        }
      }
      return 0.3;
    }
    return 0.05;
  }

  return { heightAt, clutterAt };
}

/**
 * Backward-compatible helper functions
 */
export function getTerrainHeight(x: number, y: number, kind: TerrainKind): number {
  const dummyRng = new Rng('fixed-seed');
  const t = generateTerrain(kind, dummyRng);
  return t.heightAt(x, y);
}

export function getClutterFactor(x: number, y: number, kind: TerrainKind): number {
  const dummyRng = new Rng('fixed-seed');
  const t = generateTerrain(kind, dummyRng);
  return t.clutterAt(x, y);
}

/**
 * Raymarch line-of-sight test from 'from' (radar mast at (0,0,15)) to 'to' (target).
 * Sample step 50m.
 * Blocked if terrain height at any sample exceeds ray height - 5 m. Blocked => pd = 0.
 */
export function hasLineOfSight(
  from: Vec3,
  to: Vec3,
  terrain: TerrainMap,
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
  const targetGroundZ = terrain.heightAt(to.x, to.y);
  if (to.z <= targetGroundZ) {
    return false;
  }

  // Raymarch along line of sight every sampleStepM
  const numSteps = Math.floor(totalDist / sampleStepM);
  for (let step = 1; step <= numSteps; step++) {
    const distSampled = step * sampleStepM;
    if (distSampled >= totalDist - 5) break;

    const t = distSampled / totalDist;
    const px = from.x + t * dx;
    const py = from.y + t * dy;
    const rayZ = from.z + t * dz;

    const terrainZ = terrain.heightAt(px, py);
    // Blocked if terrain height exceeds ray height - 5 m
    if (terrainZ > rayZ - 5) {
      return false; // Occluded by terrain
    }
  }

  return true;
}
