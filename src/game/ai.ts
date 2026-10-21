// The CPU opponent and the training dummy. Both read the match state and return raw input bits, exactly
// like a player's controller, so the simulation can't tell them apart.

import { IN } from '../sim/input';
import { actionable, isRage, moveOf } from '../sim/match';
import type { FighterState, MatchState, TrainingOptions } from '../sim/types';

const { UP, DOWN, LEFT, RIGHT, B1, B2, B3, B4, B5, B6 } = IN;
// symbolic directions, resolved against the fighter's facing when the input is sent
const F = 1 << 14;
const B = 1 << 15;

type Step = [bits: number, frames: number];

function resolve(bits: number, facing: 1 | -1): number {
  let out = bits & ~(F | B);
  if (bits & F) out |= facing === 1 ? RIGHT : LEFT;
  if (bits & B) out |= facing === 1 ? LEFT : RIGHT;
  return out;
}

const QCF = (btn: number): Step[] => [[DOWN, 1], [DOWN | F, 1], [F | btn, 2]];
const DP = (btn: number): Step[] => [[F, 1], [0, 1], [DOWN, 1], [DOWN | F | btn, 2]];
const QCB = (btn: number): Step[] => [[DOWN, 1], [DOWN | B, 1], [B | btn, 2]];
const tap = (bits: number, hold = 2): Step[] => [[bits, hold]];
const wait = (n: number): Step[] => [[0, n]];

interface Plans {
  far: Array<() => Step[]>;
  mid: Array<() => Step[]>;
  close: Array<() => Step[]>;
  antiAir: () => Step[];
  punish: () => Step[];
}

// far: over 15 m-units away, mid: closing the gap, close: inside poke range (about 0.9 m)
const STREET: Plans = {
  far: [
    () => [...QCF(B3), ...wait(20)],
    () => [[F, 22]] as Step[],
    () => [[F, 14]] as Step[],
    () => [[UP | F, 3], ...wait(14), ...tap(B6), ...wait(14), ...tap(DOWN | B5), ...wait(4), ...QCF(B3)],
  ],
  mid: [
    () => [[F, 14]] as Step[],
    () => [[F, 10]] as Step[],
    () => [...QCF(B2), ...wait(16)],
    () => [[F, 1], [0, 1], [F, 10]] as Step[],
    () => [...tap(B3 | B6), ...wait(40)],
    () => [[UP | F, 3], ...wait(14), ...tap(B6), ...wait(14), ...tap(DOWN | B5), ...wait(4), ...QCF(B3)],
  ],
  close: [
    () => [...tap(DOWN | B5), ...wait(4), ...QCF(B3), ...wait(10)],
    () => [...tap(B5), ...wait(18)],
    () => [...tap(B1), ...wait(4), ...tap(B1), ...wait(4), ...tap(DOWN | B5), ...wait(4), ...QCF(B3)],
    () => [...tap(B3), ...wait(10), ...tap(B6), ...wait(30)],
    () => [...tap(B1 | B4), ...wait(30)],
    () => [...tap(DOWN | B4), ...wait(4), ...tap(DOWN | B1), ...wait(6), ...QCB(B5)],
    () => [...tap(F | B2), ...wait(24)],
    () => [[B, 10]] as Step[],
    () => [...tap(DOWN | B6), ...wait(30)],
    () => [[DOWN | B, 16]] as Step[],
  ],
  antiAir: () => [...DP(B3), ...wait(30)],
  punish: () => [...tap(B3), ...wait(8), ...QCF(B3)],
};

// Iron limbs: 1 = B1, 2 = B2, 3 = B4, 4 = B5, Heat = B3
const IRON: Plans = {
  far: [
    () => [[F, 1], [0, 1], [F, 14]] as Step[],
    () => [[F, 20]] as Step[],
    () => [[F, 12]] as Step[],
    () => [[0, 12]] as Step[],
  ],
  mid: [
    () => [[F, 1], [0, 1], [F, 8]] as Step[],
    () => [[F, 14]] as Step[],
    () => [[F, 1], [0, 1], [F, 6], ...tap(F | B2), ...wait(20)],
    () => [[F, 1], [0, 1], [F, 6], ...tap(DOWN | F | B1), ...wait(12)],
    () => [[0, 10]] as Step[],
  ],
  close: [
    () => [...tap(B1), ...wait(4), ...tap(B2), ...wait(6), ...tap(B5), ...wait(24)],
    () => [...tap(DOWN | F | B1), ...wait(14)],
    () => [...tap(DOWN | F | B1), ...wait(10), ...tap(DOWN | F | B1), ...wait(12)],
    () => [...tap(DOWN | F | B2), ...wait(22), ...tap(B1), ...wait(6), ...tap(B1), ...wait(3), ...tap(B2), ...wait(14), ...tap(B4), ...wait(5), ...tap(B2), ...wait(22), ...tap(F | B2)],
    () => [[F, 1], [0, 1], [DOWN, 1], [DOWN | F | B2, 2], ...wait(26), ...tap(B4), ...wait(5), ...tap(B2), ...wait(20)],
    () => [...tap(B1 | B4), ...wait(30)],
    () => [...tap(DOWN | B5), ...wait(16)],
    () => [...tap(DOWN | F | B5), ...wait(20)],
    () => [...tap(F | B2), ...wait(24)],
    () => [...tap(B5), ...wait(20)],
    () => [...tap(DOWN | B, 2), ...tap(DOWN | B | B4), ...wait(30)],
    () => [[DOWN, 1], [0, 1], [DOWN, 1], ...wait(18)],
    () => [[0, 14]] as Step[],
  ],
  antiAir: () => [...tap(UP | F | B5), ...wait(26)],
  punish: () => [...tap(DOWN | F | B2), ...wait(24), ...tap(B4), ...wait(5), ...tap(B2), ...wait(20)],
};

