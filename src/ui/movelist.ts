// Readable move lists for the How to Play screen and the pause menu.

import type { StyleId } from '../sim/types';

export interface MoveRow {
  name: string;
  input: string;
  note?: string;
}

export const MOVELIST: Record<StyleId, { system: string[]; moves: MoveRow[] }> = {
  street: {
    system: [
      'Hold back to block. Down-back blocks lows; stand to block overheads and jump-ins.',
      'Drive gauge (6 bars): Parry, Rush, Impact and Reversal spend it. Empty it and you burn out: no Drive moves and you take chip damage.',
      'Cancel normals into specials on hit or block, and specials into supers.',
    ],
    moves: [
      { name: 'Spirit Orb', input: '↓↘→ + P', note: 'Fireball. LP slow, HP fast' },
      { name: 'Rising Fang', input: '→↓↘ + P', note: 'Invincible uppercut, very unsafe' },
      { name: 'Cyclone Kick', input: '↓↙← + K', note: 'Spinning multi-hit kick' },
      { name: 'Comet Rush', input: '↓↘→↓↘→ + K', note: 'Super, 1 bar' },
      { name: 'Meteor Drive', input: '↓↘→↓↘→ + P', note: 'Super, 3 bars' },
      { name: 'Drive Parry', input: 'MP + MK (hold)', note: 'Tap just before a hit for PERFECT PARRY' },
      { name: 'Drive Rush', input: '→→ during Parry', note: 'Or MP+MK from a cancelable normal (3 bars). Next normal gets +4' },
      { name: 'Drive Impact', input: 'HP + HK', note: 'Armors 2 hits. Crumples on hit, wall splats in the corner, stuns a burnt-out foe' },
      { name: 'Drive Reversal', input: '→ + MP + MK while blocking', note: '2 bars. Gets you out of pressure' },
      { name: 'Collarbone Breaker', input: '→ + MP', note: 'Overhead' },
      { name: 'Two-Step Kick', input: 'HP, then HK', note: 'Target combo' },
      { name: 'Throw', input: 'LP + LK', note: 'Hold ← for a back throw. Press LP+LK when grabbed to tech' },
      { name: 'Dash / Back dash', input: '→→ / ←←' },
    ],
  },
  iron: {
    system: [
      'One button per limb: 1 left punch, 2 right punch, 3 left kick, 4 right kick.',
      'Standing still blocks highs and mids. Crouch to duck highs and block lows. Iron mids hit crouchers, even Street ones: block them standing.',
      'Launch, juggle, and push them into the wall for a WALL SPLAT. Heat once per round, Rage when your health is low.',
    ],
    moves: [
      { name: '1,2,4 Gale Finish', input: '1, 2, 4', note: 'String. Ends in a knockdown kick' },
      { name: '3,2 Corkscrew', input: '3, 2', note: 'In a juggle: TORNADO spin for an extended combo' },
      { name: 'df1 Body Jab', input: '↘ + 1', note: 'Fast mid poke, +1 on block' },
      { name: 'df2 Launcher', input: '↘ + 2', note: 'Mid launcher: juggle after' },
      { name: 'uf4 Hop Kick', input: '↗ + 4', note: 'Jumps over lows, launches' },
      { name: 'f2 Iron Hammer', input: '→ + 2', note: 'Pushes far, wall splats' },
      { name: 'b4 Back Heel', input: '← + 4', note: 'Wall splats' },
      { name: 'db3 Sweep', input: '↙ + 3', note: 'Low knockdown, tracks Evade' },
      { name: 'Thunder Fist', input: '→, ↓↘ + 2', note: 'Press 2 on the same frame as ↘ for PERFECT (+5 on block, more damage)' },
      { name: 'Heat Burst', input: 'HEAT  (or 2 + 3)', note: 'Armored. Turns on Heat for 10 s: chip damage, Heat Smash' },
      { name: 'Heat Smash', input: 'HEAT in Heat', note: 'Big armored hit, uses up Heat' },
      { name: 'Rage Art', input: '↘ + 1 + 2 (low health)', note: 'Invincible, huge damage, once' },
      { name: 'Evade', input: '↓↓', note: 'Dodges straight attacks and projectiles' },
      { name: 'Throw', input: '1 + 3', note: 'Press 1+3 when grabbed to break it' },
      { name: 'Dash / Back dash', input: '→→ / ←←' },
    ],
  },
};
