// IRON style, inspired by 4-limb fighters (Tekken 8): one button per limb (1 2 3 4), strings, launchers
// and juggles, wall splats, Heat (once per round) and Rage. In this 2D game the sidestep becomes Evade
// (tap down twice): a short dodge that beats straight-line attacks and projectiles but not tracking moves.
// Defence follows Iron rules: standing still blocks highs and mids, crouching ducks highs and blocks lows,
// and mids hit crouchers (an Iron mid must be blocked standing, whatever the defender's style).
// Frame data is translated to this game's speed (the fastest Street button is a 4-frame jab, not Tekken's
// 10-frame one), so "safe" Iron moves sit around -2 to -5 on block. Names and numbers are our own.

import { IN } from '../input';
import type { CommandDef, MoveDef, StyleDef } from '../types';
import { box, moves } from './build';

// limb buttons: 1 = left punch, 2 = right punch, 3 = left kick, 4 = right kick
const B1 = IN.B1, B2 = IN.B2, B3 = IN.B4, B4 = IN.B5;
// shortcut buttons on the remaining two slots
const HEAT = IN.B3;

const MOVES: Record<string, MoveDef> = moves({
  // standing
  i1: { name: '1 Jab', startup: 5, active: 2, recovery: 9, damage: 250, onHit: 6, onBlock: 1, hitbox: box(2000, 5800, 12400, 14600), chains: [{ buttons: B2, to: 'i12', onWhiff: true }], chainWindow: 12, pose: 'jab' },
  i12: { name: '1,2 One-Two', startup: 6, active: 2, recovery: 12, damage: 320, onHit: 7, onBlock: -1, hitbox: box(2100, 6300, 12200, 14700), chains: [{ buttons: B4, to: 'i124', onWhiff: true }], chainWindow: 14, pose: 'straight' },
  i124: { name: '1,2,4 Gale Finish', startup: 11, active: 3, recovery: 22, damage: 620, onHit: 0, onBlock: -4, knockdown: true, launch: { vx: 700, vy: 900 }, wallSplat: true, hitbox: box(2300, 7600, 12200, 15500), velocity: [{ from: 1, to: 8, vx: 150 }], pose: 'kickHigh', windup: 'kickWind', spin: 1 },
  i2: { name: '2 Straight', startup: 6, active: 2, recovery: 12, damage: 420, onHit: 6, onBlock: 0, hitbox: box(2200, 6400, 12000, 14700), velocity: [{ from: 1, to: 6, vx: 100 }], pose: 'straight' },
  i3: { name: '3 Mid Kick', startup: 9, active: 3, recovery: 15, damage: 520, height: 'mid', onHit: 4, onBlock: -3, hitbox: box(2400, 7400, 6500, 10500), chains: [{ buttons: B2, to: 'i32', onWhiff: true }], chainWindow: 14, pose: 'kickMid', windup: 'kickWind' },
  i32: { name: '3,2 Corkscrew', startup: 10, active: 3, recovery: 20, damage: 480, onHit: 2, onBlock: -5, tornado: true, hitbox: box(2200, 6800, 12000, 15000), velocity: [{ from: 1, to: 6, vx: 160 }], pose: 'heavyPunch', windup: 'heavyWind' },
  i4: { name: '4 High Kick', startup: 9, active: 3, recovery: 18, damage: 650, onHit: 5, onBlock: -3, pushback: 4500, hitbox: box(2500, 7800, 12200, 15200), pose: 'kickHigh', windup: 'kickWind' },
  // directional
  df1: { name: 'df1 Body Jab', startup: 7, active: 2, recovery: 12, damage: 450, height: 'mid', onHit: 5, onBlock: 1, hitbox: box(2100, 6100, 8500, 12500), velocity: [{ from: 1, to: 6, vx: 120 }], pose: 'bodyJab' },
  df2: { name: 'df2 Launcher', startup: 13, active: 3, recovery: 18, damage: 600, height: 'mid', onHit: 0, onBlock: -7, launch: { vx: 180, vy: 1150 }, hitbox: box(1500, 5400, 8000, 18500), pose: 'crUpper', windup: 'crouch' },
  df4: { name: 'df4 Push Kick', startup: 10, active: 3, recovery: 18, damage: 600, height: 'mid', onHit: 4, onBlock: -2, pushback: 6000, hitbox: box(2400, 7600, 6000, 10000), pose: 'kickMid', windup: 'kickWind' },
  f2: { name: 'f2 Iron Hammer', startup: 12, active: 3, recovery: 20, damage: 760, height: 'mid', onHit: 3, onBlock: -4, pushback: 12000, wallSplat: true, hitbox: box(2400, 7200, 9500, 14500), velocity: [{ from: 1, to: 10, vx: 220 }], pose: 'heavyPunch', windup: 'heavyWind' },
  b4: { name: 'b4 Back Heel', startup: 14, active: 3, recovery: 20, damage: 800, onHit: 2, onBlock: -4, wallSplat: true, knockdown: true, launch: { vx: 900, vy: 700 }, hitbox: box(2300, 7900, 12200, 15500), pose: 'kickHigh', windup: 'kickWind', spin: 1 },
  uf4: { name: 'uf4 Hop Kick', startup: 15, active: 4, recovery: 22, damage: 650, height: 'mid', onHit: 0, onBlock: -8, launch: { vx: 220, vy: 1200 }, airborne: [6, 24], hitbox: box(1500, 5600, 9000, 17500), velocity: [{ from: 6, to: 22, vx: 160 }], pose: 'hopKick', windup: 'crouch' },
  db3: { name: 'db3 Sweep', startup: 16, active: 3, recovery: 26, damage: 700, height: 'low', onHit: 0, onBlock: -14, knockdown: true, launch: { vx: 0, vy: 300 }, tracking: true, hitbox: box(2600, 8200, 0, 2300), pose: 'sweep', windup: 'crouch' },
  // crouching
  id1: { name: 'd1 Crouch Jab', startup: 5, active: 2, recovery: 10, damage: 200, height: 'mid', onHit: 5, onBlock: -1, hitbox: box(2000, 5500, 7200, 9600), pose: 'crJab' },
  id2: { name: 'd2 Crouch Straight', startup: 7, active: 2, recovery: 12, damage: 350, height: 'mid', onHit: 4, onBlock: -2, hitbox: box(2100, 6000, 7200, 10200), pose: 'crPunch' },
  id3: { name: 'd3 Low Kick', startup: 11, active: 3, recovery: 18, damage: 450, height: 'low', onHit: 1, onBlock: -8, hitbox: box(2300, 7200, 0, 2600), pose: 'crKickMid' },
  id4: { name: 'd4 Shin Poke', startup: 8, active: 2, recovery: 14, damage: 320, height: 'low', onHit: 2, onBlock: -4, hitbox: box(2200, 6600, 0, 2600), pose: 'crKickLow' },
  // airborne (overheads)
  ij1: { name: 'Air 1', startup: 5, active: 8, recovery: 3, air: true, damage: 320, height: 'overhead', airStun: { hit: 13, block: 10 }, hitbox: box(1200, 4800, 2500, 7000), pose: 'airPunch' },
  ij2: { name: 'Air 2', startup: 7, active: 6, recovery: 6, air: true, damage: 650, height: 'overhead', airStun: { hit: 17, block: 13 }, hitbox: box(800, 5000, -1000, 5500), pose: 'airHammer' },
  ij3: { name: 'Air 3', startup: 6, active: 7, recovery: 4, air: true, damage: 400, height: 'overhead', airStun: { hit: 14, block: 11 }, hitbox: box(800, 4200, 1500, 6000), pose: 'airKnee' },
  ij4: { name: 'Air 4', startup: 9, active: 6, recovery: 8, air: true, damage: 750, height: 'overhead', airStun: { hit: 19, block: 15 }, hitbox: box(800, 5800, -1800, 4500), pose: 'airKickHeavy' },
  // command moves
  thunder: { name: 'Thunder Fist', kind: 'special', startup: 13, active: 3, recovery: 26, damage: 800, height: 'mid', onHit: 0, onBlock: -5, launch: { vx: 220, vy: 1250 }, hitbox: box(1500, 5600, 8000, 19000), velocity: [{ from: 1, to: 12, vx: 300 }], hitstop: 13, pose: 'crUpper', windup: 'thunderWind' },
  thunder_perfect: { name: 'Thunder Fist PERFECT', kind: 'special', startup: 11, active: 3, recovery: 22, damage: 1000, height: 'mid', onHit: 0, onBlock: 5, launch: { vx: 240, vy: 1330 }, hitbox: box(1500, 5800, 8000, 19500), velocity: [{ from: 1, to: 10, vx: 340 }], hitstop: 16, pose: 'crUpper', windup: 'thunderWind', tag: 'justFrame' },
  heat_burst: { name: 'Heat Burst', kind: 'special', startup: 16, active: 3, recovery: 26, damage: 300, height: 'mid', onHit: 15, onBlock: 1, armor: 3, pushback: 3000, hitbox: box(1800, 6400, 6000, 16000), superFreeze: 24, pose: 'heatBurst', windup: 'heatWind', tag: 'heatBurst' },
  heat_smash: { name: 'Heat Smash', kind: 'special', startup: 15, active: 4, recovery: 30, damage: 1800, height: 'mid', onHit: 0, onBlock: -3, armor: 2, knockdown: true, launch: { vx: 900, vy: 1300 }, wallSplat: true, hitbox: box(2000, 7600, 5000, 17000), velocity: [{ from: 1, to: 14, vx: 380 }], superFreeze: 20, minScale: 40, hitstop: 20, pose: 'heatSmash', windup: 'heatWind', tag: 'heatSmash' },
  rage_art: { name: 'Rage Art', kind: 'super', startup: 20, active: 4, recovery: 40, damage: 3600, height: 'mid', onHit: 0, onBlock: -20, knockdown: true, launch: { vx: 900, vy: 1600 }, invuln: [1, 22], hitbox: box(1800, 7400, 4000, 17000), velocity: [{ from: 8, to: 20, vx: 600 }], superFreeze: 50, minScale: 50, hitstop: 24, pose: 'superBig', windup: 'superWind', tag: 'rageArt' },
  evade: { name: 'Evade', kind: 'system', startup: 1, active: 1, recovery: 20, invuln: [2, 14], pose: 'evade', tag: 'evade' },
  throw: { name: 'Throw', kind: 'throw', startup: 6, active: 3, recovery: 24, throwDamage: 1300, hitbox: box(1800, 5800, 0, 15000), pose: 'throwGrab' },
  dash: { name: 'Dash', kind: 'system', startup: 1, active: 1, recovery: 1, pose: 'dash' },
  backdash: { name: 'Back Dash', kind: 'system', startup: 1, active: 1, recovery: 1, pose: 'backdash' },
});

