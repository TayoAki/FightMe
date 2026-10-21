// The deterministic arena simulation. `step` advances one frame from both players' raw inputs. It uses
// integer arithmetic on plain data only, so the same inputs always give the same state.
//
// Fighters move freely on a round arena and always face each other (lock-on). The stick is read against
// the shared camera's view (m.ax, m.az), which the simulation keeps itself so input and camera agree.

import {
  ARENA_R,
  ASSIST_COOLDOWN,
  ASSIST_HIT_COOLDOWN,
  AIRDASH_FRAMES,
  AIRDASH_SPEED,
  BACKDASH_FRAMES,
  BACKDASH_INVULN,
  BACKDASH_SPEED,
  BODY_R,
  CLASH_FRAMES,
  CLASH_PUSH,
  CRUMPLE_FRAMES,
  DASH_MAX,
  DASH_MOMENTUM,
  DASH_RECOVERY,
  DASH_SPEED,
  DASH_STOP,
  DIZZY_FRAMES,
  DRIVE_BAR,
  DRIVE_MAX,
  DRIVE_REGEN,
  DRIVE_REGEN_BURNOUT,
  DRIVE_RUSH_BONUS,
  FPS,
  GETUP_FRAMES,
  GRAVITY,
  GUARD_ARC,
  JUGGLE_GRAVITY,
  JUMP_VY,
  KNOCKDOWN_FRAMES,
  LANDING,
  PARRY_DRAIN,
  PREJUMP,
  ROUNDS_TO_WIN,
  ROUND_SECONDS,
  SCALING,
  SIDEDASH_FRAMES,
  SIDEDASH_INVULN,
  SIDEDASH_SPEED,
  STAND_HEIGHT,
  START_GAP,
  SUPER_MAX,
  TAG_COOLDOWN,
  THROW_PROTECT,
  THROW_TECH_WINDOW,
  WALLSPLAT_FRAMES,
  JUMP_SPEED,
} from './constants';
import { ATTACKS, IN, PRESS_BUFFER, findPress, pushInput } from './input';
import { STYLES, totalFrames } from './styles';
import type {
  AssistState,
  BeamState,
  CommandDef,
  CommandFrom,
  FighterState,
  GameEventType,
  HitBox,
  Kit,
  MatchState,
  MoveDef,
  ProjectileState,
  StyleDef,
  StyleId,
  TrainingOptions,
} from './types';
import { ONE, dotU, isqrt, len, norm, pointSegDist, scale, turnToward } from './vec';

const { L, H, G, D, J } = IN;
// fighters stop this far inside the fence
const LIM = ARENA_R - BODY_R;

export const styleOf = (f: FighterState): StyleDef => STYLES[f.style];
export const kitOf = (f: FighterState): Kit => STYLES[f.style].kits[f.char];
export const moveOf = (f: FighterState): MoveDef => kitOf(f).moves[f.moveId];
export const assistMove = (m: MatchState, a: AssistState): MoveDef => STYLES[m.fighters[a.side].style].kits[a.char].moves[a.moveId];

export function createFighter(side: 0 | 1, style: StyleId): FighterState {
  return {
    side,
    style,
    char: 0,
    x: side === 0 ? -START_GAP / 2 : START_GAP / 2,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    fx: side === 0 ? ONE : -ONE,
    fz: 0,
    health: STYLES[style].health,
    drive: DRIVE_MAX,
    superMeter: 0,
    burnout: false,
    state: 'idle',
    stateFrame: 0,
    moveId: '',
    moveFrame: 0,
    moveStartF: 0,
    hitConnected: 0,
    contact: '',
    contactF: 0,
    stun: 0,
    kb: 0,
    kbx: 0,
    kbz: 0,
    dashSide: 1,
    airUsed: false,
    airDashed: false,
    armorLeft: 0,
    fromDriveRush: false,
    fromDash: false,
    juggleCount: 0,
    comboHits: 0,
    comboDamage: 0,
    comboScale50: false,
    wallSplats: 0,
    pendingWallSplat: false,
    throwProtect: 0,
    throwTimer: 0,
    throwBack: false,
    lastConsumed: 0,
    lastHitBy: '',
    lastStunKind: '',
    roundWins: 0,
    actionableSince: 0,
    wasActionable: true,
    assistCD: 0,
    tagCD: 0,
    hist: [],
  };
}

export function createMatch(styles: [StyleId, StyleId], training: TrainingOptions | null = null): MatchState {
  return {
    frame: 0,
    freeze: 0,
    phase: training ? 'fight' : 'intro',
    phaseFrame: 0,
    round: 1,
    timer: ROUND_SECONDS * FPS,
    winner: -1,
    ax: ONE,
    az: 0,
    fighters: [createFighter(0, styles[0]), createFighter(1, styles[1])],
    assists: [null, null],
    projectiles: [],
    beams: [],
    clash: null,
    events: [],
    training,
    lastMove: ['', ''],
    lastAdvantage: [0, 0],
    advPending: [0, 0],
    bestCombo: [0, 0],
  };
}

export const cloneMatch = (m: MatchState): MatchState => structuredClone(m);

