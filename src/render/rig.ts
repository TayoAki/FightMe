// The standard humanoid rig every character uses, a pose solver and the placeholder mannequin.
//
// Poses are written in "root space": metres, origin on the ground under the fighter, +Z toward the
// opponent, +Y up, +X the fighter's left. A pose places the torso with angles and the fists and feet with
// positions; two-bone IK works out the elbows and knees. The solver outputs one rotation per bone relative
// to its parent, for a T-pose rest (arms along ±X, legs down), so the same output can drive any rigged
// model whose bones are mapped onto these names.

import * as THREE from 'three';

export type V3 = [number, number, number];

export interface PoseSpec {
  root: V3;
  hips: V3;
  spine: V3;
  chest: V3;
  head: V3;
  lh: V3;
  rh: V3;
  lf: V3;
  rf: V3;
  le: V3;
  re: V3;
  lk: V3;
  rk: V3;
}

export const BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'lUpperArm',
  'lForeArm',
  'lHand',
  'rUpperArm',
  'rForeArm',
  'rHand',
  'lThigh',
  'lShin',
  'lFoot',
  'rThigh',
  'rShin',
  'rFoot',
] as const;
export type BoneName = (typeof BONES)[number];

// proportions in metres
export const HIP_H = 0.97;
const SPINE = 0.11;
const CHEST = 0.18;
const NECK = 0.21;
const HEAD = 0.09;
const SHOULDER: V3 = [0.19, 0.15, 0];
const HIP: V3 = [0.095, -0.05, 0];
export const UPPER_ARM = 0.29;
export const FORE_ARM = 0.27;
export const THIGH = 0.44;
export const SHIN = 0.43;
const ANKLE_H = 0.07;

const X = new THREE.Vector3(1, 0, 0);
const NX = new THREE.Vector3(-1, 0, 0);
const NY = new THREE.Vector3(0, -1, 0);
const DEG = Math.PI / 180;

const euler = new THREE.Euler();
function eq(v: V3, out: THREE.Quaternion) {
  euler.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'YXZ');
  return out.setFromEuler(euler);
}

export interface Solved {
  hipsPos: THREE.Vector3;
  rot: Record<BoneName, THREE.Quaternion>;
}

export function newSolved(): Solved {
  const rot = {} as Record<BoneName, THREE.Quaternion>;
  for (const b of BONES) rot[b] = new THREE.Quaternion();
  return { hipsPos: new THREE.Vector3(), rot };
}

