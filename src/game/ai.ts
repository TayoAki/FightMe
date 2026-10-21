// The CPU opponent and the training dummy. Both read the match state and return raw input bits, exactly
// like a player's controller, so the simulation can't tell them apart.

import { IN } from '../sim/input';
import { actionable, moveOf } from '../sim/match';
import { STYLES } from '../sim/styles';
import type { FighterState, MatchState, TrainingOptions } from '../sim/types';
import { len, norm } from '../sim/vec';

const { UP, DOWN, LEFT, RIGHT, L, H, S, J, G, D } = IN;
// symbolic directions, turned into stick bits against the camera when the input is sent
const T = 1 << 16; // toward the opponent
const A = 1 << 17; // away
const SIDE = 1 << 18; // circling one way
const SIDE2 = 1 << 19; // circling the other way
const SYMBOLIC = T | A | SIDE | SIDE2;

type Step = [bits: number, frames: number];

// stick bits that push the fighter along a ground direction, given the camera's axis
function stickFor(m: MatchState, wx: number, wz: number): number {
  const h = (wx * m.ax + wz * m.az) / (1024 * 1024);
  const v = (wx * m.az - wz * m.ax) / (1024 * 1024);
  let out = 0;
  if (h > 0.38) out |= RIGHT;
  if (h < -0.38) out |= LEFT;
  if (v > 0.38) out |= UP;
  if (v < -0.38) out |= DOWN;
  return out;
}

function resolve(m: MatchState, me: FighterState, bits: number): number {
  if (!(bits & SYMBOLIC)) return bits;
  const o = m.fighters[1 - me.side];
  const [ux, uz] = norm(o.x - me.x, o.z - me.z, me.fx, me.fz);
  let wx = 0;
  let wz = 0;
  if (bits & T) {
    wx += ux;
    wz += uz;
  }
  if (bits & A) {
    wx -= ux;
    wz -= uz;
  }
  if (bits & SIDE) {
    wx += -uz;
    wz += ux;
  }
  if (bits & SIDE2) {
    wx -= -uz;
    wz -= ux;
  }
  return (bits & ~SYMBOLIC) | stickFor(m, wx, wz);
}

const tap = (bits: number, hold = 2): Step[] => [[bits, hold], [0, 1]];
const wait = (n: number): Step[] => [[0, n]];
const string = (btn: number, n: number, gap = 9): Step[] => Array.from({ length: n }, () => [...tap(btn), ...wait(gap)]).flat();

interface Plans {
  far: Array<() => Step[]>;
  mid: Array<() => Step[]>;
  close: Array<() => Step[]>;
  antiAir: () => Step[];
  punish: () => Step[];
}

const STREET: Plans = {
  far: [
    () => [...tap(S), ...wait(30)],
    () => [...tap(D), ...wait(22), ...string(L, 3)],
    () => [[T, 24]],
    () => [[SIDE, 18]],
    () => [...tap(D), ...wait(24), ...tap(H), ...wait(10), ...tap(S), ...wait(20)],
  ],
  mid: [
    () => [...tap(D), ...wait(12), ...string(L, 3)],
    () => [...tap(T | H), ...wait(20)],
    () => [...tap(S), ...wait(30)],
    () => [[T, 12]],
    () => [[G, 20]],
    () => [...tap(SIDE | D), ...wait(18)],
    () => [...tap(D), ...wait(10), ...tap(L | G), ...wait(30)],
  ],
  close: [
    () => string(L, 3),
    () => [...tap(H), ...wait(10), ...tap(S), ...wait(30)],
    () => [...tap(H), ...wait(10), ...tap(T | S), ...wait(40)],
    () => [...tap(SIDE | H), ...wait(30)],
    () => [...tap(L | G), ...wait(30)],
    () => [[G, 24]],
    () => [...tap(SIDE2 | D), ...wait(14), ...string(L, 2)],
    () => [...tap(A | D), ...wait(20)],
    () => [...tap(H | S), ...wait(50)],
    () => [[L | H, 18], ...wait(6)],
    () => [...tap(A | S), ...wait(40)],
  ],
  antiAir: () => [...tap(T | S), ...wait(40)],
  punish: () => [...tap(H), ...wait(10), ...tap(T | S), ...wait(40)],
};