export function hashMatch(m: MatchState): number {
  const s = JSON.stringify([m.frame, m.freeze, m.phase, m.timer, m.ax, m.az, m.fighters, m.assists, m.projectiles, m.beams, m.clash]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function emit(m: MatchState, type: GameEventType, side: 0 | 1, x: number, y: number, z: number, power = 1, text?: string) {
  m.events.push({ type, side, x, y, z, power, text });
}
const emitAt = (m: MatchState, type: GameEventType, f: FighterState, power = 1, text?: string) => emit(m, type, f.side, f.x, f.y + 12000, f.z, power, text);

// ---------------------------------------------------------------------------------------------- geometry

interface Actor {
  x: number;
  z: number;
  y: number;
  fx: number;
  fz: number;
}

interface Hurt {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}

// unit vector from a toward b
const toward = (a: { x: number; z: number; fx: number; fz: number }, b: { x: number; z: number }) => norm(b.x - a.x, b.z - a.z, a.fx, a.fz);

const airborne = (f: FighterState) => f.y > 0 || f.vy > 0;

export function hurtboxes(f: FighterState): Hurt[] {
  switch (f.state) {
    case 'knockdown':
    case 'getup':
    case 'ko':
    case 'thrown':
    case 'throwing':
      return [];
    case 'juggle':
      // a body tumbling in the air: generous, so standing attacks keep a juggle going
      return [{ x: f.x, z: f.z, r: 3000, y0: Math.max(0, f.y - 5000), y1: f.y + 9000 }];
  }
  if (airborne(f)) return [{ x: f.x, z: f.z, r: BODY_R, y0: f.y + 1500, y1: f.y + 15000 }];
  let bottom = 0;
  const out: Hurt[] = [];
  if (f.state === 'move') {
    const mv = moveOf(f);
    if (mv.airborne && f.moveFrame >= mv.airborne[0] && f.moveFrame <= mv.airborne[1]) bottom = 4500;
  }
  out.push({ x: f.x, z: f.z, r: BODY_R, y0: f.y + bottom, y1: f.y + STAND_HEIGHT });
  if (f.state === 'move') {
    // limbs stick out from just before the hit until halfway through recovery: whiffs can be punished
    const mv = moveOf(f);
    const box = mv.hitbox;
    if (box && mv.kind !== 'throw' && f.moveFrame >= mv.startup - 2 && f.moveFrame <= mv.startup + mv.active + (mv.recovery >> 1)) {
      const reach = box.f1 - 900;
      if (reach > 2600) {
        const d = Math.trunc(reach * 0.6);
        out.push({ x: f.x + scale(d, f.fx), z: f.z + scale(d, f.fz), r: 2000, y0: f.y + box.y0, y1: f.y + box.y1 });
      }
    }
  }
  return out;
}

const assistHurt = (a: AssistState): Hurt => ({ x: a.x, z: a.z, r: BODY_R, y0: a.y, y1: a.y + STAND_HEIGHT });

function hitTest(att: Actor, box: HitBox, h: Hurt): boolean {
  const rx = h.x - att.x;
  const rz = h.z - att.z;
  const fwd = scale(rx, att.fx) + scale(rz, att.fz);
  if (fwd < box.f0 - h.r || fwd > box.f1 + h.r) return false;
  const lat = scale(rx, att.fz) - scale(rz, att.fx);
  if (Math.abs(lat) > box.hw + h.r) return false;
  const y0 = att.y + box.y0;
  const y1 = att.y + box.y1;
  return y0 < h.y1 && h.y0 < y1;
}

// keep a point inside the fence; true when it had to be pulled back
function clampArena(p: { x: number; z: number }): boolean {
  const d = len(p.x, p.z);
  if (d <= LIM) return false;
  p.x = Math.trunc((p.x * LIM) / d);
  p.z = Math.trunc((p.z * LIM) / d);
  return true;
}

// how far p can travel along the unit vector (dx, dz) before reaching the fence
function roomToWall(p: { x: number; z: number }, dx: number, dz: number): number {
  const b = scale(p.x, dx) + scale(p.z, dz);
  const c = p.x * p.x + p.z * p.z - LIM * LIM;
  const disc = b * b - c;
  if (disc < 0) return 0;
  return Math.max(0, -b + isqrt(disc));
}

const atWall = (f: FighterState) => len(f.x, f.z) >= LIM - 600;

// ---------------------------------------------------------------------------------------------- state helpers

function setState(f: FighterState, s: FighterState['state']) {
  f.state = s;
  f.stateFrame = 0;
  if (s !== 'move') f.moveId = '';
}

export function actionable(f: FighterState) {
  return f.state === 'idle' || f.state === 'run' || f.state === 'guard';
}

const inHitState = (f: FighterState) =>
  f.state === 'hitstun' || f.state === 'juggle' || f.state === 'wallsplat' || f.state === 'crumple' || f.state === 'stagger';

function endMove(f: FighterState) {
  setState(f, 'idle');
  f.moveFrame = 0;
  f.fromDriveRush = false;
  f.fromDash = false;
}

function face(f: FighterState, o: FighterState) {
  const [ux, uz] = toward(f, o);
  f.fx = ux;
  f.fz = uz;
}

function startMove(m: MatchState, f: FighterState, o: FighterState, id: string, cmd?: CommandDef) {
  if (id === '@tag') {
    tagSwap(m, f, o);
    return;
  }
  const st = styleOf(f);
  const mv = kitOf(f).moves[id];
  const prevDR = f.state === 'move' && moveOf(f).tag === 'driveRush';
  if (id === 'parry') {
    if (f.burnout || f.drive <= 0) return;
    setState(f, 'parry');
    f.lastConsumed = m.frame;
    m.lastMove[f.side] = mv.name;
    return;
  }
  if (cmd?.cost?.drive) {
    f.drive -= cmd.cost.drive;
    if (f.drive <= 0) enterBurnout(m, f);
  }
  if (cmd?.cost?.super) f.superMeter -= cmd.cost.super;
  if (!mv.air) {
    face(f, o);
    if (!airborne(f)) {
      f.vx = 0;
      f.vz = 0;
    }
  }
  const idx = f.hist.length - 1;
  f.throwBack = mv.kind === 'throw' && f.hist[idx].rel === 'a';
  setState(f, 'move');
  f.moveId = id;
  f.moveFrame = 0;
  f.moveStartF = m.frame;
  f.hitConnected = 0;
  f.contact = '';
  f.armorLeft = mv.armor ?? 0;
  f.fromDriveRush = prevDR && (mv.kind === 'normal' || mv.kind === 'throw');
  f.fromDash = false;
  f.lastConsumed = m.frame;
  if (mv.air) f.airUsed = true;
  m.lastMove[f.side] = mv.name;
  if (mv.superFreeze) {
    m.freeze = mv.superFreeze;
    emitAt(m, 'super', f, mv.superFreeze, mv.name);
    // the Tag team super brings the partner in too
    if (st.team && !m.assists[f.side]) spawnAssist(m, f, o, true);
  }
  if (mv.tag === 'driveRush') emitAt(m, 'driveRush', f);
  if (mv.tag === 'driveImpact') emitAt(m, 'driveImpact', f);
}

function enterBurnout(m: MatchState, f: FighterState) {
  f.drive = 0;
  if (!f.burnout) {
    f.burnout = true;
    emitAt(m, 'burnout', f, 1, 'BURNOUT');
  }
}

// ---------------------------------------------------------------------------------------------- Tag team

function canCallAssist(m: MatchState, f: FighterState) {
  if (!styleOf(f).team || m.assists[f.side] || f.assistCD > 0) return false;
  switch (f.state) {
    case 'idle':
    case 'run':
    case 'guard':
    case 'move':
    case 'dash':
    case 'dashEnd':
    case 'air':
    case 'airdash':
    case 'land':
    case 'prejump':
      return true;
  }
  return false;
}

function spawnAssist(m: MatchState, f: FighterState, o: FighterState, free: boolean) {
  const char = (1 - f.char) as 0 | 1;
  const kit = styleOf(f).kits[char];
  const [ux, uz] = toward(f, o);
  // jump in beside the point, on the camera's side so they stay in view: toward the camera is (-az, ax)
  const a: AssistState = {
    side: f.side,
    char,
    state: 'enter',
    stateFrame: 0,
    x: f.x + scale(9000, -m.az) - scale(3000, ux),
    z: f.z + scale(9000, m.ax) - scale(3000, uz),
    y: 0,
    vx: 0,
    vz: 0,
    vy: 700,
    fx: ux,
    fz: uz,
    moveId: kit.assist!,
    moveFrame: 0,
    hitConnected: 0,
  };
  clampArena(a);
  m.assists[f.side] = a;
  if (!free) f.assistCD = 1;
  emit(m, 'assist', f.side, a.x, 12000, a.z, 1, kit.name.toUpperCase());
}

function advanceAssist(m: MatchState, a: AssistState) {
  const owner = m.fighters[a.side];
  const opp = m.fighters[1 - a.side];
  a.stateFrame++;
  const done = (cooldown: number) => {
    m.assists[a.side] = null;
    owner.assistCD = cooldown;
  };
  switch (a.state) {
    case 'enter':
      a.y = Math.max(0, a.y + a.vy);
      a.vy -= 180;
      if (a.stateFrame >= 8) {
        a.y = 0;
        a.state = 'attack';
        a.stateFrame = 0;
        a.moveFrame = 0;
        const [ux, uz] = toward(a, opp);
        a.fx = ux;
        a.fz = uz;
      }
      break;
    case 'attack': {
      const mv = assistMove(m, a);
      a.moveFrame++;
      const t = a.moveFrame;
      if (mv.homing && t <= mv.homing) {
        const [ux, uz] = toward(a, opp);
        turnToward(a, ux, uz, 10);
      }
      for (const seg of mv.velocity ?? []) {
        if (t < seg.from || t > seg.to) continue;
        a.x += scale(seg.fwd, a.fx);
        a.z += scale(seg.fwd, a.fz);
      }
      clampArena(a);
      if (mv.projectile && t === mv.startup) spawnProjectile(m, a.side, a.char, mv, a, opp);
      if (mv.beam && t === mv.startup) spawnBeam(m, a.side, a.char, mv, a, opp, true);
      if (t >= totalFrames(mv)) {
        a.state = 'leave';
        a.stateFrame = 0;
      }
      break;
    }
    case 'leave':
      a.y += 900 - a.stateFrame * 40;
      a.x -= scale(400, a.fx);
      a.z -= scale(400, a.fz);
      if (a.stateFrame >= 16) done(ASSIST_COOLDOWN);
      break;
    case 'hit':
      a.x += a.vx;
      a.z += a.vz;
      a.y += a.vy;
      a.vy -= GRAVITY;
      clampArena(a);
      if ((a.y <= 0 && a.stateFrame > 6) || a.stateFrame >= 50) done(ASSIST_HIT_COOLDOWN);
      break;
  }
}

function tagSwap(m: MatchState, f: FighterState, o: FighterState) {
  const leaving = kitOf(f).name;
  f.char = (1 - f.char) as 0 | 1;
  f.tagCD = TAG_COOLDOWN;
  setState(f, 'idle');
  emitAt(m, 'tagSwap', f, 1, `${leaving.toUpperCase()} → ${kitOf(f).name.toUpperCase()}`);
  startMove(m, f, o, kitOf(f).tagIn!);
}

// ---------------------------------------------------------------------------------------------- input → action

type Ctx = CommandFrom | 'cancel' | 'driveRush' | 'kara';

function popcount(x: number) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

function commandKind(kit: Kit, cmd: CommandDef) {
  return cmd.move === '@tag' ? 'tag' : kit.moves[cmd.move].kind;
}

function findCommand(f: FighterState, ctx: Ctx, opts: { kinds?: string[]; buffer?: number } = {}): CommandDef | null {
  const st = styleOf(f);
  const kit = kitOf(f);
  const hist = f.hist;
  const buffer = opts.buffer ?? PRESS_BUFFER;
  const lists = ctx === 'air' ? [kit.air] : [st.commands, kit.commands];
  for (const list of lists) {
    for (const cmd of list) {
      const from = cmd.from ?? (ctx === 'air' ? 'air' : 'ground');
      if (ctx === 'cancel' || ctx === 'driveRush' || ctx === 'kara') {
        if (from !== 'ground') continue;
        if (opts.kinds && !opts.kinds.includes(commandKind(kit, cmd))) continue;
        if (ctx === 'kara' && popcount(cmd.buttons) < 2) continue;
      } else if (from !== ctx) continue;
      if (cmd.needs === 'tag' && (!st.team || f.tagCD > 0)) continue;
      if (cmd.cost?.drive && (f.burnout || f.drive <= 0)) continue;
      if (cmd.cost?.super && f.superMeter < cmd.cost.super) continue;
      if (cmd.move === 'parry' && (f.burnout || f.drive <= 0)) continue;
      const idx = findPress(hist, cmd.buttons, !!cmd.any, buffer, f.lastConsumed);
      if (idx < 0) continue;
      if (cmd.rel && !cmd.rel.includes(hist[idx].rel)) continue;
      return cmd;
    }
  }
  return null;
}

const pressed = (f: FighterState, mask: number, buffer = PRESS_BUFFER) => findPress(f.hist, mask, true, buffer, f.lastConsumed);

function groundAttack(m: MatchState, f: FighterState, o: FighterState): boolean {
  const c = findCommand(f, 'ground');
  if (!c) return false;
  const fromDash = f.state === 'dash' || f.state === 'dashEnd';
  startMove(m, f, o, c.move, c);
  if (fromDash && f.state === 'move') f.fromDash = true;
  return true;
}

function startDash(m: MatchState, f: FighterState, idx: number) {
  const h = f.hist[idx];
  f.lastConsumed = m.frame;
  if (h.rel === 'a') {
    setState(f, 'backdash');
  } else if (h.rel === 's') {
    setState(f, 'sidedash');
    f.dashSide = h.side === -1 ? -1 : 1;
    emitAt(m, 'sidedash', f);
    return;
  } else setState(f, 'dash');
  emitAt(m, 'dash', f);
}

function control(m: MatchState, f: FighterState, o: FighterState) {
  const cur = f.hist[f.hist.length - 1];
  // Tag: the partner can be called in at almost any time, even in the middle of your own move
  if (canCallAssist(m, f) && findPress(f.hist, L | H, false, PRESS_BUFFER, f.lastConsumed) >= 0) {
    // a light attack started by the first half of the chord is cancelled
    if (f.state === 'move' && f.moveFrame <= 2 && moveOf(f).kind === 'normal') endMove(f);
    spawnAssist(m, f, o, false);
    f.lastConsumed = m.frame;
    return;
  }
  switch (f.state) {
    case 'parry':
      if (pressed(f, D) >= 0 && !f.burnout && f.drive > 0) {
        startMove(m, f, o, 'drive_rush', { move: 'drive_rush', buttons: D, cost: { drive: DRIVE_BAR } });
        return;
      }
      if ((cur.held & (L | H)) !== (L | H) && f.stateFrame >= 6) {
        setState(f, 'parryEnd');
        f.stun = 6;
      }
      return;
    case 'blockstun': {
      const c = findCommand(f, 'blockstun');
      if (c) startMove(m, f, o, c.move, c);
      return;
    }
    case 'thrown':
      if (f.stateFrame <= THROW_TECH_WINDOW && findPress(f.hist, L | G, false, 12, f.lastConsumed) >= 0) techThrow(m, o, f);
      return;
    case 'air':
    case 'airdash': {
      if (f.state === 'air' && !f.airDashed && pressed(f, D) >= 0) {
        setState(f, 'airdash');
        f.airDashed = true;
        f.lastConsumed = m.frame;
        emitAt(m, 'dash', f);
        return;
      }
      if (f.state === 'airdash' && f.stateFrame < 5) return;
      if (f.airUsed) return;
      const c = findCommand(f, 'air');
      if (c) startMove(m, f, o, c.move, c);
      return;
    }
    case 'dash':
      if (f.stateFrame >= 4) groundAttack(m, f, o);
      return;
    case 'dashEnd':
      groundAttack(m, f, o);
      return;
    case 'move':
      moveControl(m, f, o);
      return;
  }
  if (!actionable(f)) return;
  if (groundAttack(m, f, o)) return;
  const di = pressed(f, D);
  if (di >= 0) {
    startDash(m, f, di);
    return;
  }
  if (pressed(f, J) >= 0) {
    setState(f, 'prejump');
    f.vx = scale(JUMP_SPEED, cur.mx);
    f.vz = scale(JUMP_SPEED, cur.mz);
    f.lastConsumed = m.frame;
    return;
  }
  if (cur.held & G) {
    if (f.state !== 'guard') setState(f, 'guard');
    return;
  }
  const next = cur.mx || cur.mz ? 'run' : 'idle';
  if (f.state !== next) setState(f, next);
}

function moveControl(m: MatchState, f: FighterState, o: FighterState) {
  const mv = moveOf(f);
  const st = styleOf(f);
  // Drive Rush: cancel into any normal or throw from frame 9
  if (mv.tag === 'driveRush' && f.moveFrame >= 9) {
    const c = findCommand(f, 'driveRush', { kinds: ['normal', 'throw'], buffer: 8 });
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
  }
  // two-button commands win over a normal pressed a frame early (throws, parry, Drive Impact, supers, tags)
  if (mv.kind === 'normal' && f.moveFrame <= 2 && !f.contact) {
    const c = findCommand(f, 'kara', { buffer: 3 });
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
  }
  const endActive = mv.startup + mv.active - 1;
  const connected = f.contact === 'hit' || f.contact === 'block';
  // strings: at once on contact, otherwise when the active frames are over
  if (mv.chains && f.moveFrame >= mv.startup && f.moveFrame <= endActive + (mv.chainWindow ?? 8)) {
    for (const ch of mv.chains) {
      if (!connected && f.moveFrame < endActive) continue;
      const idx = findPress(f.hist, ch.buttons, true, m.frame - f.moveStartF + 1, f.moveStartF);
      if (idx < 0) continue;
      if (ch.rel && !ch.rel.includes(f.hist[idx].rel)) continue;
      startMove(m, f, o, ch.to);
      return;
    }
  }
  // cancels on hit or block
  if (mv.cancels && connected && f.moveFrame <= endActive + 10) {
    const buffer = m.frame - f.contactF + 10;
    const c = findCommand(f, 'cancel', { kinds: mv.cancels, buffer });
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
    // Drive Rush cancel: dash from a cancelable normal, 3 bars
    if (st.drive && mv.cancels.includes('drive') && !f.burnout && f.drive > 0 && pressed(f, D, buffer) >= 0) {
      startMove(m, f, o, 'drive_rush', { move: 'drive_rush', buttons: D, cost: { drive: 3 * DRIVE_BAR } });
    }
  }
}

// ---------------------------------------------------------------------------------------------- per-frame motion

function advance(m: MatchState, f: FighterState, o: FighterState) {
  f.stateFrame++;
  if (f.throwProtect > 0) f.throwProtect--;
  // knockback slides the fighter in any state
  if (f.kb > 0) {
    const s = f.kb < 60 ? f.kb : Math.max(1, f.kb >> 2);
    f.x += scale(s, f.kbx);
    f.z += scale(s, f.kbz);
    f.kb -= s;
  }
  const cur = f.hist[f.hist.length - 1];
  switch (f.state) {
    case 'idle':
    case 'guard':
    case 'win':
      break;
    case 'run': {
      const speed = kitOf(f).runSpeed;
      f.x += scale(speed, cur.mx);
      f.z += scale(speed, cur.mz);
      break;
    }
    case 'prejump':
      if (f.stateFrame >= PREJUMP) {
        setState(f, 'air');
        f.vy = JUMP_VY;
        f.y = 1;
        f.airUsed = false;
        f.airDashed = false;
        emitAt(m, 'jump', f);
      }
      break;
    case 'air':
      if (airPhysics(f)) land(m, f, LANDING);
      break;
    case 'airdash': {
      const [ux, uz] = toward(f, o);
      turnToward(f, ux, uz, 10);
      f.x += scale(AIRDASH_SPEED, f.fx);
      f.z += scale(AIRDASH_SPEED, f.fz);
      if (f.stateFrame >= AIRDASH_FRAMES) {
        setState(f, 'air');
        f.vx = scale(400, f.fx);
        f.vz = scale(400, f.fz);
        f.vy = 0;
      }
      break;
    }
    case 'land':
    case 'parryEnd':
    case 'dashEnd':
      if (--f.stun <= 0) endMove(f);
      break;
    case 'dash': {
      const [ux, uz] = toward(f, o);
      turnToward(f, ux, uz, 15);
      f.x += scale(DASH_SPEED, f.fx);
      f.z += scale(DASH_SPEED, f.fz);
      if (len(o.x - f.x, o.z - f.z) <= DASH_STOP || f.stateFrame >= DASH_MAX) {
        setState(f, 'dashEnd');
        f.stun = DASH_RECOVERY;
      }
      break;
    }
    case 'backdash': {
      const speed = f.stateFrame <= 14 ? BACKDASH_SPEED : BACKDASH_SPEED >> 2;
      f.x -= scale(speed, f.fx);
      f.z -= scale(speed, f.fz);
      if (f.stateFrame >= BACKDASH_FRAMES) endMove(f);
      break;
    }
    case 'sidedash': {
      // circle: move across the line to the opponent
      const [ux, uz] = toward(f, o);
      const speed = f.stateFrame <= 14 ? SIDEDASH_SPEED : SIDEDASH_SPEED >> 2;
      f.x += scale(speed, -uz * f.dashSide);
      f.z += scale(speed, ux * f.dashSide);
      if (f.stateFrame >= SIDEDASH_FRAMES) endMove(f);
      break;
    }
    case 'move':
      advanceMove(m, f, o);
      break;
    case 'hitstun':
    case 'blockstun':
    case 'stagger':
      if (--f.stun <= 0) {
        endMove(f);
        f.throwProtect = THROW_PROTECT;
      }
      break;
    case 'juggle':
      if (airPhysics(f)) {
        if (f.health <= 0) setState(f, 'ko');
        else {
          setState(f, 'knockdown');
          emitAt(m, 'knockdown', f);
        }
        f.vx = 0;
        f.vz = 0;
        f.pendingWallSplat = false;
      }
      break;
    case 'ko':
      airPhysics(f);
      break;
    case 'knockdown':
      if (f.stateFrame >= KNOCKDOWN_FRAMES) setState(f, 'getup');
      break;
    case 'getup':
      if (f.stateFrame >= GETUP_FRAMES) {
        endMove(f);
        f.throwProtect = 1;
      }
      break;
    case 'wallsplat':
      if (f.y > 2000) f.y -= 80;
      if (--f.stun <= 0) {
        setState(f, 'juggle');
        f.vy = 200;
        f.vx = scale(150, f.fx);
        f.vz = scale(150, f.fz);
        f.juggleCount = 99;
      }
      break;
    case 'crumple':
      if (f.stateFrame >= CRUMPLE_FRAMES) {
        setState(f, 'knockdown');
        emitAt(m, 'knockdown', f);
      }
      break;
    case 'dizzy':
      if (f.stateFrame >= DIZZY_FRAMES) endMove(f);
      break;
    case 'parry':
      f.drive -= PARRY_DRAIN;
      if (f.drive <= 0) {
        enterBurnout(m, f);
        setState(f, 'parryEnd');
        f.stun = 10;
      }
      break;
    case 'thrown':
      f.x = o.x + scale(4600, o.fx);
      f.z = o.z + scale(4600, o.fz);
      break;
    case 'throwing':
      advanceThrow(m, f, o);
      break;
  }
}

function land(m: MatchState, f: FighterState, recovery: number) {
  setState(f, 'land');
  f.stun = recovery;
  f.vx = 0;
  f.vz = 0;
  emitAt(m, 'land', f);
}

// returns true on landing
function airPhysics(f: FighterState): boolean {
  f.x += f.vx;
  f.z += f.vz;
  f.y += f.vy;
  f.vy -= f.state === 'juggle' ? JUGGLE_GRAVITY : GRAVITY;
  if (f.y <= 0 && f.vy < 0) {
    f.y = 0;
    f.vy = 0;
    return true;
  }
  return false;
}

function advanceMove(m: MatchState, f: FighterState, o: FighterState) {
  const mv = moveOf(f);
  f.moveFrame++;
  const t = f.moveFrame;
  if (mv.homing && t <= mv.homing) {
    const [ux, uz] = toward(f, o);
    turnToward(f, ux, uz, 10);
  }
  for (const seg of mv.velocity ?? []) {
    if (t < seg.from || t > seg.to) continue;
    f.x += scale(seg.fwd, f.fx);
    f.z += scale(seg.fwd, f.fz);
    if (seg.vy !== undefined && t === seg.from) {
      f.vy = seg.vy;
      f.y = Math.max(f.y, 1);
    }
  }
  if ((f.fromDriveRush || f.fromDash) && t <= 8) {
    const boost = f.fromDriveRush ? 260 : DASH_MOMENTUM;
    f.x += scale(boost, f.fx);
    f.z += scale(boost, f.fz);
  }
  if (mv.teleport && t === mv.teleport) teleportBehind(m, f, o);
  if (mv.projectile && t === mv.startup) spawnProjectile(m, f.side, f.char, mv, f, o);
  if (mv.beam && t === mv.startup) spawnBeam(m, f.side, f.char, mv, f, o, false);
  if (airborne(f)) {
    const wasRising = f.vy > 0;
    // ground moves with their own lift (uppercuts, flips) don't keep jump momentum
    if (!mv.air) {
      f.vx = 0;
      f.vz = 0;
    }
    if (airPhysics(f) && (mv.air || t >= mv.startup || !wasRising)) {
      land(m, f, mv.landingRecovery ?? LANDING);
      return;
    }
  }
  // the move's last frame: the fighter can act on the next one
  if (t >= totalFrames(mv)) {
    if (airborne(f)) {
      // air moves finish in a normal fall; ground moves still in the air keep falling inside the move
      if (mv.air) setState(f, 'air');
      return;
    }
    endMove(f);
  }
}

function teleportBehind(m: MatchState, f: FighterState, o: FighterState) {
  const [ux, uz] = norm(f.x - o.x, f.z - o.z, -o.fx, -o.fz);
  f.x = o.x - scale(14000, ux);
  f.z = o.z - scale(14000, uz);
  clampArena(f);
  face(f, o);
  emitAt(m, 'teleport', f);
}

function spawnProjectile(m: MatchState, side: 0 | 1, kit: 0 | 1, mv: MoveDef, from: Actor, target: FighterState) {
  const pd = mv.projectile!;
  const [dx, dz] = norm(target.x - from.x, target.z - from.z, from.fx, from.fz);
  const p: ProjectileState = {
    owner: side,
    kit,
    moveId: mv.id,
    x: from.x + scale(pd.spawnF, dx),
    z: from.z + scale(pd.spawnF, dz),
    y: from.y + pd.spawnY,
    dx,
    dz,
    vy: pd.dropVy ?? 0,
    speed: pd.speed,
    life: pd.life,
    age: 0,
    kind: pd.kind,
    dodged: false,
  };
  m.projectiles.push(p);
  emit(m, 'projectile', side, p.x, p.y, p.z);
}

function spawnBeam(m: MatchState, side: 0 | 1, kit: 0 | 1, mv: MoveDef, from: Actor, target: FighterState, fromAssist: boolean) {
  const bd = mv.beam!;
  const [dx, dz] = norm(target.x - from.x, target.z - from.z, from.fx, from.fz);
  const b: BeamState = {
    owner: side,
    kit,
    moveId: mv.id,
    fromAssist,
    x: from.x + scale(3000, dx),
    z: from.z + scale(3000, dz),
    y: from.y + bd.spawnY,
    dx,
    dz,
    len: 0,
    age: 0,
    clashing: false,
  };
  m.beams.push(b);
  emit(m, 'beam', side, b.x, b.y, b.z);
}

const beamMove = (m: MatchState, b: { owner: 0 | 1; kit: 0 | 1; moveId: string }) => STYLES[m.fighters[b.owner].style].kits[b.kit].moves[b.moveId];
const projMove = beamMove;

function stepProjectiles(m: MatchState) {
  for (const p of m.projectiles) {
    const pd = projMove(m, p).projectile!;
    if (pd.homing) {
      const t = m.fighters[1 - p.owner];
      const [tx, tz] = norm(t.x - p.x, t.z - p.z, p.dx, p.dz);
      const f = { fx: p.dx, fz: p.dz };
      turnToward(f, tx, tz, pd.homing as 3);
      p.dx = f.fx;
      p.dz = f.fz;
    }
    p.x += scale(p.speed, p.dx);
    p.z += scale(p.speed, p.dz);
    p.y += p.vy;
    p.age++;
    p.life--;
    if (len(p.x, p.z) > ARENA_R + 4000 || p.y < 0) p.life = 0;
  }
}

function stepBeams(m: MatchState) {
  for (const b of m.beams) {
    if (b.clashing) continue;
    const bd = beamMove(m, b).beam!;
    b.len = Math.min(bd.length, b.len + bd.grow);
    b.age++;
  }
  m.beams = m.beams.filter((b) => b.clashing || b.age < beamMove(m, b).beam!.duration);
}

// ---------------------------------------------------------------------------------------------- throws

function throwable(f: FighterState) {
  if (airborne(f) || f.throwProtect > 0) return false;
  switch (f.state) {
    case 'hitstun':
    case 'blockstun':
    case 'juggle':
    case 'knockdown':
    case 'getup':
    case 'wallsplat':
    case 'crumple':
    case 'thrown':
    case 'throwing':
    case 'ko':
    case 'stagger':
      return false;
    case 'backdash':
      return f.stateFrame > 10;
    case 'sidedash':
      return f.stateFrame > SIDEDASH_INVULN[1];
    case 'move': {
      const mv = moveOf(f);
      return !(mv.invuln && f.moveFrame >= mv.invuln[0] && f.moveFrame <= mv.invuln[1]);
    }
  }
  return true;
}

function tryThrow(m: MatchState, f: FighterState, o: FighterState, mv: MoveDef): boolean {
  if (!throwable(o)) return false;
  if (!hitTest(f, mv.hitbox!, { x: o.x, z: o.z, r: BODY_R, y0: 0, y1: STAND_HEIGHT })) return false;
  // both throwing at once: a tech
  if (o.state === 'move' && moveOf(o).kind === 'throw' && o.moveFrame >= moveOf(o).startup) {
    techThrow(m, f, o);
    return true;
  }
  const counter = o.state === 'parry' || (o.state === 'move' && o.moveFrame > moveOf(o).startup + moveOf(o).active - 1);
  setState(f, 'throwing');
  setState(o, 'thrown');
  o.lastConsumed = Math.max(o.lastConsumed, m.frame - 4);
  o.kb = 0;
  f.kb = 0;
  f.throwTimer = counter ? 1 : 0;
  f.contact = 'hit';
  f.contactF = m.frame;
  emitAt(m, 'throw', f, 1, counter ? 'PUNISH COUNTER' : undefined);
  return true;
}

function techThrow(m: MatchState, a: FighterState, b: FighterState) {
  for (const [f, o] of [
    [a, b],
    [b, a],
  ] as const) {
    setState(f, 'blockstun');
    f.stun = 18;
    f.kb = 5200;
    [f.kbx, f.kbz] = norm(f.x - o.x, f.z - o.z, -f.fx, -f.fz);
    f.contact = 'block';
  }
  emit(m, 'tech', a.side, (a.x + b.x) >> 1, 12000, (a.z + b.z) >> 1, 1, 'TECH');
  m.freeze = 8;
}

function advanceThrow(m: MatchState, f: FighterState, o: FighterState) {
  const t = f.stateFrame;
  if (t === THROW_TECH_WINDOW + 1 && o.state === 'thrown') {
    const mv = kitOf(f).moves.throw;
    const dmg = Math.floor((mv.throwDamage ?? 1200) * (f.throwTimer ? 1.7 : 1));
    o.health = Math.max(0, o.health - dmg);
    o.comboHits = 1;
    o.comboDamage = dmg;
    if (f.throwBack) {
      // back throw: the victim lands behind the thrower
      o.x = f.x - scale(4600, f.fx);
      o.z = f.z - scale(4600, f.fz);
      clampArena(o);
    }
    const [dx, dz] = norm(o.x - f.x, o.z - f.z, f.fx, f.fz);
    setState(o, o.health <= 0 ? 'ko' : 'juggle');
    o.vy = 900;
    o.vx = scale(420, dx);
    o.vz = scale(420, dz);
    o.y = 1;
    o.juggleCount = 99;
    m.bestCombo[f.side] = Math.max(m.bestCombo[f.side], dmg);
    m.freeze = 10;
    emit(m, 'hit', o.side, o.x, 10000, o.z, 3);
    if (o.health <= 0) emitAt(m, 'ko', o);
  }
  if (t >= 32) endMove(f);
}

// ---------------------------------------------------------------------------------------------- hits

type HitKind = 'strike' | 'assist' | 'projectile' | 'beam';

interface Source {
  owner: FighterState;
  actor: Actor;
  mv: MoveDef;
  kind: HitKind;
  // knockback direction
  dx: number;
  dz: number;
  // the attacker's current move frame, for exact advantage on strikes
  moveFrame: number;
  isLast: boolean;
  force?: boolean;
}

function invulnerableTo(def: FighterState, mv: MoveDef, kind: HitKind): boolean {
  if (def.state === 'sidedash' && def.stateFrame >= SIDEDASH_INVULN[0] && def.stateFrame <= SIDEDASH_INVULN[1]) {
    return kind === 'projectile' || kind === 'beam' || !mv.tracking;
  }
  if (def.state === 'backdash' && def.stateFrame >= BACKDASH_INVULN[0] && def.stateFrame <= BACKDASH_INVULN[1]) {
    return kind === 'strike' || kind === 'assist';
  }
  if (def.state === 'move') {
    const dm = moveOf(def);
    if (dm.invuln && def.moveFrame >= dm.invuln[0] && def.moveFrame <= dm.invuln[1]) return true;
  }
  return false;
}

function canGuard(def: FighterState, fromX: number, fromZ: number): boolean {
  if (airborne(def)) return false;
  if (!(def.state === 'guard' || def.state === 'blockstun' || def.state === 'idle' || def.state === 'run')) return false;
  if (!(def.hist[def.hist.length - 1].held & G)) return false;
  const [tx, tz] = norm(fromX - def.x, fromZ - def.z, def.fx, def.fz);
  return dotU(def.fx, def.fz, tx, tz) >= GUARD_ARC;
}

const defaultPush = (dmg: number) => (dmg <= 300 ? 2200 : dmg <= 700 ? 3000 : 3800);
const defaultHitstop = (dmg: number) => (dmg <= 300 ? 8 : dmg <= 700 ? 10 : 12);

// knock `def` back along (dx, dz); if the fence is in the way, the attacker is pushed back instead
function pushApart(att: FighterState | null, def: FighterState, amount: number, dx: number, dz: number) {
  const room = roomToWall(def, dx, dz);
  def.kbx = dx;
  def.kbz = dz;
  if (room < amount && att) {
    def.kb = room;
    att.kb = amount - room;
    att.kbx = -dx;
    att.kbz = -dz;
  } else def.kb = amount;
}

function applyHit(m: MatchState, src: Source, def: FighterState) {
  const { owner: att, actor, mv, kind } = src;
  const strike = kind === 'strike';
  // beam ticks only pause the fight briefly, or a long beam would freeze it
  const hitstop = kind === 'beam' && !src.force ? Math.min(mv.hitstop ?? 3, 3) : (mv.hitstop ?? defaultHitstop(mv.damage));
  const [tx, tz] = norm(actor.x - def.x, actor.z - def.z, def.fx, def.fz);
  const fx = def.x + scale(1500, tx);
  const fz = def.z + scale(1500, tz);
  const fy = kind === 'projectile' || kind === 'beam' ? actor.y : Math.min(def.y + 14000, Math.max(def.y + 4000, actor.y + (mv.hitbox ? (mv.hitbox.y0 + mv.hitbox.y1) >> 1 : 12000)));
  const fighterAtt = strike ? att : null;
  const markContact = (c: 'hit' | 'block') => {
    if (!strike) return;
    att.contact = c;
    att.contactF = m.frame;
    m.advPending[att.side] = 1;
  };

  // Drive Parry
  if (!src.force && def.state === 'parry') {
    const perfect = def.stateFrame <= 2 && strike;
    def.drive = Math.min(DRIVE_MAX, def.drive + (perfect ? 2 * DRIVE_BAR : DRIVE_BAR >> 1));
    markContact('block');
    if (strike) pushApart(def, att, 1600, -tx, -tz);
    if (perfect) {
      setState(att, 'stagger');
      att.stun = 28;
      att.comboScale50 = true;
      m.freeze = 22;
      emit(m, 'perfectParry', def.side, fx, fy, fz, 2, 'PERFECT PARRY');
    } else {
      m.freeze = 8;
      emit(m, 'parry', def.side, fx, fy, fz);
    }
    def.stateFrame = Math.min(def.stateFrame, 3);
    return;
  }

  // armor absorbs hits during the move's startup
  if (!src.force && def.state === 'move' && def.armorLeft > 0 && def.moveFrame < moveOf(def).startup + moveOf(def).active) {
    def.armorLeft--;
    def.health = Math.max(1, def.health - (mv.damage >> 1));
    markContact('block');
    m.freeze = hitstop;
    emit(m, 'armor', def.side, fx, fy, fz, 1, 'ARMOR');
    return;
  }

  if (!src.force && canGuard(def, actor.x, actor.z)) {
    markContact('block');
    let chip = mv.chip ?? 0;
    if (def.burnout) chip += mv.damage >> 2;
    def.health = Math.max(mv.kind === 'normal' ? 1 : 0, def.health - chip);
    if (styleOf(def).drive) {
      def.drive -= Math.floor(mv.damage * 2.5);
      if (def.drive <= 0) enterBurnout(m, def);
    }
    let stun: number;
    if (kind === 'projectile') stun = mv.projectile!.blockstun;
    else if (kind === 'beam') stun = mv.beam!.blockstun;
    else if (kind === 'assist') stun = 16;
    else if (mv.airStun) stun = mv.airStun.block + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
    else if (!src.isLast) stun = (mv.hitInterval ?? 4) + 6;
    else stun = Math.max(1, mv.onBlock + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0) + totalFrames(mv) - src.moveFrame);
    setState(def, 'blockstun');
    def.stun = stun;
    pushApart(fighterAtt, def, Math.floor((mv.pushback ?? defaultPush(mv.damage)) * 1.1), src.dx, src.dz);
    gainMeter(att, mv.damage >> 1, def, mv.damage >> 2);
    m.freeze = hitstop;
    emit(m, 'block', def.side, fx, fy, fz, mv.damage >= 800 ? 2 : 1);
    if (mv.tag === 'driveImpact') {
      if (def.burnout) {
        setState(def, 'dizzy');
        def.kb = 0;
        emitAt(m, 'dizzy', def, 2, 'STUN');
      } else if (atWall(def)) wallSplat(m, def, actor);
    }
    if (def.health <= 0) koHit(m, def, src.dx, src.dz);
    return;
  }

  // a clean hit
  markContact('hit');
  const comboing = inHitState(def);
  if (!comboing) {
    def.comboHits = 0;
    def.comboDamage = 0;
    def.juggleCount = 0;
    def.wallSplats = 0;
    if (def.state !== 'stagger') def.comboScale50 = false;
  }
  let counter: '' | 'counter' | 'punish' = '';
  if (def.state === 'move') {
    const dm = moveOf(def);
    counter = def.moveFrame <= dm.startup + dm.active - 1 ? 'counter' : 'punish';
  }
  let pct = SCALING[Math.min(def.comboHits, SCALING.length - 1)];
  if (def.comboScale50) pct = pct >> 1;
  pct = Math.max(pct, mv.minScale ?? 10);
  const mult = counter ? 120 : 100;
  const dmg = Math.floor((mv.damage * pct * mult) / 10000);
  def.health = Math.max(0, def.health - dmg);
  def.comboHits++;
  def.comboDamage += dmg;
  def.lastHitBy = mv.name;
  m.bestCombo[att.side] = Math.max(m.bestCombo[att.side], def.comboDamage);
  gainMeter(att, dmg, def, dmg >> 2);
  if (styleOf(att).drive && !att.burnout) att.drive = Math.min(DRIVE_MAX, att.drive + (dmg >> 1));
  m.freeze = hitstop + (counter ? 2 : 0);
  emit(m, 'hit', def.side, fx, fy, fz, dmg >= 1500 ? 3 : dmg >= 700 ? 2 : 1);
  if (counter === 'counter') emitAt(m, 'counter', att, 1, 'COUNTER');
  if (counter === 'punish') emitAt(m, 'punish', att, 1, 'PUNISH COUNTER');
  def.kb = 0;
  if (def.health <= 0) {
    koHit(m, def, src.dx, src.dz);
    return;
  }

  const wasAir = airborne(def) || def.state === 'juggle';
  if (mv.crumple && !wasAir) {
    if (atWall(def)) wallSplat(m, def, actor);
    else {
      setState(def, 'crumple');
      emitAt(m, 'driveImpact', def, 2, 'CRUMPLE');
    }
    return;
  }
  if (def.state === 'crumple' || def.state === 'dizzy') {
    launch(def, src, mv.launch?.fwd ?? 300, mv.launch?.vy ?? 1100, mv);
    return;
  }
  if (def.state === 'wallsplat') {
    if (mv.launch || def.wallSplats >= 3) {
      launch(def, src, -(mv.launch?.fwd ?? 300), mv.launch?.vy ?? 900, mv);
      def.juggleCount = 99;
    } else {
      def.stun = Math.max(18, WALLSPLAT_FRAMES - def.comboHits * 3);
      def.wallSplats++;
    }
    return;
  }
  if (wasAir) {
    // launchers relaunch; other hits only keep the fighter floating
    const decay = Math.max(35, 100 - 12 * def.juggleCount);
    const vy = kind === 'projectile' || kind === 'beam' ? 500 : Math.floor(((mv.launch?.vy ?? 480) * decay) / 100);
    launch(def, src, mv.launch?.fwd ?? 260, vy, mv);
    def.juggleCount++;
    if (mv.air) def.juggleCount = 99; // air-to-air hits reset, they don't juggle
    return;
  }
  if (mv.launch && src.isLast) {
    launch(def, src, mv.launch.fwd, mv.launch.vy, mv);
    if (mv.knockdown && mv.launch.vy < 800) def.juggleCount = 99; // sweeps and soft knockdowns
    return;
  }
  let stun: number;
  if (kind === 'projectile') stun = mv.projectile!.hitstun;
  else if (kind === 'beam') stun = mv.beam!.hitstun;
  else if (kind === 'assist') stun = 24;
  else if (mv.airStun) stun = mv.airStun.hit + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
  else if (!src.isLast) stun = (mv.hitInterval ?? 4) + 6;
  else {
    let adv = mv.onHit + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
    if (counter === 'counter') adv += 2;
    if (counter === 'punish') adv += 4;
    stun = Math.max(1, adv + totalFrames(mv) - src.moveFrame);
  }
  def.lastStunKind = mv.hitbox && mv.hitbox.y1 <= 4000 ? 'low' : 'high';
  setState(def, 'hitstun');
  def.stun = stun;
  def.pendingWallSplat = !!mv.wallSplat && def.wallSplats < 2;
  pushApart(fighterAtt, def, mv.pushback ?? defaultPush(mv.damage), src.dx, src.dz);
}

function launch(def: FighterState, src: Source, fwd: number, vy: number, mv: MoveDef) {
  setState(def, 'juggle');
  const v = Math.trunc(fwd / 3);
  def.vx = scale(v, src.dx);
  def.vz = scale(v, src.dz);
  def.vy = vy;
  def.y = Math.max(def.y, 1);
  def.kb = 0;
  def.pendingWallSplat = !!mv.wallSplat && def.wallSplats < 2;
}

function wallSplat(m: MatchState, def: FighterState, from: { x: number; z: number }) {
  setState(def, 'wallsplat');
  def.stun = WALLSPLAT_FRAMES;
  def.wallSplats++;
  def.vx = 0;
  def.vz = 0;
  def.vy = 0;
  def.y = Math.max(def.y, 3500);
  def.kb = 0;
  [def.fx, def.fz] = norm(from.x - def.x, from.z - def.z, def.fx, def.fz);
  def.pendingWallSplat = false;
  m.freeze = Math.max(m.freeze, 14);
  emitAt(m, 'wallSplat', def, 2, 'WALL SPLAT');
}

function koHit(m: MatchState, def: FighterState, dx: number, dz: number) {
  setState(def, 'ko');
  def.vy = 1200;
  def.vx = scale(260, dx);
  def.vz = scale(260, dz);
  def.y = Math.max(def.y, 1);
  m.freeze = 40;
  emitAt(m, 'ko', def, 3, 'K.O.');
}

function gainMeter(att: FighterState, attGain: number, def: FighterState, defGain: number) {
  if (styleOf(att).supers) att.superMeter = Math.min(SUPER_MAX, att.superMeter + attGain);
  if (styleOf(def).supers) def.superMeter = Math.min(SUPER_MAX, def.superMeter + defGain);
}

// an assist that gets hit is knocked out of the fight, and the team takes the damage
function hitAssist(m: MatchState, src: Source, a: AssistState) {
  const owner = m.fighters[a.side];
  const dmg = Math.floor(src.mv.damage * 1.2);
  owner.health = Math.max(0, owner.health - dmg);
  a.state = 'hit';
  a.stateFrame = 0;
  a.vx = scale(500, src.dx);
  a.vz = scale(500, src.dz);
  a.vy = 900;
  a.y = Math.max(a.y, 1);
  if (src.kind === 'strike') {
    src.owner.contact = 'hit';
    src.owner.contactF = m.frame;
  }
  m.freeze = Math.max(m.freeze, 12);
  emit(m, 'hit', a.side, a.x, 12000, a.z, 2);
  emit(m, 'assistHit', a.side, a.x, 14000, a.z, 1, 'ASSIST HIT');
  if (owner.health <= 0) koHit(m, owner, src.dx, src.dz);
}

function resolveHits(m: MatchState) {
  const strikes: Array<{ src: Source; def?: FighterState; assist?: AssistState }> = [];
  for (const s of [0, 1] as const) {
    const att = m.fighters[s];
    const def = m.fighters[1 - s];
    const defAssist = m.assists[1 - s];
    if (att.state === 'move') {
      const mv = moveOf(att);
      const k = att.moveFrame - mv.startup;
      if (mv.hitbox && k >= 0 && k < mv.active) {
        if (mv.kind === 'throw') {
          if (att.hitConnected === 0 && tryThrow(m, att, def, mv)) att.hitConnected = 1;
        } else {
          const hits = mv.hits ?? 1;
          const due = Math.min(hits - 1, Math.floor(k / (mv.hitInterval ?? mv.active)));
          if (att.hitConnected <= due) {
            const src: Source = { owner: att, actor: att, mv, kind: 'strike', dx: att.fx, dz: att.fz, moveFrame: att.moveFrame, isLast: att.hitConnected + 1 >= hits };
            const limit = def.state === 'juggle' && def.juggleCount >= styleOf(att).juggleLimit;
            if (!limit && !invulnerableTo(def, mv, 'strike') && hurtboxes(def).some((h) => hitTest(att, mv.hitbox!, h))) {
              strikes.push({ src, def });
            } else if (defAssist && (defAssist.state === 'attack' || defAssist.state === 'enter') && hitTest(att, mv.hitbox, assistHurt(defAssist))) {
              strikes.push({ src, assist: defAssist });
            }
          }
        }
      }
    }
    const a = m.assists[s];
    if (a && a.state === 'attack' && a.hitConnected === 0) {
      const mv = assistMove(m, a);
      const k = a.moveFrame - mv.startup;
      if (mv.hitbox && k >= 0 && k < mv.active && !invulnerableTo(def, mv, 'assist')) {
        const limit = def.state === 'juggle' && def.juggleCount >= styleOf(att).juggleLimit;
        if (!limit && hurtboxes(def).some((h) => hitTest(a, mv.hitbox!, h))) {
          strikes.push({ src: { owner: att, actor: a, mv, kind: 'assist', dx: a.fx, dz: a.fz, moveFrame: a.moveFrame, isLast: true }, def });
          a.hitConnected = 1;
        }
      }
    }
  }
  // simultaneous hits trade
  for (const s of strikes) {
    if (s.src.kind === 'strike') s.src.owner.hitConnected++;
    if (s.def) applyHit(m, s.src, s.def);
    else if (s.assist && m.assists[s.assist.side] === s.assist) hitAssist(m, s.src, s.assist);
  }

  // projectiles: clash with each other, then hit fighters and assists
  const ps = m.projectiles;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const p = ps[i];
      const q = ps[j];
      if (p.owner === q.owner || p.life <= 0 || q.life <= 0) continue;
      if (len(p.x - q.x, p.z - q.z) < 2800 && Math.abs(p.y - q.y) < 2800) {
        p.life = 0;
        q.life = 0;
        emit(m, 'block', p.owner, (p.x + q.x) >> 1, p.y, (p.z + q.z) >> 1, 2);
      }
    }
  }
  for (const p of ps) {
    if (p.life <= 0 || p.dodged) continue;
    const owner = m.fighters[p.owner];
    const def = m.fighters[1 - p.owner];
    const mv = projMove(m, p);
    const pd = mv.projectile!;
    const src: Source = { owner, actor: { x: p.x, z: p.z, y: p.y, fx: p.dx, fz: p.dz }, mv, kind: 'projectile', dx: p.dx, dz: p.dz, moveFrame: 0, isLast: true };
    const touches = (h: Hurt) => len(h.x - p.x, h.z - p.z) <= h.r + pd.r && p.y + pd.r > h.y0 && p.y - pd.r < h.y1;
    const da = m.assists[1 - p.owner];
    if (da && (da.state === 'attack' || da.state === 'enter') && touches(assistHurt(da))) {
      p.life = 0;
      hitAssist(m, src, da);
      continue;
    }
    if (def.state === 'juggle' && def.juggleCount >= styleOf(owner).juggleLimit) continue;
    if (!hurtboxes(def).some(touches)) continue;
    if (invulnerableTo(def, mv, 'projectile')) {
      if (def.state === 'sidedash') p.dodged = true;
      continue;
    }
    p.life = 0;
    applyHit(m, src, def);
  }
  m.projectiles = ps.filter((p) => p.life > 0);
  resolveBeams(m);
}

