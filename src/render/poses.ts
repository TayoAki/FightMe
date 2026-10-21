// The pose library, in root space (see rig.ts): fists (lh, rh) and feet (lf, rf) as positions in metres,
// torso and head as [pitch, yaw, roll] degrees, elbow and knee hints (le, re, lk, rk) as directions.
// Orthodox stance: the left side leads. Every pose is merged over a base so all fields exist.

import type { PoseSpec, V3 } from './rig';

type Partial3 = Partial<Record<keyof PoseSpec, V3>>;

export const STANCE: PoseSpec = {
  root: [0, -0.07, 0],
  hips: [0, -25, 0],
  spine: [4, -5, 0],
  chest: [6, -8, 0],
  head: [-4, 34, 0],
  lh: [0.06, 1.42, 0.36],
  rh: [-0.07, 1.36, 0.18],
  lf: [0.1, 0, 0.24],
  rf: [-0.12, 0, -0.26],
  le: [0.4, -1, -0.2],
  re: [-0.4, -1, -0.2],
  lk: [0.15, 0, 1],
  rk: [-0.2, 0, 1],
};

const over = (base: PoseSpec, p: Partial3): PoseSpec => ({ ...structuredClone(base), ...structuredClone(p) });

export const CROUCH = over(STANCE, {
  root: [0, -0.4, 0.03],
  hips: [22, -25, 0],
  spine: [8, -5, 0],
  chest: [6, -6, 0],
  head: [-26, 34, 0],
  lh: [0.08, 1.03, 0.42],
  rh: [-0.06, 0.99, 0.26],
  lf: [0.14, 0, 0.27],
  rf: [-0.15, 0, -0.18],
  lk: [0.25, 0.3, 1],
  rk: [-0.35, 0.2, 1],
});

const TUCK = over(STANCE, {
  root: [0, 0.05, 0],
  hips: [10, -20, 0],
  lf: [0.1, 0.5, 0.2],
  rf: [-0.1, 0.45, -0.05],
  lh: [0.1, 1.35, 0.32],
  rh: [-0.08, 1.3, 0.2],
  lk: [0, 0.3, 1],
  rk: [0, 0.3, 1],
});

const DOWN = over(STANCE, {
  root: [0, -0.82, -0.25],
  hips: [-88, -10, 0],
  spine: [-2, 0, 0],
  chest: [-2, 0, 0],
  head: [12, 20, 0],
  lf: [0.14, 0.02, 0.62],
  rf: [-0.14, 0.02, 0.56],
  lk: [0, 1, 0.2],
  rk: [0, 1, 0.2],
  lh: [0.45, 0.08, -0.55],
  rh: [-0.45, 0.08, -0.5],
  le: [1, 0, 0],
  re: [-1, 0, 0],
});

