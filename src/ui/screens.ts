// Menu screens built from DOM: title, fighter select, how to play, pause and results. Each screen is a list
// of focusable items; Game drives the focus from controller input and mouse clicks call the same actions.

import { KEYMAPS, KEY_LABELS } from '../input/devices';
import { PALETTES } from '../render/rig';
import { STYLES, STYLE_IDS } from '../sim/styles';
import type { StyleId } from '../sim/types';
import { MOVELIST, UNIVERSAL, type MoveSection } from './movelist';

const BUTTON_NAMES = ['LIGHT', 'HEAVY', 'SPECIAL', 'JUMP', 'GUARD', 'DASH'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
};

export interface MenuItem {
  label: () => string;
  action: () => void;
  left?: () => void;
  right?: () => void;
}

export class ListScreen {
  readonly root: HTMLElement;
  private itemsEl: HTMLElement;
  private rows: HTMLElement[] = [];
  focus = 0;

  constructor(parent: HTMLElement, cls: string, title: string, sub: string, private items: MenuItem[]) {
    this.root = el('div', `screen ${cls}`, parent);
    if (title) el('h1', 'screen-title', this.root, title);
    if (sub) el('div', 'screen-sub', this.root, sub);
    this.itemsEl = el('div', 'menu', this.root);
    items.forEach((it, i) => {
      const row = el('button', 'menu-item', this.itemsEl);
      row.addEventListener('click', () => {
        this.focus = i;
        it.action();
        this.refresh();
      });
      row.addEventListener('mouseenter', () => {
        this.focus = i;
        this.refresh();
      });
      this.rows.push(row);
    });
    this.refresh();
  }

  refresh() {
    this.items.forEach((it, i) => {
      const row = this.rows[i];
      const lr = it.left || it.right;
      row.innerHTML = lr ? `<span class="arrow">◀</span> ${it.label()} <span class="arrow">▶</span>` : it.label();
      row.classList.toggle('focus', i === this.focus);
    });
  }

  nav(d: { up: boolean; down: boolean; left: boolean; right: boolean; ok: boolean }) {
    const n = this.items.length;
    if (d.up) this.focus = (this.focus + n - 1) % n;
    if (d.down) this.focus = (this.focus + 1) % n;
    const it = this.items[this.focus];
    if (d.left) it.left?.();
    if (d.right) it.right?.();
    if (d.ok) it.action();
    this.refresh();
  }

  show(v: boolean) {
    this.root.classList.toggle('visible', v);
    if (v) this.refresh();
  }
}

// ------------------------------------------------------------------------------------------- fighter select

export interface Pick {
  style: StyleId;
  palette: number;
  ready: boolean;
}