function beamTip(b: BeamState): [number, number] {
  return [b.x + scale(b.len, b.dx), b.z + scale(b.len, b.dz)];
}

function resolveBeams(m: MatchState) {
  for (let i = 0; i < m.beams.length; i++) {
    const b = m.beams[i];
    if (b.clashing || b.len === 0) continue;
    const mv = beamMove(m, b);
    const bd = mv.beam!;
    const [tx, tz] = beamTip(b);
    // two beams meet: a beam clash
    for (let j = 0; j < m.beams.length; j++) {
      const c = m.beams[j];
      if (c.owner === b.owner || c.clashing || c.len === 0) continue;
      const cw = beamMove(m, c).beam!.width;
      const [cx, cz] = beamTip(c);
      const near = bd.width + cw + 1500;
      if (pointSegDist(tx, tz, c.x, c.z, cx, cz) <= near || pointSegDist(cx, cz, b.x, b.z, tx, tz) <= near) {
        b.clashing = true;
        c.clashing = true;
        const pair: [number, number] = b.owner === 0 ? [i, j] : [j, i];
        m.clash = { pos: 500, timer: CLASH_FRAMES, beams: pair, presses: [0, 0] };
        emit(m, 'beamClash', b.owner, (tx + cx) >> 1, b.y, (tz + cz) >> 1, 3, 'BEAM CLASH');
        return;
      }
    }
    // beams burn through the other side's projectiles
    for (const p of m.projectiles) {
      if (p.owner !== b.owner && pointSegDist(p.x, p.z, b.x, b.z, tx, tz) <= bd.width + 1500) p.life = 0;
    }
    if (b.age % bd.hitEvery !== 0) continue;
    const owner = m.fighters[b.owner];
    const def = m.fighters[1 - b.owner];
    const src: Source = { owner, actor: { x: b.x, z: b.z, y: b.y, fx: b.dx, fz: b.dz }, mv, kind: 'beam', dx: b.dx, dz: b.dz, moveFrame: 0, isLast: true };
    const touches = (h: Hurt) => pointSegDist(h.x, h.z, b.x, b.z, tx, tz) <= bd.width + h.r && b.y + bd.width > h.y0 && b.y - bd.width < h.y1;
    const da = m.assists[1 - b.owner];
    if (da && da.state !== 'hit' && da.state !== 'leave' && touches(assistHurt(da))) hitAssist(m, src, da);
    if (def.state === 'juggle' && def.juggleCount >= styleOf(owner).juggleLimit + 3) continue;
    if (invulnerableTo(def, mv, 'beam')) continue;
    const body = hurtboxes(def)[0];
    if (body && touches(body)) applyHit(m, src, def);
  }
  m.projectiles = m.projectiles.filter((p) => p.life > 0);
}

