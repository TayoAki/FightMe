// The game: screens, the fixed 60 fps simulation loop, who controls each side, and wiring the simulation's
// events to the renderer, HUD and sound.

import { Devices } from '../input/devices';
import { Renderer } from '../render/renderer';
import { PALETTES } from '../render/rig';
import { createMatch, kitOf, resetPositions, step } from '../sim/match';
import { STYLE_IDS } from '../sim/styles';
import type { GameEvent, MatchState, StyleId, TrainingOptions } from '../sim/types';
import { Hud } from '../ui/hud';
import { ListScreen, SelectScreen, buildHowTo } from '../ui/screens';
import { Cpu, Dummy } from './ai';
import { Sfx } from './audio';

type Mode = 'versus' | 'cpu' | 'training' | 'attract';
type Screen = 'title' | 'select' | 'howto' | 'fight' | 'pause' | 'results';

const DUMMY_MODES: Array<[TrainingOptions['dummy'], string]> = [
  ['stand', 'Stand'],
  ['guard', 'Guard all'],
  ['guardAfterFirst', 'Guard after first hit'],
  ['sidedash', 'Side dash'],
  ['jump', 'Jump'],
  ['cpu', 'CPU'],
];

const STEP_MS = 1000 / 60;

export class Game {
  private devices = new Devices();
  private renderer: Renderer;
  private hud: Hud;
  private sfx = new Sfx();
  private match: MatchState;
  private mode: Mode = 'attract';
  private screen: Screen = 'title';
  private cpus: [Cpu, Cpu] = [new Cpu(0, 1), new Cpu(1, 1)];
  private dummy = new Dummy(1);
  private cpuLevel = 1;
  private acc = 0;
  private last = performance.now();
  private prevMove: [string, string] = ['', ''];
  private title: ListScreen;
  private pause: ListScreen;
  private results: ListScreen;
  private select: SelectScreen;
  private howto: HTMLElement;
  private resultText = '';
  private dummyIdx = 2;
  private overlay: HTMLElement;

