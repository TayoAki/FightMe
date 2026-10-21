// The in-fight HUD: health, timer, round wins, Drive / super / Heat / Rage gauges, combo counters, popups,
// the announcer and the training readout. Plain DOM, updated only when a value changes.

import { DRIVE_BAR, DRIVE_MAX, FPS, HEAT_FRAMES, MAX_HEALTH, RAGE_THRESHOLD, ROUNDS_TO_WIN, SUPER_BAR } from '../sim/constants';
import { isRage } from '../sim/match';
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
  meters: HTMLElement;
  drive: HTMLElement[];
  driveLabel: HTMLElement;
  sup: HTMLElement[];
  supLabel: HTMLElement;
  heat: HTMLElement;
  heatFill: HTMLElement;
  rage: HTMLElement;
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
  private training: HTMLElement;
  private trainLines: HTMLElement[] = [];
  private lagHealth = [MAX_HEALTH, MAX_HEALTH];
  private comboShow = [0, 0];
  private comboLast = [{ hits: 0, dmg: 0 }, { hits: 0, dmg: 0 }];
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
      const heat = h('div', 'hud-row heat', meters);
      h('span', 'hud-label', heat, 'HEAT');
      const heatBar = h('div', 'heat-bar', heat);
      const heatFill = h('div', 'heat-fill', heatBar);
      const rage = h('div', 'hud-rage', meters, 'RAGE');
      const combo = h('div', `hud-combo p${i + 1}`, this.root);
      const hits = h('div', 'hits', combo);
      const dmg = h('div', 'dmg', combo);
      const pops = h('div', `hud-pops p${i + 1}`, this.root);
      this.sides.push({ ...s, meters, drive, driveLabel, sup, supLabel, heat, heatFill, rage, combo, hits, dmg, pops });
    });
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
    this.set(this.timer, String(Math.ceil(m.timer / FPS)), () => (this.timer.textContent = String(Math.max(0, Math.ceil(m.timer / FPS)))));
    m.fighters.forEach((f, i) => this.side(m, f, i));
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
    this.dim.style.opacity = m.freeze > 20 ? '1' : '0';
  }

  private side(m: MatchState, f: FighterState, i: number) {
    const s = this.sides[i];
    const st = STYLES[f.style];
    this.set(s.name, this.names[i] + st.name, () => (s.name.innerHTML = `<b>${this.names[i]}</b> · ${st.name.toUpperCase()}`));
    const hp = Math.max(0, f.health) / MAX_HEALTH;
    this.set(s.fill, hp.toFixed(4), () => {
      s.fill.style.transform = `scaleX(${hp})`;
      s.fill.classList.toggle('low', f.health <= RAGE_THRESHOLD);
    });
    // the red "damage trail" catches up after a combo ends
    const comboing = f.state === 'hitstun' || f.state === 'juggle' || f.state === 'wallsplat' || f.state === 'crumple';
    if (!comboing || f.health > this.lagHealth[i]) this.lagHealth[i] += (f.health - this.lagHealth[i]) * (f.health > this.lagHealth[i] ? 1 : 0.08);
    const lag = Math.max(0, this.lagHealth[i]) / MAX_HEALTH;
    this.set(s.lag, lag.toFixed(3), () => (s.lag.style.transform = `scaleX(${lag})`));
    const wins = '●'.repeat(f.roundWins) + '○'.repeat(Math.max(0, ROUNDS_TO_WIN - f.roundWins));
    this.set(s.wins, wins, () => (s.wins.textContent = m.training ? '' : wins));
    // gauges
    const drive = st.drive;
    s.drive[0].parentElement!.style.display = drive ? '' : 'none';
    s.sup[0].parentElement!.style.display = st.supers ? '' : 'none';
    s.heat.style.display = st.heat ? '' : 'none';
    if (drive) {
      const key = `${Math.floor(f.drive / 250)}|${f.burnout}`;
      this.set(s.drive[0].parentElement!, key, () => {
        s.drive.forEach((seg, k) => {
          const v = Math.min(1, Math.max(0, (f.drive - k * DRIVE_BAR) / DRIVE_BAR));
          seg.style.setProperty('--v', String(v));
          seg.classList.toggle('full', v >= 1);
        });
        s.driveLabel.textContent = f.burnout ? 'BURNOUT' : 'DRIVE';
        s.drive[0].parentElement!.classList.toggle('burnout', f.burnout);
      });
      void DRIVE_MAX;
    }
    if (st.supers) {
      const key = String(Math.floor(f.superMeter / 200));
      this.set(s.sup[0].parentElement!, key, () => {
        s.sup.forEach((seg, k) => {
          const v = Math.min(1, Math.max(0, (f.superMeter - k * SUPER_BAR) / SUPER_BAR));
          seg.style.setProperty('--v', String(v));
          seg.classList.toggle('full', v >= 1);
        });
        s.supLabel.textContent = `SUPER ${Math.floor(f.superMeter / SUPER_BAR)}`;
      });
    }
    if (st.heat) {
      const v = f.heatTimer > 0 ? f.heatTimer / HEAT_FRAMES : f.heatAvailable ? 1 : 0;
      const key = `${v.toFixed(3)}|${f.heatTimer > 0}`;
      this.set(s.heatFill, key, () => {
        s.heatFill.style.transform = `scaleX(${v})`;
        s.heat.classList.toggle('active', f.heatTimer > 0);
        s.heat.classList.toggle('spent', !f.heatAvailable && f.heatTimer <= 0);
      });
    }
    const rage = isRage(f);
    s.rage.style.display = rage ? '' : 'none';
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
        case 'justFrame':
          this.pop(e.side, 'PERFECT ⚡', 'blue');
          break;
        case 'wallSplat':
          this.pop(1 - e.side, 'WALL SPLAT', 'orange');
          break;
        case 'tornado':
          this.pop(1 - e.side, 'TORNADO', 'white');
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
        case 'super':
        case 'rageArt':
        case 'heatSmash':
        case 'heat':
          this.pop(e.side, (e.text ?? '').toUpperCase(), e.type === 'super' ? 'gold' : 'orange');
          this.screenFlash(0.35);
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