// mash L, H or S to push the clash point into the other beam
function stepClash(m: MatchState) {
  const c = m.clash!;
  for (const s of [0, 1] as const) {
    const h = m.fighters[s].hist[m.fighters[s].hist.length - 1];
    const n = popcount(h.pressed & ATTACKS);
    c.presses[s] += n;
    c.pos += (s === 0 ? 1 : -1) * n * CLASH_PUSH;
  }
  c.pos = Math.max(0, Math.min(1000, c.pos));
  c.timer--;
  if (c.pos >= 1000 || c.pos <= 0 || c.timer <= 0) endClash(m);
}

function endClash(m: MatchState) {
  const c = m.clash!;
  m.clash = null;
  const beams = c.beams.map((i) => m.beams[i]);
  const w = c.pos > 500 ? 0 : c.pos < 500 ? 1 : -1;
  if (w >= 0) {
    const winner = w as 0 | 1;
    const wb = beams[winner];
    const mv = beamMove(m, wb);
    const loser = m.fighters[1 - winner];
    const blast: MoveDef = { ...mv, damage: mv.beam!.clashDamage, launch: { fwd: 900, vy: 1200 }, knockdown: true, minScale: 100 };
    const src: Source = { owner: m.fighters[winner], actor: { x: wb.x, z: wb.z, y: wb.y, fx: wb.dx, fz: wb.dz }, mv: blast, kind: 'beam', dx: wb.dx, dz: wb.dz, moveFrame: 0, isLast: true, force: true };
    emit(m, 'clashWin', winner, loser.x, 12000, loser.z, 3, 'CLASH WIN');
    applyHit(m, src, loser);
  }
  m.beams = m.beams.filter((b) => !beams.includes(b));
  for (const b of beams) {
    const f = m.fighters[b.owner];
    const a = m.assists[b.owner];
    if (b.fromAssist) {
      if (a && a.state === 'attack') {
        a.state = 'leave';
        a.stateFrame = 0;
      }
    } else if (f.state === 'move' && moveOf(f).beam) endMove(f);
  }
}

