import type { EnemyKind } from '../config/gameConfig';
import type { Vec2 } from '../core/math';

export type Faction = 'player' | 'enemy';
export type ShipKind = 'player' | EnemyKind;
export type WeaponSlot = 'front' | 'left' | 'right';
export type EndReason = 'time_up' | 'defeated';
export type MatchStatus = 'running' | 'ended';

/** Digital actions (keys and buttons). */
export type GameAction = 'forward' | 'turnLeft' | 'turnRight' | 'fireFront' | 'fireLeft' | 'fireRight';

export interface PlayerIntent extends Record<GameAction, boolean> {
  /**
   * Analog steering (touch joystick): heading the bow should turn towards, in
   * world radians, or null. Turn keys take precedence when held.
   */
  targetHeading: number | null;
  /** Analog thrust in [0, 1]; the forward key always means full thrust. */
  throttle: number;
}

export const IDLE_INTENT: Readonly<PlayerIntent> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
  targetHeading: null,
  throttle: 0,
});

export interface AiState {
  path: Vec2[];
  pathIndex: number;
  nextRepathAt: number;
}

export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians; 0 points to +x, angles grow clockwise on screen (y down). */
  rotation: number;
  prevX: number;
  prevY: number;
  prevRotation: number;
  speed: number;
  health: number;
  readonly maxHealth: number;
  readonly radius: number;
  alive: boolean;
  readonly spawnedAt: number;
  /** Simulation time at which each weapon is ready again. */
  readyAt: Record<WeaponSlot, number>;
  lastDamagedAt: number;
  ai: AiState | null;
}

export interface Projectile {
  readonly id: number;
  readonly owner: Faction;
  readonly ownerId: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly range: number;
  readonly lifetime: number;
  traveled: number;
  /** Seconds since the projectile was fired. */
  age: number;
  alive: boolean;
}

export interface MatchStats {
  shotsFired: number;
  enemiesSpawned: number;
  enemiesDestroyed: number;
  chasersRammed: number;
  damageTaken: number;
  peakEntities: number;
}

export interface WorldState {
  /** Active simulated time in seconds (never advances while paused). */
  time: number;
  score: number;
  status: MatchStatus;
  endReason: EndReason | null;
  player: Ship;
  enemies: Ship[];
  projectiles: Projectile[];
  nextSpawnAt: number;
  spawnCount: number;
  nextId: number;
  stats: MatchStats;
}

export type ProjectileEndCause = 'expired' | 'island' | 'bounds' | 'hit' | 'owner_destroyed' | 'match_end';

export type SimEvent =
  | { type: 'shot'; owner: Faction; shipId: number; slot: WeaponSlot; x: number; y: number; angle: number; count: number }
  | { type: 'projectile_end'; id: number; cause: ProjectileEndCause; x: number; y: number }
  | { type: 'ship_hit'; shipId: number; kind: ShipKind; damage: number; x: number; y: number; health: number }
  | { type: 'ship_destroyed'; shipId: number; kind: ShipKind; cause: 'player_fire' | 'ram' | 'enemy_fire'; x: number; y: number; rotation: number }
  | { type: 'rammed'; shipId: number; x: number; y: number; damage: number }
  | { type: 'ship_bump'; x: number; y: number }
  | { type: 'enemy_spawned'; shipId: number; kind: EnemyKind; x: number; y: number }
  | { type: 'score_changed'; score: number }
  | { type: 'match_ended'; reason: EndReason };
