// Keyboard and gamepad → raw input bits for each player. Two players can share one keyboard, and each
// player also reads one gamepad (the first pad for P1, the second for P2; "swap pads" flips that).
// The six buttons, in order: Light, Heavy, Special, Jump, Guard, Dash.

import { IN } from '../sim/input';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  buttons: [string[], string[], string[], string[], string[], string[]];
  pause: string[];
}

export const KEYMAPS: [KeyMap, KeyMap] = [
  {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    buttons: [['KeyU'], ['KeyI'], ['KeyO'], ['KeyJ'], ['KeyK'], ['KeyL']],
    pause: ['Escape'],
  },
  {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    buttons: [
      ['Numpad7', 'Insert'],
      ['Numpad8', 'Home'],
      ['Numpad9', 'PageUp'],
      ['Numpad4', 'Delete'],
      ['Numpad5', 'End'],
      ['Numpad6', 'PageDown'],
    ],
    pause: ['Backspace', 'NumpadAdd'],
  },
];

export const KEY_LABELS: Record<string, string> = {
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyU: 'U',
  KeyI: 'I',
  KeyO: 'O',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Numpad7: 'Num7',
  Numpad8: 'Num8',
  Numpad9: 'Num9',
  Numpad4: 'Num4',
  Numpad5: 'Num5',
  Numpad6: 'Num6',
};

// standard gamepad mapping (Xbox names): X light, Y heavy, B special, A jump, RB guard, LB dash
const PAD_BUTTONS = [2, 3, 1, 0, 5, 4];
export const BUTTON_BITS = [IN.L, IN.H, IN.S, IN.J, IN.G, IN.D];
const PAD_START = 9;

export interface MenuIn {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  ok: boolean;
  back: boolean;
  pause: boolean;
  any: boolean;
}

const emptyMenu = (): MenuIn => ({ up: false, down: false, left: false, right: false, ok: false, back: false, pause: false, any: false });

export class Devices {
  private down = new Set<string>();
  private pressedOnce = new Set<string>();
  swapPads = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isGameKey(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedOnce.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private pads(): Array<Gamepad | null> {
    const list = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
    const a = list[0] ?? null;
    const b = list[1] ?? null;
    return this.swapPads ? [b, a] : [a, b];
  }

  // raw input bits for player 0 or 1 this frame
  read(side: 0 | 1): number {
    const km = KEYMAPS[side];
    const any = (codes: string[]) => codes.some((c) => this.down.has(c));
    let bits = 0;
    if (any(km.up)) bits |= IN.UP;
    if (any(km.down)) bits |= IN.DOWN;
    if (any(km.left)) bits |= IN.LEFT;
    if (any(km.right)) bits |= IN.RIGHT;
    km.buttons.forEach((codes, i) => {
      if (any(codes)) bits |= BUTTON_BITS[i];
    });
    const pad = this.pads()[side];
    if (pad) bits |= padBits(pad);
    return bits;
  }

  // menu navigation: presses since the last call, per side (keyboard half + that side's pad).
  // Enter, Space and Escape count for P1.
  private padPrev = new Map<number, number>();
  menu(): [MenuIn, MenuIn] {
    const out: [MenuIn, MenuIn] = [emptyMenu(), emptyMenu()];
    const p = this.pressedOnce;
    const hit = (codes: string[]) => codes.some((c) => p.has(c));
    for (const side of [0, 1] as const) {
      const km = KEYMAPS[side];
      const o = out[side];
      o.up = hit(km.up);
      o.down = hit(km.down);
      o.left = hit(km.left);
      o.right = hit(km.right);
      o.ok = hit(km.buttons[0]);
      o.back = hit(km.buttons[1]);
      o.pause = hit(km.pause);
    }
    if (p.has('Enter') || p.has('Space')) out[0].ok = true;
    if (p.has('Escape')) out[0].pause = true;
    this.pressedOnce.clear();
    this.pads().forEach((pad, side) => {
      if (!pad) return;
      const bits = padBits(pad) | (pad.buttons[PAD_START]?.pressed ? 1 << 12 : 0);
      const prev = this.padPrev.get(pad.index) ?? 0;
      const edge = bits & ~prev;
      this.padPrev.set(pad.index, bits);
      const o = out[side];
      if (edge & IN.UP) o.up = true;
      if (edge & IN.DOWN) o.down = true;
      if (edge & IN.LEFT) o.left = true;
      if (edge & IN.RIGHT) o.right = true;
      if (edge & IN.J) o.ok = true; // A
      if (edge & IN.S) o.back = true; // B
      if (edge & (1 << 12)) o.pause = true;
    });
    for (const o of out) o.any = o.up || o.down || o.left || o.right || o.ok || o.back || o.pause;
    return out;
  }

  // keys pressed since the last menu() call, for training hotkeys
  wasPressed(code: string) {
    return this.pressedOnce.has(code);
  }

  isHeld(code: string) {
    return this.down.has(code);
  }

  padNames(): string[] {
    return this.pads().map((p) => (p ? p.id.replace(/\(.*?\)/g, '').trim().slice(0, 28) : ''));
  }
}

function padBits(pad: Gamepad): number {
  let bits = 0;
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  if (b(12) || ay < -0.5) bits |= IN.UP;
  if (b(13) || ay > 0.5) bits |= IN.DOWN;
  if (b(14) || ax < -0.5) bits |= IN.LEFT;
  if (b(15) || ax > 0.5) bits |= IN.RIGHT;
  PAD_BUTTONS.forEach((i, k) => {
    if (b(i)) bits |= BUTTON_BITS[k];
  });
  // two-button shortcuts: RT = light + heavy (Drive Parry / assist), LT = heavy + special (Drive Impact / tag)
  if (b(7)) bits |= IN.L | IN.H;
  if (b(6)) bits |= IN.H | IN.S;
  return bits;
}

function isGameKey(code: string) {
  return (
    code.startsWith('Arrow') ||
    code.startsWith('Numpad') ||
    code === 'Space' ||
    code === 'Backspace' ||
    ['Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown'].includes(code)
  );
}
