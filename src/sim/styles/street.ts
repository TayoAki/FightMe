// STREET style, inspired by 6-button 2D fighters (SF6): light/medium/heavy punches and kicks, motion
// specials, a Drive gauge (parry, rush, impact, reversal, burnout) and a 3-bar super gauge.
// Names and numbers are our own.

import { IN } from '../input';
import { DRIVE_BAR, SUPER_BAR } from '../constants';
import type { CommandDef, MoveDef, StyleDef } from '../types';
import { box, moves } from './build';

const LP = IN.B1, MP = IN.B2, HP = IN.B3, LK = IN.B4, MK = IN.B5, HK = IN.B6;
const P = LP | MP | HP;
const K = LK | MK | HK;

const fireball = (speed: number, rec: number) => ({
  kind: 'special' as const,
  startup: 12,
  active: 1,
  recovery: rec,
  damage: 600,
  chip: 150,
  height: 'mid' as const,
  pose: 'fireball',
  windup: 'fireballWind',
  cancels: ['super' as const],
  projectile: { speed, life: 140, spawnX: 4800, spawnY: 11800, w: 2600, h: 2600, hitstun: 22, blockstun: 18, kind: 'orb' },
});

const rising = (startup: number, inv: number, dmg: number, vy: number) => ({
  kind: 'special' as const,
  startup,
  active: 12,
  recovery: 8,
  damage: dmg,
  height: 'mid' as const,
  hitbox: box(800, 4600, 6000, 21000),
  invuln: [1, inv] as [number, number],
  velocity: [{ from: startup, to: startup + 10, vx: 260, vy }],
  airborne: [startup, 99] as [number, number],
  airStun: { hit: 40, block: 16 },
  landingRecovery: 16,
  launch: { vx: 500, vy: 1100 },
  knockdown: true,
  hitstop: 14,
  cancels: ['super' as const],
  pose: 'dpRise',
  windup: 'crouch',
});

const cyclone = (hits: number, dmg: number, startup: number) => ({
  kind: 'special' as const,
  startup,
  active: hits * 7,
  recovery: 14,
  damage: dmg,
  hits,
  hitInterval: 7,
  height: 'high' as const,
  hitbox: box(-3200, 5600, 7000, 13500),
  velocity: [{ from: 3, to: startup + hits * 7, vx: 330, vy: 420 }],
  airborne: [3, 99] as [number, number],
  airStun: { hit: 30, block: 12 },
  landingRecovery: 10,
  onBlock: -6,
  knockdown: true,
  tracking: true,
  cancels: ['super' as const],
  pose: 'cyclone',
  windup: 'kickWind',
  spin: 2,
});