  // automated tests drive the simulation frame by frame instead of in real time
  private manual = false;
  private forced: [number, number] | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, opts: { low?: boolean } = {}) {
    this.renderer = new Renderer(canvas, !!opts.low);
    this.hud = new Hud(ui);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    ui.appendChild(this.overlay);
    this.match = this.newAttract();

    this.title = new ListScreen(this.overlay, 'title', '<span class="logo">FIGHT<em>ME</em></span>', 'pick a fighting style · fight your friends', [
      { label: () => 'VERSUS', action: () => this.toSelect('versus') },
      { label: () => 'VS CPU', action: () => this.toSelect('cpu') },
      { label: () => 'TRAINING', action: () => this.toSelect('training') },
      { label: () => 'HOW TO PLAY', action: () => this.go('howto') },
      {
        label: () => `CPU LEVEL: ${['EASY', 'MEDIUM', 'HARD'][this.cpuLevel]}`,
        action: () => this.cycleCpu(1),
        left: () => this.cycleCpu(-1),
        right: () => this.cycleCpu(1),
      },
      { label: () => `SOUND: ${this.sfx.enabled ? 'ON' : 'OFF'}`, action: () => (this.sfx.enabled = !this.sfx.enabled), left: () => (this.sfx.enabled = !this.sfx.enabled), right: () => (this.sfx.enabled = !this.sfx.enabled) },
      { label: () => `CONTROLLERS: ${this.devices.swapPads ? 'PAD 1 → P2' : 'PAD 1 → P1'}`, action: () => (this.devices.swapPads = !this.devices.swapPads), left: () => (this.devices.swapPads = !this.devices.swapPads), right: () => (this.devices.swapPads = !this.devices.swapPads) },
    ]);
    this.select = new SelectScreen(this.overlay);
    this.howto = buildHowTo(this.overlay, () => this.go('title'));
    this.pause = new ListScreen(this.overlay, 'pause', 'PAUSED', '', [
      { label: () => 'RESUME', action: () => this.go('fight') },
      {
        label: () => `DUMMY: ${DUMMY_MODES[this.dummyIdx][1].toUpperCase()}`,
        action: () => this.cycleDummy(1),
        left: () => this.cycleDummy(-1),
        right: () => this.cycleDummy(1),
      },
      { label: () => `METERS: ${this.match.training?.infiniteMeter ? 'INFINITE' : 'NORMAL'}`, action: () => this.toggleMeters(), left: () => this.toggleMeters(), right: () => this.toggleMeters() },
      { label: () => `HITBOXES: ${this.renderer.showBoxes ? 'ON' : 'OFF'}`, action: () => (this.renderer.showBoxes = !this.renderer.showBoxes), left: () => (this.renderer.showBoxes = !this.renderer.showBoxes), right: () => (this.renderer.showBoxes = !this.renderer.showBoxes) },
      { label: () => 'RESTART', action: () => this.startMatch() },
      { label: () => 'CHANGE STYLES', action: () => this.toSelect(this.mode) },
      { label: () => 'HOW TO PLAY', action: () => this.go('howto') },
      { label: () => 'QUIT TO TITLE', action: () => this.toTitle() },
    ]);
    this.results = new ListScreen(this.overlay, 'results', '', '', [
      { label: () => 'REMATCH', action: () => this.startMatch() },
      { label: () => 'CHANGE STYLES', action: () => this.toSelect(this.mode) },
      { label: () => 'QUIT TO TITLE', action: () => this.toTitle() },
    ]);
    window.addEventListener('resize', () => this.renderer.resize());
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.go('title');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ----------------------------------------------------------------------------------------- screens

  private go(s: Screen) {
    this.screen = s;
    this.title.show(s === 'title');
    this.select.show(s === 'select');
    this.howto.classList.toggle('visible', s === 'howto');
    this.pause.show(s === 'pause');
    this.results.show(s === 'results');
    this.hud.show((s === 'fight' || s === 'pause' || s === 'results') && this.mode !== 'attract');
    this.overlay.classList.toggle('dim', s !== 'fight' && s !== 'title');
    if (s === 'pause') {
      // the training rows only make sense in training
      this.pause.root.classList.toggle('training', this.mode === 'training');
    }
  }

  private toTitle() {
    this.mode = 'attract';
    this.match = this.newAttract();
    this.hud.clearAnnounce();
    this.go('title');
  }

  private toSelect(mode: Mode) {
    this.mode = mode;
    this.select.reset(mode !== 'versus', mode === 'cpu' ? 'CPU' : mode === 'training' ? 'DUMMY' : 'PLAYER 2');
    this.go('select');
  }

  private cycleCpu(d: number) {
    this.cpuLevel = (this.cpuLevel + d + 3) % 3;
    this.cpus.forEach((c) => (c.level = this.cpuLevel));
  }

  private cycleDummy(d: number) {
    this.dummyIdx = (this.dummyIdx + d + DUMMY_MODES.length) % DUMMY_MODES.length;
    if (this.match.training) this.match.training.dummy = DUMMY_MODES[this.dummyIdx][0];
  }

  private toggleMeters() {
    if (this.match.training) this.match.training.infiniteMeter = !this.match.training.infiniteMeter;
  }

  private newAttract(): MatchState {
    const a = STYLE_IDS[Math.floor(Math.random() * STYLE_IDS.length)];
    const b = STYLE_IDS[Math.floor(Math.random() * STYLE_IDS.length)];
    const m = createMatch([a, b]);
    const pa = Math.floor(Math.random() * PALETTES.length);
    const pb = (pa + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) % PALETTES.length;
    this.renderer.setTeams([a, b], [pa, pb]);
    this.cpus.forEach((c) => {
      c.reset();
      c.level = 2;
    });
    return m;
  }

  private startMatch() {
    const picks = this.select.picks;
    const training: TrainingOptions | null =
      this.mode === 'training' ? { dummy: DUMMY_MODES[this.dummyIdx][0], infiniteMeter: true, autoRefill: true } : null;
    this.match = createMatch([picks[0].style, picks[1].style], training);
    let pb = picks[1].palette;
    if (pb === picks[0].palette) pb = (pb + 1) % PALETTES.length;
    this.renderer.setTeams([picks[0].style, picks[1].style], [picks[0].palette, pb]);
    this.cpus.forEach((c) => {
      c.reset();
      c.level = this.cpuLevel;
    });
    this.hud.names = ['P1', this.mode === 'cpu' ? 'CPU' : this.mode === 'training' ? 'DUMMY' : 'P2'];
    this.hud.clearAnnounce();
    this.resultText = '';
    this.prevMove = ['', ''];
    this.go('fight');
  }

  // ----------------------------------------------------------------------------------------- loop

  private frame(now: number) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    this.handleInput();
    const running = this.screen === 'fight' || this.screen === 'title' || (this.screen === 'results' && this.match.phase !== 'matchEnd');
    if (running && !this.manual) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP_MS && n < 5) {
        this.tick();
        this.acc -= STEP_MS;
        n++;
      }
      if (n === 5) this.acc = 0;
    } else this.acc = 0;
    this.renderer.render(this.match);
    if (this.mode !== 'attract') this.hud.update(this.match, DUMMY_MODES[this.dummyIdx][1]);
    requestAnimationFrame((t) => this.frame(t));
  }

  private handleInput() {
    const d = this.devices;
    if (this.screen === 'fight' && this.mode === 'training') {
      if (d.wasPressed('KeyH')) this.renderer.showBoxes = !this.renderer.showBoxes;
      if (d.wasPressed('KeyR')) resetPositions(this.match);
      if (d.wasPressed('Tab')) this.cycleDummy(1);
      if (d.wasPressed('KeyM')) this.toggleMeters();
    }
    const [m0, m1] = d.menu();
    const both = { up: m0.up || m1.up, down: m0.down || m1.down, left: m0.left || m1.left, right: m0.right || m1.right, ok: m0.ok || m1.ok, back: m0.back || m1.back };
    switch (this.screen) {
      case 'title':
        this.title.nav(both);
        break;
      case 'select': {
        for (const [side, mi] of [[0, m0], [1, m1]] as const) {
          if (!mi.any) continue;
          const r = this.select.nav(side, mi);
          if (r === 'start') this.startMatch();
          if (r === 'back') this.go('title');
          if (r) break;
        }
        break;
      }
      case 'howto':
        if (both.ok || both.back || m0.pause || m1.pause) this.go(this.mode === 'attract' ? 'title' : 'pause');
        break;
      case 'fight':
        if (m0.pause || m1.pause) this.go('pause');
        break;
      case 'pause':
        if (m0.pause || m1.pause || both.back) this.go('fight');
        else this.pause.nav(both);
        break;
      case 'results':
        if (this.match.phase === 'matchEnd') this.results.nav(both);
        break;
    }
  }

  private inputFor(side: 0 | 1): number {
    const m = this.match;
    // a forced input of -1 leaves that side to its usual controller (the dummy, the CPU)
    if (this.forced && this.forced[side] >= 0) return this.forced[side];
    if (this.mode === 'attract') return this.cpus[side].think(m);
    if (side === 0) return this.devices.read(0);
    if (this.mode === 'cpu') return this.cpus[1].think(m);
    if (this.mode === 'training') {
      const opts = m.training!;
      // P2's own controls still work in training (handy for testing a real opponent)
      const human = this.devices.read(1);
      return human || this.dummy.think(m, opts);
    }
    return this.devices.read(1);
  }

  // test hooks: start a mode with given styles, then step exact frames with exact inputs
  readonly test = {
    start: (mode: Mode, styles: [StyleId, StyleId], palettes: [number, number] = [0, 1]) => {
      this.mode = mode;
      this.select.picks[0].style = styles[0];
      this.select.picks[1].style = styles[1];
      this.select.picks[0].palette = palettes[0];
      this.select.picks[1].palette = palettes[1];
      this.startMatch();
      this.manual = true;
    },
    frames: (n: number, p1 = 0, p2 = 0) => {
      this.manual = true;
      this.forced = [p1, p2];
      for (let i = 0; i < n; i++) this.tick();
      this.forced = null;
    },
    state: () => this.match,
    realtime: () => {
      this.manual = false;
    },
  };

  private tick() {
    const m = this.match;
    const inputs: [number, number] = [this.inputFor(0), this.inputFor(1)];
    step(m, inputs);
    const events: GameEvent[] = m.events;
    if (events.length) {
      this.renderer.onEvents(events, m);
      if (this.mode !== 'attract') {
        this.hud.onEvents(events, m);
        for (const e of events) this.sfx.play(e);
      }
    }
    // a whoosh when a move starts
    m.fighters.forEach((f, i) => {
      const id = f.state === 'move' ? f.moveId : '';
      if (id && id !== this.prevMove[i] && this.mode !== 'attract') {
        const mv = kitOf(f).moves[id];
        if (mv.hitbox) this.sfx.whoosh(mv.damage >= 800 ? 3 : mv.damage >= 500 ? 2 : 1);
      }
      this.prevMove[i] = id;
    });
    if (m.phase === 'matchEnd') {
      if (this.mode === 'attract') {
        this.match = this.newAttract();
        return;
      }
      if (this.screen === 'fight') {
        const w = m.winner;
        const name = (i: number) => (i === 0 ? 'PLAYER 1' : this.mode === 'cpu' ? 'CPU' : 'PLAYER 2');
        this.resultText = w === 2 ? 'DRAW' : `${name(w)} WINS`;
        this.hud.matchResult(this.resultText);
        this.go('results');
      }
    }
  }
}
