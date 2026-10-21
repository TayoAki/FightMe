import { describe, expect, it } from 'vitest';
import { ARENA_R } from '../src/sim/constants';
import { IN, pushInput } from '../src/sim/input';
import { actionable, cloneMatch, createMatch, hashMatch, step } from '../src/sim/match';
import type { InputFrame, MatchState, StyleId } from '../src/sim/types';
import { len } from '../src/sim/vec';

const { UP, DOWN, LEFT, RIGHT, L, H, S, J, G, D } = IN;

// P1 starts on the left (toward the opponent = RIGHT), P2 on the right (toward = LEFT)
function setup(s1: StyleId, s2: StyleId, gap = 4800): MatchState {
  const m = createMatch([s1, s2]);
  m.phase = 'fight';
  m.fighters[0].x = -gap / 2;
  m.fighters[1].x = gap / 2;
  return m;
}

function run(m: MatchState, frames: number, p1 = 0, p2 = 0) {
  for (let i = 0; i < frames; i++) step(m, [p1, p2]);
}

// one P1 input per frame while P2 holds `p2`
function seq(m: MatchState, inputs: number[], p2 = 0) {
  for (const i of inputs) step(m, [i, p2]);
}

function settle(m: MatchState, p1 = 0, p2 = 0, max = 400) {
  for (let i = 0; i < max; i++) {
    if (actionable(m.fighters[0]) && actionable(m.fighters[1]) && m.freeze === 0 && !m.clash && i > 2) return;
    step(m, [p1, p2]);
  }
}

const dist = (m: MatchState) => len(m.fighters[1].x - m.fighters[0].x, m.fighters[1].z - m.fighters[0].z);

describe('input', () => {
  it('reads the stick relative to the opponent', () => {
    const h: InputFrame[] = [];
    // screen right is +x; the opponent is to the right
    pushInput(h, 1, RIGHT, 1024, 0, 1024, 0);
    pushInput(h, 2, LEFT, 1024, 0, 1024, 0);
    pushInput(h, 3, UP, 1024, 0, 1024, 0);
    pushInput(h, 4, DOWN | RIGHT, 1024, 0, 1024, 0);
    pushInput(h, 5, 0, 1024, 0, 1024, 0);
    expect(h.map((x) => x.rel)).toEqual(['t', 'a', 's', 't', 'n']);
    // up goes into the screen: -z when the screen's right is +x
    expect(h[2].mz).toBe(-1024);
    expect(h[2].side).not.toBe(0);
  });
});

describe('basics', () => {
  it('a jab hits for 300 and leaves +4 on hit', () => {
    const m = setup('street', 'street');
    seq(m, [L]);
    settle(m);
    expect(m.fighters[1].health).toBe(10000 - 300);
    expect(m.lastAdvantage[0]).toBe(4);
  });

  it('guard blocks a jab at -1, and a throw beats guard', () => {
    const m = setup('street', 'street');
    seq(m, [L], G);
    settle(m, 0, G);
    expect(m.fighters[1].health).toBe(10000);
    expect(m.lastAdvantage[0]).toBe(-1);

    const t = setup('street', 'street');
    seq(t, [L | G], G);
    run(t, 60, 0, G);
    expect(t.fighters[1].health).toBe(10000 - 1200);
  });

  it('pressing throw in time techs it', () => {
    const t = setup('street', 'street');
    seq(t, [L | G]);
    run(t, 6);
    step(t, [0, L | G]);
    run(t, 60);
    expect(t.fighters[1].health).toBe(10000);
  });

  it('guard does not cover your back', () => {
    const m = setup('street', 'street');
    // P2 guards facing away from P1
    m.fighters[1].fx = 1024;
    m.fighters[1].fz = 0;
    m.fighters[1].state = 'guard';
    seq(m, [L], G);
    run(m, 30, 0, G);
    expect(m.fighters[1].health).toBe(10000 - 300);
  });

  it('running moves the fighter, and the fence keeps them in', () => {
    const m = setup('street', 'street', 20000);
    run(m, 15, RIGHT);
    expect(dist(m)).toBe(20000 - 15 * 680);
    const o = setup('street', 'street', 20000);
    run(o, 600, LEFT);
    expect(len(o.fighters[0].x, o.fighters[0].z)).toBeLessThanOrEqual(ARENA_R);
  });

  it('a homing dash closes the distance', () => {
    const m = setup('street', 'street', 60000);
    seq(m, [D]);
    run(m, 45);
    expect(dist(m)).toBeLessThan(12000);
  });

  it('a side dash circles the opponent and dodges a fireball', () => {
    const m = setup('street', 'tag', 50000);
    seq(m, [S]);
    // the orb comes out on frame 13 and needs ~70 frames to arrive; P2 side dashes as it does
    run(m, 60);
    step(m, [0, UP | D]);
    run(m, 80);
    expect(m.fighters[1].health).toBe(9000);
    expect(Math.abs(m.fighters[1].z)).toBeGreaterThan(5000);
  });

  it('a super needs meter', () => {
    const m = setup('street', 'street');
    seq(m, [S | G]);
    run(m, 80);
    expect(m.fighters[1].health).toBeGreaterThan(9000);

    const m2 = setup('street', 'street');
    m2.fighters[0].superMeter = 30000;
    seq(m2, [RIGHT | S | G]);
    run(m2, 200);
    expect(m2.fighters[0].superMeter).toBeLessThan(10000);
    expect(m2.fighters[1].health).toBeLessThan(10000 - 3000);
  });
});