// ---------------------------------------------------------------------------------------------- spacing

function pushSpan(f: FighterState): [number, number] {
  if (airborne(f)) return [f.y + 4000, f.y + 14000];
  if (f.state === 'knockdown' || f.state === 'ko') return [0, 4000];
  return [0, STAND_HEIGHT];
}

function resolveSpacing(m: MatchState) {
  const [a, b] = m.fighters;
  for (const f of m.fighters) {
    if (f.state === 'thrown') continue;
    const clamped = clampArena(f);
    // knocked into the fence by a wall-splat move: pinned there
    if (f.pendingWallSplat && (f.state === 'juggle' || f.state === 'hitstun') && (clamped || atWall(f))) wallSplat(m, f, m.fighters[1 - f.side]);
    else if (clamped) {
      if (f.state === 'juggle') {
        f.vx = 0;
        f.vz = 0;
      }
      f.kb = 0;
    }
  }
  if (a.state === 'thrown' || b.state === 'thrown') return;
  const [ay0, ay1] = pushSpan(a);
  const [by0, by1] = pushSpan(b);
  if (!(ay0 < by1 && by0 < ay1)) return;
  const need = 2 * BODY_R - 200;
  for (let pass = 0; pass < 2; pass++) {
    const d = len(b.x - a.x, b.z - a.z);
    if (d >= need) return;
    // push apart along the line between them (or across the facing when exactly on top of each other)
    const [dx, dz] = norm(b.x - a.x, b.z - a.z, a.fx, a.fz);
    const ov = need - d;
    const half = ov >> 1;
    const aStuck = len(a.x, a.z) >= LIM - 10 && scale(a.x, -dx) + scale(a.z, -dz) > 0;
    const bStuck = len(b.x, b.z) >= LIM - 10 && scale(b.x, dx) + scale(b.z, dz) > 0;
    const pa = aStuck ? 0 : bStuck ? ov : half;
    const pb = ov - pa;
    a.x -= scale(pa, dx);
    a.z -= scale(pa, dz);
    b.x += scale(pb, dx);
    b.z += scale(pb, dz);
    clampArena(a);
    clampArena(b);
  }
}

