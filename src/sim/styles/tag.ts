// TAG style, inspired by Marvel Tokon and 2XKO: a team of two who share one health bar. VOLT is a rushdown
// striker and NOVA a zoner. The one on the bench can be called in for an assist (L + H, 3 s cooldown) or
// tagged in (H + S, 5 s cooldown, also as a cancel on hit), and the team super brings both in at once.
// Names and numbers are our own.

import { SUPER_BAR, TEAM_HEALTH } from '../constants';
import { IN } from '../input';
import type { CommandDef, Kit, StyleDef } from '../types';
import { hb, moves } from './build';

const { L, H, S, G } = IN;
const cancels = ['special' as const, 'super' as const, 'tag' as const];

const THROW = { name: 'Throw', kind: 'throw' as const, startup: 5, active: 3, recovery: 23, throwDamage: 1200, hitbox: hb(1800, 5800, 0, 15000, 3500), pose: 'throwGrab' };
const SWEEP = { name: 'Sweep', startup: 10, active: 3, recovery: 22, damage: 700, onHit: 0, onBlock: -11, knockdown: true, launch: { fwd: 0, vy: 300 }, tracking: true, hitbox: hb(2600, 8200, 0, 2600, 7000), pose: 'sweep', windup: 'crouch' };
const ENTRY = { kind: 'special' as const, startup: 12, active: 3, recovery: 16, damage: 500, onBlock: -4, invuln: [1, 10] as [number, number], velocity: [{ from: 1, to: 12, fwd: 700 }], homing: 12, launch: { fwd: 400, vy: 900 }, hitbox: hb(1500, 6500, 6000, 15000, 4000) };