export class Cpu {
  private queue: Step[] = [];
  private hold = 0;
  private cooldown = 0;
  private blockFor = 0;
  private dodgeRoll = -1;
  constructor(private side: 0 | 1, public level = 1) {}

  reset() {
    this.queue = [];
    this.hold = 0;
    this.cooldown = 0;
    this.blockFor = 0;
  }

  think(m: MatchState): number {
    const me = m.fighters[this.side];
    const op = m.fighters[1 - this.side];
    const facing = me.facing;
    if (m.phase !== 'fight') {
      this.reset();
      return 0;
    }
    // a fireball about to arrive interrupts walking and waiting (not attacks already being input)
    const skill0 = [0.35, 0.6, 0.85][this.level] ?? 0.6;
    const eta = projectileEta(m, me);
    if (eta >= 0 && eta <= 12 && (!this.queue.length || (this.queue[0][0] & (B1 | B2 | B3 | B4 | B5 | B6)) === 0) && actionable(me)) {
      if (this.dodgeRoll < 0) this.dodgeRoll = Math.random();
      if (this.dodgeRoll < skill0) {
        this.queue = [];
        if (me.style === 'iron' && eta <= 9 && eta >= 2 && this.dodgeRoll < skill0 * 0.8) this.plan([[DOWN, 1], [0, 1], [DOWN, 1], ...wait(16)]);
        else this.blockFor = Math.max(this.blockFor, eta + 10);
      }
    } else if (eta < 0) this.dodgeRoll = -1;
    // finish the current plan
    if (this.queue.length) {
      const step = this.queue[0];
      const bits = step[0];
      if (++this.hold >= step[1]) {
        this.queue.shift();
        this.hold = 0;
      }
      return resolve(bits, facing);
    }
    // grabbed: try to tech (reaction-based, so not every time)
    if (me.state === 'thrown') {
      if (me.stateFrame >= 3 && Math.random() < (skill0 * 0.6) / 4) return B1 | B4;
      return 0;
    }
    // defence: block attacks that are coming
    if (this.blockFor > 0) {
      this.blockFor--;
      return resolve(guardFor(me, op), facing);
    }
    if (!actionable(me)) return 0;
    const dist = Math.abs(op.x - me.x);
    const threat = isThreat(op, me, dist, m);
    const skill = [0.35, 0.6, 0.85][this.level] ?? 0.6;
    if (threat && Math.random() < skill * 0.55) {
      this.blockFor = 14 + Math.floor(Math.random() * 10);
      return resolve(guardFor(me, op), facing);
    }
    // a fireball still far away: Street jumps over it now and then
    if (me.style === 'street' && eta > 14 && eta < 26 && dist > 12000 && Math.random() < skill * 0.15) {
      this.plan([[UP | F, 3], ...wait(14), ...tap(B6), ...wait(10)]);
      return this.think(m);
    }
    // a Drive Impact winding up: get out of the way or throw it
    if (op.state === 'move' && moveOf(op).tag === 'driveImpact' && op.moveFrame < 18 && Math.random() < skill) {
      if (dist < 6000) this.plan([...tap(B1 | B4), ...wait(30)]);
      else if (me.style === 'iron') this.plan([[DOWN, 1], [0, 1], [DOWN, 1], ...wait(20)]);
      else this.plan([[B, 1], [0, 1], [B, 1], ...wait(20)]);
      return this.think(m);
    }
    if (this.cooldown-- > 0) return 0;
    const ai = me.style === 'iron' ? IRON : STREET;
    // meter and comeback tools
    if (me.style === 'iron') {
      if (isRage(me) && dist < 7000 && Math.random() < 0.25) {
        this.plan([[DOWN | F | B1 | B2, 2], ...wait(50)]);
        return this.think(m);
      }
      if (me.heatTimer > 0 && dist < 8000 && Math.random() < 0.18) {
        this.plan([...tap(B3), ...wait(40)]);
        return this.think(m);
      }
      if (me.heatAvailable && me.heatTimer <= 0 && dist < 9000 && Math.random() < 0.1) {
        this.plan([...tap(B3), ...wait(34)]);
        return this.think(m);
      }
    } else if (me.superMeter >= 10000 && dist < 7500 && Math.random() < 0.12) {
      const btn = me.superMeter >= 30000 ? B3 : B6;
      this.plan([[DOWN, 1], [DOWN | F, 1], [F, 1], [DOWN, 1], [DOWN | F, 1], [F | btn, 2], ...wait(50)]);
      return this.think(m);
    }
    // punish a whiffed or blocked unsafe move
    if (op.state === 'move' && op.moveFrame > moveOf(op).startup + moveOf(op).active && dist < 9000 && Math.random() < skill * 0.7) {
      this.plan(ai.punish());
      return this.think(m);
    }
    // anti-air a jump-in when it's about to land in front (falling, within reach)
    if ((op.state === 'air' || (op.y > 4000 && op.state === 'move')) && op.vy < 300 && dist < 9500 && Math.random() < skill * 0.6) {
      this.plan(ai.antiAir());
      return this.think(m);
    }
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    if (Math.random() < 0.22) {
      this.cooldown = 4 + Math.floor(Math.random() * 14);
      return 0;
    }
    // Iron against a crouching opponent: mids (highs would whiff)
    if (me.style === 'iron' && op.crouching && dist < 9000 && Math.random() < skill) {
      const mids: Step[][] = [
        [...tap(DOWN | F | B1), ...wait(12)],
        [...tap(DOWN | F | B5), ...wait(18)],
        [...tap(F | B2), ...wait(24)],
        [...tap(DOWN | F | B2), ...wait(22), ...tap(B4), ...wait(5), ...tap(B2), ...wait(20)],
      ];
      this.plan(pick(mids));
      this.cooldown = [18, 9, 4][this.level] ?? 9;
      return this.think(m);
    }
    const zone = dist > 15000 ? ai.far : dist > 9000 ? ai.mid : ai.close;
    this.plan(pick(zone)());
    this.cooldown = [18, 9, 4][this.level] ?? 9;
    return this.think(m);
  }