describe('Street', () => {
  it('cancels a heavy into a fireball on hit', () => {
    const m = setup('street', 'street');
    seq(m, [H, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, S]);
    run(m, 120);
    expect(m.fighters[1].comboHits).toBe(2);
    expect(m.fighters[1].health).toBe(10000 - 800 - 600);
  });

  it('the light string chains three hits', () => {
    const m = setup('street', 'street');
    // each press only counts once the previous hit has started, so space them out past the hitstop
    seq(m, [L, 0, 0, 0, 0, L, ...Array(14).fill(0), L]);
    run(m, 60);
    expect(m.fighters[1].comboHits).toBe(3);
  });

  it('Drive Parry stops a jab and refills Drive', () => {
    const m = setup('street', 'street');
    m.fighters[1].drive = 30000;
    step(m, [0, L | H]);
    run(m, 4, 0, L | H);
    seq(m, [L], L | H);
    run(m, 20, 0, L | H);
    expect(m.fighters[1].health).toBe(10000);
    expect(m.fighters[1].drive).toBeGreaterThan(30000 - 2000);
  });

  it('Drive Impact armors through a jab', () => {
    const m = setup('street', 'street', 7000);
    step(m, [H | S, 0]);
    run(m, 8, 0, LEFT);
    step(m, [0, L]);
    run(m, 30);
    expect(m.fighters[0].health).toBeLessThan(10000);
    expect(m.fighters[0].health).toBeGreaterThan(9000);
    expect(m.fighters[1].health).toBeLessThan(10000);
  });
});

describe('Tag', () => {
  it('a launcher leads into a juggle', () => {
    const m = setup('tag', 'street');
    seq(m, [H]);
    run(m, 16);
    expect(m.fighters[1].state).toBe('juggle');
    while (!actionable(m.fighters[0])) step(m, [0, 0]);
    seq(m, [L, ...Array(10).fill(0), L]);
    run(m, 60);
    expect(m.fighters[1].comboHits).toBeGreaterThanOrEqual(3);
  });

  it('calls the partner in for an assist, with a cooldown', () => {
    const m = setup('tag', 'street', 30000);
    seq(m, [L | H]);
    expect(m.assists[0]).not.toBeNull();
    // Volt is on point, so Nova comes in with a beam
    run(m, 200);
    expect(m.fighters[1].health).toBeLessThan(10000);
    expect(m.assists[0]).toBeNull();
    expect(m.fighters[0].assistCD).toBeGreaterThan(0);
    seq(m, [0, L | H]);
    expect(m.assists[0]).toBeNull();
  });

  it('tags the partner in, and the tag has a cooldown', () => {
    const m = setup('tag', 'street', 30000);
    seq(m, [H | S]);
    expect(m.fighters[0].char).toBe(1);
    expect(m.fighters[0].tagCD).toBeGreaterThan(0);
    settle(m);
    seq(m, [H | S]);
    expect(m.fighters[0].char).toBe(1);
  });

  it('an assist that gets hit costs the team health', () => {
    const m = setup('street', 'tag', 30000);
    seq(m, [0], L | H);
    const a = m.assists[1]!;
    expect(a).not.toBeNull();
    // put the assist right in front of P1 as it starts its beam, then jab it
    a.state = 'attack';
    a.x = m.fighters[0].x + 4000;
    a.z = 0;
    seq(m, [L]);
    run(m, 20);
    expect(m.fighters[1].health).toBe(9000 - Math.floor(300 * 1.2));
    run(m, 60);
    expect(m.assists[1]).toBeNull();
    expect(m.fighters[1].assistCD).toBeGreaterThan(180);
  });
});

describe('beams', () => {
  it('two beams clash, and mashing wins it', () => {
    const m = setup('street', 'tag', 40000);
    m.fighters[0].superMeter = 30000;
    m.fighters[1].superMeter = 30000;
    m.fighters[1].char = 1;
    step(m, [LEFT | S | G, S | G]);
    let clashed = false;
    for (let i = 0; i < 400; i++) {
      // P1 mashes, P2 does nothing
      step(m, [i % 2 ? L : H, 0]);
      if (m.clash) clashed = true;
    }
    expect(clashed).toBe(true);
    expect(m.clash).toBeNull();
    expect(m.fighters[1].health).toBeLessThan(9000 - 3000);
    expect(m.fighters[0].health).toBe(10000);
  });
});

describe('walls', () => {
  it('a wall-splat move pins the opponent against the fence', () => {
    const m = setup('tag', 'street');
    m.fighters[1].x = ARENA_R - 6000;
    m.fighters[0].x = ARENA_R - 12000;
    seq(m, [RIGHT | H]);
    let splat = false;
    for (let i = 0; i < 60; i++) {
      step(m, [0, 0]);
      if (m.fighters[1].state === 'wallsplat') splat = true;
    }
    expect(splat).toBe(true);
  });
});

describe('determinism', () => {
  it('replays the same random inputs to the same state, from a clone too', () => {
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) / 65536;
    const all = [UP, DOWN, LEFT, RIGHT, L, H, S, J, G, D];
    const inputs: Array<[number, number]> = [];
    let cur: [number, number] = [0, 0];
    for (let i = 0; i < 4000; i++) {
      if (i % 3 === 0) cur = [0, 1].map(() => all.filter(() => rnd() < 0.16).reduce((a, b) => a | b, 0)) as [number, number];
      inputs.push(cur);
    }
    const a = setup('street', 'tag', 30000);
    const b = setup('street', 'tag', 30000);
    let snap: MatchState | null = null;
    inputs.forEach((inp, i) => {
      step(a, inp);
      step(b, inp);
      if (i === 2000) snap = cloneMatch(a);
    });
    expect(hashMatch(a)).toBe(hashMatch(b));
    const c = snap! as MatchState;
    for (let i = 2001; i < inputs.length; i++) step(c, inputs[i]);
    expect(hashMatch(c)).toBe(hashMatch(a));
  });
});