const MOVES: Record<string, MoveDef> = moves({
  // standing normals
  '5lp': { name: 'Jab', startup: 4, active: 2, recovery: 7, damage: 300, onHit: 4, onBlock: -1, hitbox: box(2000, 5600, 11200, 13800), cancels: ['special', 'super', 'drive'], chains: [{ buttons: LP, to: '5lp' }], chainWindow: 6, pose: 'jab' },
  '5mp': { name: 'Straight', startup: 6, active: 3, recovery: 10, damage: 600, onHit: 5, onBlock: 1, hitbox: box(2200, 6600, 11000, 13800), cancels: ['special', 'super', 'drive'], velocity: [{ from: 1, to: 5, vx: 90 }], pose: 'straight' },
  '5hp': { name: 'Hammer Hook', startup: 10, active: 3, recovery: 18, damage: 800, onHit: 2, onBlock: -3, hitbox: box(2400, 7200, 10500, 14500), cancels: ['special', 'super', 'drive'], chains: [{ buttons: HK, to: 'tc_two_step' }], chainWindow: 10, velocity: [{ from: 1, to: 9, vx: 140 }], pose: 'heavyPunch', windup: 'heavyWind' },
  '5lk': { name: 'Snap Kick', startup: 5, active: 3, recovery: 9, damage: 300, onHit: 2, onBlock: -2, hitbox: box(2000, 6000, 5500, 9000), pose: 'kickLow' },
  '5mk': { name: 'Front Kick', startup: 8, active: 3, recovery: 16, damage: 700, onHit: 2, onBlock: -4, hitbox: box(2500, 7800, 6000, 9500), cancels: ['special', 'super', 'drive'], pose: 'kickMid', windup: 'kickWind' },
  '5hk': { name: 'Roundhouse', startup: 12, active: 3, recovery: 20, damage: 900, onHit: 4, onBlock: -5, pushback: 5000, hitbox: box(2500, 8200, 10800, 15000), pose: 'kickHigh', windup: 'kickWind' },
  '6mp': { name: 'Collarbone Breaker', startup: 20, active: 2, recovery: 14, damage: 700, height: 'overhead', onHit: 1, onBlock: -2, hitbox: box(2200, 6000, 9500, 16500), velocity: [{ from: 1, to: 18, vx: 110 }], pose: 'overhead', windup: 'overheadWind' },
  tc_two_step: { name: 'Two-Step Kick', startup: 9, active: 3, recovery: 22, damage: 900, onHit: 0, onBlock: -8, knockdown: true, launch: { vx: 600, vy: 700 }, hitbox: box(2500, 7800, 6000, 13000), velocity: [{ from: 1, to: 8, vx: 200 }], pose: 'kickMid', windup: 'kickWind' },
  // crouching normals
  '2lp': { name: 'Crouch Jab', startup: 4, active: 2, recovery: 8, damage: 300, height: 'mid', onHit: 3, onBlock: -1, hitbox: box(2000, 5500, 7200, 9600), cancels: ['special', 'super', 'drive'], chains: [{ buttons: LP, dirs: [1, 2, 3], to: '2lp' }], chainWindow: 6, pose: 'crJab' },
  '2mp': { name: 'Crouch Straight', startup: 6, active: 3, recovery: 10, damage: 600, height: 'mid', onHit: 4, onBlock: 0, hitbox: box(2200, 6200, 7000, 10000), cancels: ['special', 'super', 'drive'], pose: 'crPunch' },
  '2hp': { name: 'Rising Elbow', startup: 8, active: 4, recovery: 18, damage: 900, height: 'mid', onHit: 1, onBlock: -5, hitbox: box(800, 5000, 9000, 19500), cancels: ['special', 'super', 'drive'], pose: 'crUpper' },
  '2lk': { name: 'Shin Tap', startup: 5, active: 2, recovery: 9, damage: 200, height: 'low', onHit: 2, onBlock: -1, hitbox: box(2000, 5800, 0, 2600), cancels: ['special', 'super', 'drive'], pose: 'crKickLow' },
  '2mk': { name: 'Low Poke', startup: 8, active: 3, recovery: 16, damage: 500, height: 'low', onHit: 2, onBlock: -6, hitbox: box(2400, 7700, 0, 2600), cancels: ['special', 'super', 'drive'], pose: 'crKickMid' },
  '2hk': { name: 'Sweep', startup: 9, active: 3, recovery: 24, damage: 900, height: 'low', onHit: 0, onBlock: -12, knockdown: true, launch: { vx: 0, vy: 300 }, hitbox: box(2600, 8200, 0, 2300), tracking: true, pose: 'sweep', windup: 'crouch' },
  // jumping normals: air attacks are overheads (block them standing)
  jlp: { name: 'Air Jab', startup: 4, active: 8, recovery: 3, air: true, damage: 300, height: 'overhead', airStun: { hit: 12, block: 10 }, hitbox: box(1200, 4800, 2500, 7000), pose: 'airPunch' },
  jmp: { name: 'Air Straight', startup: 6, active: 6, recovery: 6, air: true, damage: 600, height: 'overhead', airStun: { hit: 16, block: 13 }, hitbox: box(1400, 5400, 1500, 6500), pose: 'airPunch' },
  jhp: { name: 'Air Hammer', startup: 8, active: 6, recovery: 8, air: true, damage: 800, height: 'overhead', airStun: { hit: 19, block: 15 }, hitbox: box(800, 5000, -1500, 5500), pose: 'airHammer' },
  jlk: { name: 'Air Knee', startup: 5, active: 8, recovery: 3, air: true, damage: 300, height: 'overhead', airStun: { hit: 12, block: 10 }, hitbox: box(800, 4200, 1500, 6000), pose: 'airKnee' },
  jmk: { name: 'Air Kick', startup: 7, active: 6, recovery: 6, air: true, damage: 600, height: 'overhead', airStun: { hit: 16, block: 13 }, hitbox: box(1000, 5600, 0, 5000), pose: 'airKick' },
  jhk: { name: 'Air Heel', startup: 9, active: 6, recovery: 8, air: true, damage: 800, height: 'overhead', airStun: { hit: 19, block: 15 }, hitbox: box(800, 5800, -1800, 4500), pose: 'airKickHeavy' },
  // specials
  orb_l: { name: 'Spirit Orb (L)', ...fireball(360, 36) },
  orb_m: { name: 'Spirit Orb (M)', ...fireball(470, 36) },
  orb_h: { name: 'Spirit Orb (H)', ...fireball(600, 36) },
  fang_l: { name: 'Rising Fang (L)', ...rising(4, 4, 1100, 1050) },
  fang_m: { name: 'Rising Fang (M)', ...rising(5, 6, 1250, 1250) },
  fang_h: { name: 'Rising Fang (H)', ...rising(6, 8, 1450, 1450) },
  cyclone_l: { name: 'Cyclone Kick (L)', ...cyclone(2, 400, 8) },
  cyclone_m: { name: 'Cyclone Kick (M)', ...cyclone(3, 350, 10) },
  cyclone_h: { name: 'Cyclone Kick (H)', ...cyclone(4, 330, 12) },
  // supers
  sa1: { name: 'Comet Rush', kind: 'super', startup: 7, active: 16, recovery: 26, damage: 450, hits: 4, hitInterval: 4, height: 'mid', onBlock: -14, knockdown: true, launch: { vx: 700, vy: 900 }, invuln: [1, 10], hitbox: box(1500, 6500, 4000, 16000), velocity: [{ from: 1, to: 22, vx: 900 }], superFreeze: 30, minScale: 30, pose: 'superRush', windup: 'heavyWind' },
  sa3: { name: 'Meteor Drive', kind: 'super', startup: 9, active: 4, recovery: 40, damage: 4000, height: 'mid', onBlock: -24, knockdown: true, launch: { vx: 900, vy: 1700 }, invuln: [1, 14], hitbox: box(1500, 7500, 4000, 17000), velocity: [{ from: 1, to: 11, vx: 1100 }], superFreeze: 60, minScale: 50, hitstop: 24, pose: 'superBig', windup: 'superWind', tag: 'sa3' },
  // drive system
  drive_rush: { name: 'Drive Rush', kind: 'drive', startup: 1, active: 1, recovery: 19, pose: 'driveRush', velocity: [{ from: 1, to: 6, vx: 980 }, { from: 7, to: 14, vx: 760 }, { from: 15, to: 20, vx: 300 }], tag: 'driveRush' },
  drive_impact: { name: 'Drive Impact', kind: 'drive', startup: 26, active: 2, recovery: 35, damage: 800, height: 'mid', onHit: 0, onBlock: -3, armor: 2, pushback: 9000, crumple: true, hitstop: 18, hitbox: box(2400, 8200, 5000, 15500), velocity: [{ from: 10, to: 27, vx: 230 }], pose: 'driveImpact', windup: 'driveImpactWind', tag: 'driveImpact' },
  drive_reversal: { name: 'Drive Reversal', kind: 'drive', startup: 20, active: 3, recovery: 26, damage: 500, height: 'mid', onHit: 0, onBlock: -6, pushback: 9000, knockdown: true, launch: { vx: 500, vy: 600 }, invuln: [1, 22], hitbox: box(2000, 6800, 5000, 15000), pose: 'heavyPunch', windup: 'parry', tag: 'driveReversal' },
  parry: { name: 'Drive Parry', kind: 'drive', startup: 1, active: 1, recovery: 1, pose: 'parry', tag: 'parry' },
  // movement and throws
  throw: { name: 'Throw', kind: 'throw', startup: 5, active: 3, recovery: 23, throwDamage: 1200, hitbox: box(1800, 5800, 0, 15000), pose: 'throwGrab' },
  dash: { name: 'Dash', kind: 'system', startup: 1, active: 1, recovery: 1, pose: 'dash' },
  backdash: { name: 'Back Dash', kind: 'system', startup: 1, active: 1, recovery: 1, pose: 'backdash' },
});

