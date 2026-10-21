// Readable move lists for the How to Play screen. "Toward", "away" and "side" mean the stick pushed toward
// your opponent, away from them, or across (circling).

import type { StyleId } from '../sim/types';

export interface MoveRow {
  name: string;
  input: string;
  note?: string;
}

export interface MoveSection {
  title: string;
  system: string[];
  moves: MoveRow[];
}

export const UNIVERSAL: MoveSection = {
  title: 'Every style',
  system: [
    'You always face your opponent. Left and right on the stick follow the screen; up and down circle in and out of it.',
    'Guard covers your front and sides, not your back. Throws beat guard.',
    'The fence round the arena is a wall: wall-splat moves pin people against it.',
  ],
  moves: [
    { name: 'Homing dash', input: 'Dash', note: 'Chases your opponent; attack out of it' },
    { name: 'Side dash', input: 'side + Dash', note: 'Circles them and dodges straight attacks, fireballs and beams' },
    { name: 'Back dash', input: 'away + Dash', note: 'Hops back, briefly untouchable' },
    { name: 'Jump / air dash', input: 'Jump, then Dash in the air' },
    { name: 'Guard', input: 'hold Guard' },
    { name: 'Throw', input: 'Light + Guard', note: 'Press Light + Guard when grabbed to break it' },
    { name: 'Beam clash', input: 'mash Light, Heavy, Special', note: 'When two beams meet, the faster masher wins' },
  ],
};

export const MOVELIST: Record<StyleId, MoveSection[]> = {
  street: [
    {
      title: 'Street',
      system: [
        'Drive gauge (6 bars): Parry, Drive Rush, Drive Impact and Drive Reversal spend it. Empty it and you burn out: no Drive moves and you take chip damage.',
        'Cancel normals into specials on hit or block, and specials into supers.',
      ],
      moves: [
        { name: 'Light string', input: 'Light, Light, Light' },
        { name: 'Hammer Hook / Front Kick', input: 'Heavy / toward + Heavy', note: 'Both cancel into specials' },
        { name: 'Rising Elbow / Sweep', input: 'away + Heavy / side + Heavy', note: 'Anti-air / knockdown that catches side dashes' },
        { name: 'Spirit Orb', input: 'Special', note: 'Fireball' },
        { name: 'Rising Fang', input: 'toward + Special', note: 'Invincible uppercut, very unsafe' },
        { name: 'Cyclone Kick', input: 'away + Special', note: 'Spinning multi-hit kick' },
        { name: 'Comet Rush', input: 'Special + Guard', note: 'Super, 1 bar' },
        { name: 'Spirit Cannon', input: 'away + Special + Guard', note: 'Beam super, 2 bars. Clashes with other beams' },
        { name: 'Meteor Drive', input: 'toward + Special + Guard', note: 'Super, 3 bars' },
        { name: 'Drive Parry', input: 'hold Light + Heavy', note: 'Tap it just before a hit for PERFECT PARRY' },
        { name: 'Drive Rush', input: 'Dash during Parry', note: 'Or Dash out of a cancelable normal on contact (3 bars). Your next hit gets +4' },
        { name: 'Drive Impact', input: 'Heavy + Special', note: 'Armors 2 hits. Crumples on hit, wall splats at the fence, stuns a burnt-out opponent' },
        { name: 'Drive Reversal', input: 'Light + Heavy while guarding a hit', note: '2 bars. Gets you out of pressure' },
      ],
    },
  ],
  tag: [
    {
      title: 'Tag team',
      system: [
        'A team of two that shares one health bar. One fights, the other waits to be called in.',
        'Assist (Light + Heavy): your partner jumps in for one attack, even in the middle of your own combo. 3 s cooldown. If they get hit, you take the damage and wait longer.',
        'Tag (Heavy + Special): swap who is fighting. Works as a cancel on hit to extend combos. 5 s cooldown.',
        'Team super (Special + Guard, 1 bar): both of you attack at once.',
      ],
      moves: [],
    },
    {
      title: 'Volt (rushdown)',
      system: ['Assist: Volt Rush, a homing launcher.'],
      moves: [
        { name: 'Auto combo', input: 'Light ×4' },
        { name: 'Volt Upper', input: 'Heavy', note: 'Launcher: juggle after it' },
        { name: 'Lunge Punch', input: 'toward + Heavy', note: 'Wall splats' },
        { name: 'Rising Knee / Sweep', input: 'away + Heavy / side + Heavy' },
        { name: 'Thunder Step', input: 'Special', note: 'Dashing strike that passes through attacks' },
        { name: 'Rising Volt', input: 'toward + Special', note: 'Invincible uppercut' },
        { name: 'Backflip Kick', input: 'away + Special', note: 'Escape that kicks' },
        { name: 'Dive Kick', input: 'Special in the air' },
        { name: 'Thunder Cross', input: 'Special + Guard', note: 'Super' },
      ],
    },
    {
      title: 'Nova (zoner)',
      system: ['Assist: Nova Beam, which clashes with other beams.'],
      moves: [
        { name: 'Palm, Push Palm', input: 'Light, Light', note: 'Push Palm wall splats' },
        { name: 'Arc Kick', input: 'Heavy', note: 'Long reach' },
        { name: 'Nova Lift', input: 'toward + Heavy', note: 'Launcher' },
        { name: 'Orbit Guard / Sweep', input: 'away + Heavy / side + Heavy', note: 'Anti-air / knockdown' },
        { name: 'Nova Bolt', input: 'Special', note: 'Fast projectile' },
        { name: 'Seeker Orb', input: 'toward + Special', note: 'Slow orb that follows the opponent' },
        { name: 'Blink', input: 'away + Special', note: 'Teleport behind the opponent' },
        { name: 'Air Bolt', input: 'Special in the air' },
        { name: 'Nova Cannon', input: 'Special + Guard', note: 'Beam super' },
      ],
    },
  ],
};
