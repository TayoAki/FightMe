// The in-fight HUD: health, timer, round wins, Drive and super gauges, the Tag team's assist and tag
// cooldowns, combo counters, popups, the beam-clash mash meter, the announcer and the training readout.
// Plain DOM, updated only when a value changes.

import { ASSIST_COOLDOWN, DRIVE_BAR, FPS, MAX_HEALTH, ROUNDS_TO_WIN, SUPER_BAR, TAG_COOLDOWN } from '../sim/constants';
import { STYLES } from '../sim/styles';
import type { FighterState, GameEvent, MatchState } from '../sim/types';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  parent?.appendChild(el);
  return el;
};

interface SideEls {
  name: HTMLElement;
  fill: HTMLElement;
  lag: HTMLElement;
  wins: HTMLElement;
  driveRow: HTMLElement;
  drive: HTMLElement[];
  driveLabel: HTMLElement;
  supRow: HTMLElement;
  sup: HTMLElement[];
  supLabel: HTMLElement;
  teamRow: HTMLElement;
  assist: HTMLElement;
  tag: HTMLElement;
  combo: HTMLElement;
  hits: HTMLElement;
  dmg: HTMLElement;
  pops: HTMLElement;
}

export class Hud {
  readonly root: HTMLElement;
  private sides: SideEls[] = [];
  private timer: HTMLElement;
  private announce: HTMLElement;
  private flash: HTMLElement;
  private dim: HTMLElement;
  private clash: HTMLElement;
  private clashFill: HTMLElement;
  private training: HTMLElement;
  private trainLines: HTMLElement[] = [];
  private lagHealth = [MAX_HEALTH, MAX_HEALTH];
  private comboShow = [0, 0];
  private comboLast = [
    { hits: 0, dmg: 0 },
    { hits: 0, dmg: 0 },
  ];
  private cache = new Map<HTMLElement, string>();
  names: [string, string] = ['P1', 'P2'];

  constructor(parent: HTMLElement) {
    this.root = h('div', 'hud', parent);
    const top = h('div', 'hud-top', this.root);
    const mkSide = (i: number) => {
      const side = h('div', `hud-side p${i + 1}`, top);
      const name = h('div', 'hud-name', side);
      const bar = h('div', 'hud-bar', side);
      const lag = h('div', 'hud-lag', bar);
      const fill = h('div', 'hud-fill', bar);
      const wins = h('div', 'hud-wins', side);
      return { name, fill, lag, wins };
    };
    const a = mkSide(0);
    this.timer = h('div', 'hud-timer', top, '99');
    const b = mkSide(1);
    const bottom = h('div', 'hud-bottom', this.root);
    [a, b].forEach((s, i) => {
      const meters = h('div', `hud-meters p${i + 1}`, bottom);
      const driveRow = h('div', 'hud-row drive', meters);
      const driveLabel = h('span', 'hud-label', driveRow, 'DRIVE');
      const drive = Array.from({ length: 6 }, () => h('div', 'seg', driveRow));
      const supRow = h('div', 'hud-row super', meters);
      const supLabel = h('span', 'hud-label', supRow, 'SUPER');
      const sup = Array.from({ length: 3 }, () => h('div', 'seg big', supRow));
      const teamRow = h('div', 'hud-row team', meters);
      const assist = h('div', 'pill', teamRow, 'ASSIST');
      const tag = h('div', 'pill', teamRow, 'TAG');
      const combo = h('div', `hud-combo p${i + 1}`, this.root);
      const hits = h('div', 'hits', combo);
      const dmg = h('div', 'dmg', combo);
      const pops = h('div', `hud-pops p${i + 1}`, this.root);
      this.sides.push({ ...s, driveRow, drive, driveLabel, supRow, sup, supLabel, teamRow, assist, tag, combo, hits, dmg, pops });
    });
    this.clash = h('div', 'hud-clash', this.root);
    h('div', 'clash-title', this.clash, 'MASH!');
    const clashBar = h('div', 'clash-bar', this.clash);
    this.clashFill = h('div', 'clash-fill', clashBar);
    this.announce = h('div', 'hud-announce', this.root);
    this.flash = h('div', 'hud-flash', this.root);
    this.dim = h('div', 'hud-dim', this.root);
    this.training = h('div', 'hud-training', this.root);
    for (let i = 0; i < 4; i++) this.trainLines.push(h('div', 'line', this.training));
  }

  private set(el: HTMLElement, key: string, apply: () => void) {
    if (this.cache.get(el) === key) return;
    this.cache.set(el, key);
    apply();
  }