// lock-on: fighters keep facing each other while they can act; guarding turns slowly, so fast circling
// and assists from the side can get behind a guard
function lockOn(f: FighterState, o: FighterState) {
  const [ux, uz] = toward(f, o);
  switch (f.state) {
    case 'idle':
    case 'run':
    case 'land':
    case 'dashEnd':
    case 'getup':
    case 'parry':
    case 'parryEnd':
    case 'prejump':
    case 'win':
      f.fx = ux;
      f.fz = uz;
      break;
    case 'guard':
    case 'blockstun':
    case 'air':
      turnToward(f, ux, uz, 5);
      break;
  }
}

// the shared camera looks across the line between the fighters and swings round as they circle
function updateAxis(m: MatchState) {
  const [a, b] = m.fighters;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (len(dx, dz) < 6000) return;
  let [tx, tz] = norm(dx, dz);
  if (dotU(tx, tz, m.ax, m.az) < 0) {
    tx = -tx;
    tz = -tz;
  }
  [m.ax, m.az] = norm(m.ax * 11 + tx, m.az * 11 + tz, m.ax, m.az);
}

// ---------------------------------------------------------------------------------------------- meters

function regen(m: MatchState, f: FighterState) {
  const st = styleOf(f);
  if (st.drive) {
    if (f.burnout) {
      f.drive += DRIVE_REGEN_BURNOUT;
      if (f.drive >= DRIVE_MAX) {
        f.drive = DRIVE_MAX;
        f.burnout = false;
      }
    } else if (f.state !== 'parry' && f.state !== 'hitstun' && f.state !== 'blockstun' && !(f.state === 'move' && moveOf(f).kind === 'drive')) {
      f.drive = Math.min(DRIVE_MAX, f.drive + DRIVE_REGEN);
    }
  }
  // the assist cooldown starts when the partner has left
  if (f.assistCD > 0 && !m.assists[f.side]) f.assistCD--;
  if (f.tagCD > 0) f.tagCD--;
  if (m.training?.infiniteMeter) {
    if (st.drive) {
      f.drive = DRIVE_MAX;
      f.burnout = false;
    }
    if (st.supers) f.superMeter = SUPER_MAX;
  }
}

