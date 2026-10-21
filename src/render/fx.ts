// Hit sparks, impact rings, projectile orbs and auras. Pools are allocated once; nothing is created per hit.

import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a * vAlpha;
    gl_FragColor = vec4(vTint * a * 1.6, a);
  }
`;

export class Particles {
  readonly points: THREE.Points;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private tint: Float32Array;
  private size: Float32Array;
  private size0: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private life0: Float32Array;
  private grav: Float32Array;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(private max = 900) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { scale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  setScale(px: number) {
    this.mat.uniforms.scale.value = px;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, grav = 0) {
    let i = this.n;
    if (i >= this.max) {
      // recycle the oldest-looking slot
      i = Math.floor(Math.random() * this.max);
    } else this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.tint.set([color.r, color.g, color.b], i * 3);
    this.size[i] = this.size0[i] = size;
    this.alpha[i] = 1;
    this.life[i] = this.life0[i] = life;
    this.grav[i] = grav;
  }

  burst(x: number, y: number, z: number, count: number, color: THREE.Color, speed: number, size: number, life: number, grav = 0.004) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.5) * Math.PI;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + speed * 0.2, Math.sin(a) * Math.cos(e) * s * 0.6, color, size * (0.5 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav);
    }
  }

  update(frames: number) {
    if (frames <= 0) return;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= frames;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.tint]) arr.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.size[i] = this.size[j];
          this.size0[i] = this.size0[j];
          this.alpha[i] = this.alpha[j];
          this.life[i] = this.life[j];
          this.life0[i] = this.life0[j];
          this.grav[i] = this.grav[j];
        }
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * frames;
      this.vel[k] *= 0.94;
      this.vel[k + 2] *= 0.94;
      this.pos[k] += this.vel[k] * frames;
      this.pos[k + 1] += this.vel[k + 1] * frames;
      this.pos[k + 2] += this.vel[k + 2] * frames;
      const u = this.life[i] / this.life0[i];
      this.alpha[i] = Math.min(1, u * 1.6);
      this.size[i] = this.size0[i] * (0.4 + 0.6 * u);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const name of ['position', 'tint', 'size', 'alpha']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Rings {
  private pool: Array<{ mesh: THREE.Mesh; life: number; life0: number; grow: number }> = [];
  readonly group = new THREE.Group();

  constructor() {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, life: 0, life0: 1, grow: 1 });
    }
  }

  spawn(x: number, y: number, z: number, color: THREE.Color, size: number, life = 14) {
    const r = this.pool.find((p) => p.life <= 0) ?? this.pool[0];
    r.mesh.position.set(x, y, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
    r.life = r.life0 = life;
    r.grow = size * 0.65;
    r.mesh.visible = true;
  }

  update(frames: number, camera: THREE.Camera) {
    for (const r of this.pool) {
      if (r.life <= 0) continue;
      r.life -= frames;
      const u = 1 - Math.max(0, r.life) / r.life0;
      const s = 0.05 + r.grow * (1 - (1 - u) * (1 - u));
      r.mesh.scale.setScalar(s);
      r.mesh.quaternion.copy(camera.quaternion);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (1 - u) * 0.5;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}

export class Orbs {
  readonly group = new THREE.Group();
  private meshes: THREE.Group[] = [];

  constructor() {
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 20, 14),
        new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      g.add(core, shell);
      g.visible = false;
      this.group.add(g);
      this.meshes.push(g);
    }
  }

  // size: 1 for a normal orb; bolts are smaller and stretched along their flight
  sync(list: Array<{ x: number; y: number; z: number; dx: number; dz: number; color: THREE.Color; t: number; size: number; stretch: number }>) {
    this.meshes.forEach((g, i) => {
      const p = list[i];
      g.visible = !!p;
      if (!p) return;
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
      g.scale.set(p.size, p.size, p.size * p.stretch);
      const shell = g.children[1] as THREE.Mesh;
      (shell.material as THREE.MeshBasicMaterial).color.copy(p.color);
      shell.scale.setScalar(1 + Math.sin(p.t * 0.6) * 0.12);
    });
  }
}

// beams: a white core inside a coloured glow, and a churning ball where two beams clash
export class Beams {
  readonly group = new THREE.Group();
  private beams: Array<{ root: THREE.Group; core: THREE.Mesh; glow: THREE.Mesh; tip: THREE.Mesh }> = [];
  private clashBall: THREE.Group;
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();

  constructor() {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    const ball = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Group();
      const core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      const glow = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const tip = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      root.add(core, glow, tip);
      root.visible = false;
      this.group.add(root);
      this.beams.push({ root, core, glow, tip });
    }
    this.clashBall = new THREE.Group();
    this.clashBall.add(
      new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: '#ffffff' })),
      new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    this.clashBall.visible = false;
    this.group.add(this.clashBall);
  }

  // each beam runs from (x, y, z) along (dx, dz) for `len` metres
  sync(list: Array<{ x: number; y: number; z: number; dx: number; dz: number; len: number; width: number; color: THREE.Color }>, clash: { x: number; y: number; z: number; t: number } | null, t: number) {
    this.beams.forEach((b, i) => {
      const p = list[i];
      b.root.visible = !!p && p.len > 0.05;
      if (!p || !b.root.visible) return;
      this.dir.set(p.dx, 0, p.dz).normalize();
      b.root.position.set(p.x, p.y, p.z);
      b.root.quaternion.setFromUnitVectors(this.up, this.dir);
      const flicker = 1 + Math.sin(t * 1.7 + i) * 0.08;
      const w = p.width * flicker;
      b.core.scale.set(w * 0.3, p.len, w * 0.3);
      b.core.position.y = p.len / 2;
      b.glow.scale.set(w * 0.8, p.len, w * 0.8);
      b.glow.position.y = p.len / 2;
      (b.glow.material as THREE.MeshBasicMaterial).color.copy(p.color);
      (b.tip.material as THREE.MeshBasicMaterial).color.copy(p.color);
      b.tip.scale.setScalar(w * 1.5);
      b.tip.position.y = p.len;
    });
    this.clashBall.visible = !!clash;
    if (clash) {
      this.clashBall.position.set(clash.x, clash.y, clash.z);
      const s = 0.45 + Math.sin(t * 0.9) * 0.08;
      this.clashBall.children[0].scale.setScalar(s * 0.55);
      this.clashBall.children[1].scale.setScalar(s);
    }
  }
}
