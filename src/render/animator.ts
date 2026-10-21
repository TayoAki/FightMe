// Picks a pose for a fighter (or a Tag partner on assist) from its simulation state: a clip per state,
// keyframes per move (built from the move's startup, active and recovery frames), and a short blend when
// the state changes.

import { CRUMPLE_FRAMES, GETUP_FRAMES } from '../sim/constants';
import { totalFrames } from '../sim/styles';
import type { MoveDef } from '../sim/types';
import { CROUCH_POSES, POSES } from './poses';
import { copyPose, lerpPose, type PoseSpec } from './rig';

const P = POSES;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function mix(a: PoseSpec, b: PoseSpec, t: number, out: PoseSpec) {
  return lerpPose(a, b, smooth(clamp01(t)), out);
}

const hold = (a: PoseSpec, out: PoseSpec) => lerpPose(a, a, 0, out);

function keyed(keys: Array<[number, PoseSpec]>, t: number, out: PoseSpec) {
  if (t <= keys[0][0]) return hold(keys[0][1], out);
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) return mix(a, b, t1 === t0 ? 1 : (t - t0) / (t1 - t0), out);
  }
  return hold(keys[keys.length - 1][1], out);
}

function moveKeys(mv: MoveDef): Array<[number, PoseSpec]> {
  const base = mv.air ? P.jumpUp : CROUCH_POSES.has(mv.pose) ? P.crouch : P.stance;
  if (mv.keys) return mv.keys.map(([t, name]) => [t, P[name] ?? base]);
  const strike = P[mv.pose] ?? base;
  const S = mv.startup;
  const A = mv.active;
  const T = totalFrames(mv);
  const keys: Array<[number, PoseSpec]> = [[0, base]];
  if (mv.windup && P[mv.windup] && S > 3) keys.push([Math.max(1, Math.round(S * 0.62)), P[mv.windup]]);
  keys.push([Math.max(1, S - (S > 6 ? 1 : 0)), strike]);
  keys.push([S + A - 1 + Math.min(4, Math.round(mv.recovery * 0.25)), strike]);
  keys.push([Math.max(S + A + 1, T), base]);
  return keys;
}

const keyCache = new Map<MoveDef, Array<[number, PoseSpec]>>();

// what the animator needs to know about a fighter or an assist
export interface AnimView {
  state: string;
  stateFrame: number;
  mv: MoveDef | null;
  moveFrame: number;
  vy: number;
  y: number;
  stun: number;
  lastStunKind: string;
  // the run direction in the fighter's own frame: forward and sideways parts, -1..1
  runFwd: number;
  runSide: number;
  dashSide: number;
}

export interface AnimFrame {
  pose: PoseSpec;
  spin: number;
  lean: number;
  // extra body turn in degrees (strafing and side dashes)
  yaw: number;
}

export class Animator {
  private out = copyPose(P.stance);
  private from = copyPose(P.stance);
  private target = copyPose(P.stance);
  private key = '';
  private blend = 1;
  private blendFrames = 3;
  private lastFrame = 0;
  private yaw = 0;
  private runPhase = 0;

