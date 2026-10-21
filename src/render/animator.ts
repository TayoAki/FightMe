// Picks a pose for a fighter from its simulation state: a clip per state, keyframes per move (built from the
// move's startup, active and recovery frames), and a short blend when the state changes.

import { STYLES, totalFrames } from '../sim/styles';
import type { FighterState, MoveDef } from '../sim/types';
import { CRUMPLE_FRAMES, GETUP_FRAMES } from '../sim/constants';
import { CROUCH_POSES, POSES } from './poses';
import { copyPose, lerpPose, type PoseSpec } from './rig';

const P = POSES;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function mix(a: PoseSpec, b: PoseSpec, t: number, out: PoseSpec) {
  return lerpPose(a, b, smooth(clamp01(t)), out);
}

function keyed(keys: Array<[number, PoseSpec]>, t: number, out: PoseSpec) {
  if (t <= keys[0][0]) return lerpPose(keys[0][1], keys[0][1], 0, out);
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (t <= t1) return mix(a, b, t1 === t0 ? 1 : (t - t0) / (t1 - t0), out);
  }
  const last = keys[keys.length - 1][1];
  return lerpPose(last, last, 0, out);
}

const crouchMoves = new Set<string>();
for (const st of Object.values(STYLES)) for (const id of Object.values(st.normals.crouch)) crouchMoves.add(id);

function moveKeys(mv: MoveDef): Array<[number, PoseSpec]> {
  const base = mv.air ? P.jumpUp : CROUCH_POSES.has(mv.pose) || crouchMoves.has(mv.id) ? P.crouch : P.stance;
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

export interface AnimFrame {
  pose: PoseSpec;
  spin: number;
  side: number;
  lean: number;
}

export class Animator {
  private out = copyPose(P.stance);
  private from = copyPose(P.stance);
  private target = copyPose(P.stance);
  private key = '';
  private blend = 1;
  private blendFrames = 3;
  private lastFrame = 0;

  update(f: FighterState, frame: number): AnimFrame {
    let spin = 0;
    let side = 0;
    let lean = 0;
    const t = this.target;
    let key: string = f.state;
    let blendFrames = 4;
    switch (f.state) {
      case 'idle': {
        const ph = (Math.sin((frame / 70) * Math.PI * 2) + 1) / 2;
        lerpPose(P.stance, P.stance2, ph, t);
        break;
      }
      case 'walkF':
      case 'walkB': {
        const cyc = [P.walk1, P.walk2, P.walk3, P.walk4];
        const len = 28;
        let u = (f.stateFrame % len) / len;
        if (f.state === 'walkB') u = 1 - u;
        const i = Math.floor(u * 4);
        mix(cyc[i], cyc[(i + 1) % 4], u * 4 - i, t);
        break;
      }
      case 'crouch':
        lerpPose(P.crouch, P.crouch, 0, t);
        blendFrames = 3;
        break;
      case 'prejump':
      case 'land':
        lerpPose(P.land, P.land, 0, t);
        blendFrames = 2;
        break;
      case 'air': {
        mix(P.jumpUp, P.jumpFall, (600 - f.vy) / 1400, t);
        if (f.jumpDir !== 0) spin = 0;
        break;
      }
      case 'dash':
        lerpPose(P.dash, P.dash, 0, t);
        break;
      case 'backdash':
        lerpPose(P.backdash, P.backdash, 0, t);
        break;
      case 'move': {
        const mv = STYLES[f.style].moves[f.moveId];
        if (!mv) break;
        key = `move:${mv.id}`;
        blendFrames = 2;
        let keys = keyCache.get(mv);
        if (!keys) keyCache.set(mv, (keys = moveKeys(mv)));
        keyed(keys, f.moveFrame, t);
        if (mv.spin) {
          const s0 = Math.max(1, mv.startup - 3);
          const s1 = mv.startup + mv.active;
          spin = mv.spin * 360 * clamp01((f.moveFrame - s0) / (s1 - s0));
        }
        if (mv.tag === 'evade') side = Math.sin(clamp01(f.moveFrame / 20) * Math.PI) * 0.55;
        break;
      }
      case 'hitstun': {
        const base = f.lastStunKind === 'crouch' ? P.hitCrouch : f.lastStunKind === 'low' ? P.hitLow : P.hitHigh;
        const rest = f.lastStunKind === 'crouch' ? P.crouch : P.stance;
        const total = f.stateFrame + f.stun;
        mix(base, rest, (f.stateFrame / Math.max(1, total) - 0.45) / 0.55, t);
        key = `hit:${f.lastStunKind}`;
        blendFrames = 1;
        break;
      }
      case 'blockstun':
        lerpPose(f.blockHeight === 'crouch' ? P.blockCrouch : P.blockStand, P.stance, 0, t);
        blendFrames = 1;
        break;
      case 'stagger':
        lerpPose(P.stagger, P.stagger, 0, t);
        blendFrames = 2;
        break;
      case 'juggle':
      case 'ko':
        if (f.y > 0 || f.vy > 0) {
          lerpPose(P.juggle, P.juggle, 0, t);
          lean = Math.max(-40, Math.min(30, -f.vy / 40));
          blendFrames = 2;
        } else lerpPose(P.down, P.down, 0, t);
        break;
      case 'knockdown':
        lerpPose(P.down, P.down, 0, t);
        blendFrames = 5;
        break;
      case 'getup': {
        const u = f.stateFrame / GETUP_FRAMES;
        if (u < 0.5) mix(P.down, P.getup, u * 2, t);
        else mix(P.getup, P.stance, (u - 0.5) * 2, t);
        break;
      }
      case 'wallsplat':
        lerpPose(P.wallsplat, P.wallsplat, 0, t);
        blendFrames = 2;
        break;
      case 'crumple': {
        const u = f.stateFrame / CRUMPLE_FRAMES;
        if (u < 0.35) mix(P.hitLow, P.crumple, u / 0.35, t);
        else if (u < 0.82) lerpPose(P.crumple, P.crumple, 0, t);
        else mix(P.crumple, P.down, (u - 0.82) / 0.18, t);
        break;
      }
      case 'dizzy': {
        const ph = (Math.sin((f.stateFrame / 50) * Math.PI * 2) + 1) / 2;
        lerpPose(P.dizzy1, P.dizzy2, ph, t);
        break;
      }
      case 'thrown':
        lerpPose(P.thrown, P.thrown, 0, t);
        blendFrames = 2;
        break;
      case 'throwing':
        if (f.stateFrame < 9) lerpPose(P.throwHold, P.throwHold, 0, t);
        else mix(P.throwHold, P.throwToss, (f.stateFrame - 9) / 6, t);
        blendFrames = 2;
        break;
      case 'parry':
        lerpPose(P.parry, P.parry, 0, t);
        blendFrames = 2;
        break;
      case 'parryEnd':
        mix(P.parry, P.stance, f.stateFrame / 6, t);
        break;
      case 'win':
        lerpPose(P.win, P.win, 0, t);
        blendFrames = 8;
        break;
    }

    if (key !== this.key) {
      this.key = key;
      lerpPose(this.out, this.out, 0, this.from);
      this.blend = 0;
      this.blendFrames = blendFrames;
    }
    if (frame !== this.lastFrame) {
      this.blend = Math.min(1, this.blend + (frame - this.lastFrame) / this.blendFrames);
      this.lastFrame = frame;
    }
    if (this.blend < 1) lerpPose(this.from, t, smooth(this.blend), this.out);
    else lerpPose(t, t, 0, this.out);
    return { pose: this.out, spin, side, lean };
  }
}
