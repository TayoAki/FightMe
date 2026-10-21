// STREET style, inspired by Street Fighter 6, moved into the arena: light/heavy normals and specials picked
// by the stick's direction relative to the opponent, a Drive gauge (parry, rush, impact, reversal,
// burnout) and a 3-bar super gauge. Names and numbers are our own.

import { DRIVE_BAR, MAX_HEALTH, SUPER_BAR } from '../constants';
import { IN } from '../input';
import type { CommandDef, Kit, StyleDef } from '../types';
import { hb, moves } from './build';

const { L, H, S, G } = IN;
const ALL = ['special', 'super', 'drive'] as const;
const cancels = [...ALL];

const MOVES = moves({
  // the light string: L, L, L
  l1: { name: 'Jab', startup: 4, active: 2, recovery: 7, damage: 300, onHit: 4, onBlock: -1, hitbox: hb(2000, 5600, 11200, 13800, 2500), cancels, chains: [{ buttons: L, to: 'l2' }], chainWindow: 10, pose: 'jab' },
  l2: { name: 'Straight', startup: 6, active: 3, recovery: 10, damage: 600, onHit: 5, onBlock: 1, hitbox: hb(2200, 6600, 11000, 13800, 2600), velocity: [{ from: 1, to: 5, fwd: 90 }], cancels, chains: [{ buttons: L, to: 'l3' }], chainWindow: 12, pose: 'straight' },
  l3: { name: 'Roundhouse', startup: 10, active: 3, recovery: 18, damage: 800, onHit: 0, onBlock: -6, knockdown: true, launch: { fwd: 700, vy: 700 }, wallSplat: true, pushback: 5000, hitbox: hb(2500, 8200, 10800, 15000, 4500), cancels: ['super'], pose: 'kickHigh', windup: 'kickWind', spin: 1 },
  // heavies by direction
  h: { name: 'Hammer Hook', startup: 10, active: 3, recovery: 18, damage: 800, onHit: 2, onBlock: -3, hitbox: hb(2400, 7200, 10500, 14500, 3500), velocity: [{ from: 1, to: 9, fwd: 140 }], cancels, pose: 'heavyPunch', windup: 'heavyWind' },
  th: { name: 'Front Kick', startup: 9, active: 3, recovery: 16, damage: 700, onHit: 2, onBlock: -4, hitbox: hb(2500, 8800, 6000, 12000, 3000), velocity: [{ from: 1, to: 8, fwd: 200 }], cancels, pose: 'kickMid', windup: 'kickWind' },
  ah: { name: 'Rising Elbow', startup: 8, active: 4, recovery: 18, damage: 900, onHit: 1, onBlock: -5, hitbox: hb(800, 5200, 9000, 21500, 4000), cancels, pose: 'crUpper' },
  sh: { name: 'Sweep', startup: 9, active: 3, recovery: 24, damage: 900, onHit: 0, onBlock: -12, knockdown: true, launch: { fwd: 0, vy: 300 }, tracking: true, hitbox: hb(2600, 8400, 0, 2600, 7000), pose: 'sweep', windup: 'crouch' },
  // in the air
  jl: { name: 'Air Jab', startup: 4, active: 8, recovery: 3, air: true, damage: 300, airStun: { hit: 12, block: 10 }, hitbox: hb(1200, 4800, 2500, 7000), pose: 'airPunch' },
  jh: { name: 'Air Heel', startup: 8, active: 6, recovery: 8, air: true, damage: 800, airStun: { hit: 19, block: 15 }, hitbox: hb(800, 5800, -1800, 4500), pose: 'airKickHeavy' },
  // specials: S, toward + S, away + S
  orb: { name: 'Spirit Orb', kind: 'special', startup: 13, active: 1, recovery: 34, damage: 600, chip: 150, cancels: ['super'], pose: 'fireball', windup: 'fireballWind', projectile: { speed: 520, life: 150, spawnF: 4800, spawnY: 11800, r: 1400, hitstun: 22, blockstun: 18, kind: 'orb' } },
  fang: { name: 'Rising Fang', kind: 'special', startup: 5, active: 12, recovery: 8, damage: 1250, invuln: [1, 6], hitbox: hb(800, 4600, 6000, 21000, 3500), velocity: [{ from: 5, to: 15, fwd: 260, vy: 1250 }], airborne: [5, 99], airStun: { hit: 40, block: 16 }, landingRecovery: 16, launch: { fwd: 500, vy: 1100 }, knockdown: true, hitstop: 14, cancels: ['super'], pose: 'dpRise', windup: 'crouch' },
  cyclone: { name: 'Cyclone Kick', kind: 'special', startup: 10, active: 21, recovery: 14, damage: 350, hits: 3, hitInterval: 7, onBlock: -6, hitbox: hb(-3200, 5600, 7000, 13500, 4500), velocity: [{ from: 3, to: 31, fwd: 330, vy: 420 }], airborne: [3, 99], airStun: { hit: 30, block: 12 }, landingRecovery: 10, knockdown: true, tracking: true, cancels: ['super'], pose: 'cyclone', windup: 'kickWind', spin: 2 },
  // supers: S + G, toward for the 3-bar one, away for the beam
  sa1: { name: 'Comet Rush', kind: 'super', startup: 7, active: 16, recovery: 26, damage: 450, hits: 4, hitInterval: 4, onBlock: -14, knockdown: true, launch: { fwd: 700, vy: 900 }, invuln: [1, 10], hitbox: hb(1500, 6500, 4000, 16000, 4500), velocity: [{ from: 1, to: 22, fwd: 900 }], homing: 8, superFreeze: 30, minScale: 30, pose: 'superRush', windup: 'heavyWind' },
  sa2: { name: 'Spirit Cannon', kind: 'super', startup: 14, active: 40, recovery: 30, damage: 260, chip: 60, invuln: [1, 14], superFreeze: 30, minScale: 40, pose: 'fireball', windup: 'fireballWind', beam: { length: 80000, grow: 4200, width: 2600, duration: 40, hitEvery: 5, hitstun: 16, blockstun: 12, spawnY: 12000, clashDamage: 3200 } },
  sa3: { name: 'Meteor Drive', kind: 'super', startup: 9, active: 4, recovery: 40, damage: 4000, onBlock: -24, knockdown: true, launch: { fwd: 900, vy: 1700 }, invuln: [1, 14], hitbox: hb(1500, 7500, 4000, 17000, 4500), velocity: [{ from: 1, to: 11, fwd: 1100 }], homing: 8, superFreeze: 60, minScale: 50, hitstop: 24, pose: 'superBig', windup: 'superWind' },
  // the Drive system
  drive_rush: { name: 'Drive Rush', kind: 'drive', startup: 1, active: 1, recovery: 19, velocity: [{ from: 1, to: 6, fwd: 1100 }, { from: 7, to: 14, fwd: 820 }, { from: 15, to: 20, fwd: 300 }], homing: 14, pose: 'driveRush', tag: 'driveRush' },
  drive_impact: { name: 'Drive Impact', kind: 'drive', startup: 26, active: 2, recovery: 35, damage: 800, onHit: 0, onBlock: -3, armor: 2, pushback: 9000, crumple: true, hitstop: 18, hitbox: hb(2400, 8400, 5000, 15500, 4000), velocity: [{ from: 10, to: 27, fwd: 230 }], homing: 10, pose: 'driveImpact', windup: 'driveImpactWind', tag: 'driveImpact' },
  drive_reversal: { name: 'Drive Reversal', kind: 'drive', startup: 20, active: 3, recovery: 26, damage: 500, onHit: 0, onBlock: -6, pushback: 9000, knockdown: true, launch: { fwd: 500, vy: 600 }, invuln: [1, 22], hitbox: hb(2000, 6800, 5000, 15000, 4500), pose: 'heavyPunch', windup: 'parry', tag: 'driveReversal' },
  parry: { name: 'Drive Parry', kind: 'drive', startup: 1, active: 1, recovery: 1, pose: 'parry', tag: 'parry' },
  throw: { name: 'Throw', kind: 'throw', startup: 5, active: 3, recovery: 23, throwDamage: 1200, hitbox: hb(1800, 5800, 0, 15000, 3500), pose: 'throwGrab' },
});