  update(v: AnimView, frame: number): AnimFrame {
    let spin = 0;
    let lean = 0;
    let yaw = 0;
    const t = this.target;
    let key = v.state;
    let blendFrames = 4;
    switch (v.state) {
      case 'idle':
      case 'win': {
        if (v.state === 'win') {
          hold(P.win, t);
          blendFrames = 8;
          break;
        }
        const ph = (Math.sin((frame / 70) * Math.PI * 2) + 1) / 2;
        lerpPose(P.stance, P.stance2, ph, t);
        break;
      }
      case 'run': {
        const cyc = [P.walk1, P.walk2, P.walk3, P.walk4];
        // run backwards when backing off; turn into the direction when strafing
        const back = v.runFwd < -0.35;
        this.runPhase += (back ? -1 : 1) / 18;
        const u = ((this.runPhase % 1) + 1) % 1;
        const i = Math.floor(u * 4);
        mix(cyc[i], cyc[(i + 1) % 4], u * 4 - i, t);
        yaw = (Math.atan2(v.runSide, Math.abs(v.runFwd) + 0.001) * 180) / Math.PI * 0.6;
        if (back) yaw = -yaw;
        lean = back ? -4 : 6;
        break;
      }
      case 'guard':
      case 'blockstun':
        hold(P.blockStand, t);
        blendFrames = v.state === 'guard' ? 3 : 1;
        break;
      case 'prejump':
      case 'land':
        hold(P.land, t);
        blendFrames = 2;
        break;
      case 'air':
      case 'enter':
      case 'leave':
        mix(P.jumpUp, P.jumpFall, (600 - v.vy) / 1400, t);
        break;
      case 'dash':
      case 'airdash':
        hold(P.dash, t);
        lean = 10;
        blendFrames = 2;
        break;
      case 'dashEnd':
        mix(P.dash, P.stance, v.stateFrame / 7, t);
        break;
      case 'backdash':
        hold(P.backdash, t);
        break;
      case 'sidedash':
        hold(P.evade, t);
        yaw = 55 * v.dashSide;
        blendFrames = 2;
        break;
      case 'move':
      case 'attack': {
        const mv = v.mv;
        if (!mv) break;
        key = `move:${mv.id}`;
        blendFrames = 2;
        let keys = keyCache.get(mv);
        if (!keys) keyCache.set(mv, (keys = moveKeys(mv)));
        keyed(keys, v.moveFrame, t);
        if (mv.spin) {
          const s0 = Math.max(1, mv.startup - 3);
          const s1 = mv.startup + mv.active;
          spin = mv.spin * 360 * clamp01((v.moveFrame - s0) / (s1 - s0));
        }
        break;
      }
      case 'hitstun': {
        const base = v.lastStunKind === 'low' ? P.hitLow : P.hitHigh;
        const total = v.stateFrame + v.stun;
        mix(base, P.stance, (v.stateFrame / Math.max(1, total) - 0.45) / 0.55, t);
        key = `hit:${v.lastStunKind}`;
        blendFrames = 1;
        break;
      }
      case 'stagger':
        hold(P.stagger, t);
        blendFrames = 2;
        break;
      case 'juggle':
      case 'ko':
      case 'hit':
        if (v.y > 0 || v.vy > 0) {
          hold(P.juggle, t);
          lean = Math.max(-40, Math.min(30, -v.vy / 40));
          blendFrames = 2;
        } else hold(P.down, t);
        break;
      case 'knockdown':
        hold(P.down, t);
        blendFrames = 5;
        break;
      case 'getup': {
        const u = v.stateFrame / GETUP_FRAMES;
        if (u < 0.5) mix(P.down, P.getup, u * 2, t);
        else mix(P.getup, P.stance, (u - 0.5) * 2, t);
        break;
      }
      case 'wallsplat':
        hold(P.wallsplat, t);
        blendFrames = 2;
        break;
      case 'crumple': {
        const u = v.stateFrame / CRUMPLE_FRAMES;
        if (u < 0.35) mix(P.hitLow, P.crumple, u / 0.35, t);
        else if (u < 0.82) hold(P.crumple, t);
        else mix(P.crumple, P.down, (u - 0.82) / 0.18, t);
        break;
      }
      case 'dizzy': {
        const ph = (Math.sin((v.stateFrame / 50) * Math.PI * 2) + 1) / 2;
        lerpPose(P.dizzy1, P.dizzy2, ph, t);
        break;
      }
      case 'thrown':
        hold(P.thrown, t);
        blendFrames = 2;
        break;
      case 'throwing':
        if (v.stateFrame < 9) hold(P.throwHold, t);
        else mix(P.throwHold, P.throwToss, (v.stateFrame - 9) / 6, t);
        blendFrames = 2;
        break;
      case 'parry':
        hold(P.parry, t);
        blendFrames = 2;
        break;
      case 'parryEnd':
        mix(P.parry, P.stance, v.stateFrame / 6, t);
        break;
    }

    if (key !== this.key) {
      this.key = key;
      hold(this.out, this.from);
      this.blend = 0;
      this.blendFrames = blendFrames;
    }
    const dt = Math.max(0, frame - this.lastFrame);
    if (dt) {
      this.blend = Math.min(1, this.blend + dt / this.blendFrames);
      this.lastFrame = frame;
    }
    if (this.blend < 1) lerpPose(this.from, t, smooth(this.blend), this.out);
    else hold(t, this.out);
    // the body turn eases, so strafing doesn't snap
    this.yaw += (yaw - this.yaw) * Math.min(1, 0.3 * Math.max(1, dt));
    return { pose: this.out, spin, lean, yaw: this.yaw };
  }
}
