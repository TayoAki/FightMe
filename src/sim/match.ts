// The deterministic match simulation. `step` advances one frame from both players' raw inputs. It uses
// integer arithmetic on plain data only, so the same inputs always give the same state.

import {
  BACKDASH_FRAMES,
  BACKDASH_SPEED,
  CRUMPLE_FRAMES,
  CROUCH_HEIGHT,
  DASH_FRAMES,
  DASH_SPEED,
  DIZZY_FRAMES,
  DRIVE_BAR,
  DRIVE_MAX,
  DRIVE_REGEN,
  DRIVE_REGEN_BURNOUT,
  DRIVE_RUSH_BONUS,
  GETUP_FRAMES,
  GRAVITY,
  JUGGLE_GRAVITY,
  HEAT_FRAMES,
  JUMP_VY,
  KNOCKDOWN_FRAMES,
  LANDING,
  MAX_HEALTH,
  MAX_SEPARATION,
  PARRY_DRAIN,
  PREJUMP,
  PUSH_HALF,
  PUSH_HALF_AIR,
  RAGE_THRESHOLD,
  ROUNDS_TO_WIN,
  ROUND_SECONDS,
  SCALING,
  STAGE_HALF,
  STAND_HEIGHT,
  START_GAP,
  SUPER_BAR,
  SUPER_MAX,
  THROW_PROTECT,
  THROW_TECH_WINDOW,
  WALLSPLAT_FRAMES,
  FPS,
} from './constants';
import { BUTTONS, IN, PRESS_BUFFER, findPress, isBack, isDown, isForward, isUp, matchMotion, pushInput } from './input';
import { STYLES, totalFrames } from './styles';
import type {
  Box,
  CommandDef,
  Facing,
  FighterState,
  GameEventType,
  MatchState,
  MoveDef,
  ProjectileState,
  StyleDef,
  StyleId,
  TrainingOptions,
} from './types';

const MP = IN.B2, MK = IN.B5;
const THROW_BUTTONS = IN.B1 | IN.B4;
const HEAVY_FIRST = [IN.B3, IN.B6, IN.B2, IN.B5, IN.B1, IN.B4];

export const styleOf = (f: FighterState): StyleDef => STYLES[f.style];
export const moveOf = (f: FighterState): MoveDef => STYLES[f.style].moves[f.moveId];

