// Plain-data types for the simulation. Everything in MatchState is JSON-safe integers, strings and arrays,
// so a state can be cloned and re-simulated (the basis for rollback netcode later).
//
// Units: 1 sim unit (su) = 0.1 mm, so 10000 su = 1 m. One step = one frame at 60 fps.
// The arena is the x/z ground plane with y up. Directions are fixed-point unit vectors of length 1024.
// Hitboxes are facing-relative: `f0..f1` is the reach in front of the fighter, `hw` the half width.

export type StyleId = 'street' | 'tag';

// a stick direction relative to the opponent: neutral, toward, away, or sideways (circling)
export type Rel = 'n' | 't' | 'a' | 's';

export interface HitBox {
  f0: number;
  f1: number;
  y0: number;
  y1: number;
  hw: number;
}

export interface ProjectileDef {
  speed: number;
  life: number;
  spawnF: number;
  spawnY: number;
  r: number;
  hitstun: number;
  blockstun: number;
  kind: string;
  // degrees the projectile turns toward its target each frame (0: flies straight)
  homing?: 0 | 1 | 2 | 3;
  // aimed down at the ground in front (air projectiles)
  dropVy?: number;
}

export interface BeamDef {
  length: number;
  grow: number;
  width: number;
  duration: number;
  hitEvery: number;
  hitstun: number;
  blockstun: number;
  spawnY: number;
  // damage to the loser of a beam clash
  clashDamage: number;
}

export interface VelocitySegment {
  from: number;
  to: number;
  // forward speed along the fighter's facing
  fwd: number;
  vy?: number;
}

export interface ChainDef {
  buttons: number;
  rel?: Rel[];
  to: string;
}

export type MoveKind = 'normal' | 'special' | 'super' | 'throw' | 'drive' | 'system' | 'assist';

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  onHit: number;
  onBlock: number;
  hitbox?: HitBox;
  hits?: number;
  hitInterval?: number;
  chip?: number;
  pushback?: number;
  hitstop?: number;
  launch?: { fwd: number; vy: number };
  knockdown?: boolean;
  crumple?: boolean;
  wallSplat?: boolean;
  armor?: number;
  invuln?: [number, number];
  projectile?: ProjectileDef;
  beam?: BeamDef;
  velocity?: VelocitySegment[];
  air?: boolean;
  airStun?: { hit: number; block: number };
  landingRecovery?: number;
  airborne?: [number, number];
  // hits a fighter in the middle of a side dash
  tracking?: boolean;
  // frames during which the attacker keeps turning toward the opponent
  homing?: number;
  // teleports behind the opponent on this frame
  teleport?: number;
  throwDamage?: number;
  cancels?: Array<'special' | 'super' | 'drive' | 'tag'>;
  chains?: ChainDef[];
  chainWindow?: number;
  superFreeze?: number;
  minScale?: number;
  tag?: string;
  // render-only: poses for the animation layer
  pose: string;
  windup?: string;
  keys?: Array<[number, string]>;
  spin?: number;
}

export type CommandFrom = 'ground' | 'air' | 'parry' | 'blockstun';

export interface CommandDef {
  move: string;
  buttons: number;
  // any one of `buttons` (otherwise all of them, pressed within 3 frames of each other)
  any?: boolean;
  rel?: Rel[];
  from?: CommandFrom;
  cost?: { drive?: number; super?: number };
  needs?: 'tag';
}

// one character's moves. Street fighters have one kit; a Tag team has two, one per character.
export interface Kit {
  name: string;
  runSpeed: number;
  moves: Record<string, MoveDef>;
  commands: CommandDef[];
  air: CommandDef[];
  // the move this character does when called in as an assist
  assist?: string;
  // the move this character comes in with on a tag
  tagIn?: string;
}

export interface StyleDef {
  id: StyleId;
  name: string;
  inspired: string;
  tagline: string;
  drive: boolean;
  supers: boolean;
  team: boolean;
  juggleLimit: number;
  // a team of two shares a smaller health pool than a solo fighter
  health: number;
  // style-wide commands, checked before the kit's own
  commands: CommandDef[];
  kits: Kit[];
}

export interface InputFrame {
  f: number;
  raw: number;
  rel: Rel;
  // which way a sideways input circles: +1 or -1, 0 when not sideways
  side: -1 | 0 | 1;
  // the stick as a world direction (length 1024), 0,0 when neutral
  mx: number;
  mz: number;
  held: number;
  pressed: number;
}

export type FighterStateName =
  | 'idle'
  | 'run'
  | 'guard'
  | 'prejump'
  | 'air'
  | 'airdash'
  | 'land'
  | 'dash'
  | 'dashEnd'
  | 'backdash'
  | 'sidedash'
  | 'move'
  | 'hitstun'
  | 'blockstun'
  | 'juggle'
  | 'knockdown'
  | 'getup'
  | 'wallsplat'
  | 'crumple'
  | 'dizzy'
  | 'stagger'
  | 'thrown'
  | 'throwing'
  | 'parry'
  | 'parryEnd'
  | 'beamClash'
  | 'ko'
  | 'win';

