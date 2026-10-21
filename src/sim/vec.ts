// Fixed-point vector maths for the simulation. Directions are integer vectors of length ONE (1024), and
// every operation is exact integer arithmetic, so the same inputs give the same state on every machine.

export const ONE = 1024;

export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

export const len = (x: number, z: number) => isqrt(x * x + z * z);

// unit vector along (x, z), or (fx, fz) when (x, z) is zero
export function norm(x: number, z: number, fx = ONE, fz = 0): [number, number] {
  const l = len(x, z);
  if (l === 0) return [fx, fz];
  return [Math.trunc((x * ONE) / l), Math.trunc((z * ONE) / l)];
}

// a distance times a unit-vector component
export const scale = (d: number, unit: number) => Math.trunc((d * unit) / ONE);

// dot product of two unit vectors, in ONE units (ONE = same direction, -ONE = opposite)
export const dotU = (ax: number, az: number, bx: number, bz: number) => Math.trunc((ax * bx + az * bz) / ONE);

// turn steps in degrees, as exact fixed-point cos/sin
const ROT: Record<number, [number, number]> = { 3: [1023, 54], 5: [1020, 89], 10: [1008, 178], 15: [989, 265] };

export interface Facing {
  fx: number;
  fz: number;
}

// turn `f` toward the unit vector (tx, tz) by at most `step` degrees (0 = snap)
export function turnToward(f: Facing, tx: number, tz: number, step: 0 | 3 | 5 | 10 | 15) {
  if (step === 0) {
    f.fx = tx;
    f.fz = tz;
    return;
  }
  const [c, s] = ROT[step];
  if (dotU(f.fx, f.fz, tx, tz) >= c) {
    f.fx = tx;
    f.fz = tz;
    return;
  }
  const sgn = f.fx * tz - f.fz * tx >= 0 ? 1 : -1;
  const nx = Math.trunc((f.fx * c - f.fz * s * sgn) / ONE);
  const nz = Math.trunc((f.fx * s * sgn + f.fz * c) / ONE);
  [f.fx, f.fz] = norm(nx, nz, f.fx, f.fz);
}

// distance from point p to the segment a→b (all in su)
export function pointSegDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  // t is a ratio of exact integers, then rounded to an integer position: deterministic
  const cx = ax + Math.round(dx * t);
  const cz = az + Math.round(dz * t);
  return len(px - cx, pz - cz);
}
