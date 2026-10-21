// The 3D view of a match: the fighters (and Tag partners) on the round rooftop, the shared fight camera, and
// effects driven by the simulation's events. Reads the match state; never changes it.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { assistMove, hurtboxes, moveOf } from '../sim/match';
import { STYLES } from '../sim/styles';
import type { AssistState, FighterState, GameEvent, MatchState, StyleId } from '../sim/types';
import { Animator, type AnimView } from './animator';
import { Beams, Orbs, Particles, Rings } from './fx';
import { PALETTES, buildMannequin, newSolved, solve, type Palette, type Rig } from './rig';
import { buildStage, type Stage } from './stage';

const M = 1 / 10000;
const U = 1 / 1024;

interface Body {
  group: THREE.Group;
  rig: Rig;
  anim: Animator;
  palette: Palette;
  glow: THREE.Color;
  flash: number;
}

interface SideView {
  // one body per character: Street has one, a Tag team two
  bodies: Body[];
  // the character who just tagged out, leaping away
  ghost: { char: number; frames: number; x: number; z: number; fx: number; fz: number } | null;
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
  electric: C('#6ab8ff'),
  dust: C('#b9a9d6'),
  star: C('#fff27a'),
  smoke: C('#8a8f99'),
  clash: C('#ffd34d'),
  bolt: C('#5ff2ff'),
  seeker: C('#c58bff'),
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 300);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private stage: Stage;
  private sides: SideView[] = [];
  private particles = new Particles(1400);
  private rings = new Rings();
  private orbs = new Orbs();
  private beams = new Beams();
  private cam = { x: 0, y: 1.1, z: 0, px: 0, py: 2, pz: 8, ready: false };
  private shake = 0;
  private superCam = { side: 0, frames: 0 };
  private koCam = 0;
  private lastFrame = 0;
  private solved = newSolved();
  private debug = new THREE.Group();
  private hurtWires: THREE.LineSegments[] = [];
  private hitWires: THREE.LineSegments[] = [];
  showBoxes = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private low = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.stage = buildStage(this.scene);
    this.scene.add(this.particles.points, this.rings.group, this.orbs.group, this.beams.group, this.debug);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.75, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const cyl = new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 1, 16, 1));
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    for (let i = 0; i < 6; i++) {
      const w = new THREE.LineSegments(cyl, new THREE.LineBasicMaterial({ color: '#3da5ff', depthTest: false, transparent: true }));
      w.renderOrder = 10;
      this.debug.add(w);
      this.hurtWires.push(w);
      const b = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: '#ff3b3b', depthTest: false, transparent: true }));
      b.renderOrder = 10;
      this.debug.add(b);
      this.hitWires.push(b);
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

  // a Tag team's second character wears the palette three steps along
  setTeams(styles: [StyleId, StyleId], palettes: [number, number]) {
    for (const s of this.sides) for (const b of s.bodies) this.scene.remove(b.group);
    this.sides = styles.map((style, side) => {
      const n = STYLES[style].kits.length;
      const bodies: Body[] = [];
      for (let c = 0; c < n; c++) {
        const palette = PALETTES[(palettes[side] + c * 3) % PALETTES.length];
        const rig = buildMannequin(palette);
        const group = new THREE.Group();
        group.add(rig.root);
        group.visible = false;
        this.scene.add(group);
        bodies.push({ group, rig, anim: new Animator(), palette, glow: new THREE.Color(palette.glow), flash: 0 });
      }
      return { bodies, ghost: null };
    });
    this.cam.ready = false;
  }

  private glowOf(side: number, char: number) {
    const s = this.sides[side];
    return (s?.bodies[char] ?? s?.bodies[0])?.glow ?? COLORS.white;
  }

  onEvents(events: GameEvent[], m: MatchState) {
    for (const e of events) this.event(e, m);
  }

  private event(e: GameEvent, m: MatchState) {
    const x = e.x * M;
    const y = e.y * M;
    const z = e.z * M;
    const P = this.particles;
    const R = this.rings;
    const f = m.fighters[e.side];
    const fx = f.x * M;
    const fz = f.z * M;
    switch (e.type) {
      case 'hit': {
        const c = e.power >= 3 ? COLORS.hit3 : e.power === 2 ? COLORS.hit2 : COLORS.hit1;
        P.burst(x, y, z, 12 + e.power * 12, c, 0.03 + e.power * 0.014, 26 + e.power * 10, 16 + e.power * 4);
        P.burst(x, y, z, 6, COLORS.white, 0.02, 60 + e.power * 20, 6, 0);
        R.spawn(x, y, z, c, 0.25 + e.power * 0.18);
        this.shake = Math.max(this.shake, 0.012 * e.power);
        const body = this.sides[e.side]?.bodies[f.char];
        if (body) body.flash = 1;
        break;
      }
      case 'counter':
      case 'punish':
        R.spawn(m.fighters[1 - e.side].x * M, 1.3, m.fighters[1 - e.side].z * M, COLORS.hit3, 0.9, 18);
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
        R.spawn(x, y, z, COLORS.white, 1.2, 24);
        R.spawn(x, y, z, COLORS.parry, 0.8, 18);
        P.burst(x, y, z, 40, COLORS.parry, 0.05, 30, 24);
        this.shake = 0.03;
        break;
      case 'armor':
        R.spawn(x, y, z, COLORS.white, 0.6, 12);
        P.burst(x, y, z, 12, COLORS.white, 0.03, 20, 10);
        break;
      case 'tech':
        R.spawn(x, y, z, COLORS.white, 0.7, 14);
        break;
      case 'super': {
        const c = this.glowOf(e.side, f.char);
        R.spawn(fx, 1.1, fz, c, 1.3, 30);
        R.spawn(fx, 1.1, fz, COLORS.white, 0.8, 20);
        P.burst(fx, 1.0, fz, 70, c, 0.06, 34, 40, 0.001);
        this.superCam = { side: e.side, frames: e.power };
        break;
      }
      case 'driveImpact':
        R.spawn(fx, 1.1, fz, COLORS.drive, 0.7, 16);
        P.burst(fx, 1.1, fz, 24, COLORS.drive, 0.035, 30, 20);
        break;
      case 'driveRush':
        R.spawn(fx, 0.9, fz, COLORS.drive, 0.7, 12);
        break;
      case 'wallSplat':
        this.stage.flashFence(fx, fz);
        R.spawn(fx, y, fz, COLORS.hit2, 1.2, 22);
        P.burst(fx, y, fz, 40, COLORS.hit1, 0.05, 30, 22);
        this.shake = 0.05;
        break;
      case 'dash':
      case 'sidedash':
        P.burst(fx, 0.05, fz, 8, COLORS.dust, 0.015, 26, 14, 0);
        if (e.type === 'sidedash') P.burst(fx, 1.0, fz, 10, COLORS.electric, 0.02, 24, 12, 0);
        break;
      case 'teleport':
        R.spawn(fx, 1.0, fz, this.glowOf(e.side, f.char), 0.9, 16);
        P.burst(fx, 1.0, fz, 30, this.glowOf(e.side, f.char), 0.04, 26, 18, 0);
        break;
      case 'assist': {
        const c = this.glowOf(e.side, 1 - f.char);
        R.spawn(x, 0.9, z, c, 0.9, 16);
        P.burst(x, 0.3, z, 20, c, 0.03, 26, 16);
        break;
      }
      case 'assistHit':
        R.spawn(x, y, z, COLORS.hit3, 0.8, 16);
        break;
      case 'tagSwap': {
        const side = this.sides[e.side];
        if (side && side.bodies.length > 1) side.ghost = { char: 1 - f.char, frames: 26, x: f.x, z: f.z, fx: f.fx, fz: f.fz };
        const c = this.glowOf(e.side, f.char);
        R.spawn(fx, 1.0, fz, c, 1.1, 18);
        P.burst(fx, 1.0, fz, 40, c, 0.045, 28, 20);
        break;
      }
      case 'beam':
        R.spawn(x, y, z, this.glowOf(e.side, f.char), 0.5, 12);
        break;
      case 'beamClash':
        this.superCam.frames = 0;
        R.spawn(x, y, z, COLORS.clash, 2.2, 30);
        P.burst(x, y, z, 80, COLORS.clash, 0.06, 34, 30, 0);
        this.shake = 0.06;
        break;
      case 'clashWin':
        R.spawn(x, y, z, COLORS.white, 2.0, 30);
        P.burst(x, y, z, 90, COLORS.clash, 0.08, 36, 36);
        this.shake = 0.08;
        break;
      case 'knockdown':
        P.burst(fx, 0.05, fz, 18, COLORS.dust, 0.025, 34, 22, 0.0005);
        this.shake = Math.max(this.shake, 0.015);
        break;
      case 'ko':
        R.spawn(fx, y, fz, COLORS.white, 1.8, 36);
        P.burst(fx, y, fz, 80, COLORS.hit1, 0.07, 34, 40);
        this.shake = 0.08;
        this.koCam = 120;
        break;
      case 'land':
      case 'jump':
        P.burst(fx, 0.04, fz, 5, COLORS.dust, 0.012, 22, 12, 0);
        break;
      case 'projectile':
        R.spawn(x, y, z, this.glowOf(e.side, f.char), 0.45, 10);
        break;
      case 'burnout':
        P.burst(fx, 1.3, fz, 30, COLORS.smoke, 0.02, 40, 30, -0.0008);
        break;
      case 'dizzy':
        R.spawn(fx, 1.8, fz, COLORS.star, 0.6, 16);
        break;
    }
  }

  render(m: MatchState) {
    // effects step at most 6 frames per render; camera timers count every frame that passed
    const passed = Math.max(0, m.frame - this.lastFrame);
    const frames = Math.min(6, passed);
    this.lastFrame = m.frame;
    if (!this.sides.length) return;
    m.fighters.forEach((f, side) => this.placeSide(m, f, side, frames));
    this.auras(m, frames);
    this.syncProjectiles(m, frames);
    this.particles.update(frames);
    this.stage.update(frames);
    this.updateCamera(m, frames, passed);
    this.rings.update(frames, this.camera);
    this.drawBoxes(m);
    if (this.low) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }

  private fighterView(f: FighterState): AnimView {
    const h = f.hist[f.hist.length - 1];
    const mx = h?.mx ?? 0;
    const mz = h?.mz ?? 0;
    return {
      state: f.state,
      stateFrame: f.stateFrame,
      mv: f.state === 'move' ? moveOf(f) : null,
      moveFrame: f.moveFrame,
      vy: f.vy,
      y: f.y,
      stun: f.stun,
      lastStunKind: f.lastStunKind,
      runFwd: (mx * f.fx + mz * f.fz) * U * U,
      runSide: (mx * f.fz - mz * f.fx) * U * U,
      dashSide: -f.dashSide,
    };
  }

  private assistView(m: MatchState, a: AssistState): AnimView {
    return {
      state: a.state,
      stateFrame: a.stateFrame,
      mv: a.state === 'attack' ? assistMove(m, a) : null,
      moveFrame: a.moveFrame,
      vy: a.state === 'leave' ? 900 - a.stateFrame * 40 : a.vy,
      y: a.y,
      stun: 0,
      lastStunKind: '',
      runFwd: 0,
      runSide: 0,
      dashSide: 0,
    };
  }

  private pose(body: Body, view: AnimView, frame: number, x: number, y: number, z: number, fx: number, fz: number) {
    const a = body.anim.update(view, frame);
    solve(a.pose, this.solved);
    body.rig.apply(this.solved);
    body.group.visible = true;
    body.group.position.set(x, y, z);
    body.rig.root.rotation.set((a.lean * Math.PI) / 180, Math.atan2(fx, fz) + ((a.yaw + a.spin) * Math.PI) / 180, 0, 'YXZ');
  }

  private placeSide(m: MatchState, f: FighterState, side: number, frames: number) {
    const view = this.sides[side];
    const body = view.bodies[f.char] ?? view.bodies[0];
    let x = f.x * M;
    // the hit fighter shakes during hitstop
    if (m.freeze > 0 && (f.state === 'hitstun' || f.state === 'juggle' || f.state === 'blockstun') && f.stateFrame === 0) x += (m.frame % 2 ? 1 : -1) * 0.018;
    this.pose(body, this.fighterView(f), m.frame, x, f.y * M, f.z * M, f.fx, f.fz);
    body.flash = Math.max(0, body.flash - frames * 0.18);
    body.rig.setTint(f.burnout, body.flash);
    // the partner: on assist, leaping away after a tag, or off screen
    if (view.bodies.length < 2) return;
    const partner = view.bodies[1 - f.char];
    const a = m.assists[side];
    if (a) {
      this.pose(partner, this.assistView(m, a), m.frame, a.x * M, a.y * M, a.z * M, a.fx, a.fz);
      partner.rig.setTint(false, a.state === 'hit' ? 0.6 : 0);
      view.ghost = null;
    } else if (view.ghost && view.ghost.frames > 0) {
      const g = view.ghost;
      g.frames -= frames;
      const t = 26 - g.frames;
      const back = t * 0.09;
      const gv: AnimView = { state: 'leave', stateFrame: t, mv: null, moveFrame: 0, vy: 900 - t * 60, y: 0, stun: 0, lastStunKind: '', runFwd: 0, runSide: 0, dashSide: 0 };
      this.pose(partner, gv, m.frame, g.x * M - g.fx * U * back, Math.max(0, t * 0.16 - t * t * 0.002), g.z * M - g.fz * U * back, g.fx, g.fz);
    } else partner.group.visible = false;
  }

  private syncProjectiles(m: MatchState, frames: number) {
    this.orbs.sync(
      m.projectiles.map((p) => {
        const color = p.kind === 'bolt' ? COLORS.bolt : p.kind === 'seeker' ? COLORS.seeker : this.glowOf(p.owner, p.kit);
        if (frames && Math.random() < 0.9) this.particles.emit(p.x * M, p.y * M + (Math.random() - 0.5) * 0.12, p.z * M, -p.dx * U * 0.01, 0, -p.dz * U * 0.01, color, 34, 12, 0);
        return { x: p.x * M, y: p.y * M, z: p.z * M, dx: p.dx, dz: p.dz, color, t: p.age, size: p.kind === 'bolt' ? 0.7 : p.kind === 'seeker' ? 1.25 : 1, stretch: p.kind === 'bolt' ? 2.4 : 1 };
      }),
    );
    const clash = m.clash;
    let point: { x: number; y: number; z: number; t: number } | null = null;
    if (clash) {
      const a = m.beams[clash.beams[0]];
      const b = m.beams[clash.beams[1]];
      if (a && b) {
        const u = clash.pos / 1000;
        point = { x: (a.x + (b.x - a.x) * u) * M, y: ((a.y + b.y) / 2) * M, z: (a.z + (b.z - a.z) * u) * M, t: m.frame };
        if (frames) this.particles.burst(point.x, point.y, point.z, 6, COLORS.clash, 0.05, 30, 14, 0);
      }
    }
    this.beams.sync(
      m.beams.map((b) => {
        const mv = STYLES[m.fighters[b.owner].style].kits[b.kit].moves[b.moveId];
        let lenM = b.len * M;
        if (point && b.clashing) lenM = Math.hypot(point.x - b.x * M, point.z - b.z * M);
        return { x: b.x * M, y: b.y * M, z: b.z * M, dx: b.dx, dz: b.dz, len: lenM, width: (mv.beam?.width ?? 2000) * M, color: this.glowOf(b.owner, b.kit) };
      }),
      point,
      m.frame,
    );
  }

  private auras(m: MatchState, frames: number) {
    if (!frames) return;
    const P = this.particles;
    const r = () => Math.random() - 0.5;
    m.fighters.forEach((f) => {
      const x = f.x * M;
      const y = f.y * M;
      const z = f.z * M;
      if (f.state === 'move' && f.moveId === 'drive_rush') {
        for (let i = 0; i < 3; i++) P.emit(x + r() * 0.3, y + 0.3 + Math.random() * 1.2, z + r() * 0.3, -f.fx * U * 0.03, 0, -f.fz * U * 0.03, COLORS.drive, 34, 14, 0);
      }
      if (f.state === 'dash' || f.state === 'airdash') {
        const c = this.glowOf(f.side, f.char);
        for (let i = 0; i < 2; i++) P.emit(x + r() * 0.3, y + 0.3 + Math.random() * 1.2, z + r() * 0.3, -f.fx * U * 0.03, 0, -f.fz * U * 0.03, c, 30, 12, 0);
      }
      if (f.fromDriveRush) P.emit(x + r() * 0.3, y + 0.4 + Math.random(), z + r() * 0.3, -f.fx * U * 0.02, 0, -f.fz * U * 0.02, COLORS.drive, 26, 10, 0);
      if (f.state === 'parry') {
        const a = Math.random() * Math.PI * 2;
        P.emit(x + f.fx * U * 0.25 + Math.cos(a) * 0.4, y + 1.0 + Math.sin(a) * 0.7, z + f.fz * U * 0.25, 0, 0, 0, COLORS.parry, 26, 8, 0);
      }
      if (f.state === 'guard') P.emit(x + f.fx * U * 0.35 + r() * 0.3, y + 0.6 + Math.random() * 0.9, z + f.fz * U * 0.35 + r() * 0.3, 0, 0.004, 0, COLORS.block, 18, 8, 0);
      if (f.state === 'dizzy' && m.frame % 4 === 0) {
        const a = m.frame * 0.15;
        P.emit(x + Math.cos(a) * 0.25, y + 1.85, z + Math.sin(a) * 0.25, 0, 0, 0, COLORS.star, 34, 10, 0);
      }
      if (f.burnout && m.frame % 6 === 0) P.emit(x + r() * 0.3, y + 1.5, z, 0, 0.006, 0, COLORS.smoke, 40, 30, -0.0002);
    });
  }

  private updateCamera(m: MatchState, frames: number, passed: number) {
    const [a, b] = m.fighters;
    // the camera looks into the screen, across the line between the fighters
    const ax = m.ax * U;
    const az = m.az * U;
    const ix = az;
    const iz = -ax;
    let tx = ((a.x + b.x) / 2) * M;
    let tz = ((a.z + b.z) / 2) * M;
    let ty = 1.0 + Math.max(a.y, b.y) * M * 0.35;
    const sep = Math.hypot((a.x - b.x) * M, (a.z - b.z) * M);
    let dist = Math.min(17, Math.max(5.4, 2.6 + sep * 1.05));
    let height = 0.55 + dist * 0.13;
    let px = tx - ix * dist;
    let pz = tz - iz * dist;
    let k = 0.12;
    const as = m.assists.find((x) => x);
    if (as) {
      // keep a partner on assist in view
      tx = tx * 0.8 + as.x * M * 0.2;
      tz = tz * 0.8 + as.z * M * 0.2;
      px = tx - ix * dist;
      pz = tz - iz * dist;
    }
    if (m.clash) {
      const ca = m.beams[m.clash.beams[0]];
      const cb = m.beams[m.clash.beams[1]];
      if (ca && cb) {
        tx = ((ca.x + cb.x) / 2) * M;
        tz = ((ca.z + cb.z) / 2) * M;
        dist = Math.max(dist, 7);
        px = tx - ix * dist;
        pz = tz - iz * dist;
      }
    } else if (this.superCam.frames > 0) {
      // a close shot from in front of the fighter, a little to the camera's side
      const f = m.fighters[this.superCam.side];
      const fx = f.fx * U;
      const fz = f.fz * U;
      const dx = fx * 0.75 - ix * 0.66;
      const dz = fz * 0.75 - iz * 0.66;
      const l = Math.hypot(dx, dz) || 1;
      tx = f.x * M + fx * 0.3;
      tz = f.z * M + fz * 0.3;
      ty = 1.15 + f.y * M;
      px = f.x * M + (dx / l) * 3.4;
      pz = f.z * M + (dz / l) * 3.4;
      height = 0.35;
      k = 0.25;
      this.superCam.frames -= passed;
    } else if (this.koCam > 0) {
      dist *= 0.85;
      px = tx - ix * dist;
      pz = tz - iz * dist;
      this.koCam -= passed;
    }
    const py = ty + height;
    if (!this.cam.ready) {
      Object.assign(this.cam, { x: tx, y: ty, z: tz, px, py, pz, ready: true });
    }
    const s = 1 - Math.pow(1 - k, Math.max(1, frames));
    const c = this.cam;
    c.x += (tx - c.x) * s;
    c.y += (ty - c.y) * s;
    c.z += (tz - c.z) * s;
    c.px += (px - c.px) * s;
    c.py += (py - c.py) * s;
    c.pz += (pz - c.pz) * s;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.0005) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.82, Math.max(1, frames));
    }
    this.camera.position.set(c.px + sx, c.py + sy, c.pz + sx);
    this.camera.lookAt(c.x, c.y, c.z);
  }

  private drawBoxes(m: MatchState) {
    this.debug.visible = this.showBoxes;
    if (!this.showBoxes) return;
    let nh = 0;
    let nb = 0;
    const hurt = (x: number, z: number, r: number, y0: number, y1: number) => {
      const w = this.hurtWires[nh++];
      if (!w) return;
      w.visible = true;
      w.position.set(x * M, ((y0 + y1) / 2) * M, z * M);
      w.scale.set(r * M, (y1 - y0) * M, r * M);
    };
    const hit = (ox: number, oz: number, oy: number, fx: number, fz: number, f0: number, f1: number, y0: number, y1: number, hw: number, color: string) => {
      const b = this.hitWires[nb++];
      if (!b) return;
      b.visible = true;
      const mid = (f0 + f1) / 2;
      b.position.set((ox + fx * U * mid) * M, (oy + (y0 + y1) / 2) * M, (oz + fz * U * mid) * M);
      b.rotation.set(0, Math.atan2(fx, fz), 0);
      b.scale.set(hw * 2 * M, (y1 - y0) * M, (f1 - f0) * M);
      (b.material as THREE.LineBasicMaterial).color.set(color);
    };
    for (const f of m.fighters) {
      for (const h of hurtboxes(f)) hurt(h.x, h.z, h.r, h.y0, h.y1);
      if (f.state === 'move') {
        const mv = moveOf(f);
        const box = mv.hitbox;
        if (box && f.moveFrame >= mv.startup && f.moveFrame < mv.startup + mv.active) hit(f.x, f.z, f.y, f.fx, f.fz, box.f0, box.f1, box.y0, box.y1, box.hw, mv.kind === 'throw' ? '#3dff8e' : '#ff3b3b');
      }
    }
    for (let i = nh; i < this.hurtWires.length; i++) this.hurtWires[i].visible = false;
    for (let i = nb; i < this.hitWires.length; i++) this.hitWires[i].visible = false;
  }
}