// ---------------------------------------------------------------------------------------------- the step

export function step(m: MatchState, raw: [number, number]) {
  m.events = [];
  m.frame++;
  const [a, b] = m.fighters;
  for (const f of m.fighters) {
    const [ux, uz] = toward(f, m.fighters[1 - f.side]);
    pushInput(f.hist, m.frame, m.phase === 'fight' ? raw[f.side] : 0, m.ax, m.az, ux, uz);
  }

  if (m.phase === 'intro') {
    m.phaseFrame++;
    if (m.phaseFrame === 1) emit(m, 'round', 0, 0, 12000, 0, m.round, `ROUND ${m.round}`);
    if (m.phaseFrame >= 100) {
      m.phase = 'fight';
      m.phaseFrame = 0;
      emit(m, 'fight', 0, 0, 12000, 0, 1, 'FIGHT!');
    }
    return;
  }
  if (m.clash) {
    stepClash(m);
    return;
  }
  if (m.freeze > 0) {
    m.freeze--;
    return;
  }
  m.phaseFrame++;

  if (m.phase === 'fight') {
    control(m, a, b);
    control(m, b, a);
  }
  advance(m, a, b);
  advance(m, b, a);
  for (const s of [0, 1] as const) {
    const as = m.assists[s];
    if (as) advanceAssist(m, as);
  }
  stepProjectiles(m);
  stepBeams(m);
  resolveSpacing(m);
  if (m.phase === 'fight') resolveHits(m);
  lockOn(a, b);
  lockOn(b, a);
  updateAxis(m);
  regen(m, a);
  regen(m, b);
  trackAdvantage(m);
  if (m.training) trainingRules(m);
  else roundRules(m);
}

