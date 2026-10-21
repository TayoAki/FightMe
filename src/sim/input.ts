// Raw input bits, numpad notation, the per-fighter input history, and motion matching.
//
// Numpad notation, relative to the way the fighter faces:
//   7 8 9     up-back   up   up-forward
//   4 5 6     back      -    forward
//   1 2 3     down-back down down-forward

import type { InputFrame, Motion } from './types';

export const IN = {
  UP: 1,
  DOWN: 2,
  LEFT: 4,
  RIGHT: 8,
  B1: 16,
  B2: 32,
  B3: 64,
  B4: 128,
  B5: 256,
  B6: 512,
} as const;

export const BUTTONS = IN.B1 | IN.B2 | IN.B3 | IN.B4 | IN.B5 | IN.B6;
export const BUTTON_LIST = [IN.B1, IN.B2, IN.B3, IN.B4, IN.B5, IN.B6];

export const HIST_LEN = 48;
// a press made this many frames before the fighter can act still comes out
export const PRESS_BUFFER = 4;

export function toNumpad(raw: number, facing: 1 | -1): number {
  const left = (raw & IN.LEFT) !== 0;
  const right = (raw & IN.RIGHT) !== 0;
  const up = (raw & IN.UP) !== 0;
  const down = (raw & IN.DOWN) !== 0;
  // opposite directions cancel out (the usual SOCD rule for keyboards and leverless controllers)
  const h = left === right ? 0 : right ? 1 : -1;
  const v = up === down ? 0 : up ? 1 : -1;
  const fwd = h * facing;
  return (v + 1) * 3 + (fwd + 1) + 1;
}

export function pushInput(hist: InputFrame[], f: number, raw: number, facing: 1 | -1) {
  const prev = hist.length ? hist[hist.length - 1].held : 0;
  const held = raw & BUTTONS;
  hist.push({ f, raw, dir: toNumpad(raw, facing), held, pressed: held & ~prev });
  if (hist.length > HIST_LEN) hist.shift();
}

export const isDown = (dir: number) => dir <= 3;
export const isUp = (dir: number) => dir >= 7;
export const isBack = (dir: number) => dir === 1 || dir === 4 || dir === 7;
export const isForward = (dir: number) => dir === 3 || dir === 6 || dir === 9;

interface MotionDef {
  steps: number[][];
  window: number;
  // the last step must be entered on the newest frame (dashes and evades fire on the tap itself)
  fresh?: boolean;
}

export const MOTIONS: Record<Motion, MotionDef> = {
  '236': { steps: [[2], [3], [6]], window: 14 },
  '214': { steps: [[2], [1], [4]], window: 14 },
  '623': { steps: [[6], [2, 1], [3]], window: 16 },
  '236236': { steps: [[2], [3], [6], [2], [3], [6]], window: 32 },
  '214214': { steps: [[2], [1], [4], [2], [1], [4]], window: 32 },
  '66': { steps: [[6], [5], [6]], window: 12, fresh: true },
  '44': { steps: [[4], [5], [4]], window: 12, fresh: true },
  '22': { steps: [[2], [5, 4, 6, 7, 8, 9], [2]], window: 12, fresh: true },
};

// Returns the index of the frame where the motion's last step was first reached (for just-frame checks),
// or -1. The motion must finish at or before `end` and no more than `slack` frames before it.
export function matchMotion(hist: InputFrame[], motion: Motion, end: number, slack = 6): number {
  const def = MOTIONS[motion];
  let step = def.steps.length - 1;
  let i = end;
  const min = Math.max(0, end - def.window);
  let lastStepIdx = -1;
  if (def.fresh) {
    if (end < 1 || !def.steps[step].includes(hist[end].dir) || def.steps[step].includes(hist[end - 1].dir)) return -1;
  }
  while (i >= min && step >= 0) {
    const want = def.steps[step];
    if (want.includes(hist[i].dir)) {
      if (step === def.steps.length - 1) {
        if (end - i > slack) return -1;
        // walk back to where this direction was first reached
        let j = i;
        while (j - 1 >= min && want.includes(hist[j - 1].dir)) j--;
        lastStepIdx = j;
        i = j;
      }
      step--;
    }
    i--;
  }
  return step < 0 ? lastStepIdx : -1;
}

// Index of the newest frame (within `buffer` frames and after `after`) on which `mask` was completed:
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
    // each button must have been pressed within the last 3 frames up to i
    let got = 0;
    for (let j = i; j >= Math.max(0, i - 2); j--) got |= hist[j].pressed;
    if ((got & mask) === mask) return i;
  }
  return -1;
}