export interface FighterState {
  side: 0 | 1;
  style: StyleId;
  // the active character's kit (Tag teams switch between 0 and 1)
  char: 0 | 1;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  // facing, a unit vector (length 1024)
  fx: number;
  fz: number;
  health: number;
  drive: number;
  superMeter: number;
  burnout: boolean;
  state: FighterStateName;
  stateFrame: number;
  moveId: string;
  moveFrame: number;
  moveStartF: number;
  hitConnected: number;
  contact: '' | 'hit' | 'block';
  contactF: number;
  stun: number;
  // knockback still to slide, and its direction
  kb: number;
  kbx: number;
  kbz: number;
  dashSide: -1 | 1;
  airUsed: boolean;
  airDashed: boolean;
  armorLeft: number;
  fromDriveRush: boolean;
  fromDash: boolean;
  juggleCount: number;
  comboHits: number;
  comboDamage: number;
  comboScale50: boolean;
  wallSplats: number;
  pendingWallSplat: boolean;
  throwProtect: number;
  throwTimer: number;
  throwBack: boolean;
  lastConsumed: number;
  lastHitBy: string;
  lastStunKind: '' | 'high' | 'low';
  roundWins: number;
  actionableSince: number;
  wasActionable: boolean;
  assistCD: number;
  tagCD: number;
  hist: InputFrame[];
}

// a Tag partner jumping in for an assist
export interface AssistState {
  side: 0 | 1;
  char: 0 | 1;
  state: 'enter' | 'attack' | 'leave' | 'hit';
  stateFrame: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  fx: number;
  fz: number;
  moveId: string;
  moveFrame: number;
  hitConnected: number;
}

export interface ProjectileState {
  owner: 0 | 1;
  kit: 0 | 1;
  moveId: string;
  x: number;
  z: number;
  y: number;
  dx: number;
  dz: number;
  vy: number;
  speed: number;
  life: number;
  age: number;
  kind: string;
  // set once the target dodges it: the projectile flies past
  dodged: boolean;
}

export interface BeamState {
  owner: 0 | 1;
  kit: 0 | 1;
  moveId: string;
  fromAssist: boolean;
  x: number;
  z: number;
  y: number;
  dx: number;
  dz: number;
  len: number;
  age: number;
  clashing: boolean;
}

export interface ClashState {
  // 0..1000: where the clash point sits between the two beams (500 = the middle)
  pos: number;
  timer: number;
  // beam index per side
  beams: [number, number];
  presses: [number, number];
}

export type GameEventType =
  | 'hit'
  | 'block'
  | 'parry'
  | 'perfectParry'
  | 'counter'
  | 'punish'
  | 'armor'
  | 'throw'
  | 'tech'
  | 'super'
  | 'driveRush'
  | 'driveImpact'
  | 'burnout'
  | 'wallSplat'
  | 'dash'
  | 'sidedash'
  | 'teleport'
  | 'assist'
  | 'assistHit'
  | 'tagSwap'
  | 'beam'
  | 'beamClash'
  | 'clashWin'
  | 'knockdown'
  | 'ko'
  | 'round'
  | 'fight'
  | 'timeover'
  | 'dizzy'
  | 'jump'
  | 'land'
  | 'projectile';

export interface GameEvent {
  type: GameEventType;
  side: 0 | 1;
  x: number;
  y: number;
  z: number;
  power: number;
  text?: string;
}

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'roundEnd' | 'matchEnd';

export interface TrainingOptions {
  dummy: 'stand' | 'guard' | 'guardAfterFirst' | 'jump' | 'sidedash' | 'cpu';
  infiniteMeter: boolean;
  autoRefill: boolean;
}

export interface MatchState {
  frame: number;
  freeze: number;
  phase: MatchPhase;
  phaseFrame: number;
  round: number;
  timer: number;
  winner: -1 | 0 | 1 | 2;
  // the screen's "right" direction on the ground (unit vector): the shared camera looks across it, and the
  // stick is read relative to it, so left and right on the stick match the screen
  ax: number;
  az: number;
  fighters: [FighterState, FighterState];
  assists: [AssistState | null, AssistState | null];
  projectiles: ProjectileState[];
  beams: BeamState[];
  clash: ClashState | null;
  events: GameEvent[];
  training: TrainingOptions | null;
  // training readouts (the sim measures them so they are exact)
  lastMove: [string, string];
  lastAdvantage: [number, number];
  advPending: [number, number];
  bestCombo: [number, number];
}
