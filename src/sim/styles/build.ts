import type { HitBox, MoveDef } from '../types';

// hb(f0, f1, y0, y1, hw): reach f0..f1 in front of the fighter, height y0..y1, half width hw (sim units)
export const hb = (f0: number, f1: number, y0: number, y1: number, hw = 3000): HitBox => ({ f0, f1, y0, y1, hw });

type MoveInput = Partial<MoveDef> & Pick<MoveDef, 'name' | 'startup' | 'active' | 'recovery' | 'pose'>;

export function moves(table: Record<string, MoveInput>): Record<string, MoveDef> {
  const out: Record<string, MoveDef> = {};
  for (const [id, m] of Object.entries(table)) {
    out[id] = {
      kind: 'normal',
      damage: 0,
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