const VOLT: Kit = {
  name: 'Volt',
  runSpeed: 760,
  assist: 'assist',
  tagIn: 'tag_in',
  moves: moves({
    // L, L, L, L auto combo
    l1: { name: 'Snap Jab', startup: 4, active: 2, recovery: 8, damage: 250, onHit: 3, onBlock: -1, hitbox: hb(2000, 5600, 11000, 13800, 2600), chains: [{ buttons: L, to: 'l2' }], chainWindow: 12, cancels, pose: 'jab' },
    l2: { name: 'Elbow', startup: 6, active: 3, recovery: 10, damage: 300, onHit: 3, onBlock: -2, hitbox: hb(2000, 6000, 10500, 14000, 3000), velocity: [{ from: 1, to: 5, fwd: 120 }], chains: [{ buttons: L, to: 'l3' }], chainWindow: 12, cancels, pose: 'heavyPunch' },
    l3: { name: 'Knee', startup: 7, active: 3, recovery: 12, damage: 350, onHit: 2, onBlock: -3, hitbox: hb(1800, 5600, 7000, 12000, 3000), velocity: [{ from: 1, to: 6, fwd: 150 }], chains: [{ buttons: L, to: 'l4' }], chainWindow: 12, cancels, pose: 'kickMid' },
    l4: { name: 'Spin Kick', startup: 10, active: 3, recovery: 22, damage: 500, onBlock: -8, knockdown: true, launch: { fwd: 800, vy: 600 }, wallSplat: true, pushback: 5000, hitbox: hb(2500, 8200, 10800, 15000, 4500), cancels: ['super', 'tag'], pose: 'kickHigh', windup: 'kickWind', spin: 1 },
    h: { name: 'Volt Upper', startup: 11, active: 3, recovery: 20, damage: 700, onBlock: -7, launch: { fwd: 150, vy: 1150 }, hitbox: hb(1500, 5400, 8000, 18500, 3500), cancels, pose: 'crUpper', windup: 'crouch' },
    th: { name: 'Lunge Punch', startup: 12, active: 3, recovery: 18, damage: 800, onHit: 3, onBlock: -2, pushback: 6000, wallSplat: true, hitbox: hb(2400, 7200, 9500, 14500, 3500), velocity: [{ from: 1, to: 10, fwd: 500 }], homing: 6, cancels, pose: 'heavyPunch', windup: 'heavyWind' },
    ah: { name: 'Rising Knee', startup: 7, active: 4, recovery: 20, damage: 750, onBlock: -8, launch: { fwd: 200, vy: 1000 }, hitbox: hb(800, 5000, 9000, 21000, 4000), cancels, pose: 'hopKick' },
    sh: SWEEP,
    jl: { name: 'Air Jab', startup: 4, active: 8, recovery: 3, air: true, damage: 300, airStun: { hit: 12, block: 10 }, hitbox: hb(1200, 4800, 2500, 7000), pose: 'airPunch' },
    jh: { name: 'Air Axe', startup: 8, active: 6, recovery: 8, air: true, damage: 800, airStun: { hit: 19, block: 15 }, hitbox: hb(800, 5800, -1800, 4500), pose: 'airHammer' },
    js: { name: 'Dive Kick', kind: 'special', startup: 6, active: 30, recovery: 10, air: true, damage: 700, airStun: { hit: 16, block: 12 }, hitbox: hb(800, 5600, -2000, 4000, 3500), velocity: [{ from: 6, to: 35, fwd: 900, vy: -1100 }], landingRecovery: 10, pose: 'airKickHeavy' },
    step: { name: 'Thunder Step', kind: 'special', startup: 16, active: 4, recovery: 18, damage: 700, onBlock: -10, invuln: [4, 9], hitbox: hb(1500, 6500, 6000, 15000, 4000), velocity: [{ from: 1, to: 14, fwd: 900 }], homing: 14, launch: { fwd: 500, vy: 900 }, cancels: ['super', 'tag'], pose: 'superRush', windup: 'dash' },
    rise: { name: 'Rising Volt', kind: 'special', startup: 5, active: 10, recovery: 10, damage: 1100, invuln: [1, 5], hitbox: hb(800, 4600, 6000, 21000, 3500), velocity: [{ from: 5, to: 14, fwd: 240, vy: 1200 }], airborne: [5, 99], airStun: { hit: 38, block: 16 }, landingRecovery: 16, launch: { fwd: 450, vy: 1100 }, knockdown: true, hitstop: 14, cancels: ['super'], pose: 'dpRise', windup: 'crouch' },
    flip: { name: 'Backflip Kick', kind: 'special', startup: 8, active: 5, recovery: 18, damage: 600, invuln: [1, 7], hitbox: hb(800, 5600, 6000, 16000, 4000), velocity: [{ from: 1, to: 12, fwd: -450, vy: 800 }], airborne: [2, 99], airStun: { hit: 24, block: 14 }, landingRecovery: 8, launch: { fwd: 300, vy: 900 }, pose: 'hopKick' },
    super: { name: 'Thunder Cross', kind: 'super', startup: 7, active: 18, recovery: 26, damage: 400, hits: 5, hitInterval: 4, onBlock: -14, knockdown: true, launch: { fwd: 700, vy: 1000 }, invuln: [1, 10], hitbox: hb(1500, 6500, 4000, 16000, 4500), velocity: [{ from: 1, to: 24, fwd: 950 }], homing: 8, superFreeze: 30, minScale: 30, pose: 'superRush', windup: 'heavyWind' },
    assist: { name: 'Volt Rush', kind: 'assist', startup: 16, active: 4, recovery: 20, damage: 500, onBlock: -4, hitbox: hb(1500, 6500, 6000, 15000, 4000), velocity: [{ from: 4, to: 16, fwd: 1000 }], homing: 10, launch: { fwd: 200, vy: 1150 }, pose: 'superRush', windup: 'dash' },
    tag_in: { name: 'Volt Entry', ...ENTRY, pose: 'kickHigh', windup: 'jumpUp' },
    throw: THROW,
  }),
  commands: [
    { move: 'rise', buttons: S, any: true, rel: ['t'] },
    { move: 'flip', buttons: S, any: true, rel: ['a'] },
    { move: 'step', buttons: S, any: true },
    { move: 'th', buttons: H, any: true, rel: ['t'] },
    { move: 'ah', buttons: H, any: true, rel: ['a'] },
    { move: 'sh', buttons: H, any: true, rel: ['s'] },
    { move: 'h', buttons: H, any: true },
    { move: 'l1', buttons: L, any: true },
  ],
  air: [
    { move: 'js', buttons: S, any: true },
    { move: 'jh', buttons: H, any: true },
    { move: 'jl', buttons: L, any: true },
  ],
};