const VOLT: Plans = {
  far: [
    () => [...tap(D), ...wait(20), ...string(L, 4, 8)],
    () => [...tap(S), ...wait(36)],
    () => [[T, 22]],
    () => [[SIDE, 16]],
    () => [...tap(L | H), ...wait(4), ...tap(D), ...wait(20), ...string(L, 4, 8)],
  ],
  mid: [
    () => [...tap(D), ...wait(10), ...string(L, 4, 8)],
    () => [...tap(T | H), ...wait(28)],
    () => [...tap(S), ...wait(36)],
    () => [...tap(SIDE | D), ...wait(16)],
    () => [[G, 18]],
  ],
  close: [
    () => string(L, 4, 8),
    () => [...tap(H), ...wait(24), ...string(L, 2, 10), ...tap(H | S), ...wait(30)],
    () => [...tap(L), ...wait(6), ...tap(L | H), ...wait(4), ...string(L, 3, 8)],
    () => [...tap(SIDE | H), ...wait(30)],
    () => [...tap(L | G), ...wait(30)],
    () => [[G, 22]],
    () => [...tap(A | S), ...wait(30)],
    () => [...tap(SIDE2 | D), ...wait(14), ...string(L, 3, 8)],
  ],
  antiAir: () => [...tap(T | S), ...wait(36)],
  punish: () => [...tap(H), ...wait(24), ...string(L, 3, 10)],
};

const NOVA: Plans = {
  far: [
    () => [...tap(S), ...wait(30)],
    () => [...tap(T | S), ...wait(30)],
    () => [...tap(L | H), ...wait(20), ...tap(S), ...wait(26)],
    () => [[SIDE, 18]],
    () => [[0, 14]],
  ],
  mid: [
    () => [...tap(S), ...wait(30)],
    () => [...tap(H), ...wait(24)],
    () => [...tap(A | D), ...wait(10), ...tap(S), ...wait(26)],
    () => [...tap(SIDE | D), ...wait(16), ...tap(S), ...wait(26)],
    () => [...tap(H | S), ...wait(30)],
  ],
  close: [
    () => string(L, 2, 10),
    () => [...tap(H), ...wait(24)],
    () => [...tap(T | H), ...wait(26)],
    () => [...tap(A | S), ...wait(36)],
    () => [...tap(L | G), ...wait(30)],
    () => [[G, 22]],
    () => [...tap(A | D), ...wait(12), ...tap(S), ...wait(26)],
    () => [...tap(L | H), ...wait(6), ...string(L, 2, 10)],
  ],
  antiAir: () => [...tap(A | H), ...wait(30)],
  punish: () => [...tap(T | H), ...wait(26), ...string(L, 2, 10)],
};

const plansFor = (f: FighterState): Plans => (f.style === 'street' ? STREET : f.char === 0 ? VOLT : NOVA);

export class Cpu {
  private queue: Step[] = [];
  private hold = 0;
  private cooldown = 0;
  private guardFor = 0;
  private dodgeRoll = -1;
  private mashTick = 0;
  constructor(
    private side: 0 | 1,
    public level = 1,
  ) {}

  reset() {
    this.queue = [];
    this.hold = 0;
    this.cooldown = 0;
    this.guardFor = 0;
    this.dodgeRoll = -1;
  }

  private plan(steps: Step[]) {
    this.queue = steps.map((s): Step => [s[0], s[1]]);
    this.hold = 0;
  }