export class SelectScreen {
  readonly root: HTMLElement;
  private cards: HTMLElement[] = [];
  private hint: HTMLElement;
  picks: [Pick, Pick] = [
    { style: 'street', palette: 0, ready: false },
    { style: 'tag', palette: 1, ready: false },
  ];
  // in VS CPU and Training, P1 also picks the opponent once they are ready
  p2ByP1 = false;
  p2Label = 'P2';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'screen select', parent);
    el('h1', 'screen-title', this.root, 'CHOOSE YOUR STYLE');
    const row = el('div', 'cards', this.root);
    for (let i = 0; i < 2; i++) {
      const c = el('div', `card p${i + 1}`, row);
      c.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const side = i as 0 | 1;
        if (t.dataset.act === 'prev') this.change(side, -1);
        else if (t.dataset.act === 'next') this.change(side, 1);
        else if (t.dataset.pal) this.picks[side].palette = Number(t.dataset.pal);
        else if (t.dataset.act === 'ready') this.picks[side].ready = !this.picks[side].ready;
        this.render();
      });
      this.cards.push(c);
    }
    this.hint = el('div', 'screen-sub', this.root);
    this.render();
  }

  reset(p2ByP1: boolean, p2Label: string) {
    this.p2ByP1 = p2ByP1;
    this.p2Label = p2Label;
    this.picks[0].ready = false;
    this.picks[1].ready = false;
    this.render();
  }

  private change(side: 0 | 1, d: number) {
    const i = STYLE_IDS.indexOf(this.picks[side].style);
    this.picks[side].style = STYLE_IDS[(i + d + STYLE_IDS.length) % STYLE_IDS.length];
  }

  // returns true when both are ready
  nav(side: 0 | 1, d: { up: boolean; down: boolean; left: boolean; right: boolean; ok: boolean; back: boolean }): 'start' | 'back' | '' {
    let target = side;
    if (this.p2ByP1) target = this.picks[0].ready ? 1 : 0;
    if (this.p2ByP1 && side === 1) return '';
    const p = this.picks[target];
    if (d.back) {
      if (p.ready) p.ready = false;
      else if (target === 1 && this.p2ByP1) this.picks[0].ready = false;
      else {
        this.render();
        return 'back';
      }
    } else if (!p.ready) {
      if (d.left) this.change(target, -1);
      if (d.right) this.change(target, 1);
      if (d.up) p.palette = (p.palette + PALETTES.length - 1) % PALETTES.length;
      if (d.down) p.palette = (p.palette + 1) % PALETTES.length;
      if (d.ok) p.ready = true;
    }
    this.render();
    return this.picks[0].ready && this.picks[1].ready ? 'start' : '';
  }

  render() {
    this.picks.forEach((p, i) => {
      const st = STYLES[p.style];
      const c = this.cards[i];
      const label = i === 0 ? 'PLAYER 1' : this.p2Label;
      const active = !this.p2ByP1 || (i === 0 ? !this.picks[0].ready : this.picks[0].ready);
      c.classList.toggle('ready', p.ready);
      c.classList.toggle('waiting', !active && !p.ready);
      const pal = PALETTES[p.palette];
      c.style.setProperty('--accent', pal.body);
      c.style.setProperty('--glow', pal.glow);
      const swatches = PALETTES.map((q, k) => `<span class="sw ${k === p.palette ? 'on' : ''}" data-pal="${k}" style="background:${q.body};box-shadow:0 0 0 2px ${q.glow}55"></span>`).join('');
      c.innerHTML = `
        <div class="card-player">${label}</div>
        <div class="card-style"><span class="arrow" data-act="prev">◀</span><b>${st.name.toUpperCase()}</b><span class="arrow" data-act="next">▶</span></div>
        <div class="card-inspired">mechanics inspired by ${st.inspired}</div>
        <div class="card-tag">${st.tagline}</div>
        <div class="card-team">${st.team ? st.kits.map((k) => `<span class="btn">${k.name.toUpperCase()}</span>`).join(' + ') : '&nbsp;'}</div>
        <div class="card-buttons">${BUTTON_NAMES.map((b, k) => `<span class="key">${keyName(i as 0 | 1, k)}</span><span class="btn">${b}</span>`).join('')}</div>
        <div class="swatches">${swatches}</div>
        <button class="card-ready" data-act="ready">${p.ready ? 'READY ✓' : 'CONFIRM'}</button>`;
    });
    const keys0 = keyName(0, 0);
    this.hint.innerHTML = this.p2ByP1
      ? `${this.picks[0].ready ? `Now pick the ${this.p2Label} style` : 'Pick your style'}: <b>A/D</b> style · <b>W/S</b> colour · <b>${keys0}</b> or <b>Enter</b> confirm · <b>I</b> back`
      : `P1: <b>A/D</b> style · <b>W/S</b> colour · <b>${keys0}</b> confirm   ·   P2: <b>←/→</b> · <b>↑/↓</b> · <b>${keyName(1, 0)}</b> confirm   ·   pads: d-pad + A`;
  }

  show(v: boolean) {
    this.root.classList.toggle('visible', v);
  }
}

function keyName(side: 0 | 1, i: number) {
  const code = KEYMAPS[side].buttons[i][0];
  return KEY_LABELS[code] ?? code;
}

// ------------------------------------------------------------------------------------------- how to play

function section(parent: HTMLElement, sec: MoveSection, sub = '') {
  const col = el('div', 'howto-col', parent);
  el('h2', '', col, `${sec.title.toUpperCase()}${sub ? ` <small>${sub}</small>` : ''}`);
  const ul = el('ul', 'howto-system', col);
  for (const s of sec.system) el('li', '', ul, s);
  if (!sec.moves.length) return;
  const table = el('table', 'howto-moves', col);
  for (const m of sec.moves) {
    const tr = el('tr', '', table);
    el('td', 'mv-name', tr, m.name);
    el('td', 'mv-input', tr, m.input);
    el('td', 'mv-note', tr, m.note ?? '');
  }
}

export function buildHowTo(parent: HTMLElement, onBack: () => void) {
  const root = el('div', 'screen howto', parent);
  el('h1', 'screen-title', root, 'HOW TO PLAY');
  const intro = el('div', 'howto-intro', root);
  intro.innerHTML =
    'Every fighter picks a <b>style</b>: the mechanics they play with. All styles share the same six buttons: <b>Light, Heavy, Special, Jump, Guard, Dash</b>. ' +
    'Keyboard: P1 moves with <b>WASD</b>, buttons <b>U I O / J K L</b>. P2 moves with the <b>arrows</b>, buttons <b>Num 7 8 9 / 4 5 6</b> (or <b>Ins Home PgUp / Del End PgDn</b>). ' +
    'Pads (Xbox names): <b>X</b> Light, <b>Y</b> Heavy, <b>B</b> Special, <b>A</b> Jump, <b>RB</b> Guard, <b>LB</b> Dash, <b>RT</b> = Light + Heavy, <b>LT</b> = Heavy + Special. Pause: <b>Esc</b> / Start.';
  const cols = el('div', 'howto-cols', root);
  section(cols, UNIVERSAL);
  for (const id of STYLE_IDS) {
    MOVELIST[id].forEach((sec, i) => section(cols, sec, i === 0 ? `inspired by ${STYLES[id].inspired}` : ''));
  }
  const back = el('button', 'menu-item focus back', root, 'BACK');
  back.addEventListener('click', onBack);
  return root;
}
