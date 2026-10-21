import { describe, expect, it } from 'vitest';
import { Cpu } from '../src/game/ai';
import { createMatch, step } from '../src/sim/match';
import type { StyleId } from '../src/sim/types';

// CPU against CPU for whole matches in every style pairing: nothing throws, health stays in range,
// fighters stay on the stage, and every match finishes
describe('soak', () => {
  const pairs: Array<[StyleId, StyleId]> = [
    ['street', 'street'],
    ['street', 'iron'],
    ['iron', 'street'],
    ['iron', 'iron'],
  ];
  for (const pair of pairs) {
    it(`${pair[0]} vs ${pair[1]}`, () => {
      for (let game = 0; game < 3; game++) {
        const m = createMatch(pair);
        const cpus = [new Cpu(0, 2), new Cpu(1, game % 3)];
        let frames = 0;
        while (m.phase !== 'matchEnd' && frames < 60 * 60 * 8) {
          step(m, [cpus[0].think(m), cpus[1].think(m)]);
          frames++;
          for (const f of m.fighters) {
            expect(f.health).toBeGreaterThanOrEqual(0);
            expect(f.health).toBeLessThanOrEqual(10000);
            expect(Math.abs(f.x)).toBeLessThanOrEqual(38000);
            expect(Number.isFinite(f.y)).toBe(true);
          }
        }
        expect(m.phase).toBe('matchEnd');
      }
    });
  }
});