  think(m: MatchState): number {
    const me = m.fighters[this.side];
    const op = m.fighters[1 - this.side];
    if (m.phase !== 'fight') {
      this.reset();
      return 0;
    }
    const skill = [0.35, 0.6, 0.85][this.level] ?? 0.6;
    // beam clash: mash
    if (m.clash) {
      this.queue = [];
      this.mashTick++;
      const rate = [3, 2, 1][this.level] ?? 2;
      return this.mashTick % (rate + 1) === 0 ? [L, H, S][this.mashTick % 3] : 0;
    }
    if (me.state === 'thrown') return me.stateFrame >= 3 && Math.random() < (skill * 0.6) / 4 ? L | G : 0;
    const dist = len(op.x - me.x, op.z - me.z);
    // a fireball about to arrive interrupts walking and waiting (not attacks already being input)
    const eta = projectileEta(m, me);
    const busy = this.queue.length && (this.queue[0][0] & (L | H | S | D)) !== 0;
    if (eta >= 0 && eta <= 14 && !busy && actionable(me)) {
      if (this.dodgeRoll < 0) this.dodgeRoll = Math.random();
      if (this.dodgeRoll < skill) {
        this.queue = [];
        if (eta <= 10 && eta >= 2 && this.dodgeRoll < skill * 0.8) this.plan([...tap(Math.random() < 0.5 ? SIDE | D : SIDE2 | D), ...wait(14)]);
        else this.guardFor = Math.max(this.guardFor, eta + 10);
      }
    } else if (eta < 0) this.dodgeRoll = -1;
    // a beam coming this way: get out of its line, or answer it with your own
    const beam = m.beams.find((b) => b.owner !== me.side && !b.clashing);
    if (beam && actionable(me) && !busy) {
      if (me.superMeter >= 20000 && Math.random() < skill * 0.5) {
        this.plan([...tap(me.style === 'street' ? A | S | G : S | G), ...wait(40)]);
      } else this.plan([...tap(Math.random() < 0.5 ? SIDE | D : SIDE2 | D), ...wait(16)]);
    }
    // finish the current plan
    if (this.queue.length) {
      const step = this.queue[0];
      if (++this.hold >= step[1]) {
        this.queue.shift();
        this.hold = 0;
      }
      return resolve(m, me, step[0]);
    }
    if (this.guardFor > 0) {
      this.guardFor--;
      return G;
    }
    if (!actionable(me)) return 0;
    // see an attack coming: guard it or step aside
    if (isThreat(op, dist) && Math.random() < skill * 0.5) {
      if (Math.random() < 0.25) {
        this.plan([...tap(Math.random() < 0.5 ? SIDE | D : SIDE2 | D), ...wait(12)]);
        return this.think(m);
      }
      this.guardFor = 14 + Math.floor(Math.random() * 10);
      return G;
    }
    if (this.cooldown-- > 0) return 0;
    const ai = plansFor(me);
    const pick = <X>(list: X[]) => list[Math.floor(Math.random() * list.length)];
    // punish a whiffed or blocked unsafe move
    if (op.state === 'move' && op.moveFrame > moveOf(op).startup + moveOf(op).active && dist < 9000 && Math.random() < skill * 0.7) {
      this.plan(ai.punish());
      return this.think(m);
    }
    // anti-air a jump-in that is about to land in front
    if ((op.state === 'air' || op.state === 'airdash') && op.vy < 300 && dist < 9500 && Math.random() < skill * 0.6) {
      this.plan(ai.antiAir());
      return this.think(m);
    }
    // meter and team tools
    if (me.superMeter >= 10000 && dist < 9000 && Math.random() < 0.1) {
      const dir = me.style === 'street' && me.superMeter >= 30000 ? T : 0;
      this.plan([...tap(dir | S | G), ...wait(50)]);
      return this.think(m);
    }
    if (STYLES[me.style].team) {
      if (me.assistCD === 0 && !m.assists[me.side] && Math.random() < 0.07) {
        this.plan([...tap(L | H), ...wait(4)]);
        return this.think(m);
      }
      if (me.tagCD === 0 && op.state === 'knockdown' && Math.random() < 0.3) {
        this.plan([...tap(H | S), ...wait(30)]);
        return this.think(m);
      }
    }
    if (Math.random() < 0.2) {
      this.cooldown = 4 + Math.floor(Math.random() * 14);
      return 0;
    }
    const zone = dist > 35000 ? ai.far : dist > 12000 ? ai.mid : ai.close;
    this.plan(pick(zone)());
    this.cooldown = [18, 9, 4][this.level] ?? 9;
    return this.think(m);
  }
}

// frames until the nearest enemy projectile reaches this fighter (or will, if it's still being thrown), or -1
function projectileEta(m: MatchState, me: FighterState): number {
  let best = -1;
  for (const p of m.projectiles) {
    if (p.owner === me.side || p.dodged) continue;
    const [tx, tz] = norm(me.x - p.x, me.z - p.z);
    if (tx * p.dx + tz * p.dz < 0) continue;
    const eta = Math.max(0, (len(me.x - p.x, me.z - p.z) - 3800) / p.speed);
    if (best < 0 || eta < best) best = eta;
  }
  const op = m.fighters[1 - me.side];
  if (op.state === 'move') {
    const mv = moveOf(op);
    if (mv.projectile && op.moveFrame < mv.startup) {
      const travel = Math.max(0, len(op.x - me.x, op.z - me.z) - mv.projectile.spawnF - 3800) / mv.projectile.speed;
      const eta = mv.startup - op.moveFrame + travel;
      if (best < 0 || eta < best) best = eta;
    }
  }
  return best;
}

function isThreat(op: FighterState, dist: number) {
  if (op.state === 'dash' && dist < 16000) return true;
  if (op.state !== 'move') return false;
  const mv = moveOf(op);
  return !!mv.hitbox && op.moveFrame <= mv.startup + mv.active && dist < mv.hitbox.f1 + 6000;
}

// training dummy behaviours
export class Dummy {
  private guardTimer = 0;
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
      case 'guard':
        return G;
      case 'jump':
        return actionable(me) ? J : 0;
      case 'cpu':
        return this.cpu.think(m);
      case 'sidedash':
        // dodge anything that comes at it
        return actionable(me) && (isThreat(op, len(op.x - me.x, op.z - me.z)) || projectileEta(m, me) >= 0) && m.frame % 2 === 0 ? resolve(m, me, SIDE | D) : 0;
      case 'guardAfterFirst': {
        if (me.state === 'hitstun' || me.state === 'juggle') this.guardTimer = 50;
        if (this.guardTimer > 0) {
          this.guardTimer--;
          return G;
        }
        return 0;
      }
    }
  }
}