function trackAdvantage(m: MatchState) {
  for (const f of m.fighters) {
    const now = actionable(f);
    if (now && !f.wasActionable) f.actionableSince = m.frame;
    f.wasActionable = now;
  }
  for (const att of m.fighters) {
    const def = m.fighters[1 - att.side];
    if (!m.advPending[att.side]) continue;
    if (actionable(att) && actionable(def)) {
      m.lastAdvantage[att.side] = def.actionableSince - att.actionableSince;
      m.advPending[att.side] = 0;
    }
  }
}

function trainingRules(m: MatchState) {
  for (const f of m.fighters) {
    if (f.health <= 0) {
      f.health = 1;
      if (f.state === 'ko') setState(f, 'knockdown');
    }
  }
  const [a, b] = m.fighters;
  if (m.training?.autoRefill && actionable(a) && actionable(b)) {
    if (m.frame - Math.max(a.actionableSince, b.actionableSince) >= 45) {
      a.health = styleOf(a).health;
      b.health = styleOf(b).health;
    }
  }
}

function roundRules(m: MatchState) {
  const [a, b] = m.fighters;
  if (m.phase === 'fight') {
    m.timer--;
    const koA = a.health <= 0;
    const koB = b.health <= 0;
    if (koA || koB || m.timer <= 0) {
      if (!koA && !koB) emit(m, 'timeover', 0, 0, 12000, 0, 1, 'TIME');
      m.phase = 'ko';
      m.phaseFrame = 0;
      m.winner = koA && koB ? 2 : koA ? 1 : koB ? 0 : a.health === b.health ? 2 : a.health > b.health ? 0 : 1;
      m.projectiles = [];
      m.beams = [];
      m.assists = [null, null];
    }
    return;
  }
  if (m.phase === 'ko') {
    if (m.phaseFrame === 70 && m.winner !== 2) {
      const w = m.fighters[m.winner as 0 | 1];
      if (w.health > 0 && !airborne(w)) {
        endMove(w);
        setState(w, 'win');
      }
    }
    if (m.phaseFrame >= 170) {
      if (m.winner === 0 || m.winner === 1) m.fighters[m.winner].roundWins++;
      const done = a.roundWins >= ROUNDS_TO_WIN || b.roundWins >= ROUNDS_TO_WIN || m.round >= 5;
      if (done) {
        m.phase = 'matchEnd';
        m.phaseFrame = 0;
        m.winner = a.roundWins === b.roundWins ? 2 : a.roundWins > b.roundWins ? 0 : 1;
      } else nextRound(m);
    }
  }
}

function freshFighters(m: MatchState) {
  m.fighters = m.fighters.map((f) => {
    const n = createFighter(f.side, f.style);
    n.roundWins = f.roundWins;
    // the Drive gauge refills between rounds, the super gauge carries over
    n.superMeter = f.superMeter;
    n.hist = f.hist;
    return n;
  }) as [FighterState, FighterState];
  m.assists = [null, null];
  m.projectiles = [];
  m.beams = [];
  m.clash = null;
  m.ax = ONE;
  m.az = 0;
}

function nextRound(m: MatchState) {
  m.round++;
  m.phase = 'intro';
  m.phaseFrame = 0;
  m.timer = ROUND_SECONDS * FPS;
  m.winner = -1;
  freshFighters(m);
}

export function resetPositions(m: MatchState) {
  freshFighters(m);
  m.freeze = 0;
}