  private plan(steps: Step[]) {
    this.queue = steps.map((s): Step => [s[0], s[1]]);
    this.hold = 0;
  }
}

// frames until the nearest enemy projectile reaches this fighter, or -1
function projectileEta(m: MatchState, me: FighterState): number {
  let best = -1;
  for (const p of m.projectiles) {
    if (p.owner === me.side || p.dodged || Math.sign(p.vx) !== Math.sign(me.x - p.x)) continue;
    const eta = Math.max(0, (Math.abs(p.x - me.x) - 3300) / Math.abs(p.vx));
    if (best < 0 || eta < best) best = eta;
  }
  // a fireball still in its startup: read the throwing motion
  const op = m.fighters[1 - me.side];
  if (op.state === 'move') {
    const mv = moveOf(op);
    if (mv.projectile && op.moveFrame < mv.startup) {
      const travel = Math.max(0, Math.abs(op.x - me.x) - mv.projectile.spawnX - 3300) / mv.projectile.speed;
      const eta = mv.startup - op.moveFrame + travel;
      if (best < 0 || eta < best) best = eta;
    }
  }
  return best;
}

function isThreat(op: FighterState, me: FighterState, dist: number, m: MatchState) {
  if (op.state === 'move') {
    const mv = moveOf(op);
    if (mv.hitbox && op.moveFrame <= mv.startup + mv.active && dist < (mv.hitbox.x + mv.hitbox.w) + 3500) return true;
  }
  return m.projectiles.some((p) => p.owner !== me.side && Math.abs(p.x - me.x) < 9000);
}

function guardFor(me: FighterState, op: FighterState): number {
  const low = op.state === 'move' && moveOf(op).height === 'low';
  const overhead = op.state === 'move' && (moveOf(op).height === 'overhead' || op.y > 0);
  if (me.style === 'iron') return low ? DOWN : overhead ? 0 : 0;
  return low ? DOWN | B : overhead ? B : B;
}

// training dummy behaviours
export class Dummy {
  private blockTimer = 0;
  private cpu: Cpu;
  constructor(private side: 0 | 1) {
    this.cpu = new Cpu(side, 1);
  }

  think(m: MatchState, opts: TrainingOptions): number {
    const me = m.fighters[this.side];
    const op = m.fighters[1 - this.side];
    switch (opts.dummy) {
      case 'stand':
        return 0;
      case 'crouch':
        return DOWN;
      case 'jump':
        return actionable(me) ? UP : 0;
      case 'cpu':
        return this.cpu.think(m);
      case 'block':
        return resolve(guardFor(me, op), me.facing);
      case 'blockAfterFirst': {
        if (me.state === 'hitstun' || me.state === 'juggle') this.blockTimer = 50;
        if (this.blockTimer > 0) {
          this.blockTimer--;
          return resolve(guardFor(me, op), me.facing);
        }
        return 0;
      }
    }
  }
}