const tmp = {
  qh: new THREE.Quaternion(),
  qs: new THREE.Quaternion(),
  qc: new THREE.Quaternion(),
  qn: new THREE.Quaternion(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  qinv: new THREE.Quaternion(),
  ph: new THREE.Vector3(),
  ps: new THREE.Vector3(),
  pc: new THREE.Vector3(),
  v: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  t: new THREE.Vector3(),
  pole: new THREE.Vector3(),
  mid: new THREE.Vector3(),
};

// two-bone IK: start S, target T, lengths a and b, pole hint P. Writes the two segment directions.
function ik(S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, P: THREE.Vector3, upper: THREE.Vector3, lower: THREE.Vector3) {
  const d0 = tmp.v.subVectors(T, S);
  let d = d0.length();
  const u = d0.normalize();
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const n = tmp.pole.copy(P).addScaledVector(u, -P.dot(u));
  if (n.lengthSq() < 1e-8) n.set(0, 0, 1).addScaledVector(u, -u.z);
  n.normalize();
  const elbow = tmp.mid.copy(S).addScaledVector(u, a * cosA).addScaledVector(n, a * sinA);
  upper.subVectors(elbow, S).normalize();
  const end = tmp.t.copy(S).addScaledVector(u, d);
  lower.subVectors(end, elbow).normalize();
}

const upperDir = new THREE.Vector3();
const lowerDir = new THREE.Vector3();
const target = new THREE.Vector3();
const poleV = new THREE.Vector3();
const start = new THREE.Vector3();

export function solve(p: PoseSpec, out: Solved): Solved {
  const { qh, qs, qc, qn, q1, q2, qinv, ph, ps, pc } = tmp;
  ph.set(p.root[0], HIP_H + p.root[1], p.root[2]);
  out.hipsPos.copy(ph);
  eq(p.hips, qh);
  out.rot.hips.copy(qh);
  eq(p.spine, out.rot.spine);
  qs.multiplyQuaternions(qh, out.rot.spine);
  ps.set(0, SPINE, 0).applyQuaternion(qh).add(ph);
  eq(p.chest, out.rot.chest);
  qc.multiplyQuaternions(qs, out.rot.chest);
  pc.set(0, CHEST, 0).applyQuaternion(qs).add(ps);
  out.rot.neck.identity();
  eq(p.head, out.rot.head);
  qn.copy(qc);

  // arms
  for (const side of [1, -1] as const) {
    const sh = start.set(SHOULDER[0] * side, SHOULDER[1], SHOULDER[2]).applyQuaternion(qc).add(pc);
    const h = side === 1 ? p.lh : p.rh;
    const e = side === 1 ? p.le : p.re;
    target.set(h[0], h[1], h[2]);
    poleV.set(e[0], e[1], e[2]);
    ik(sh, target, UPPER_ARM, FORE_ARM, poleV, upperDir, lowerDir);
    const rest = side === 1 ? X : NX;
    q1.setFromUnitVectors(rest, upperDir);
    q2.setFromUnitVectors(rest, lowerDir);
    const up = side === 1 ? out.rot.lUpperArm : out.rot.rUpperArm;
    const fo = side === 1 ? out.rot.lForeArm : out.rot.rForeArm;
    up.copy(qinv.copy(qc).invert()).multiply(q1);
    fo.copy(qinv.copy(q1).invert()).multiply(q2);
    (side === 1 ? out.rot.lHand : out.rot.rHand).identity();
  }
  // legs
  for (const side of [1, -1] as const) {
    const hp = start.set(HIP[0] * side, HIP[1], HIP[2]).applyQuaternion(qh).add(ph);
    const f = side === 1 ? p.lf : p.rf;
    const k = side === 1 ? p.lk : p.rk;
    target.set(f[0], f[1] + ANKLE_H, f[2]);
    poleV.set(k[0], k[1], k[2]);
    ik(hp, target, THIGH, SHIN, poleV, upperDir, lowerDir);
    q1.setFromUnitVectors(NY, upperDir);
    q2.setFromUnitVectors(NY, lowerDir);
    const th = side === 1 ? out.rot.lThigh : out.rot.rThigh;
    const sn = side === 1 ? out.rot.lShin : out.rot.rShin;
    th.copy(qinv.copy(qh).invert()).multiply(q1);
    sn.copy(qinv.copy(q1).invert()).multiply(q2);
    // feet on the ground stay flat and point where the hips point; raised feet follow the shin
    const ft = side === 1 ? out.rot.lFoot : out.rot.rFoot;
    if (f[1] < 0.12) {
      euler.set(0, p.hips[1] * DEG * 0.6, 0, 'YXZ');
      q2.setFromEuler(euler);
      // foot world = shinWorld * local  →  local = inv(shinWorld) * desired
      const shinWorld = tmp.q1.setFromUnitVectors(NY, lowerDir);
      ft.copy(qinv.copy(shinWorld).invert()).multiply(q2);
    } else {
      ft.identity();
    }
  }
  return out;
}

export function lerpPose(a: PoseSpec, b: PoseSpec, t: number, out: PoseSpec): PoseSpec {
  for (const k of Object.keys(a) as (keyof PoseSpec)[]) {
    const x = a[k], y = b[k], o = out[k];
    o[0] = x[0] + (y[0] - x[0]) * t;
    o[1] = x[1] + (y[1] - x[1]) * t;
    o[2] = x[2] + (y[2] - x[2]) * t;
  }
  return out;
}

export function copyPose(p: PoseSpec): PoseSpec {
  return JSON.parse(JSON.stringify(p));
}

// ---------------------------------------------------------------------------------------------- mannequin

export interface Palette {
  body: string;
  trim: string;
  glow: string;
}

export const PALETTES: Palette[] = [
  { body: '#e8452c', trim: '#2a1a1f', glow: '#ffb347' },
  { body: '#2f7bff', trim: '#141c33', glow: '#5ff2ff' },
  { body: '#2fd17a', trim: '#10261c', glow: '#d6ff5f' },
  { body: '#b04dff', trim: '#21122e', glow: '#ff7ae0' },
  { body: '#f2c230', trim: '#2b2210', glow: '#ffffff' },
  { body: '#e9edf2', trim: '#23262b', glow: '#ff3b3b' },
];

export interface Rig {
  root: THREE.Group;
  bones: Record<BoneName, THREE.Object3D>;
  materials: { body: THREE.MeshPhysicalMaterial; trim: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial };
  apply(s: Solved): void;
  setTint(burnout: boolean, flash: number): void;
}

function capsule(r: number, len: number, mat: THREE.Material, dir: THREE.Vector3, offset = 0) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 12);
  const m = new THREE.Mesh(g, mat);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.position.copy(dir).multiplyScalar(len / 2 + offset);
  m.castShadow = true;
  return m;
}

