import { describe, expect, it } from 'vitest';
import { Cpu } from '../src/game/ai';
import { ARENA_R } from '../src/sim/constants';
import { IN } from '../src/sim/input';
import { createMatch, step } from '../src/sim/match';
import { STYLES } from '../src/sim/styles';
import type { MatchState, StyleId } from '../src/sim/types';
import { len } from '../src/sim/vec';

const pairs: Array<[StyleId, StyleId]> = [
  ['street', 'street'],
  ['street', 'tag'],
  ['tag', 'street'],
  ['tag', 'tag'],
];

function checkInvariants(m: MatchState) {
  for (const f of m.fighters) {
    expect(f.health).toBeGreaterThanOrEqual(0);
    expect(f.health).toBeLessThanOrEqual(STYLES[f.style].health);
    expect(len(f.x, f.z)).toBeLessThanOrEqual(ARENA_R);
    expect(Number.isFinite(f.y)).toBe(true);
    expect(f.y).toBeGreaterThanOrEqual(0);
  }
}

// mashing random inputs for whole matches in every style pairing: nothing throws, health stays in range,
// fighters stay inside the arena, and every match finishes
describe('soak (random inputs)', () => {
  const all = [IN.UP, IN.DOWN, IN.LEFT, IN.RIGHT, IN.L, IN.H, IN.S, IN.J, IN.G, IN.D];
  for (const pair of pairs) {
    it(`${pair[0]} vs ${pair[1]}`, () => {
      let seed = 99;
      const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) / 65536;
      for (let game = 0; game < 2; game++) {
        const m = createMatch(pair);
        let cur: [number, number] = [0, 0];
        let frames = 0;
        while (m.phase !== 'matchEnd' && frames < 60 * 60 * 8) {
          if (frames % 4 === 0) cur = [0, 1].map(() => all.filter(() => rnd() < 0.2).reduce((a, b) => a | b, 0)) as [number, number];
          step(m, cur);
          frames++;
          checkInvariants(m);
        }
        expect(m.phase).toBe('matchEnd');
      }
    });
  }
});

// CPU against CPU for whole matches: the same checks, with the moves people actually do
describe('soak (CPU vs CPU)', () => {
  for (const pair of pairs) {
    it(`${pair[0]} vs ${pair[1]}`, () => {
      for (let game = 0; game < 3; game++) {
        const m = createMatch(pair);
        const cpus = [new Cpu(0, 2), new Cpu(1, game % 3)];
        let frames = 0;
        while (m.phase !== 'matchEnd' && frames < 60 * 60 * 8) {
          step(m, [cpus[0].think(m), cpus[1].think(m)]);
          frames++;
          checkInvariants(m);
        }
        expect(m.phase).toBe('matchEnd');
      }
    });
  }
});
