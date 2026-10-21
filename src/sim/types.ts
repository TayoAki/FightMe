// Plain-data types for the simulation. Everything in MatchState is JSON-safe numbers, strings and arrays,
// so a state can be cloned and re-simulated (the basis for rollback netcode later).
//
// Units: 1 sim unit (su) = 0.1 mm. 10000 su = 1 m. One step = one frame at 60 fps.
// Boxes are facing-relative: +x points at the opponent, y is up from the fighter's feet.

export type StyleId = 'street' | 'iron';
export type Height = 'high' | 'mid' | 'low' | 'overhead';
export type Facing = 1 | -1;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProjectileDef {
  speed: number;
  life: number;
  spawnX: number;
  spawnY: number;
  w: number;
  h: number;
  hitstun: number;
  blockstun: number;
  kind: string;
}

export interface VelocitySegment {
  from: number;
  to: number;
  vx: number;
  vy?: number;
}

export interface ChainDef {
  buttons: number;
  dirs?: number[];
  to: string;
  // strings (Iron) can be entered on whiff; target combos (Street) need the first hit to connect
  onWhiff?: boolean;
}

export type MoveKind = 'normal' | 'special' | 'super' | 'throw' | 'drive' | 'system';

export interface MoveDef {
  id: string;
  name: string;
  kind: MoveKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  height: Height;
  onHit: number;
  onBlock: number;
  hitbox?: Box;
  hurtbox?: Box;
  hits?: number;
  hitInterval?: number;
  chip?: number;
  pushback?: number;
  hitstop?: number;
  launch?: { vx: number; vy: number };
  knockdown?: boolean;
  crumple?: boolean;
  wallSplat?: boolean;
  tornado?: boolean;
  armor?: number;
  invuln?: [number, number];
  projectile?: ProjectileDef;
  velocity?: VelocitySegment[];
  air?: boolean;
  airStun?: { hit: number; block: number };
  landingRecovery?: number;
  airborne?: [number, number];
  tracking?: boolean;
  throwDamage?: number;
  cancels?: Array<'special' | 'super' | 'drive'>;
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

export type Motion = '236' | '214' | '623' | '236236' | '214214' | '66' | '44' | '22';

export interface CommandDef {
  move: string;
  buttons: number;
  any?: boolean;
  motion?: Motion;
  justFrame?: boolean;
  dirs?: number[];
  air?: boolean;
  from?: 'ground' | 'air' | 'parry' | 'blockstun' | 'heat' | 'prejump';
  cost?: { drive?: number; super?: number };
  needs?: 'heat' | 'heatAvailable' | 'rage';
}

export interface StyleDef {
  id: StyleId;
  name: string;
  inspired: string;
  tagline: string;
  buttonLabels: [string, string, string, string, string, string];
  walkF: number;
  walkB: number;
  jumpVx: number;
  neutralGuard: boolean;
  crouchGuardBlocksMid: boolean;
  crouchGuardDirs: number[];
  juggleLimit: number;
  drive: boolean;
  supers: boolean;
  heat: boolean;
  rage: boolean;
  evade: boolean;
  moves: Record<string, MoveDef>;
  commands: CommandDef[];
  // normals by button and stance, looked up after commands
  normals: { stand: Record<number, string>; crouch: Record<number, string>; air: Record<number, string> };
}

export interface InputFrame {
  f: number;
  raw: number;
  dir: number;
  held: number;
  pressed: number;
}

export type FighterStateName =
  | 'idle'
  | 'walkF'
  | 'walkB'
  | 'crouch'
  | 'prejump'
  | 'air'
  | 'land'
  | 'dash'
  | 'backdash'
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
  | 'ko'
  | 'win';

export interface FighterState {
  side: 0 | 1;
  style: StyleId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  health: number;
  drive: number;
  superMeter: number;
  burnout: boolean;
  heatAvailable: boolean;
  heatTimer: number;
  rageUsed: boolean;
  state: FighterStateName;
  stateFrame: number;
  moveId: string;
  moveFrame: number;
  moveStartF: number;
  hitIndex: number;
  hitConnected: number;
  contact: '' | 'hit' | 'block' | 'whiff';
  contactF: number;
  stun: number;
  kb: number;
  kbDir: Facing;
  jumpDir: -1 | 0 | 1;
  airUsed: boolean;
  crouching: boolean;
  blockHeight: '' | 'stand' | 'crouch';
  armorLeft: number;
  driveRushBuff: number;
  fromDriveRush: boolean;
  juggleCount: number;
  tornadoUsed: boolean;
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
  lastStunKind: '' | 'high' | 'low' | 'crouch' | 'air';
  roundWins: number;
  actionableSince: number;
  wasActionable: boolean;
  hist: InputFrame[];
}

export interface ProjectileState {
  owner: 0 | 1;
  moveId: string;
  x: number;
  y: number;
  vx: number;
  life: number;
  age: number;
  kind: string;
  // set once the target evades it: the projectile flies past
  dodged: boolean;
}

export type GameEventType =
  | 'hit'
  | 'block'
  | 'parry'
  | 'perfectParry'
  | 'counter'
  | 'punish'
  | 'armor'
  | 'whiff'
  | 'throw'
  | 'tech'
  | 'super'
  | 'driveRush'
  | 'driveImpact'
  | 'burnout'
  | 'heat'
  | 'heatSmash'
  | 'rage'
  | 'rageArt'
  | 'wallSplat'
  | 'tornado'
  | 'justFrame'
  | 'evade'
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
  power: number;
  text?: string;
}

export type MatchPhase = 'intro' | 'fight' | 'ko' | 'roundEnd' | 'matchEnd';

export interface TrainingOptions {
  dummy: 'stand' | 'crouch' | 'jump' | 'block' | 'blockAfterFirst' | 'cpu';
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
  fighters: [FighterState, FighterState];
  projectiles: ProjectileState[];
  events: GameEvent[];
  training: TrainingOptions | null;
  // training readouts (the sim measures them so they are exact)
  lastMove: [string, string];
  lastAdvantage: [number, number];
  advPending: [number, number];
  bestCombo: [number, number];
}
