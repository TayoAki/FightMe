// Raw input bits, the per-fighter input history, and button-press matching.
//
// The stick is read relative to the screen: left/right along the shared camera's view, up/down into and out
// of the screen. Each frame it is turned into a world direction and into a direction relative to the
// opponent (toward, away, sideways), which is what commands look at.

import type { InputFrame, Rel } from './types';
import { dotU, norm } from './vec';

export const IN = {
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  // light, heavy, special, jump, guard, dash
  L: 16,
  H: 32,
  S: 64,
  J: 128,
  G: 256,
  D: 512,
} as const;

export const BUTTONS = IN.L | IN.H | IN.S | IN.J | IN.G | IN.D;
export const ATTACKS = IN.L | IN.H | IN.S;

export const HIST_LEN = 48;
// a press made this many frames before the fighter can act still comes out
export const PRESS_BUFFER = 4;
// the stick counts as toward or away within about 53° of the line to the opponent
const REL_CUT = 620;

// ax/az: the screen's right as a ground direction; (ux, uz): unit vector toward the opponent
export function pushInput(hist: InputFrame[], f: number, raw: number, ax: number, az: number, ux: number, uz: number) {
  const prev = hist.length ? hist[hist.length - 1].held : 0;
  const held = raw & BUTTONS;
  const h = (raw & IN.RIGHT ? 1 : 0) - (raw & IN.LEFT ? 1 : 0);
  const v = (raw & IN.UP ? 1 : 0) - (raw & IN.DOWN ? 1 : 0);
  let mx = 0;
  let mz = 0;
  let rel: Rel = 'n';
  let side: -1 | 0 | 1 = 0;
  if (h || v) {
    // into the screen is the screen's right turned a quarter: (az, -ax)
    [mx, mz] = norm(h * ax + v * az, h * az - v * ax);
    const d = dotU(mx, mz, ux, uz);
    if (d > REL_CUT) rel = 't';
    else if (d < -REL_CUT) rel = 'a';
    else {
      rel = 's';
      side = ux * mz - uz * mx >= 0 ? 1 : -1;
    }
  }
  hist.push({ f, raw, rel, side, mx, mz, held, pressed: held & ~prev });
  if (hist.length > HIST_LEN) hist.shift();
}

// Index of the newest frame (within `buffer` frames and after frame `after`) on which `mask` was completed:
// for `any`, any one of the buttons pressed; otherwise every button pressed within 3 frames of each other.
export function findPress(hist: InputFrame[], mask: number, any: boolean, buffer: number, after: number): number {
  const n = hist.length;
  for (let i = n - 1; i >= Math.max(0, n - buffer); i--) {
    const h = hist[i];
    if (h.f <= after) break;
    if (any) {
      if (h.pressed & mask) return i;
      continue;
    }
    if (!(h.pressed & mask)) continue;
    if ((h.held & mask) !== mask) continue;
    let got = 0;
    for (let j = i; j >= Math.max(0, i - 2); j--) got |= hist[j].pressed;
    if ((got & mask) === mask) return i;
  }
  return -1;
}
