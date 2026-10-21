// The 3D view of a match: two rigged fighters on the rooftop stage, the fight camera, and effects driven by
// the simulation's events. Reads the match state; never changes it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { STAGE_HALF } from '../sim/constants';
import { hurtboxes, moveOf, toWorld } from '../sim/match';
import type { Box, FighterState, GameEvent, MatchState } from '../sim/types';
import { Animator } from './animator';
import { Orbs, Particles, Rings } from './fx';
import { buildMannequin, newSolved, solve, type Palette, type Rig } from './rig';
import { buildStage } from './stage';

const M = 1 / 10000;
const BASE_YAW = (65 * Math.PI) / 180;
const WALL_X = STAGE_HALF * M;

interface FighterView {
  outer: THREE.Group;
  rig: Rig;
  anim: Animator;
  flash: number;
  palette: Palette;
  glow: THREE.Color;
}

const C = (s: string) => new THREE.Color(s);
const COLORS = {
  hit1: C('#ffd36b'),
  hit2: C('#ff8a3d'),
  hit3: C('#ff3b3b'),
  block: C('#9fd8ff'),
  parry: C('#40ff9a'),
  white: C('#ffffff'),
  drive: C('#3dff8e'),
  heat: C('#ff6a2b'),
  heat2: C('#ff3cd2'),
  rage: C('#ff2a2a'),
  electric: C('#6ab8ff'),
  dust: C('#b9a9d6'),
  star: C('#fff27a'),
  smoke: C('#8a8f99'),
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private fighters: FighterView[] = [];
  private particles = new Particles(1200);
  private rings = new Rings();
  private orbs = new Orbs();
  private cam = { x: 0, y: 1.1, dist: 7 };
  private shake = 0;
  private superCam = { side: 0, frames: 0 };
  private koCam = 0;
  private lastFrame = 0;
  private solved = newSolved();
  private debug = new THREE.Group();
  private debugBoxes: THREE.LineSegments[] = [];
  showBoxes = false;

  constructor(private canvas: HTMLCanvasElement, private low = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    buildStage(this.scene);
    this.scene.add(this.particles.points, this.rings.group, this.orbs.group, this.debug);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.75, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const geo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
    for (let i = 0; i < 14; i++) {
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true }));
      l.renderOrder = 10;
      l.visible = false;
      this.debug.add(l);
      this.debugBoxes.push(l);
    }
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // particle sizes are in units of 4 mm: on screen, pixels = size * 0.004 m * pixels-per-metre / distance
    const pxPerMetre = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.particles.setScale(pxPerMetre * 0.004);
  }

  setFighters(palettes: [Palette, Palette]) {
    for (const f of this.fighters) this.scene.remove(f.outer);
    this.fighters = palettes.map((p) => {
      const rig = buildMannequin(p);
      const outer = new THREE.Group();
      outer.add(rig.root);
      this.scene.add(outer);
      return { outer, rig, anim: new Animator(), flash: 0, palette: p, glow: new THREE.Color(p.glow) };
    });
  }

  onEvents(events: GameEvent[], m: MatchState) {
    for (const e of events) this.event(e, m);
  }

  private event(e: GameEvent, m: MatchState) {
    const x = e.x * M;
    const y = e.y * M;
    const z = 0.25;
    const P = this.particles;
    const R = this.rings;
    switch (e.type) {
      case 'hit': {
        const c = e.power >= 3 ? COLORS.hit3 : e.power === 2 ? COLORS.hit2 : COLORS.hit1;
        P.burst(x, y, z, 12 + e.power * 12, c, 0.03 + e.power * 0.014, 26 + e.power * 10, 16 + e.power * 4);
        P.burst(x, y, z, 6, COLORS.white, 0.02, 60 + e.power * 20, 6, 0);
        R.spawn(x, y, z, c, 0.25 + e.power * 0.18);
        this.shake = Math.max(this.shake, 0.012 * e.power);
        this.fighters[e.side].flash = 1;
        break;
      }
      case 'counter':
      case 'punish':
        R.spawn(this.fx(m, 1 - e.side), 1.3, z, COLORS.hit3, 0.9, 18);
        break;
      case 'block':
        P.burst(x, y, z, 10, COLORS.block, 0.025, 22, 12);
        R.spawn(x, y, z, COLORS.block, 0.3 + e.power * 0.1, 10);
        this.shake = Math.max(this.shake, 0.004 * e.power);
        break;
      case 'parry':
        R.spawn(x, y, z, COLORS.parry, 0.55, 14);
        P.burst(x, y, z, 14, COLORS.parry, 0.03, 24, 14);
        break;
      case 'perfectParry':
        R.spawn(x, y, z, COLORS.white, 1.4, 24);
        R.spawn(x, y, z, COLORS.parry, 0.9, 18);
        P.burst(x, y, z, 40, COLORS.parry, 0.05, 30, 24);
        this.shake = 0.03;
        break;
      case 'armor':
        R.spawn(x, y, z, COLORS.white, 0.6, 12);
        P.burst(x, y, z, 12, COLORS.white, 0.03, 20, 10);
        break;
      case 'tech':
        R.spawn(x, 1.2, z, COLORS.white, 0.7, 14);
        break;
      case 'super':
      case 'heat':
      case 'heatSmash':
      case 'rageArt': {
        const fx = this.fx(m, e.side);
        const c = e.type === 'super' ? this.fighters[e.side].glow : e.type === 'rageArt' ? COLORS.rage : COLORS.heat;
        R.spawn(fx, 1.1, z, c, 1.3, 30);
        R.spawn(fx, 1.1, z, COLORS.white, 0.8, 20);
        P.burst(fx, 1.0, z, 70, c, 0.06, 34, 40, 0.001);
        this.superCam = { side: e.side, frames: e.power };
        break;
      }
      case 'driveImpact':
        R.spawn(this.fx(m, e.side), 1.1, z, COLORS.drive, 0.7, 16);
        P.burst(this.fx(m, e.side), 1.1, z, 24, COLORS.drive, 0.035, 30, 20);
        break;
      case 'driveRush':
        R.spawn(this.fx(m, e.side), 0.9, z, COLORS.drive, 0.7, 12);
        break;
      case 'wallSplat': {
        const wx = Math.sign(x || 1) * WALL_X;
        R.spawn(wx, y, z, COLORS.hit2, 1.4, 22);
        P.burst(wx, y, z, 40, COLORS.hit1, 0.05, 30, 22);
        this.shake = 0.05;
        break;
      }
      case 'tornado':
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * 4;
          P.emit(x + Math.cos(a) * 0.3, y - 0.4 + i * 0.03, z + Math.sin(a) * 0.3, Math.cos(a + 1.6) * 0.02, 0.02, Math.sin(a + 1.6) * 0.02, COLORS.white, 30, 20, 0);
        }
        break;
      case 'justFrame': {
        const fx = this.fx(m, e.side);
        R.spawn(fx, 0.9, z, COLORS.electric, 1.0, 16);
        P.burst(fx, 0.9, z, 36, COLORS.electric, 0.05, 26, 16, 0);
        break;
      }
      case 'knockdown':
        P.burst(x, 0.05, z, 18, COLORS.dust, 0.025, 34, 22, 0.0005);
        this.shake = Math.max(this.shake, 0.015);
        break;
      case 'ko':
        R.spawn(x, y, z, COLORS.white, 1.8, 36);
        P.burst(x, y, z, 80, COLORS.hit1, 0.07, 34, 40);
        this.shake = 0.08;
        this.koCam = 120;
        break;
      case 'land':
      case 'jump':
        P.burst(x, 0.04, z, 5, COLORS.dust, 0.012, 22, 12, 0);
        break;
      case 'projectile':
        R.spawn(x, y, z, this.fighters[e.side].glow, 0.45, 10);
        break;
      case 'evade':
        P.burst(this.fx(m, e.side), 1.0, 0.6, 10, COLORS.electric, 0.02, 24, 12, 0);
        break;
      case 'burnout':
        P.burst(this.fx(m, e.side), 1.3, z, 30, COLORS.smoke, 0.02, 40, 30, -0.0008);
        break;
      case 'dizzy':
        R.spawn(this.fx(m, e.side), 1.8, z, COLORS.star, 0.6, 16);
        break;
    }
  }

  private fx(m: MatchState, side: number) {
    return m.fighters[side].x * M;
  }

  render(m: MatchState) {
    const frames = Math.max(0, Math.min(6, m.frame - this.lastFrame));
    this.lastFrame = m.frame;
    if (!this.fighters.length) return;
    m.fighters.forEach((f, i) => this.placeFighter(f, this.fighters[i], m, frames));
    this.auras(m, frames);
    // projectiles
    this.orbs.sync(
      m.projectiles.map((p) => {
        const color = this.fighters[p.owner].glow;
        if (frames && Math.random() < 0.9) this.particles.emit(p.x * M, p.y * M + (Math.random() - 0.5) * 0.12, 0.05, -Math.sign(p.vx) * 0.01, 0, 0, color, 34, 12, 0);
        return { x: p.x * M, y: p.y * M, color, t: p.age };
      }),
    );
    this.particles.update(frames);
    this.updateCamera(m, frames);
    this.rings.update(frames, this.camera);
    this.drawBoxes(m);
    if (this.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }

  private placeFighter(f: FighterState, v: FighterView, m: MatchState, frames: number) {
    const a = v.anim.update(f, m.frame);
    solve(a.pose, this.solved);
    v.rig.apply(this.solved);
    let x = f.x * M;
    // the hit fighter shakes during hitstop
    if (m.freeze > 0 && (f.state === 'hitstun' || f.state === 'juggle' || f.state === 'blockstun') && f.stateFrame === 0) {
      x += (m.frame % 2 ? 1 : -1) * 0.018;
    }
    v.outer.position.set(x, f.y * M, a.side);
    v.outer.scale.x = f.facing;
    v.rig.root.rotation.set((a.lean * Math.PI) / 180, BASE_YAW + (a.spin * Math.PI) / 180, 0);
    v.flash = Math.max(0, v.flash - frames * 0.18);
    v.rig.setTint(f.burnout, v.flash);
    v.rig.materials.glow.emissiveIntensity = f.heatTimer > 0 ? 3 : 1.6;
  }

  private auras(m: MatchState, frames: number) {
    if (!frames) return;
    const P = this.particles;
    m.fighters.forEach((f) => {
      const x = f.x * M;
      const y = f.y * M;
      const r = () => (Math.random() - 0.5);
      if (f.heatTimer > 0) {
        for (let i = 0; i < 2; i++) P.emit(x + r() * 0.5, y + 0.2 + Math.random() * 1.4, r() * 0.4, 0, 0.012, 0, Math.random() < 0.5 ? COLORS.heat : COLORS.heat2, 30, 22, -0.0003);
      }
      if (f.state === 'move' && f.moveId === 'drive_rush') {
        for (let i = 0; i < 3; i++) P.emit(x + r() * 0.3, y + 0.3 + Math.random() * 1.2, r() * 0.3, -f.facing * 0.03, 0, 0, COLORS.drive, 34, 14, 0);
      }
      if (f.fromDriveRush) P.emit(x + r() * 0.3, y + 0.4 + Math.random(), r() * 0.3, -f.facing * 0.02, 0, 0, COLORS.drive, 26, 10, 0);
      if (f.state === 'parry') {
        const a = Math.random() * Math.PI * 2;
        P.emit(x + Math.cos(a) * 0.55 * f.facing + 0.1 * f.facing, y + 1.0 + Math.sin(a) * 0.75, 0.2, 0, 0, 0, COLORS.parry, 26, 8, 0);
      }
      if (f.state === 'dizzy' && m.frame % 4 === 0) {
        const a = m.frame * 0.15;
        P.emit(x + Math.cos(a) * 0.25, y + 1.85, Math.sin(a) * 0.25, 0, 0, 0, COLORS.star, 34, 10, 0);
      }
      if (f.burnout && m.frame % 6 === 0) P.emit(x + r() * 0.3, y + 1.5, 0, 0, 0.006, 0, COLORS.smoke, 40, 30, -0.0002);
      if (f.style === 'iron' && !f.rageUsed && f.health > 0 && f.health <= 2500 && m.frame % 3 === 0) {
        P.emit(x + r() * 0.5, y + 0.3 + Math.random() * 1.2, r() * 0.3, 0, 0.01, 0, COLORS.rage, 22, 16, -0.0002);
      }
    });
  }

  private updateCamera(m: MatchState, frames: number) {
    const [a, b] = m.fighters;
    const ax = a.x * M, bx = b.x * M;
    let tx = (ax + bx) / 2;
    const sep = Math.abs(ax - bx);
    let dist = Math.min(8.4, Math.max(6.6, 5.9 + sep * 0.55));
    let ty = 1.05 + Math.max(a.y, b.y) * M * 0.35;
    if (this.superCam.frames > 0) {
      const f = m.fighters[this.superCam.side];
      tx = f.x * M + f.facing * 0.4;
      dist = 4.2;
      ty = 1.15;
      if (frames) this.superCam.frames -= frames;
    } else if (this.koCam > 0) {
      dist -= 0.8;
      if (frames) this.koCam -= frames;
    }
    const halfW = Math.tan((this.camera.fov * Math.PI) / 360) * dist * this.camera.aspect;
    const limit = Math.max(0, WALL_X + 0.6 - halfW);
    tx = Math.max(-limit, Math.min(limit, tx));
    const k = this.superCam.frames > 0 ? 0.25 : 0.12;
    const s = 1 - Math.pow(1 - k, Math.max(1, frames));
    this.cam.x += (tx - this.cam.x) * s;
    this.cam.y += (ty - this.cam.y) * s;
    this.cam.dist += (dist - this.cam.dist) * s;
    let sx = 0, sy = 0;
    if (this.shake > 0.0005) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.82, Math.max(1, frames));
    }
    this.camera.position.set(this.cam.x + sx, this.cam.y + 0.3 + sy, this.cam.dist);
    this.camera.lookAt(this.cam.x + sx * 0.5, this.cam.y, 0);
  }

  private drawBoxes(m: MatchState) {
    this.debug.visible = this.showBoxes;
    if (!this.showBoxes) return;
    let n = 0;
    const put = (b: Box, color: string) => {
      const l = this.debugBoxes[n++];
      if (!l) return;
      l.visible = true;
      l.position.set((b.x + b.w / 2) * M, (b.y + b.h / 2) * M, 0.6);
      l.scale.set(b.w * M, b.h * M, 1);
      (l.material as THREE.LineBasicMaterial).color.set(color);
    };
    for (const f of m.fighters) {
      for (const h of hurtboxes(f)) put(h, '#3da5ff');
      if (f.state === 'move') {
        const mv = moveOf(f);
        if (mv.hitbox && f.moveFrame >= mv.startup && f.moveFrame < mv.startup + mv.active) put(toWorld(f, mv.hitbox), mv.kind === 'throw' ? '#3dff8e' : '#ff3b3b');
      }
    }
    for (const p of m.projectiles) put({ x: p.x - 1300, y: p.y - 1300, w: 2600, h: 2600 }, '#ff3b3b');
    for (let i = n; i < this.debugBoxes.length; i++) this.debugBoxes[i].visible = false;
  }
}
