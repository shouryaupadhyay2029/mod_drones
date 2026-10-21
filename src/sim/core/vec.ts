import { dAtan2, PI } from './dmath.js';

export interface Vec3 {
  x: number; // East (m)
  y: number; // North (m)
  z: number; // Up (m)
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vDist(a: Vec3, b: Vec3): number {
  return vLen(vSub(a, b));
}

export function vLen2D(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vDist2D(a: Vec3, b: Vec3): number {
  return vLen2D(vSub(a, b));
}

export function vNormalize(v: Vec3): Vec3 {
  const l = vLen(v);
  if (l === 0) return { x: 0, y: 0, z: 0 };
  return vScale(v, 1 / l);
}

export function bearingDeg(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let deg = (dAtan2(dx, dy) * 180) / PI;
  if (deg < 0) {
    deg += 360;
  }
  if (deg >= 360) {
    deg -= 360;
  }
  return deg;
}