export function buildMannequin(pal: Palette): Rig {
  const body = new THREE.MeshPhysicalMaterial({ color: pal.body, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const trim = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: 0.7, metalness: 0.1 });
  const glow = new THREE.MeshStandardMaterial({ color: pal.glow, emissive: pal.glow, emissiveIntensity: 1.6, roughness: 0.4 });
  const root = new THREE.Group();
  const mk = (name: BoneName, parent: THREE.Object3D, pos: V3) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(pos[0], pos[1], pos[2]);
    parent.add(o);
    return o;
  };
  const bones = {} as Record<BoneName, THREE.Object3D>;
  bones.hips = mk('hips', root, [0, HIP_H, 0]);
  bones.spine = mk('spine', bones.hips, [0, SPINE, 0]);
  bones.chest = mk('chest', bones.spine, [0, CHEST, 0]);
  bones.neck = mk('neck', bones.chest, [0, NECK, 0]);
  bones.head = mk('head', bones.neck, [0, HEAD, 0]);
  bones.lUpperArm = mk('lUpperArm', bones.chest, SHOULDER);
  bones.lForeArm = mk('lForeArm', bones.lUpperArm, [UPPER_ARM, 0, 0]);
  bones.lHand = mk('lHand', bones.lForeArm, [FORE_ARM, 0, 0]);
  bones.rUpperArm = mk('rUpperArm', bones.chest, [-SHOULDER[0], SHOULDER[1], SHOULDER[2]]);
  bones.rForeArm = mk('rForeArm', bones.rUpperArm, [-UPPER_ARM, 0, 0]);
  bones.rHand = mk('rHand', bones.rForeArm, [-FORE_ARM, 0, 0]);
  bones.lThigh = mk('lThigh', bones.hips, HIP);
  bones.lShin = mk('lShin', bones.lThigh, [0, -THIGH, 0]);
  bones.lFoot = mk('lFoot', bones.lShin, [0, -SHIN, 0]);
  bones.rThigh = mk('rThigh', bones.hips, [-HIP[0], HIP[1], HIP[2]]);
  bones.rShin = mk('rShin', bones.rThigh, [0, -THIGH, 0]);
  bones.rFoot = mk('rFoot', bones.rShin, [0, -SHIN, 0]);

  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const px = new THREE.Vector3(1, 0, 0);
  const nx = new THREE.Vector3(-1, 0, 0);
  const add = (b: BoneName, m: THREE.Object3D) => bones[b].add(m);
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, pos: V3, scale?: V3) => {
    const m = new THREE.Mesh(g, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true;
    return m;
  };
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  // torso
  add('hips', mesh(sphere, trim, [0, 0.0, 0], [0.17, 0.11, 0.12]));
  add('hips', mesh(new THREE.TorusGeometry(1, 0.12, 8, 24), glow, [0, 0.055, 0], [0.15, 0.11, 0.15]).rotateX(Math.PI / 2));
  add('spine', capsule(0.115, 0.2, body, up, -0.04));
  add('chest', mesh(sphere, body, [0, 0.09, 0.01], [0.2, 0.15, 0.13]));
  add('chest', mesh(sphere, body, [0.13, 0.13, 0], [0.085, 0.08, 0.085]));
  add('chest', mesh(sphere, body, [-0.13, 0.13, 0], [0.085, 0.08, 0.085]));
  add('neck', capsule(0.045, 0.12, trim, down, -0.03));
  add('head', mesh(sphere, body, [0, 0.03, 0.005], [0.1, 0.12, 0.11]));
  // visor shows which way the head faces
  add('head', mesh(sphere, glow, [0, 0.045, 0.065], [0.075, 0.025, 0.05]));
  add('head', mesh(new THREE.TorusGeometry(1, 0.18, 8, 24), trim, [0, 0.085, 0], [0.105, 0.105, 0.105]).rotateX(Math.PI / 2));
  // arms
  add('lUpperArm', capsule(0.055, UPPER_ARM, body, px));
  add('lForeArm', capsule(0.048, FORE_ARM, body, px));
  add('lForeArm', mesh(sphere, glow, [FORE_ARM * 0.82, 0, 0], [0.052, 0.052, 0.052]));
  add('lHand', mesh(sphere, trim, [0.04, 0, 0], [0.07, 0.065, 0.065]));
  add('rUpperArm', capsule(0.055, UPPER_ARM, body, nx));
  add('rForeArm', capsule(0.048, FORE_ARM, body, nx));
  add('rForeArm', mesh(sphere, glow, [-FORE_ARM * 0.82, 0, 0], [0.052, 0.052, 0.052]));
  add('rHand', mesh(sphere, trim, [-0.04, 0, 0], [0.07, 0.065, 0.065]));
  // legs
  for (const s of ['l', 'r'] as const) {
    add(`${s}Thigh`, capsule(0.08, THIGH, trim, down));
    add(`${s}Shin`, capsule(0.062, SHIN, trim, down));
    add(`${s}Shin`, mesh(sphere, body, [0, -SHIN * 0.25, 0.02], [0.07, 0.11, 0.07]));
    add(`${s}Foot`, mesh(sphere, trim, [0, 0, 0], [0.055, 0.055, 0.055]));
    add(`${s}Foot`, mesh(new THREE.BoxGeometry(0.1, 0.065, 0.23), body, [0, -0.04, 0.06]));
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false;
  });

  const baseBody = new THREE.Color(pal.body);
  const grey = new THREE.Color('#6b6f78');
  const white = new THREE.Color('#ffffff');
  return {
    root,
    bones,
    materials: { body, trim, glow },
    apply(s: Solved) {
      bones.hips.position.copy(s.hipsPos);
      for (const b of BONES) bones[b].quaternion.copy(s.rot[b]);
    },
    setTint(burnout: boolean, flash: number) {
      body.color.copy(burnout ? grey : baseBody);
      if (flash > 0) body.color.lerp(white, Math.min(1, flash));
      body.emissive.copy(white).multiplyScalar(flash * 0.5);
    },
  };
}