export function createFighter(side: 0 | 1, style: StyleId): FighterState {
  return {
    side,
    style,
    x: side === 0 ? -START_GAP / 2 : START_GAP / 2,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    health: MAX_HEALTH,
    drive: DRIVE_MAX,
    superMeter: 0,
    burnout: false,
    heatAvailable: true,
    heatTimer: 0,
    rageUsed: false,
    state: 'idle',
    stateFrame: 0,
    moveId: '',
    moveFrame: 0,
    moveStartF: 0,
    hitIndex: 0,
    hitConnected: 0,
    contact: '',
    contactF: 0,
    stun: 0,
    kb: 0,
    kbDir: 1,
    jumpDir: 0,
    airUsed: false,
    crouching: false,
    blockHeight: '',
    armorLeft: 0,
    driveRushBuff: 0,
    fromDriveRush: false,
    juggleCount: 0,
    tornadoUsed: false,
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
    fighters: [createFighter(0, styles[0]), createFighter(1, styles[1])],
    projectiles: [],
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
  const s = JSON.stringify([m.frame, m.freeze, m.phase, m.timer, m.fighters, m.projectiles]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function emit(m: MatchState, type: GameEventType, f: FighterState, power = 1, text?: string, x = f.x, y = f.y + 12000) {
  m.events.push({ type, side: f.side, x, y, power, text });
}

// ---------------------------------------------------------------------------------------------- geometry

export function toWorld(f: FighterState, b: Box): Box {
  const x = f.facing === 1 ? f.x + b.x : f.x - (b.x + b.w);
  return { x, y: f.y + b.y, w: b.w, h: b.h };
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const airborne = (f: FighterState) => f.y > 0 || f.vy > 0;

export function hurtboxes(f: FighterState): Box[] {
  switch (f.state) {
    case 'knockdown':
    case 'getup':
    case 'ko':
    case 'thrown':
    case 'throwing':
      return [];
    case 'juggle':
      return [toWorld(f, { x: -2600, y: 0, w: 5200, h: 9000 })];
  }
  const out: Box[] = [];
  if (airborne(f)) {
    out.push(toWorld(f, { x: -1800, y: 1500, w: 3600, h: 13500 }));
  } else {
    let bottom = 0;
    if (f.state === 'move') {
      const mv = moveOf(f);
      if (mv.airborne && f.moveFrame >= mv.airborne[0] && f.moveFrame <= mv.airborne[1]) bottom = 4500;
    }
    const h = f.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    out.push(toWorld(f, { x: -2000, y: bottom, w: 4000, h: h - bottom }));
  }
  if (f.state === 'move') {
    const mv = moveOf(f);
    if (mv.hurtbox) out.push(toWorld(f, mv.hurtbox));
    // limbs stick out from just before the hit until halfway through recovery: whiffs can be punished
    const hb = mv.hitbox;
    if (hb && mv.kind !== 'throw' && f.moveFrame >= mv.startup - 2 && f.moveFrame <= mv.startup + mv.active + (mv.recovery >> 1)) {
      const reach = hb.x + hb.w - 900;
      if (reach > 2000) out.push(toWorld(f, { x: 1500, y: hb.y + 300, w: reach - 1500, h: Math.max(1500, hb.h - 600) }));
    }
  }
  return out;
}

function pushHalf(f: FighterState) {
  return airborne(f) ? PUSH_HALF_AIR : PUSH_HALF;
}

function pushSpan(f: FighterState): [number, number] {
  if (airborne(f)) return [f.y + 4000, f.y + 14000];
  if (f.state === 'knockdown' || f.state === 'ko') return [0, 4000];
  return [0, f.crouching ? CROUCH_HEIGHT : STAND_HEIGHT];
}

const WALL = STAGE_HALF - PUSH_HALF;
const atWall = (f: FighterState, dir: Facing) => (dir === 1 ? f.x >= WALL - 400 : f.x <= -WALL + 400);

// ---------------------------------------------------------------------------------------------- state helpers

function setState(f: FighterState, s: FighterState['state']) {
  f.state = s;
  f.stateFrame = 0;
  if (s !== 'move') f.moveId = '';
}

export function actionable(f: FighterState) {
  return f.state === 'idle' || f.state === 'walkF' || f.state === 'walkB' || f.state === 'crouch';
}

const inHitState = (f: FighterState) =>
  f.state === 'hitstun' || f.state === 'juggle' || f.state === 'wallsplat' || f.state === 'crumple' || f.state === 'stagger';

const rageActive = (f: FighterState) => styleOf(f).rage && !f.rageUsed && f.health > 0 && f.health <= RAGE_THRESHOLD;

function endMove(f: FighterState) {
  setState(f, 'idle');
  f.moveId = '';
  f.moveFrame = 0;
  f.fromDriveRush = false;
  f.crouching = false;
}

function startMove(m: MatchState, f: FighterState, o: FighterState, id: string, cmd?: CommandDef) {
  const st = styleOf(f);
  const mv = st.moves[id];
  const prevDR = f.state === 'move' && moveOf(f).tag === 'driveRush';
  if (id === 'dash' || id === 'backdash') {
    setState(f, id);
    f.lastConsumed = m.frame;
    return;
  }
  if (id === 'parry') {
    if (f.burnout || f.drive <= 0) return;
    setState(f, 'parry');
    f.crouching = false;
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
    f.facing = o.x >= f.x ? 1 : -1;
    f.vx = 0;
  }
  const dir = f.hist[f.hist.length - 1].dir;
  f.crouching = !mv.air && st.normals.crouch && Object.values(st.normals.crouch).includes(id);
  f.throwBack = mv.kind === 'throw' && isBack(dir);
  setState(f, 'move');
  f.moveId = id;
  f.moveFrame = 0;
  f.moveStartF = m.frame;
  f.hitConnected = 0;
  f.contact = '';
  f.armorLeft = mv.armor ?? 0;
  f.fromDriveRush = prevDR && mv.kind === 'normal';
  f.lastConsumed = m.frame;
  if (mv.air) f.airUsed = true;
  m.lastMove[f.side] = mv.name;
  if (mv.superFreeze) {
    m.freeze = mv.superFreeze;
    emit(m, mv.kind === 'super' ? 'super' : mv.tag === 'heatSmash' ? 'heatSmash' : 'heat', f, mv.superFreeze, mv.name);
  }
  if (mv.tag === 'heatBurst') {
    f.heatAvailable = false;
    f.heatTimer = HEAT_FRAMES;
  }
  if (mv.tag === 'heatSmash') f.heatTimer = 0;
  if (mv.tag === 'rageArt') {
    f.rageUsed = true;
    emit(m, 'rageArt', f, 1, mv.name);
  }
  if (mv.tag === 'driveRush') emit(m, 'driveRush', f);
  if (mv.tag === 'driveImpact') emit(m, 'driveImpact', f);
  if (mv.tag === 'justFrame') emit(m, 'justFrame', f, 1, 'PERFECT');
  if (mv.tag === 'evade') emit(m, 'evade', f);
}

function enterBurnout(m: MatchState, f: FighterState) {
  f.drive = 0;
  if (!f.burnout) {
    f.burnout = true;
    emit(m, 'burnout', f, 1, 'BURNOUT');
  }
}

// ---------------------------------------------------------------------------------------------- input → action

type Ctx = 'ground' | 'parry' | 'blockstun' | 'prejump' | 'cancel' | 'driveRush' | 'kara';

function findCommand(f: FighterState, ctx: Ctx, opts: { kinds?: string[]; buffer?: number } = {}): CommandDef | null {
  const st = styleOf(f);
  const hist = f.hist;
  const n = hist.length - 1;
  const buffer = opts.buffer ?? PRESS_BUFFER;
  for (const cmd of st.commands) {
    const mv = st.moves[cmd.move];
    const from = cmd.from ?? 'ground';
    if (ctx === 'cancel' || ctx === 'driveRush' || ctx === 'kara') {
      if (from !== 'ground') continue;
      if (opts.kinds && !opts.kinds.includes(mv.kind)) continue;
      if (ctx === 'kara' && popcount(cmd.buttons) < 2) continue;
    } else if (from !== ctx) continue;
    if (cmd.needs === 'heat' && f.heatTimer <= 0) continue;
    if (cmd.needs === 'heatAvailable' && !(f.heatAvailable && f.heatTimer <= 0)) continue;
    if (cmd.needs === 'rage' && !rageActive(f)) continue;
    if (cmd.cost?.drive && (f.burnout || f.drive <= 0)) continue;
    if (cmd.cost?.super && f.superMeter < cmd.cost.super) continue;
    if (cmd.move === 'parry' && (f.burnout || f.drive <= 0)) continue;
    if (cmd.buttons === 0) {
      if (!cmd.motion || matchMotion(hist, cmd.motion, n) < 0) continue;
      return cmd;
    }
    const idx = findPress(hist, cmd.buttons, !!cmd.any, buffer, f.lastConsumed);
    if (idx < 0) continue;
    if (cmd.dirs && !cmd.dirs.includes(hist[idx].dir)) continue;
    if (cmd.motion) {
      const last = matchMotion(hist, cmd.motion, idx);
      if (last < 0) continue;
      if (cmd.justFrame && last !== idx) continue;
      // 2-3-6 rolled into a press also reads as 6-2-3: when the stick ends forward, it's the quarter circle
      if (cmd.motion === '623' && hist[idx].dir === 6 && matchMotion(hist, '236', idx) >= 0) continue;
    }
    return cmd;
  }
  return null;
}

function popcount(x: number) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

// the newest button press within the buffer, heaviest first when several land on one frame
function newestButton(f: FighterState, buffer = PRESS_BUFFER): number {
  const hist = f.hist;
  for (let i = hist.length - 1; i >= Math.max(0, hist.length - buffer); i--) {
    const h = hist[i];
    if (h.f <= f.lastConsumed) break;
    if (h.pressed & BUTTONS) {
      for (const b of HEAVY_FIRST) if (h.pressed & b) return b;
    }
  }
  return 0;
}

function normalFor(f: FighterState, button: number, stance: 'stand' | 'crouch' | 'air'): string | undefined {
  return styleOf(f).normals[stance][button];
}

function control(m: MatchState, f: FighterState, o: FighterState) {
  const st = styleOf(f);
  const cur = f.hist[f.hist.length - 1];
  switch (f.state) {
    case 'parry': {
      const c = findCommand(f, 'parry');
      if (c) {
        startMove(m, f, o, c.move, c);
        return;
      }
      if ((cur.held & (MP | MK)) !== (MP | MK) && f.stateFrame >= 6) {
        setState(f, 'parryEnd');
        f.stun = 6;
      }
      return;
    }
    case 'blockstun': {
      const c = findCommand(f, 'blockstun');
      if (c) startMove(m, f, o, c.move, c);
      return;
    }
    case 'thrown': {
      if (f.stateFrame <= THROW_TECH_WINDOW && findPress(f.hist, THROW_BUTTONS, false, 12, f.lastConsumed) >= 0) {
        techThrow(m, o, f);
      }
      return;
    }
    case 'prejump': {
      const c = findCommand(f, 'prejump');
      if (c) startMove(m, f, o, c.move, c);
      return;
    }
    case 'air': {
      if (f.airUsed) return;
      const b = newestButton(f);
      const id = b && normalFor(f, b, 'air');
      if (id) startMove(m, f, o, id);
      return;
    }
    case 'move':
      moveControl(m, f, o);
      return;
  }
  if (!actionable(f)) return;
  const c = findCommand(f, 'ground');
  if (c) {
    startMove(m, f, o, c.move, c);
    return;
  }
  const b = newestButton(f);
  if (b) {
    const id = normalFor(f, b, isDown(cur.dir) ? 'crouch' : 'stand');
    if (id) {
      startMove(m, f, o, id);
      return;
    }
  }
  const d = cur.dir;
  if (isUp(d)) {
    setState(f, 'prejump');
    f.jumpDir = d === 7 ? -1 : d === 9 ? 1 : 0;
    f.crouching = false;
    return;
  }
  const next = isDown(d) ? 'crouch' : isForward(d) ? 'walkF' : isBack(d) ? 'walkB' : 'idle';
  f.crouching = next === 'crouch';
  if (f.state !== next) setState(f, next);
  void st;
}

function moveControl(m: MatchState, f: FighterState, o: FighterState) {
  const mv = moveOf(f);
  const st = styleOf(f);
  // Drive Rush: cancel into any normal or throw from frame 9
  if (mv.tag === 'driveRush' && f.moveFrame >= 9) {
    const c = findCommand(f, 'driveRush', { kinds: ['normal', 'throw'] });
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
    const b = newestButton(f, 8);
    const id = b && normalFor(f, b, isDown(f.hist[f.hist.length - 1].dir) ? 'crouch' : 'stand');
    if (id) {
      startMove(m, f, o, id);
      return;
    }
  }
  // two-button commands win over a normal pressed a frame early (throws, parry, Drive Impact, Heat)
  if (mv.kind === 'normal' && f.moveFrame <= 2 && !f.contact) {
    const c = findCommand(f, 'kara', { buffer: 3 });
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
  }
  const endActive = mv.startup + mv.active - 1;
  const connected = f.contact === 'hit' || f.contact === 'block';
  // chains: strings (on whiff, at their natural timing) and target combos (on contact, at once)
  if (mv.chains && f.moveFrame >= mv.startup && f.moveFrame <= endActive + (mv.chainWindow ?? 8)) {
    for (const ch of mv.chains) {
      if (!ch.onWhiff && !connected) continue;
      if (ch.onWhiff && f.moveFrame < endActive && !connected) continue;
      const idx = findPress(f.hist, ch.buttons, true, m.frame - f.moveStartF + 1, f.moveStartF);
      if (idx < 0) continue;
      if (ch.dirs && !ch.dirs.includes(f.hist[idx].dir)) continue;
      startMove(m, f, o, ch.to);
      return;
    }
  }
  // special and super cancels, on hit or block
  if (mv.cancels && connected && f.moveFrame <= endActive + 10) {
    const buffer = m.frame - f.contactF + 10;
    const kinds: string[] = [];
    if (mv.cancels.includes('special')) kinds.push('special');
    if (mv.cancels.includes('super')) kinds.push('super');
    const c = kinds.length ? findCommand(f, 'cancel', { kinds, buffer }) : null;
    if (c) {
      startMove(m, f, o, c.move, c);
      return;
    }
    // Drive Rush cancel: MP+MK from a cancelable normal, 3 bars
    if (st.drive && mv.cancels.includes('drive') && !f.burnout && f.drive > 0 && findPress(f.hist, MP | MK, false, buffer, f.lastConsumed) >= 0) {
      startMove(m, f, o, 'drive_rush', { move: 'drive_rush', buttons: MP | MK, cost: { drive: 3 * DRIVE_BAR } });
    }
  }
}

// ---------------------------------------------------------------------------------------------- per-frame motion

function advance(m: MatchState, f: FighterState, o: FighterState) {
  const st = styleOf(f);
  f.stateFrame++;
  if (f.throwProtect > 0) f.throwProtect--;
  // knockback slides the fighter in any state
  if (f.kb > 0) {
    const s = f.kb < 60 ? f.kb : Math.max(1, f.kb >> 2);
    f.x += f.kbDir * s;
    f.kb -= s;
  }
  switch (f.state) {
    case 'idle':
    case 'crouch':
      break;
    case 'walkF':
      f.x += f.facing * st.walkF;
      break;
    case 'walkB':
      f.x -= f.facing * st.walkB;
      break;
    case 'prejump':
      if (f.stateFrame >= PREJUMP) {
        setState(f, 'air');
        f.vy = JUMP_VY;
        f.vx = f.jumpDir * st.jumpVx * f.facing;
        f.y = 1;
        f.airUsed = false;
        emit(m, 'jump', f);
      }
      break;
    case 'air':
      if (airPhysics(f)) {
        setState(f, 'land');
        f.stun = LANDING;
        emit(m, 'land', f);
      }
      break;
    case 'land':
    case 'parryEnd':
      if (--f.stun <= 0) endMove(f);
      break;
    case 'dash': {
      const t = f.stateFrame;
      const speed = t <= 4 ? DASH_SPEED >> 1 : t <= 13 ? DASH_SPEED : DASH_SPEED >> 2;
      f.x += f.facing * speed;
      if (t >= DASH_FRAMES) endMove(f);
      break;
    }
    case 'backdash': {
      const t = f.stateFrame;
      const speed = t <= 14 ? BACKDASH_SPEED : BACKDASH_SPEED >> 2;
      f.x -= f.facing * speed;
      if (t >= BACKDASH_FRAMES) endMove(f);
      break;
    }
    case 'move':
      advanceMove(m, f);
      break;
    case 'hitstun':
    case 'blockstun':
    case 'stagger':
      if (--f.stun <= 0) {
        endMove(f);
        f.throwProtect = THROW_PROTECT;
        f.blockHeight = '';
      }
      break;
    case 'juggle':
      if (airPhysics(f)) {
        if (f.health <= 0) setState(f, 'ko');
        else {
          setState(f, 'knockdown');
          emit(m, 'knockdown', f);
        }
        f.vx = 0;
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
        f.vx = -f.facing * 150;
        f.juggleCount = 99;
      }
      break;
    case 'crumple':
      if (f.stateFrame >= CRUMPLE_FRAMES) {
        setState(f, 'knockdown');
        emit(m, 'knockdown', f);
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
      f.x = o.x + o.facing * 4600;
      break;
    case 'throwing':
      advanceThrow(m, f, o);
      break;
    case 'win':
      break;
  }
}

// returns true on landing
function airPhysics(f: FighterState): boolean {
  f.x += f.vx;
  f.y += f.vy;
  f.vy -= f.state === 'juggle' ? JUGGLE_GRAVITY : GRAVITY;
  if (f.y <= 0 && f.vy < 0) {
    f.y = 0;
    f.vy = 0;
    return true;
  }
  return false;
}

function advanceMove(m: MatchState, f: FighterState) {
  const mv = moveOf(f);
  f.moveFrame++;
  const t = f.moveFrame;
  if (mv.velocity) {
    for (const seg of mv.velocity) {
      if (t < seg.from || t > seg.to) continue;
      f.x += f.facing * seg.vx;
      if (seg.vy !== undefined && t === seg.from) {
        f.vy = seg.vy;
        f.y = Math.max(f.y, 1);
      }
    }
  }
  if (f.fromDriveRush && t <= 8) f.x += f.facing * 260;
  if (mv.projectile && t === mv.startup) spawnProjectile(m, f, mv);
  if (airborne(f)) {
    const wasRising = f.vy > 0;
    // ground moves with their own lift (uppercuts, hop kicks) don't keep jump momentum
    if (!mv.air) f.vx = 0;
    if (airPhysics(f)) {
      if (mv.air || t >= mv.startup || !wasRising) {
        setState(f, 'land');
        f.stun = mv.air ? (mv.landingRecovery ?? LANDING) : (mv.landingRecovery ?? LANDING);
        f.moveId = '';
        emit(m, 'land', f);
        return;
      }
    }
  }
  // the move's last frame: the fighter can act on the next one
  if (t >= totalFrames(mv)) {
    if (airborne(f)) {
      if (mv.air) {
        setState(f, 'air');
        f.moveId = '';
      }
      // ground moves that are still in the air keep falling inside the move until they land
      return;
    }
    endMove(f);
  }
}

function spawnProjectile(m: MatchState, f: FighterState, mv: MoveDef) {
  const p = mv.projectile!;
  const proj: ProjectileState = {
    owner: f.side,
    moveId: mv.id,
    x: f.x + f.facing * p.spawnX,
    y: f.y + p.spawnY,
    vx: f.facing * p.speed,
    life: p.life,
    age: 0,
    kind: p.kind,
    dodged: false,
  };
  m.projectiles.push(proj);
  emit(m, 'projectile', f, 1, undefined, proj.x, proj.y);
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
    case 'move': {
      const mv = moveOf(f);
      if (mv.invuln && f.moveFrame >= mv.invuln[0] && f.moveFrame <= mv.invuln[1]) return false;
      return true;
    }
  }
  return true;
}

function tryThrow(m: MatchState, f: FighterState, o: FighterState, mv: MoveDef): boolean {
  if (!throwable(o)) return false;
  const reach = toWorld(f, mv.hitbox!);
  const half = pushHalf(o);
  const body: Box = { x: o.x - half, y: 0, w: half * 2, h: STAND_HEIGHT };
  if (!overlap(reach, body)) return false;
  // both throwing at once: a tech
  if (o.state === 'move' && moveOf(o).kind === 'throw' && o.moveFrame >= moveOf(o).startup) {
    techThrow(m, f, o);
    return true;
  }
  const counter = o.state === 'parry' || (o.state === 'move' && o.moveFrame > moveOf(o).startup + moveOf(o).active - 1);
  setState(f, 'throwing');
  setState(o, 'thrown');
  o.lastConsumed = Math.max(o.lastConsumed, m.frame - 4);
  o.crouching = false;
  o.kb = 0;
  f.kb = 0;
  f.throwTimer = counter ? 1 : 0;
  f.contact = 'hit';
  f.contactF = m.frame;
  emit(m, 'throw', f, 1, counter ? 'PUNISH COUNTER' : undefined);
  return true;
}

function techThrow(m: MatchState, a: FighterState, b: FighterState) {
  for (const [f, o] of [[a, b], [b, a]] as const) {
    setState(f, 'blockstun');
    f.stun = 18;
    f.kb = 5200;
    f.kbDir = (f.x >= o.x ? 1 : -1) as Facing;
    f.moveId = '';
    f.contact = 'block';
  }
  emit(m, 'tech', a, 1, 'TECH', (a.x + b.x) >> 1);
  m.freeze = 8;
}

function advanceThrow(m: MatchState, f: FighterState, o: FighterState) {
  const t = f.stateFrame;
  if (t === THROW_TECH_WINDOW + 1 && o.state === 'thrown') {
    const mv = styleOf(f).moves.throw;
    const mult = f.throwTimer ? 1.7 : 1;
    const dmg = Math.floor((mv.throwDamage ?? 1200) * mult);
    o.health = Math.max(0, o.health - dmg);
    o.comboHits = 1;
    o.comboDamage = dmg;
    if (f.throwBack) {
      // back throw: the victim lands on the other side
      o.x = f.x - f.facing * 4600;
    }
    const dir: Facing = o.x >= f.x ? 1 : -1;
    setState(o, o.health <= 0 ? 'ko' : 'juggle');
    o.vy = 900;
    o.vx = dir * 420;
    o.y = 1;
    o.juggleCount = 99;
    m.bestCombo[f.side] = Math.max(m.bestCombo[f.side], dmg);
    m.freeze = 10;
    emit(m, 'hit', o, 3, undefined, o.x, 10000);
    if (o.health <= 0) emit(m, 'ko', o);
  }
  if (t >= 32) endMove(f);
}

// ---------------------------------------------------------------------------------------------- hits

function invulnerableTo(def: FighterState, mv: MoveDef, projectile: boolean): boolean {
  if (def.state === 'move') {
    const dm = moveOf(def);
    if (dm.invuln && def.moveFrame >= dm.invuln[0] && def.moveFrame <= dm.invuln[1]) {
      if (dm.tag === 'evade') return projectile || !mv.tracking;
      return true;
    }
  }
  return false;
}

function canBlock(def: FighterState, att: FighterState, mv: MoveDef): 'stand' | 'crouch' | '' {
  if (airborne(def)) return '';
  if (!(actionable(def) || def.state === 'blockstun')) return '';
  const st = styleOf(def);
  const raw = def.hist[def.hist.length - 1].raw;
  // "back" is away from the attacker, so cross-ups are blocked by holding the other way
  const away = att.x >= def.x ? IN.LEFT : IN.RIGHT;
  const toward = away === IN.LEFT ? IN.RIGHT : IN.LEFT;
  const holdAway = (raw & away) !== 0 && (raw & toward) === 0;
  const down = (raw & IN.DOWN) !== 0 && (raw & IN.UP) === 0;
  const holdToward = (raw & toward) !== 0 && (raw & away) === 0;
  const crouchGuard = down && (holdAway || (st.crouchGuardDirs.includes(2) && !holdToward));
  const neutral = !holdAway && !holdToward && !down && (raw & IN.UP) === 0;
  const standGuard = !down && (holdAway || (st.neutralGuard && neutral && (def.state === 'idle' || def.state === 'blockstun')));
  switch (mv.height) {
    case 'high':
      return standGuard ? 'stand' : crouchGuard ? 'crouch' : '';
    case 'mid':
      // a crouching guard stops a mid only when both styles allow it: Iron mids must be blocked standing,
      // and an Iron fighter can't crouch-block anyone's mids
      return standGuard ? 'stand' : crouchGuard && st.crouchGuardBlocksMid && styleOf(att).crouchGuardBlocksMid ? 'crouch' : '';
    case 'low':
      return crouchGuard ? 'crouch' : '';
    case 'overhead':
      return standGuard ? 'stand' : '';
  }
}

const defaultPush = (dmg: number) => (dmg <= 300 ? 2200 : dmg <= 700 ? 3000 : 3800);
const defaultHitstop = (dmg: number) => (dmg <= 300 ? 8 : dmg <= 700 ? 10 : 12);

function pushApart(att: FighterState, def: FighterState, amount: number) {
  const dir: Facing = def.x >= att.x ? 1 : -1;
  const wallX = dir === 1 ? WALL : -WALL;
  const room = Math.abs(wallX - def.x);
  if (room < amount) {
    def.kb = room;
    def.kbDir = dir;
    att.kb = amount - room;
    att.kbDir = (-dir) as Facing;
  } else {
    def.kb = amount;
    def.kbDir = dir;
  }
}

interface Source {
  att: FighterState;
  mv: MoveDef;
  projectile?: ProjectileState;
}

function applyHit(m: MatchState, src: Source, def: FighterState) {
  const { att, mv } = src;
  const isProj = !!src.projectile;
  const hits = mv.hits ?? 1;
  if (!isProj) att.hitConnected++;
  const isLast = isProj || att.hitConnected >= hits;
  const hitstop = mv.hitstop ?? defaultHitstop(mv.damage);
  const fx = isProj ? src.projectile!.x : def.x - att.facing * 1200;
  const fy = isProj ? src.projectile!.y : Math.min(def.y + 13000, Math.max(def.y + 3000, att.y + (mv.hitbox ? mv.hitbox.y + (mv.hitbox.h >> 1) : 12000)));
  const markContact = (c: 'hit' | 'block') => {
    if (isProj) return;
    att.contact = c;
    att.contactF = m.frame;
    m.advPending[att.side] = 1;
  };

  // Drive Parry
  if (def.state === 'parry') {
    const perfect = def.stateFrame <= 2 && !isProj;
    def.drive = Math.min(DRIVE_MAX, def.drive + (perfect ? 2 * DRIVE_BAR : DRIVE_BAR >> 1));
    markContact('block');
    if (!isProj) pushApart(def, att, 1600);
    if (perfect) {
      setState(att, 'stagger');
      att.stun = 28;
      att.comboScale50 = true;
      att.moveId = '';
      m.freeze = 22;
      emit(m, 'perfectParry', def, 2, 'PERFECT PARRY', fx, fy);
    } else {
      m.freeze = 8;
      emit(m, 'parry', def, 1, undefined, fx, fy);
    }
    def.stateFrame = Math.min(def.stateFrame, 3);
    return;
  }

  // armor absorbs hits during the move's startup
  if (def.state === 'move' && def.armorLeft > 0 && def.moveFrame < moveOf(def).startup + moveOf(def).active) {
    def.armorLeft--;
    def.health = Math.max(1, def.health - (mv.damage >> 1));
    markContact('block');
    m.freeze = hitstop;
    emit(m, 'armor', def, 1, 'ARMOR', fx, fy);
    return;
  }

  const guard = canBlock(def, att, mv);
  if (guard) {
    markContact('block');
    let chip = mv.chip ?? 0;
    if (def.burnout) chip += mv.damage >> 2;
    if (att.heatTimer > 0) chip += Math.floor(mv.damage * 0.15);
    def.health = Math.max(mv.kind === 'normal' ? 1 : 0, def.health - chip);
    if (styleOf(def).drive) {
      def.drive -= Math.floor(mv.damage * 2.5);
      if (def.drive <= 0) enterBurnout(m, def);
    }
    let stun: number;
    if (isProj) stun = mv.projectile!.blockstun;
    else if (mv.airStun) stun = mv.airStun.block + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
    else if (!isLast) stun = (mv.hitInterval ?? 4) + 6;
    else stun = Math.max(1, mv.onBlock + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0) + totalFrames(mv) - att.moveFrame);
    setState(def, 'blockstun');
    def.stun = stun;
    def.blockHeight = guard;
    def.crouching = guard === 'crouch';
    pushApart(att, def, Math.floor((mv.pushback ?? defaultPush(mv.damage)) * 1.1));
    gainMeter(att, mv.damage >> 1, def, mv.damage >> 2);
    m.freeze = hitstop;
    emit(m, 'block', def, mv.damage >= 800 ? 2 : 1, undefined, fx, fy);
    if (mv.tag === 'driveImpact') {
      if (def.burnout) {
        setState(def, 'dizzy');
        def.kb = 0;
        emit(m, 'dizzy', def, 2, 'STUN');
      } else if (atWall(def, att.facing)) {
        wallSplat(m, def, att);
      }
    }
    if (def.health <= 0) koHit(m, att, def);
    return;
  }

  // a clean hit
  markContact('hit');
  const comboing = inHitState(def);
  if (!comboing) {
    def.comboHits = 0;
    def.comboDamage = 0;
    def.juggleCount = 0;
    def.tornadoUsed = false;
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
  let mult = 100;
  if (counter) mult += 20;
  if (rageActive(att)) mult += 10;
  const dmg = Math.floor((mv.damage * pct * mult) / 10000);
  def.health = Math.max(0, def.health - dmg);
  def.comboHits++;
  def.comboDamage += dmg;
  def.lastHitBy = mv.name;
  m.bestCombo[att.side] = Math.max(m.bestCombo[att.side], def.comboDamage);
  gainMeter(att, dmg, def, dmg >> 2);
  if (styleOf(att).drive && !att.burnout) att.drive = Math.min(DRIVE_MAX, att.drive + (dmg >> 1));
  m.freeze = hitstop + (counter ? 2 : 0);
  emit(m, 'hit', def, dmg >= 1500 ? 3 : dmg >= 700 ? 2 : 1, undefined, fx, fy);
  if (counter === 'counter') emit(m, 'counter', att, 1, 'COUNTER');
  if (counter === 'punish') emit(m, 'punish', att, 1, 'PUNISH COUNTER');
  def.kb = 0;

  if (def.health <= 0) {
    koHit(m, att, def);
    return;
  }

  const wasAir = airborne(def) || def.state === 'juggle';
  if (mv.crumple && !wasAir) {
    if (atWall(def, att.facing)) wallSplat(m, def, att);
    else {
      setState(def, 'crumple');
      emit(m, 'driveImpact', def, 2, 'CRUMPLE');
    }
    def.crouching = false;
    return;
  }
  if (def.state === 'crumple' || def.state === 'dizzy') {
    // follow-ups on a crumpled or stunned fighter pop them up
    if (def.state === 'crumple' || mv.launch) {
      launch(def, att, mv.launch?.vx ?? 300, mv.launch?.vy ?? 1100, mv);
      return;
    }
  }
  if (def.state === 'wallsplat') {
    if (mv.launch || def.wallSplats >= 3) {
      launch(def, att, -(mv.launch?.vx ?? 300), mv.launch?.vy ?? 900, mv);
      def.juggleCount = 99;
    } else {
      def.stun = Math.max(18, WALLSPLAT_FRAMES - def.comboHits * 3);
      def.wallSplats++;
    }
    return;
  }
  if (wasAir) {
    const decay = Math.max(35, 100 - 12 * def.juggleCount);
    // launchers relaunch; other hits only keep the fighter floating
    let vy = Math.floor(((mv.launch?.vy ?? 480) * decay) / 100);
    if (mv.tornado && !def.tornadoUsed) {
      vy = 1450;
      def.tornadoUsed = true;
      emit(m, 'tornado', def, 2, 'TORNADO');
    }
    launch(def, att, mv.launch?.vx ?? 260, isProj ? 600 : vy, mv);
    def.juggleCount++;
    if (mv.air) def.juggleCount = 99; // air-to-air hits reset, they don't juggle
    return;
  }
  if (mv.launch && isLast) {
    launch(def, att, mv.launch.vx, mv.launch.vy, mv);
    if (mv.knockdown && mv.launch.vy < 800) def.juggleCount = 99; // sweeps and soft knockdowns
    return;
  }
  let stun: number;
  if (isProj) stun = mv.projectile!.hitstun;
  else if (mv.airStun) stun = mv.airStun.hit + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
  else if (!isLast) stun = (mv.hitInterval ?? 4) + 6;
  else {
    let adv = mv.onHit + (att.fromDriveRush ? DRIVE_RUSH_BONUS : 0);
    if (counter === 'counter') adv += 2;
    if (counter === 'punish') adv += 4;
    stun = Math.max(1, adv + totalFrames(mv) - att.moveFrame);
  }
  def.lastStunKind = def.crouching ? 'crouch' : mv.height === 'low' ? 'low' : 'high';
  setState(def, 'hitstun');
  def.stun = stun;
  def.pendingWallSplat = !!mv.wallSplat && def.wallSplats < 2;
  pushApart(att, def, mv.pushback ?? defaultPush(mv.damage));
}

function launch(def: FighterState, att: FighterState, vx: number, vy: number, mv: MoveDef) {
  setState(def, 'juggle');
  def.vx = att.facing * Math.floor(vx / 3);
  def.vy = vy;
  def.y = Math.max(def.y, 1);
  def.kb = 0;
  def.crouching = false;
  def.pendingWallSplat = !!mv.wallSplat && def.wallSplats < 2;
}

function wallSplat(m: MatchState, def: FighterState, att: FighterState) {
  setState(def, 'wallsplat');
  def.stun = WALLSPLAT_FRAMES;
  def.wallSplats++;
  def.vx = 0;
  def.vy = 0;
  def.y = Math.max(def.y, 3500);
  def.kb = 0;
  def.facing = (att.x >= def.x ? 1 : -1) as Facing;
  def.pendingWallSplat = false;
  def.crouching = false;
  m.freeze = Math.max(m.freeze, 14);
  emit(m, 'wallSplat', def, 2, 'WALL SPLAT');
}

function koHit(m: MatchState, att: FighterState, def: FighterState) {
  setState(def, 'ko');
  def.vy = 1200;
  def.vx = att.facing * 260;
  def.y = Math.max(def.y, 1);
  def.crouching = false;
  m.freeze = 40;
  emit(m, 'ko', def, 3, 'K.O.');
}

function gainMeter(att: FighterState, attGain: number, def: FighterState, defGain: number) {
  if (styleOf(att).supers) att.superMeter = Math.min(SUPER_MAX, att.superMeter + attGain);
  if (styleOf(def).supers) def.superMeter = Math.min(SUPER_MAX, def.superMeter + defGain);
}

function resolveHits(m: MatchState) {
  const [a, b] = m.fighters;
  const strikes: Array<[FighterState, FighterState, MoveDef]> = [];
  for (const [att, def] of [[a, b], [b, a]] as const) {
    if (att.state !== 'move') continue;
    const mv = moveOf(att);
    if (!mv.hitbox) continue;
    const k = att.moveFrame - mv.startup;
    if (k < 0 || k >= mv.active) continue;
    if (mv.kind === 'throw') {
      if (att.hitConnected === 0 && tryThrow(m, att, def, mv)) att.hitConnected = 1;
      continue;
    }
    const hits = mv.hits ?? 1;
    const interval = mv.hitInterval ?? mv.active;
    const due = Math.min(hits - 1, Math.floor(k / interval));
    if (att.hitConnected > due) continue;
    if (def.state === 'juggle' && def.juggleCount >= styleOf(att).juggleLimit) continue;
    if (invulnerableTo(def, mv, false)) continue;
    const hb = toWorld(att, mv.hitbox);
    if (!hurtboxes(def).some((h) => overlap(hb, h))) continue;
    strikes.push([att, def, mv]);
  }
  // simultaneous hits trade
  for (const [att, def, mv] of strikes) applyHit(m, { att, mv }, def);

  // projectiles: clash with each other, then hit fighters
  const ps = m.projectiles;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const p = ps[i], q = ps[j];
      if (p.owner === q.owner || p.life <= 0 || q.life <= 0) continue;
      if (Math.abs(p.x - q.x) < 2600 && Math.abs(p.y - q.y) < 2600) {
        p.life = 0;
        q.life = 0;
        m.events.push({ type: 'block', side: p.owner, x: (p.x + q.x) >> 1, y: p.y, power: 2 });
      }
    }
  }
  for (const p of ps) {
    if (p.life <= 0) continue;
    const owner = m.fighters[p.owner];
    const def = m.fighters[1 - p.owner];
    const mv = STYLES[owner.style].moves[p.moveId];
    const pd = mv.projectile!;
    const pb: Box = { x: p.x - (pd.w >> 1), y: p.y - (pd.h >> 1), w: pd.w, h: pd.h };
    if (p.dodged) continue;
    if (def.state === 'juggle' && def.juggleCount >= styleOf(owner).juggleLimit) continue;
    if (!hurtboxes(def).some((h) => overlap(pb, h))) continue;
    if (invulnerableTo(def, mv, true)) {
      if (def.state === 'move' && moveOf(def).tag === 'evade') p.dodged = true;
      continue;
    }
    p.life = 0;
    applyHit(m, { att: owner, mv, projectile: p }, def);
  }
  m.projectiles = ps.filter((p) => p.life > 0);
}

function stepProjectiles(m: MatchState) {
  for (const p of m.projectiles) {
    p.x += p.vx;
    p.age++;
    p.life--;
    if (Math.abs(p.x) > STAGE_HALF + 4000) p.life = 0;
  }
}

// ---------------------------------------------------------------------------------------------- spacing

function resolveSpacing(m: MatchState, prev: [number, number]) {
  const [a, b] = m.fighters;
  for (const f of m.fighters) {
    if (f.state === 'thrown') continue;
    const lim = WALL;
    if (f.x > lim || f.x < -lim) {
      const dir: Facing = f.x > 0 ? 1 : -1;
      f.x = dir * lim;
      if (f.pendingWallSplat && (f.state === 'juggle' || f.state === 'hitstun')) {
        const att = m.fighters[1 - f.side];
        wallSplat(m, f, att);
      }
      if (f.state === 'juggle') f.vx = 0;
    }
  }
  // pushboxes
  if (a.state !== 'thrown' && b.state !== 'thrown') {
    const [ay0, ay1] = pushSpan(a);
    const [by0, by1] = pushSpan(b);
    if (ay0 < by1 && by0 < ay1) {
      const need = pushHalf(a) + pushHalf(b);
      const dist = Math.abs(a.x - b.x);
      if (dist < need) {
        const ov = need - dist;
        // who's on the left: by position, then by who was on the left before this frame
        const aLeft = a.x !== b.x ? a.x < b.x : prev[0] !== prev[1] ? prev[0] < prev[1] : a.side === 0;
        const s = aLeft ? -1 : 1;
        const half = ov >> 1;
        a.x += s * half;
        b.x -= s * (ov - half);
        for (const [f, o] of [[a, b], [b, a]] as const) {
          if (f.x > WALL) {
            o.x -= f.x - WALL;
            f.x = WALL;
          } else if (f.x < -WALL) {
            o.x += -WALL - f.x;
            f.x = -WALL;
          }
        }
      }
    }
  }
  // the camera holds both fighters: walking away at full distance is blocked
  const dist = Math.abs(a.x - b.x);
  if (dist > MAX_SEPARATION) {
    const excess = dist - MAX_SEPARATION;
    const awayA = Math.abs(a.x - b.x) - Math.abs(prev[0] - b.x);
    const awayB = Math.abs(a.x - b.x) - Math.abs(a.x - prev[1]);
    const f = awayA >= awayB ? a : b;
    const o = f === a ? b : a;
    f.x += (f.x < o.x ? 1 : -1) * excess;
  }
}

function autoFace(f: FighterState, o: FighterState) {
  if (airborne(f)) return;
  if (actionable(f) || f.state === 'land' || f.state === 'getup' || f.state === 'knockdown') {
    if (o.x !== f.x) f.facing = o.x > f.x ? 1 : -1;
  }
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
      f.drive = Math.min(DRIVE_MAX, f.drive + (f.state === 'walkF' ? DRIVE_REGEN * 2 : DRIVE_REGEN));
    }
  }
  if (f.heatTimer > 0) f.heatTimer--;
  if (f.driveRushBuff > 0) f.driveRushBuff--;
  if (m.training?.infiniteMeter) {
    if (st.drive) {
      f.drive = DRIVE_MAX;
      f.burnout = false;
    }
    if (st.supers) f.superMeter = SUPER_MAX;
    if (st.heat && f.heatTimer <= 0) f.heatAvailable = true;
  }
}

