import { describe, expect, it } from 'vitest';
import { IN, matchMotion, pushInput } from '../src/sim/input';
import { actionable, cloneMatch, createMatch, hashMatch, step } from '../src/sim/match';
import type { InputFrame, MatchState, StyleId } from '../src/sim/types';

const { UP, DOWN, LEFT, RIGHT, B1, B2, B3, B4, B5, B6 } = IN;

// P1 starts on the left facing right (forward = RIGHT), P2 on the right facing left (forward = LEFT)
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

// feeds a sequence of P1 inputs (one per frame) while P2 holds `p2`
function seq(m: MatchState, inputs: number[], p2 = 0) {
  for (const i of inputs) step(m, [i, p2]);
}

function settle(m: MatchState, p1 = 0, p2 = 0, max = 400) {
  for (let i = 0; i < max; i++) {
    if (actionable(m.fighters[0]) && actionable(m.fighters[1]) && m.freeze === 0 && i > 2) return;
    step(m, [p1, p2]);
  }
}

describe('motion inputs', () => {
  const hist = (dirs: number[]): InputFrame[] => dirs.map((dir, f) => ({ f, raw: 0, dir, held: 0, pressed: 0 }));
  it('reads a quarter circle forward', () => {
    expect(matchMotion(hist([5, 2, 3, 6]), '236', 3)).toBeGreaterThanOrEqual(0);
    expect(matchMotion(hist([5, 2, 6]), '236', 2)).toBe(-1);
  });
  it('reads a dragon punch motion and finds the just frame', () => {
    const h = hist([5, 6, 5, 2, 3]);
    expect(matchMotion(h, '623', 4)).toBe(4);
    expect(matchMotion(hist([5, 6, 2, 3, 3, 3]), '623', 5)).toBe(3);
  });
  it('fires a dash only on the second tap', () => {
    expect(matchMotion(hist([6, 5, 6]), '66', 2)).toBeGreaterThanOrEqual(0);
    expect(matchMotion(hist([6, 5, 6, 6]), '66', 3)).toBe(-1);
  });
  it('turns raw directions into numpad notation for each facing', () => {
    const h: InputFrame[] = [];
    pushInput(h, 1, RIGHT | DOWN, 1);
    pushInput(h, 2, RIGHT | DOWN, -1);
    pushInput(h, 3, LEFT | RIGHT | UP, 1);
    expect(h.map((x) => x.dir)).toEqual([3, 1, 8]);
  });
});

describe('Street style', () => {
  it('a jab hits for 300 and leaves +4 on hit', () => {
    const m = setup('street', 'street');
    seq(m, [B1]);
    settle(m);
    expect(m.fighters[1].health).toBe(10000 - 300);
    expect(m.lastAdvantage[0]).toBe(4);
  });

  it('a blocked jab is -1 and chips nothing', () => {
    const m = setup('street', 'street');
    // P2 holds back (away from P1 = RIGHT)
    seq(m, [B1], RIGHT);
    settle(m, 0, RIGHT);
    expect(m.fighters[1].health).toBe(10000);
    expect(m.lastAdvantage[0]).toBe(-1);
  });

  it('a low beats a standing block, an overhead beats a crouching block', () => {
    const m = setup('street', 'street');
    seq(m, [DOWN | B5], RIGHT);
    settle(m, 0, RIGHT);
    expect(m.fighters[1].health).toBe(10000 - 500);

    const m2 = setup('street', 'street');
    seq(m2, [RIGHT | B2], RIGHT | DOWN);
    run(m2, 40, 0, RIGHT | DOWN);
    expect(m2.fighters[1].health).toBe(10000 - 700);
  });

  it('cancels a crouching medium kick into a fireball on hit', () => {
    const m = setup('street', 'street');
    seq(m, [DOWN | B5, DOWN, DOWN, DOWN | RIGHT, RIGHT, RIGHT | B3]);
    run(m, 120);
    // 2MK (500) then the orb at 100% scaling of a 2-hit combo (600)
    expect(m.fighters[1].health).toBe(10000 - 500 - 600);
    expect(m.fighters[1].comboHits).toBe(2);
  });

  it('Drive Impact armors through a jab and crumples', () => {
    const m = setup('street', 'street', 7000);
    // P1 starts Drive Impact; P2 jabs into it after walking in a little
    step(m, [B3 | B6, 0]);
    run(m, 8, 0, LEFT);
    step(m, [0, B1]);
    run(m, 30);
    expect(m.fighters[1].state === 'crumple' || m.fighters[1].comboHits > 0).toBe(true);
    expect(m.fighters[0].health).toBeLessThan(10000);
    expect(m.fighters[0].health).toBeGreaterThan(9000);
  });

  it('throws for 1200, and pressing throw in time techs it', () => {
    const m = setup('street', 'street');
    seq(m, [B1 | B4]);
    run(m, 60);
    expect(m.fighters[1].health).toBe(10000 - 1200);

    const t = setup('street', 'street');
    seq(t, [B1 | B4]);
    run(t, 6);
    step(t, [0, B1 | B4]);
    run(t, 60);
    expect(t.fighters[1].health).toBe(10000);
  });

  it('a super needs meter', () => {
    const m = setup('street', 'street');
    const qcf = [DOWN, DOWN | RIGHT, RIGHT];
    seq(m, [...qcf, ...qcf, RIGHT | B1]);
    run(m, 80);
    expect(m.fighters[1].health).toBeGreaterThan(9000);

    const m2 = setup('street', 'street');
    m2.fighters[0].superMeter = 30000;
    seq(m2, [...qcf, ...qcf, RIGHT | B1]);
    run(m2, 200);
    // 3 bars spent; the hit itself builds a little back
    expect(m2.fighters[0].superMeter).toBeLessThan(10000);
    expect(m2.fighters[1].health).toBeLessThan(10000 - 3000);
  });

  it('fireballs travel and hit at range', () => {
    const m = setup('street', 'street', 20000);
    seq(m, [DOWN, DOWN | RIGHT, RIGHT | B1]);
    run(m, 120);
    expect(m.fighters[1].health).toBe(10000 - 600);
  });
});

