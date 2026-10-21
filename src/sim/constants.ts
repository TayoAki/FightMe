// Shared rules. Distances in sim units (0.1 mm), speeds in su per frame, 60 frames per second.

export const FPS = 60;
export const MAX_HEALTH = 10000;
export const TEAM_HEALTH = 9000;
export const ROUND_SECONDS = 99;
export const ROUNDS_TO_WIN = 2;

// the arena: a round rooftop 15 m across, with an energy fence at the edge
export const ARENA_R = 75000;
export const START_GAP = 40000;
export const BODY_R = 2400;
export const STAND_HEIGHT = 16500;

export const GRAVITY = 62;
// juggled fighters float a little longer, so launchers lead into combos
export const JUGGLE_GRAVITY = 52;
export const JUMP_VY = 1250;
export const JUMP_SPEED = 420;
export const PREJUMP = 4;
export const LANDING = 3;

// homing dash: chases the opponent until in range
export const DASH_SPEED = 1500;
export const DASH_MAX = 34;
export const DASH_STOP = 9500;
export const DASH_RECOVERY = 7;
export const DASH_MOMENTUM = 260;
export const BACKDASH_FRAMES = 20;
export const BACKDASH_SPEED = 720;
export const BACKDASH_INVULN: [number, number] = [1, 6];
// side dash: circles the opponent and dodges straight attacks and projectiles
export const SIDEDASH_FRAMES = 20;
export const SIDEDASH_SPEED = 980;
export const SIDEDASH_INVULN: [number, number] = [2, 13];
export const AIRDASH_FRAMES = 14;
export const AIRDASH_SPEED = 1300;

// guard covers attacks from the front and the sides (about ±100°), not from behind
export const GUARD_ARC = -180;

export const KNOCKDOWN_FRAMES = 46;
export const GETUP_FRAMES = 12;
export const CRUMPLE_FRAMES = 56;
export const DIZZY_FRAMES = 150;
export const WALLSPLAT_FRAMES = 42;
export const THROW_TECH_WINDOW = 9;
export const THROW_PROTECT = 3;

// Drive gauge (Street style): 6 bars
export const DRIVE_BAR = 10000;
export const DRIVE_MAX = 6 * DRIVE_BAR;
export const DRIVE_REGEN = 22;
export const DRIVE_REGEN_BURNOUT = 100;
export const PARRY_DRAIN = 55;
export const DRIVE_RUSH_BONUS = 4;

// super gauge: 3 bars
export const SUPER_BAR = 10000;
export const SUPER_MAX = 3 * SUPER_BAR;

// Tag style: assist and tag cooldowns, as in Marvel Tokon (3 s and 5 s)
export const ASSIST_COOLDOWN = 180;
export const ASSIST_HIT_COOLDOWN = 360;
export const TAG_COOLDOWN = 300;

// beam clash: mash to push the clash point into the other beam
export const CLASH_FRAMES = 240;
export const CLASH_PUSH = 16;

// combo damage scaling by hits already landed, in percent
export const SCALING = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10];