// ---------------------------------------------------------------------------------------------- the step

export function step(m: MatchState, raw: [number, number]) {
  m.events = [];
  m.frame++;
  const [a, b] = m.fighters;
  for (const f of m.fighters) pushInput(f.hist, m.frame, m.phase === 'fight' ? raw[f.side] : 0, f.facing);

  if (m.phase === 'intro') {
    m.phaseFrame++;
    if (m.phaseFrame === 1) m.events.push({ type: 'round', side: 0, x: 0, y: 12000, power: m.round, text: `ROUND ${m.round}` });
    if (m.phaseFrame >= 100) {
      m.phase = 'fight';
      m.phaseFrame = 0;
      m.events.push({ type: 'fight', side: 0, x: 0, y: 12000, power: 1, text: 'FIGHT!' });
    }
    return;
  }
  if (m.freeze > 0) {
    m.freeze--;
    return;
  }
  m.phaseFrame++;

  const prev: [number, number] = [a.x, b.x];
  if (m.phase === 'fight') {
    control(m, a, b);
    control(m, b, a);
  }
  advance(m, a, b);
  advance(m, b, a);
  stepProjectiles(m);
  resolveSpacing(m, prev);
  if (m.phase === 'fight') resolveHits(m);
  autoFace(a, b);
  autoFace(b, a);
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
    const idle = m.frame - Math.max(a.actionableSince, b.actionableSince);
    if (idle >= 45) {
      a.health = MAX_HEALTH;
      b.health = MAX_HEALTH;
    }
  }
}