  show(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  update(m: MatchState, dummyLabel = '') {
    const training = !!m.training;
    this.timer.style.visibility = training ? 'hidden' : '';
    const secs = String(Math.max(0, Math.ceil(m.timer / FPS)));
    this.set(this.timer, secs, () => (this.timer.textContent = secs));
    m.fighters.forEach((f, i) => this.side(m, f, i));
    // beam clash: the bar shows how far P1 has pushed
    this.clash.style.display = m.clash ? '' : 'none';
    if (m.clash) this.clashFill.style.transform = `scaleX(${m.clash.pos / 1000})`;
    this.training.style.display = training ? '' : 'none';
    if (training) {
      const last = m.lastMove[0] || '-';
      const adv = m.lastAdvantage[0];
      const d = m.fighters[1];
      const lines = [
        `Last move: <b>${last}</b>  ·  Frame advantage: <b class="${adv > 0 ? 'plus' : adv < 0 ? 'minus' : ''}">${adv > 0 ? '+' : ''}${adv}</b>`,
        `Combo: <b>${d.comboHits}</b> hits · <b>${d.comboDamage.toLocaleString()}</b> dmg  ·  Best: <b>${m.bestCombo[0].toLocaleString()}</b>`,
        `Dummy: <b>${dummyLabel}</b>  ·  Meters: <b>${m.training?.infiniteMeter ? 'infinite' : 'normal'}</b>`,
        `<span class="keys">Tab</span> dummy  <span class="keys">M</span> meters  <span class="keys">H</span> hitboxes  <span class="keys">R</span> reset  <span class="keys">Esc</span> menu`,
      ];
      lines.forEach((html, k) => this.set(this.trainLines[k], html, () => (this.trainLines[k].innerHTML = html)));
    }
    this.dim.style.opacity = m.freeze > 20 || m.clash ? '1' : '0';
  }

  private side(m: MatchState, f: FighterState, i: number) {
    const s = this.sides[i];
    const st = STYLES[f.style];
    const who = st.team ? st.kits.map((k, c) => (c === f.char ? `<b class="on">${k.name.toUpperCase()}</b>` : k.name.toUpperCase())).join(' ⇄ ') : st.name.toUpperCase();
    this.set(s.name, this.names[i] + who, () => (s.name.innerHTML = `<b>${this.names[i]}</b> · ${who}`));
    const max = st.health;
    const hp = Math.max(0, f.health) / max;
    this.set(s.fill, hp.toFixed(4), () => {
      s.fill.style.transform = `scaleX(${hp})`;
      s.fill.classList.toggle('low', f.health <= max / 4);
    });
    // the red "damage trail" catches up after a combo ends
    const comboing = f.state === 'hitstun' || f.state === 'juggle' || f.state === 'wallsplat' || f.state === 'crumple';
    if (!comboing || f.health > this.lagHealth[i]) this.lagHealth[i] += (f.health - this.lagHealth[i]) * (f.health > this.lagHealth[i] ? 1 : 0.08);
    const lag = Math.max(0, this.lagHealth[i]) / max;
    this.set(s.lag, lag.toFixed(3), () => (s.lag.style.transform = `scaleX(${lag})`));
    const wins = '●'.repeat(f.roundWins) + '○'.repeat(Math.max(0, ROUNDS_TO_WIN - f.roundWins));
    this.set(s.wins, wins, () => (s.wins.textContent = m.training ? '' : wins));
    // gauges
    s.driveRow.style.display = st.drive ? '' : 'none';
    s.supRow.style.display = st.supers ? '' : 'none';
    s.teamRow.style.display = st.team ? '' : 'none';
    if (st.drive) {
      this.set(s.driveRow, `${Math.floor(f.drive / 250)}|${f.burnout}`, () => {
        s.drive.forEach((seg, k) => {
          const v = Math.min(1, Math.max(0, (f.drive - k * DRIVE_BAR) / DRIVE_BAR));
          seg.style.setProperty('--v', String(v));
          seg.classList.toggle('full', v >= 1);
        });
        s.driveLabel.textContent = f.burnout ? 'BURNOUT' : 'DRIVE';
        s.driveRow.classList.toggle('burnout', f.burnout);
      });
    }
    if (st.supers) {
      this.set(s.supRow, String(Math.floor(f.superMeter / 200)), () => {
        s.sup.forEach((seg, k) => {
          const v = Math.min(1, Math.max(0, (f.superMeter - k * SUPER_BAR) / SUPER_BAR));
          seg.style.setProperty('--v', String(v));
          seg.classList.toggle('full', v >= 1);
        });
        s.supLabel.textContent = `SUPER ${Math.floor(f.superMeter / SUPER_BAR)}`;
      });
    }
    if (st.team) {
      const partner = st.kits[1 - f.char].name.toUpperCase();
      const out = !!m.assists[i];
      const aReady = !out && f.assistCD === 0;
      const aText = out ? `${partner} IN` : aReady ? `ASSIST ${partner}` : `ASSIST ${Math.ceil(f.assistCD / FPS)}s`;
      this.set(s.assist, aText, () => {
        s.assist.textContent = aText;
        s.assist.classList.toggle('ready', aReady);
        s.assist.style.setProperty('--v', String(aReady || out ? 1 : 1 - Math.min(1, f.assistCD / ASSIST_COOLDOWN)));
      });
      const tReady = f.tagCD === 0;
      const tText = tReady ? `TAG ${partner}` : `TAG ${Math.ceil(f.tagCD / FPS)}s`;
      this.set(s.tag, tText, () => {
        s.tag.textContent = tText;
        s.tag.classList.toggle('ready', tReady);
        s.tag.style.setProperty('--v', String(tReady ? 1 : 1 - f.tagCD / TAG_COOLDOWN));
      });
    }
    // combo counter for the attacker
    const def = m.fighters[1 - i];
    if (def.comboHits >= 2 && (def.state === 'hitstun' || def.state === 'juggle' || def.state === 'wallsplat' || def.state === 'crumple' || def.state === 'stagger' || def.state === 'knockdown' || def.state === 'ko')) {
      if (def.comboHits !== this.comboLast[i].hits || def.comboDamage !== this.comboLast[i].dmg) {
        this.comboLast[i] = { hits: def.comboHits, dmg: def.comboDamage };
        s.hits.innerHTML = `<b>${def.comboHits}</b> HITS`;
        s.dmg.textContent = def.comboDamage.toLocaleString();
        s.combo.classList.remove('bump');
        void s.combo.offsetWidth;
        s.combo.classList.add('bump');
      }
      this.comboShow[i] = 70;
    }
    if (this.comboShow[i] > 0) this.comboShow[i]--;
    s.combo.style.opacity = this.comboShow[i] > 0 ? String(Math.min(1, this.comboShow[i] / 15)) : '0';
    if (this.comboShow[i] === 0) this.comboLast[i] = { hits: 0, dmg: 0 };
  }

  onEvents(events: GameEvent[], m: MatchState) {
    for (const e of events) {
      switch (e.type) {
        case 'counter':
        case 'punish':
          this.pop(e.side, e.text ?? '', 'red');
          break;
        case 'perfectParry':
          this.pop(e.side, 'PERFECT PARRY', 'green');
          this.screenFlash(0.6);
          break;
        case 'wallSplat':
          this.pop(1 - e.side, 'WALL SPLAT', 'orange');
          break;
        case 'tech':
          this.pop(0, 'TECH', 'white');
          this.pop(1, 'TECH', 'white');
          break;
        case 'burnout':
          this.pop(e.side, 'BURNOUT', 'grey');
          break;
        case 'dizzy':
          this.pop(1 - e.side, 'STUN!', 'yellow');
          break;
        case 'driveImpact':
          if (e.text) this.pop(1 - e.side, e.text, 'green');
          break;
        case 'driveRush':
          this.pop(e.side, 'DRIVE RUSH', 'green');
          break;
        case 'assist':
          this.pop(e.side, `${e.text} ASSIST`, 'blue');
          break;
        case 'assistHit':
          this.pop(1 - e.side, 'ASSIST HIT', 'red');
          break;
        case 'tagSwap':
          this.pop(e.side, e.text ?? 'TAG', 'blue');
          break;
        case 'teleport':
          this.pop(e.side, 'BLINK', 'white');
          break;
        case 'super':
          this.pop(e.side, (e.text ?? '').toUpperCase(), 'gold');
          this.screenFlash(0.35);
          break;
        case 'beamClash':
          this.say('BEAM CLASH', 1200, 'clash');
          this.screenFlash(0.5);
          break;
        case 'clashWin':
          this.pop(e.side, 'CLASH WIN', 'gold');
          this.screenFlash(0.7);
          break;
        case 'armor':
          this.pop(e.side, 'ARMOR', 'white');
          break;
        case 'round':
        case 'fight':
        case 'timeover':
          this.say(e.text ?? '', e.type === 'fight' ? 900 : 1500);
          break;
        case 'ko': {
          const dbl = m.fighters[0].health <= 0 && m.fighters[1].health <= 0;
          this.say(dbl ? 'DOUBLE K.O.' : 'K.O.', 1800, 'ko');
          this.screenFlash(0.8);
          break;
        }
      }
    }
  }

  matchResult(text: string) {
    this.say(text, 100000, 'result');
  }

  clearAnnounce() {
    this.announce.className = 'hud-announce';
    this.announce.textContent = '';
  }

  private sayTimer = 0;
  say(text: string, ms: number, cls = '') {
    clearTimeout(this.sayTimer);
    this.announce.className = `hud-announce show ${cls}`;
    this.announce.textContent = text;
    this.sayTimer = window.setTimeout(() => (this.announce.className = 'hud-announce'), ms);
  }

  private pop(side: number, text: string, color: string) {
    if (!text) return;
    const el = h('div', `pop ${color}`, this.sides[side].pops, text);
    setTimeout(() => el.remove(), 1300);
  }

  private screenFlash(a: number) {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = String(a);
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity 380ms ease-out';
      this.flash.style.opacity = '0';
    });
  }
}