const COMMANDS: CommandDef[] = [
  { move: 'rage_art', buttons: B1 | B2, dirs: [3], needs: 'rage' },
  { move: 'heat_smash', buttons: HEAT, any: true, needs: 'heat' },
  { move: 'heat_smash', buttons: B2 | B3, needs: 'heat' },
  { move: 'heat_burst', buttons: HEAT, any: true, needs: 'heatAvailable' },
  { move: 'heat_burst', buttons: B2 | B3, needs: 'heatAvailable' },
  { move: 'thunder_perfect', buttons: B2, any: true, motion: '623', justFrame: true },
  { move: 'thunder', buttons: B2, any: true, motion: '623' },
  { move: 'throw', buttons: B1 | B3 },
  { move: 'uf4', buttons: B4, any: true, dirs: [9], from: 'prejump' },
  { move: 'uf4', buttons: B4, any: true, dirs: [9] },
  { move: 'db3', buttons: B3, any: true, dirs: [1] },
  { move: 'df1', buttons: B1, any: true, dirs: [3] },
  { move: 'df2', buttons: B2, any: true, dirs: [3] },
  { move: 'df4', buttons: B4, any: true, dirs: [3] },
  { move: 'f2', buttons: B2, any: true, dirs: [6] },
  { move: 'b4', buttons: B4, any: true, dirs: [4] },
  { move: 'evade', buttons: 0, motion: '22' },
  { move: 'dash', buttons: 0, motion: '66' },
  { move: 'backdash', buttons: 0, motion: '44' },
];

export const IRON: StyleDef = {
  id: 'iron',
  name: 'Iron',
  inspired: 'Tekken 8',
  tagline: 'One button per limb, strings, launchers, wall splats, Heat and Rage',
  buttonLabels: ['1', '2', 'HEAT', '3', '4', '-'],
  walkF: 360,
  walkB: 320,
  jumpVx: 380,
  neutralGuard: true,
  crouchGuardBlocksMid: false,
  crouchGuardDirs: [1, 2],
  juggleLimit: 7,
  drive: false,
  supers: false,
  heat: true,
  rage: true,
  evade: true,
  moves: MOVES,
  commands: COMMANDS,
  normals: {
    stand: { [B1]: 'i1', [B2]: 'i2', [B3]: 'i3', [B4]: 'i4' },
    crouch: { [B1]: 'id1', [B2]: 'id2', [B3]: 'id3', [B4]: 'id4' },
    air: { [B1]: 'ij1', [B2]: 'ij2', [B3]: 'ij3', [B4]: 'ij4' },
  },
};