function roundRules(m: MatchState) {
  const [a, b] = m.fighters;
  if (m.phase === 'fight') {
    m.timer--;
    const koA = a.health <= 0, koB = b.health <= 0;
    if (koA || koB || m.timer <= 0) {
      if (!koA && !koB) m.events.push({ type: 'timeover', side: 0, x: 0, y: 12000, power: 1, text: 'TIME' });
      m.phase = 'ko';
      m.phaseFrame = 0;
      m.winner = koA && koB ? 2 : koA ? 1 : koB ? 0 : a.health === b.health ? 2 : a.health > b.health ? 0 : 1;
      m.projectiles = [];
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
      } else {
        nextRound(m);
      }
    }
  }
}

function nextRound(m: MatchState) {
  m.round++;
  m.phase = 'intro';
  m.phaseFrame = 0;
  m.timer = ROUND_SECONDS * FPS;
  m.winner = -1;
  m.projectiles = [];
  m.fighters = m.fighters.map((f) => {
    const n = createFighter(f.side, f.style);
    n.roundWins = f.roundWins;
    // the Drive gauge refills between rounds, the super gauge carries over
    n.superMeter = f.superMeter;
    n.hist = f.hist;
    return n;
  }) as [FighterState, FighterState];
}

export function resetPositions(m: MatchState) {
  m.fighters = m.fighters.map((f) => {
    const n = createFighter(f.side, f.style);
    n.hist = f.hist;
    n.superMeter = f.superMeter;
    return n;
  }) as [FighterState, FighterState];
  m.projectiles = [];
  m.freeze = 0;
}

export function isRage(f: FighterState) {
  return rageActive(f);
}

export const SUPER_BAR_SIZE = SUPER_BAR;
