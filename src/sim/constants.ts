// Shared rules. Distances in sim units (0.1 mm), speeds in su per frame, 60 frames per second.

export const FPS = 60;
export const MAX_HEALTH = 10000;
export const ROUND_SECONDS = 99;
export const ROUNDS_TO_WIN = 2;

export const STAGE_HALF = 38000;
export const MAX_SEPARATION = 32000;
export const START_GAP = 18000;

export const PUSH_HALF = 2300;
export const PUSH_HALF_AIR = 1800;
export const STAND_HEIGHT = 16500;
export const CROUCH_HEIGHT = 12000;

export const GRAVITY = 65;
// juggled fighters float a little longer, so launchers lead into combos
export const JUGGLE_GRAVITY = 54;
export const JUMP_VY = 1300;
export const PREJUMP = 4;
export const LANDING = 3;

export const DASH_FRAMES = 18;
export const DASH_SPEED = 720;
export const BACKDASH_FRAMES = 22;
export const BACKDASH_SPEED = 620;

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

// Super gauge (Street style): 3 bars
export const SUPER_BAR = 10000;
export const SUPER_MAX = 3 * SUPER_BAR;

// Heat (Iron style): once per round, lasts this long
export const HEAT_FRAMES = 600;
export const RAGE_THRESHOLD = 2500;

// combo damage scaling by hits already landed, in percent
export const SCALING = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10];

export const DEFAULT_HITSTOP = { light: 8, medium: 10, heavy: 12 };