const KIT: Kit = {
  name: 'Street',
  runSpeed: 680,
  moves: MOVES,
  commands: [
    { move: 'fang', buttons: S, any: true, rel: ['t'] },
    { move: 'cyclone', buttons: S, any: true, rel: ['a'] },
    { move: 'orb', buttons: S, any: true },
    { move: 'th', buttons: H, any: true, rel: ['t'] },
    { move: 'ah', buttons: H, any: true, rel: ['a'] },
    { move: 'sh', buttons: H, any: true, rel: ['s'] },
    { move: 'h', buttons: H, any: true },
    { move: 'l1', buttons: L, any: true },
  ],
  air: [
    { move: 'jh', buttons: H, any: true },
    { move: 'jl', buttons: L, any: true },
  ],
};

const COMMANDS: CommandDef[] = [
  { move: 'sa3', buttons: S | G, rel: ['t'], cost: { super: 3 * SUPER_BAR } },
  { move: 'sa2', buttons: S | G, rel: ['a'], cost: { super: 2 * SUPER_BAR } },
  { move: 'sa1', buttons: S | G, cost: { super: SUPER_BAR } },
  { move: 'drive_reversal', buttons: L | H, from: 'blockstun', cost: { drive: 2 * DRIVE_BAR } },
  { move: 'drive_impact', buttons: H | S, cost: { drive: DRIVE_BAR } },
  { move: 'parry', buttons: L | H },
  { move: 'throw', buttons: L | G },
];

export const STREET: StyleDef = {
  id: 'street',
  name: 'Street',
  inspired: 'Street Fighter 6',
  tagline: 'Drive gauge, parries, fireballs, uppercuts and a beam super',
  drive: true,
  supers: true,
  team: false,
  juggleLimit: 3,
  health: MAX_HEALTH,
  commands: COMMANDS,
  kits: [KIT],
};
