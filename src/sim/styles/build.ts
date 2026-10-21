import type { Box, MoveDef } from '../types';

// box(x0, x1, y0, y1): facing-relative, in sim units
export const box = (x0: number, x1: number, y0: number, y1: number): Box => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });

type MoveInput = Partial<MoveDef> & Pick<MoveDef, 'name' | 'startup' | 'active' | 'recovery' | 'pose'>;

export function moves(table: Record<string, MoveInput>): Record<string, MoveDef> {
  const out: Record<string, MoveDef> = {};
  for (const [id, m] of Object.entries(table)) {
    out[id] = {
      kind: 'normal',
      damage: 0,
      height: 'high',
      onHit: 0,
      onBlock: 0,
      ...m,
      id,
    };
  }
  return out;
}

// total frames of a move: startup frames, then active, then recovery
export const totalFrames = (m: MoveDef) => m.startup - 1 + m.active + m.recovery;