export const POSES: Record<string, PoseSpec> = {
  stance: STANCE,
  stance2: over(STANCE, { root: [0, -0.088, 0], lh: [0.06, 1.4, 0.36], rh: [-0.07, 1.34, 0.18], chest: [8, -8, 0] }),
  crouch: CROUCH,
  walk1: over(STANCE, { root: [0, -0.06, 0], lf: [0.1, 0, 0.32], rf: [-0.12, 0, -0.2] }),
  walk2: over(STANCE, { root: [0, -0.04, 0], lf: [0.1, 0, 0.22], rf: [-0.12, 0.09, -0.08] }),
  walk3: over(STANCE, { root: [0, -0.07, 0], lf: [0.1, 0.06, 0.3], rf: [-0.12, 0, -0.16] }),
  walk4: over(STANCE, { root: [0, -0.05, 0], lf: [0.1, 0, 0.26], rf: [-0.12, 0, -0.3] }),
  jumpUp: TUCK,
  jumpFall: over(TUCK, { lf: [0.1, 0.22, 0.2], rf: [-0.1, 0.12, -0.12], lh: [0.12, 1.45, 0.3] }),
  land: over(CROUCH, { root: [0, -0.26, 0] }),
  dash: over(STANCE, { root: [0, -0.1, 0.06], hips: [10, -25, 0], chest: [10, -10, 0], lf: [0.1, 0.08, 0.4], rf: [-0.12, 0, -0.3] }),
  backdash: over(STANCE, { root: [0, -0.03, -0.05], hips: [-12, -25, 0], chest: [-10, -10, 0], lf: [0.1, 0.18, 0.2], rf: [-0.12, 0.05, -0.2] }),

  // reactions
  hitHigh: over(STANCE, { root: [0, -0.06, -0.08], hips: [-8, -20, 0], spine: [-8, 0, 0], chest: [-14, -5, 6], head: [-28, 30, 8], lh: [0.28, 1.25, 0.12], rh: [-0.3, 1.2, -0.05] }),
  hitLow: over(STANCE, { root: [0, -0.1, -0.04], hips: [8, -25, 0], chest: [24, -5, 0], head: [5, 30, 0], lh: [0.12, 1.05, 0.25], rh: [-0.12, 1.02, 0.2] }),
  hitCrouch: over(CROUCH, { chest: [-10, -5, 6], head: [-30, 30, 0], lh: [0.3, 0.95, 0.2], rh: [-0.25, 0.9, 0.1] }),
  blockStand: over(STANCE, { root: [0, -0.1, -0.02], chest: [12, -15, 0], head: [5, 30, 0], lh: [0.0, 1.48, 0.3], rh: [-0.04, 1.42, 0.27], le: [0.6, -0.6, 0.3], re: [-0.6, -0.6, 0.3] }),
  blockCrouch: over(CROUCH, { lh: [0.02, 1.1, 0.36], rh: [-0.04, 1.05, 0.33], chest: [15, -15, 0], le: [0.6, -0.6, 0.3], re: [-0.6, -0.6, 0.3] }),
  juggle: over(STANCE, { root: [0, -0.35, 0], hips: [-60, -20, 0], spine: [-10, 0, 0], chest: [-10, 0, 0], head: [-10, 30, 0], lf: [0.12, 0.65, 0.55], rf: [-0.12, 0.55, 0.65], lh: [0.35, 1.0, -0.4], rh: [-0.35, 0.9, -0.35], lk: [0, 1, 0.3], rk: [0, 1, 0.3] }),
  down: DOWN,
  getup: over(CROUCH, { root: [0, -0.5, -0.05], hips: [30, -25, 0], lh: [0.25, 0.1, 0.2], rh: [-0.2, 0.5, 0.2] }),
  wallsplat: over(STANCE, { root: [0, 0, -0.1], hips: [-12, 0, 0], chest: [-12, 0, 0], head: [-22, 0, 0], lh: [0.55, 1.45, -0.2], rh: [-0.55, 1.45, -0.2], le: [0, -1, 0], re: [0, -1, 0], lf: [0.15, 0.05, 0.08], rf: [-0.15, 0.05, 0.05] }),
  crumple: over(STANCE, { root: [0, -0.52, 0.05], hips: [35, -15, 0], chest: [35, 0, 0], head: [30, 0, 0], lf: [0.13, 0.02, -0.32], rf: [-0.13, 0.02, -0.3], lk: [0, -0.3, 1], rk: [0, -0.3, 1], lh: [0.25, 0.35, 0.3], rh: [-0.25, 0.35, 0.28] }),
  dizzy1: over(STANCE, { root: [0, -0.1, 0], hips: [5, -15, 4], chest: [15, -10, 8], head: [20, 20, 15], lh: [0.25, 0.9, 0.2], rh: [-0.22, 0.88, 0.1] }),
  dizzy2: over(STANCE, { root: [0, -0.1, 0], hips: [5, -15, -4], chest: [15, -10, -8], head: [20, 40, -15], lh: [0.22, 0.88, 0.1], rh: [-0.25, 0.9, 0.2] }),
  stagger: over(STANCE, { root: [0, -0.12, -0.06], hips: [-5, -20, 6], chest: [-10, -5, 10], head: [-15, 30, 10], lh: [0.35, 1.2, 0.0], rh: [-0.3, 1.1, -0.1] }),
  thrown: over(STANCE, { root: [0, 0.08, 0], hips: [-15, 0, 0], chest: [-15, 0, 0], head: [-25, 0, 0], lh: [0.3, 1.5, 0.3], rh: [-0.3, 1.5, 0.3], lf: [0.1, 0.12, 0.1], rf: [-0.1, 0.1, -0.05] }),
  win: over(STANCE, { root: [0, 0, 0], hips: [0, -10, 0], chest: [-8, 0, 0], head: [-10, 20, 0], rh: [-0.08, 2.15, 0.12], re: [-0.5, 0, 0], lh: [0.22, 0.95, 0.0], le: [1, 0, -0.5], lf: [0.12, 0, 0.1], rf: [-0.12, 0, -0.1] }),
  parry: over(STANCE, { root: [0, -0.1, 0], chest: [0, 5, 0], lh: [0.12, 1.3, 0.48], rh: [-0.08, 1.25, 0.44], le: [0.7, -0.7, 0], re: [-0.7, -0.7, 0] }),

  // standing attacks
  jab: over(STANCE, { hips: [0, -30, 0], chest: [4, -45, 0], head: [-4, 40, 0], lh: [0.05, 1.4, 0.72] }),
  straight: over(STANCE, { hips: [0, 5, 0], chest: [6, 25, 0], head: [-4, 5, 0], rh: [0.0, 1.38, 0.74], lh: [0.12, 1.38, 0.25], rf: [-0.12, 0, -0.2] }),
  heavyWind: over(STANCE, { root: [0, -0.1, -0.03], hips: [0, -40, 0], chest: [0, -40, 0], head: [0, 50, 0], rh: [-0.28, 1.3, -0.2] }),
  heavyPunch: over(STANCE, { root: [0, -0.1, 0.06], hips: [0, 15, 0], chest: [10, 40, -5], head: [0, -5, 0], rh: [0.12, 1.32, 0.7], re: [-0.6, 0.3, 0], lh: [0.14, 1.35, 0.15], lf: [0.1, 0, 0.32] }),
  kickWind: over(STANCE, { root: [0, -0.03, 0], hips: [-5, -10, 0], chest: [-5, -20, 0], rf: [-0.12, 0.25, -0.05], rk: [0, 0.2, 1] }),
  kickLow: over(STANCE, { hips: [-8, -35, 0], chest: [-6, -15, 0], lf: [0.1, 0.25, 0.76], lk: [0.2, 0.5, 1], rf: [-0.12, 0, -0.18] }),
  kickMid: over(STANCE, { root: [0, 0, -0.05], hips: [-12, -5, 0], chest: [-10, -10, 0], rf: [0, 0.75, 0.86], rk: [0, 0.6, 1], lf: [0.1, 0, 0.05] }),
  kickHigh: over(STANCE, { hips: [-15, 40, 15], chest: [-20, 20, 18], head: [5, -20, -10], rf: [0.05, 1.45, 0.72], rk: [-0.5, 0.3, 0.8], lf: [0.1, 0, 0.0], lh: [0.25, 1.35, 0.1], rh: [-0.35, 1.0, -0.2] }),
  overheadWind: over(STANCE, { root: [0, -0.03, 0], chest: [-15, 15, 0], rh: [-0.1, 2.0, -0.1], re: [-0.5, 0.2, -0.5] }),
  overhead: over(STANCE, { root: [0, -0.12, 0.08], hips: [10, 10, 0], chest: [25, 25, 0], rh: [0, 1.25, 0.62], lf: [0.1, 0, 0.36] }),
  bodyJab: over(STANCE, { root: [0, -0.16, 0.06], hips: [10, -30, 0], chest: [14, -40, 0], lh: [0.05, 1.08, 0.7], rh: [-0.07, 1.25, 0.2] }),
  throwGrab: over(STANCE, { root: [0, -0.06, 0.08], chest: [10, 0, 0], lh: [0.14, 1.3, 0.54], rh: [-0.12, 1.28, 0.52] }),
  throwHold: over(STANCE, { root: [0, -0.1, 0], chest: [-5, 10, 0], lh: [0.15, 1.5, 0.45], rh: [-0.12, 1.48, 0.42] }),
  throwToss: over(STANCE, { chest: [10, 60, 0], hips: [0, 40, 0], lh: [0.4, 1.4, 0.2], rh: [-0.3, 1.5, 0.4] }),

  // crouching attacks
  crJab: over(CROUCH, { chest: [4, -35, 0], lh: [0.05, 0.98, 0.74] }),
  crPunch: over(CROUCH, { chest: [8, 20, 0], rh: [-0.02, 0.95, 0.74] }),
  crUpper: over(STANCE, { root: [0, -0.16, 0.05], hips: [-5, 10, 0], chest: [-12, 25, 0], head: [-10, 0, 0], rh: [0.02, 1.95, 0.32], re: [-0.6, -0.3, 0.2], lh: [0.15, 1.15, 0.2], lf: [0.12, 0, 0.3], rf: [-0.12, 0, -0.2] }),
  crKickLow: over(CROUCH, { hips: [22, -45, 0], lf: [0.14, 0.04, 0.68], lk: [0.2, 0.6, 1] }),
  crKickMid: over(CROUCH, { root: [0, -0.45, 0], hips: [25, -50, 0], chest: [10, -10, 0], lf: [0.12, 0.03, 0.84], lk: [0.2, 0.7, 1], rh: [-0.15, 0.6, 0.25] }),
  sweep: over(CROUCH, { root: [0, -0.62, 0], hips: [30, 40, 0], chest: [20, 30, 0], rf: [0.05, 0.03, 0.86], rk: [0, 1, 0.5], lf: [0.2, 0, 0.15], lk: [0.5, 0.6, 0.6], lh: [0.3, 0.1, 0.3], rh: [-0.2, 0.15, 0.1] }),

  // air attacks
  airPunch: over(TUCK, { hips: [10, -20, 0], chest: [15, -30, 0], lh: [0.05, 1.05, 0.64] }),
  airHammer: over(TUCK, { hips: [15, 0, 0], chest: [25, 10, 0], lh: [0.05, 0.75, 0.56], rh: [-0.05, 0.72, 0.56] }),
  airKnee: over(TUCK, { lf: [0.1, 0.72, 0.3], lk: [0, 0.2, 1], rf: [-0.1, 0.3, -0.1] }),
  airKick: over(TUCK, { hips: [-10, 10, 0], rf: [0, 0.25, 0.82], rk: [0, 0.5, 1], lf: [0.1, 0.5, 0] }),
  airKickHeavy: over(TUCK, { hips: [-20, 20, 0], chest: [-15, 10, 0], rf: [0, -0.05, 0.74], lf: [0.12, 0.45, -0.05] }),

  // specials and supers
  fireballWind: over(STANCE, { root: [0, -0.12, 0], hips: [0, -50, 0], chest: [0, -40, 0], head: [0, 60, 0], lh: [0.05, 1.0, -0.15], rh: [-0.08, 0.98, -0.2], lf: [0.12, 0, 0.32], rf: [-0.14, 0, -0.3] }),
  fireball: over(STANCE, { root: [0, -0.14, 0.05], hips: [6, 0, 0], chest: [8, 10, 0], head: [0, 0, 0], lh: [0.06, 1.18, 0.68], rh: [-0.04, 1.12, 0.66], le: [0.6, -0.8, 0], re: [-0.6, -0.8, 0], lf: [0.13, 0, 0.36], rf: [-0.14, 0, -0.32] }),
  dpRise: over(STANCE, { root: [0, 0.05, 0.05], hips: [-8, 15, 0], chest: [-12, 30, 0], head: [-15, 0, 0], rh: [0.02, 2.1, 0.28], re: [-0.5, 0, 0.5], lh: [0.2, 1.05, 0.05], lf: [0.1, 0.55, 0.28], lk: [0, 0.3, 1], rf: [-0.1, 0, -0.12] }),
  cyclone: over(STANCE, { root: [0, 0.05, 0], hips: [-5, 0, 0], chest: [-5, 0, 0], rf: [-0.05, 0.85, 0.84], rk: [0, 1, 0], lf: [0.12, 0.38, -0.08], lk: [0, 0, 1], lh: [0.55, 1.3, -0.05], rh: [-0.5, 1.28, -0.05], le: [0, -1, 0], re: [0, -1, 0] }),
  driveImpactWind: over(STANCE, { root: [0, -0.1, -0.08], hips: [0, -45, 0], chest: [-5, -45, 0], head: [0, 55, 0], rh: [-0.3, 1.32, -0.35], lh: [0.2, 1.38, 0.3], lf: [0.12, 0, 0.3], rf: [-0.14, 0, -0.32] }),
  driveImpact: over(STANCE, { root: [0, -0.16, 0.18], hips: [10, 25, 0], chest: [14, 45, 0], head: [0, -10, 0], rh: [0.02, 1.3, 0.86], re: [-0.4, -0.5, 0], lh: [0.25, 1.3, -0.05], lf: [0.12, 0, 0.55], rf: [-0.14, 0, -0.32] }),
  driveRush: over(STANCE, { root: [0, -0.18, 0.1], hips: [18, -25, 0], chest: [18, -10, 0], lh: [0.1, 1.2, 0.45], rh: [-0.1, 1.15, 0.3], lf: [0.12, 0.05, 0.42], rf: [-0.14, 0.12, -0.4] }),
  superWind: over(STANCE, { root: [0, -0.2, -0.05], hips: [0, -30, 0], chest: [10, -30, 0], lh: [0.25, 1.1, 0.1], rh: [-0.25, 1.1, 0.05], lf: [0.16, 0, 0.3], rf: [-0.16, 0, -0.3] }),
  superRush: over(STANCE, { root: [0, -0.1, 0.12], hips: [10, 15, 0], chest: [15, 30, 0], rh: [0, 1.35, 0.82], lh: [0.2, 1.4, 0.45], lf: [0.12, 0, 0.5] }),
  superBig: over(STANCE, { root: [0, 0, 0.1], hips: [-10, 10, 0], chest: [-18, 15, 0], head: [-25, 0, 0], lh: [0.12, 2.05, 0.42], rh: [-0.08, 2.0, 0.42], lf: [0.12, 0.25, 0.32], rf: [-0.12, 0, -0.2] }),
  hopKick: over(STANCE, { root: [0, 0.3, 0], hips: [-15, 0, 0], chest: [-12, 10, 0], rf: [0, 1.5, 0.62], rk: [0, 0.6, 1], lf: [0.12, 0.65, 0.05], lk: [0, 0.3, 1], lh: [0.3, 1.4, 0.1], rh: [-0.3, 1.35, -0.1] }),
  thunderWind: over(CROUCH, { root: [0, -0.32, 0], hips: [20, -30, 0], chest: [20, -30, 0], rh: [-0.05, 0.62, 0.2], lh: [0.15, 0.95, 0.3] }),
  heatWind: over(STANCE, { root: [0, -0.18, 0], chest: [-15, 0, 0], head: [-20, 0, 0], lh: [0.45, 0.92, 0.12], rh: [-0.45, 0.92, 0.12], le: [1, 0, -0.3], re: [-1, 0, -0.3], lf: [0.18, 0, 0.18], rf: [-0.18, 0, -0.18] }),
  heatBurst: over(STANCE, { root: [0, -0.12, 0.1], chest: [10, 0, 0], lh: [0.35, 1.35, 0.52], rh: [-0.35, 1.35, 0.52] }),
  heatSmash: over(STANCE, { root: [0, -0.25, 0.15], hips: [20, 10, 0], chest: [30, 10, 0], head: [10, 0, 0], lh: [0.06, 0.82, 0.7], rh: [-0.06, 0.8, 0.68], lf: [0.12, 0, 0.5] }),
  evade: over(STANCE, { root: [0, -0.18, -0.12], hips: [-5, -55, -8], chest: [-14, -20, -12], head: [-5, 50, 0], lh: [0.15, 1.35, 0.25], rh: [-0.15, 1.3, 0.05], lf: [0.16, 0, 0.12], rf: [-0.14, 0, -0.38] }),
};

export const CROUCH_POSES = new Set(['crJab', 'crPunch', 'crKickLow', 'crKickMid', 'sweep']);