describe('Iron style', () => {
  it('standing still blocks highs and mids (neutral guard)', () => {
    const m = setup('street', 'iron');
    seq(m, [B2]);
    settle(m);
    expect(m.fighters[1].health).toBe(10000);
  });

  it('highs whiff over a crouching Iron fighter, mids hit it', () => {
    const m = setup('iron', 'iron');
    seq(m, [B1], DOWN);
    run(m, 30, 0, DOWN);
    expect(m.fighters[1].health).toBe(10000);

    const m2 = setup('iron', 'iron');
    seq(m2, [RIGHT | DOWN | B1], DOWN);
    run(m2, 30, 0, DOWN);
    expect(m2.fighters[1].health).toBe(10000 - 450);
  });

  it('the 1,2 string and the df2 launcher juggle', () => {
    const m = setup('iron', 'street');
    seq(m, [B1, 0, 0, 0, B2]);
    run(m, 40);
    expect(m.fighters[1].comboHits).toBe(2);

    const j = setup('iron', 'street');
    seq(j, [DOWN | RIGHT | B2]);
    run(j, 30);
    expect(j.fighters[1].state).toBe('juggle');
    // as soon as the launcher recovers, follow up in the air with a jab, then 1,2
    while (!actionable(j.fighters[0])) step(j, [0, 0]);
    seq(j, [B1, 0, 0, 0, B2]);
    run(j, 60);
    expect(j.fighters[1].comboHits).toBeGreaterThanOrEqual(3);
  });

  it('Evade dodges a fireball', () => {
    const m = setup('street', 'iron', 16000);
    seq(m, [DOWN, DOWN | RIGHT, RIGHT | B3]);
    // the orb needs ~20 frames to arrive; P2 taps down twice as it does
    run(m, 14);
    seq(m, [0, 0, 0], 0);
    step(m, [0, DOWN]);
    step(m, [0, 0]);
    step(m, [0, DOWN]);
    run(m, 60);
    expect(m.fighters[1].health).toBe(10000);
  });

  it('Heat Burst turns on Heat once per round', () => {
    const m = setup('iron', 'street', 12000);
    seq(m, [B3]);
    run(m, 80);
    expect(m.fighters[0].heatAvailable).toBe(false);
    expect(m.fighters[0].heatTimer).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('replays the same random inputs to the same state, from a clone too', () => {
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) / 65536;
    const all = [UP, DOWN, LEFT, RIGHT, B1, B2, B3, B4, B5, B6];
    const inputs: Array<[number, number]> = [];
    let cur: [number, number] = [0, 0];
    for (let i = 0; i < 3000; i++) {
      if (i % 3 === 0) cur = [0, 1].map(() => all.filter(() => rnd() < 0.18).reduce((a, b) => a | b, 0)) as [number, number];
      inputs.push(cur);
    }
    const a = setup('street', 'iron', 18000);
    const b = setup('street', 'iron', 18000);
    let snap: MatchState | null = null;
    inputs.forEach((inp, i) => {
      step(a, inp);
      step(b, inp);
      if (i === 1500) snap = cloneMatch(a);
    });
    expect(hashMatch(a)).toBe(hashMatch(b));
    const c = snap! as MatchState;
    for (let i = 1501; i < inputs.length; i++) step(c, inputs[i]);
    expect(hashMatch(c)).toBe(hashMatch(a));
  });
});