const COMMANDS: CommandDef[] = [
  { move: 'sa3', buttons: P, any: true, motion: '236236', cost: { super: 3 * SUPER_BAR } },
  { move: 'sa1', buttons: K, any: true, motion: '236236', cost: { super: SUPER_BAR } },
  { move: 'drive_reversal', buttons: MP | MK, from: 'blockstun', dirs: [6, 3, 9], cost: { drive: 2 * DRIVE_BAR } },
  { move: 'fang_h', buttons: HP, motion: '623', any: true },
  { move: 'fang_m', buttons: MP, motion: '623', any: true },
  { move: 'fang_l', buttons: LP, motion: '623', any: true },
  { move: 'orb_h', buttons: HP, motion: '236', any: true },
  { move: 'orb_m', buttons: MP, motion: '236', any: true },
  { move: 'orb_l', buttons: LP, motion: '236', any: true },
  { move: 'cyclone_h', buttons: HK, motion: '214', any: true },
  { move: 'cyclone_m', buttons: MK, motion: '214', any: true },
  { move: 'cyclone_l', buttons: LK, motion: '214', any: true },
  { move: 'drive_impact', buttons: HP | HK, cost: { drive: DRIVE_BAR } },
  { move: 'drive_rush', buttons: 0, motion: '66', from: 'parry', cost: { drive: DRIVE_BAR } },
  { move: 'parry', buttons: MP | MK },
  { move: 'throw', buttons: LP | LK },
  { move: '6mp', buttons: MP, any: true, dirs: [6] },
  { move: 'dash', buttons: 0, motion: '66' },
  { move: 'backdash', buttons: 0, motion: '44' },
];

export const STREET: StyleDef = {
  id: 'street',
  name: 'Street',
  inspired: 'Street Fighter 6',
  tagline: '6 buttons, motion specials, Drive gauge and supers',
  buttonLabels: ['LP', 'MP', 'HP', 'LK', 'MK', 'HK'],
  walkF: 380,
  walkB: 300,
  jumpVx: 420,
  neutralGuard: false,
  crouchGuardBlocksMid: true,
  crouchGuardDirs: [1],
  juggleLimit: 3,
  drive: true,
  supers: true,
  heat: false,
  rage: false,
  evade: false,
  moves: MOVES,
  commands: COMMANDS,
  normals: {
    stand: { [LP]: '5lp', [MP]: '5mp', [HP]: '5hp', [LK]: '5lk', [MK]: '5mk', [HK]: '5hk' },
    crouch: { [LP]: '2lp', [MP]: '2mp', [HP]: '2hp', [LK]: '2lk', [MK]: '2mk', [HK]: '2hk' },
    air: { [LP]: 'jlp', [MP]: 'jmp', [HP]: 'jhp', [LK]: 'jlk', [MK]: 'jmk', [HK]: 'jhk' },
  },
};