const NOVA: Kit = {
  name: 'Nova',
  runSpeed: 640,
  assist: 'assist',
  tagIn: 'tag_in',
  moves: moves({
    l1: { name: 'Palm', startup: 5, active: 2, recovery: 9, damage: 300, onHit: 3, onBlock: -1, hitbox: hb(2000, 5800, 11000, 13800, 2600), chains: [{ buttons: L, to: 'l2' }], chainWindow: 12, cancels, pose: 'jab' },
    l2: { name: 'Push Palm', startup: 8, active: 3, recovery: 14, damage: 500, onHit: 1, onBlock: -3, pushback: 7000, wallSplat: true, hitbox: hb(2200, 6800, 10000, 14500, 3500), velocity: [{ from: 1, to: 6, fwd: 140 }], cancels, pose: 'fireball' },
    h: { name: 'Arc Kick', startup: 11, active: 3, recovery: 18, damage: 750, onHit: 2, onBlock: -4, hitbox: hb(2600, 9200, 9000, 13500, 3500), cancels, pose: 'kickHigh', windup: 'kickWind' },
    th: { name: 'Nova Lift', startup: 12, active: 3, recovery: 20, damage: 650, onBlock: -8, launch: { fwd: 150, vy: 1150 }, hitbox: hb(1500, 5400, 8000, 18500, 3500), cancels, pose: 'crUpper', windup: 'crouch' },
    ah: { name: 'Orbit Guard', startup: 7, active: 5, recovery: 18, damage: 700, onBlock: -6, launch: { fwd: 200, vy: 900 }, hitbox: hb(500, 4800, 9000, 22000, 4500), cancels, pose: 'superBig' },
    sh: SWEEP,
    jl: { name: 'Air Palm', startup: 5, active: 7, recovery: 4, air: true, damage: 300, airStun: { hit: 12, block: 10 }, hitbox: hb(1200, 5000, 2500, 7500), pose: 'airPunch' },
    jh: { name: 'Air Kick', startup: 8, active: 6, recovery: 8, air: true, damage: 700, airStun: { hit: 18, block: 14 }, hitbox: hb(1000, 5800, 0, 5000), pose: 'airKick' },
    js: { name: 'Air Bolt', kind: 'special', startup: 10, active: 1, recovery: 16, air: true, damage: 500, chip: 100, landingRecovery: 6, pose: 'airPunch', projectile: { speed: 700, life: 60, spawnF: 3000, spawnY: 6000, r: 1200, hitstun: 20, blockstun: 14, kind: 'bolt', dropVy: -500 } },
    bolt: { name: 'Nova Bolt', kind: 'special', startup: 12, active: 1, recovery: 30, damage: 400, chip: 120, cancels: ['super'], pose: 'straight', windup: 'fireballWind', projectile: { speed: 820, life: 110, spawnF: 4800, spawnY: 12500, r: 1200, hitstun: 20, blockstun: 16, kind: 'bolt' } },
    seeker: { name: 'Seeker Orb', kind: 'special', startup: 16, active: 1, recovery: 22, damage: 700, chip: 150, cancels: ['super'], pose: 'fireball', windup: 'fireballWind', projectile: { speed: 300, life: 220, spawnF: 5000, spawnY: 13000, r: 1600, hitstun: 26, blockstun: 18, kind: 'seeker', homing: 3 } },
    blink: { name: 'Blink', kind: 'special', startup: 18, active: 1, recovery: 14, invuln: [1, 18], teleport: 10, pose: 'evade', tag: 'blink' },
    super: { name: 'Nova Cannon', kind: 'super', startup: 14, active: 44, recovery: 30, damage: 280, chip: 60, invuln: [1, 14], superFreeze: 30, minScale: 40, pose: 'fireball', windup: 'fireballWind', beam: { length: 85000, grow: 4500, width: 3000, duration: 44, hitEvery: 5, hitstun: 16, blockstun: 12, spawnY: 12000, clashDamage: 3400 } },
    assist: { name: 'Nova Beam', kind: 'assist', startup: 18, active: 32, recovery: 20, damage: 130, chip: 30, pose: 'fireball', windup: 'fireballWind', beam: { length: 70000, grow: 3600, width: 2200, duration: 32, hitEvery: 7, hitstun: 14, blockstun: 12, spawnY: 12000, clashDamage: 2400 } },
    tag_in: { name: 'Nova Entry', ...ENTRY, pose: 'kickMid', windup: 'jumpUp' },
    throw: THROW,
  }),
  commands: [
    { move: 'seeker', buttons: S, any: true, rel: ['t'] },
    { move: 'blink', buttons: S, any: true, rel: ['a'] },
    { move: 'bolt', buttons: S, any: true },
    { move: 'th', buttons: H, any: true, rel: ['t'] },
    { move: 'ah', buttons: H, any: true, rel: ['a'] },
    { move: 'sh', buttons: H, any: true, rel: ['s'] },
    { move: 'h', buttons: H, any: true },
    { move: 'l1', buttons: L, any: true },
  ],
  air: [
    { move: 'js', buttons: S, any: true },
    { move: 'jh', buttons: H, any: true },
    { move: 'jl', buttons: L, any: true },
  ],
};

// the assist (L + H) is handled by the match itself: it can be called during your own moves
const COMMANDS: CommandDef[] = [
  { move: 'super', buttons: S | G, cost: { super: SUPER_BAR } },
  { move: '@tag', buttons: H | S, needs: 'tag' },
  { move: 'throw', buttons: L | G },
];

export const TAG: StyleDef = {
  id: 'tag',
  name: 'Tag',
  inspired: 'Marvel Tokon and 2XKO',
  tagline: 'A team of two: call your partner in for assists, tag in mid-combo',
  drive: false,
  supers: true,
  team: true,
  juggleLimit: 4,
  health: TEAM_HEALTH,
  commands: COMMANDS,
  kits: [VOLT, NOVA],
};
