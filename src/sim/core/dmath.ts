export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const DEG_TO_RAD = PI / 180;
export const RAD_TO_DEG = 180 / PI;

export function dSin(x: number): number {
  // Normalize into [-PI, PI] using floor (avoiding modulo with floating precision)
  const k = Math.floor(x / TWO_PI + 0.5);
  let r = x - k * TWO_PI;

  // Symmetrize into [-HALF_PI, HALF_PI]
  if (r > HALF_PI) {
    r = PI - r;
  } else if (r < -HALF_PI) {
    r = -PI - r;
  }

  // 9th-degree Taylor approximation for sin(r)
  const r2 = r * r;
  const r3 = r * r2;
  const r5 = r3 * r2;
  const r7 = r5 * r2;
  const r9 = r7 * r2;

  return r - r3 / 6 + r5 / 120 - r7 / 5040 + r9 / 362880;
}

export function dCos(x: number): number {
  return dSin(x + HALF_PI);
}

function dAtan01(t: number): number {
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;
  const t8 = t6 * t2;

  // Minimax approximation on [0, 1] with max error < 3e-5 rad
  return t * (0.999866 - 0.3302995 * t2 + 0.180141 * t4 - 0.085133 * t6 + 0.0208351 * t8);
}

export function dAtan2(y: number, x: number): number {
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }

  const absX = Math.abs(x);
  const absY = Math.abs(y);

  let angle: number;
  if (absY <= absX) {
    const t = absY / absX;
    angle = dAtan01(t);
  } else {
    const t = absX / absY;
    angle = HALF_PI - dAtan01(t);
  }

  if (x > 0) {
    return y >= 0 ? angle : -angle;
  } else {
    return y >= 0 ? PI - angle : -PI + angle;
  }
}
