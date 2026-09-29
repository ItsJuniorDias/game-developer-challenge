/**
 * Central, typed gameplay configuration.
 *
 * Every balancing number used by the simulation lives here. Systems only read
 * from a `GameConfig` snapshot, so tuning never requires touching system logic.
 * A snapshot is frozen when a match starts; option changes apply to new matches.
 */

export type EnemyKind = 'chaser' | 'shooter';

export interface WeaponConfig {
  /** Damage applied once per projectile hit. */
  readonly damage: number;
  /** Projectile speed in world units per second. */
  readonly projectileSpeed: number;
  /** Maximum distance a projectile travels before it expires (world units). */
  readonly range: number;
  /** Maximum time a projectile stays in the air (seconds); it expires on whichever limit comes first. */
  readonly lifetimeSeconds: number;
  /** Minimum time between two shots of this weapon (seconds). */
  readonly cooldownSeconds: number;
}

export interface BroadsideConfig extends WeaponConfig {
  /** Number of parallel projectiles fired per broadside. */
  readonly projectileCount: number;
  /** Distance between two parallel projectiles, along the hull (world units). */
  readonly spacing: number;
}

export interface ShipHullConfig {
  readonly maxHealth: number;
  /** Radius used for ship-to-ship contact (rams and separation). */
  readonly radius: number;
  /**
   * Half extents of the hull. Projectile hits use this ellipse; islands and
   * arena bounds use three circles of radius `hitHalfWidth` along the keel,
   * so the bow and stern cannot enter the shore or leave the arena.
   */
  readonly hitHalfLength: number;
  readonly hitHalfWidth: number;
  /** Top speed in world units per second. */
  readonly maxSpeed: number;
  /** Rotation speed in radians per second. */
  readonly turnSpeed: number;
}

export interface PlayerConfig extends ShipHullConfig {
  readonly acceleration: number;
  readonly deceleration: number;
  /**
   * Joystick steering: fraction of the requested thrust kept while the bow is
   * still turning towards the stick direction (1 = no slowdown). Lets the ship
   * turn around tightly when the stick points behind it.
   */
  readonly steeringMinThrottle: number;
  readonly frontCannon: WeaponConfig;
  readonly broadside: BroadsideConfig;
}

export interface EnemyHullConfig extends ShipHullConfig {
  /** Acceleration and braking (world units per second squared). */
  readonly acceleration: number;
  /** Fraction of the target speed kept while turning hard (slows down to round islands). */
  readonly minTurnThrottle: number;
}

export interface ChaserConfig extends EnemyHullConfig {
  /** Damage dealt to the player when the chaser rams it (the chaser explodes). */
  readonly ramDamage: number;
}

export interface ShooterConfig extends EnemyHullConfig {
  /** The shooter opens fire when the player is within this distance. */
  readonly attackRange: number;
  /** The shooter stops approaching once it is this close to the player. */
  readonly holdDistance: number;
  /** Max heading error (radians) tolerated before firing. */
  readonly aimTolerance: number;
  /** Fraction of the player's motion during the cannonball flight used to lead the aim. */
  readonly leadFactor: number;
  readonly cannon: WeaponConfig;
}

export interface SpawnConfig {
  /** Seconds between two spawns (player option, see OPTION_LIMITS). */
  readonly intervalSeconds: number;
  /** Delay before the very first spawn (seconds). */
  readonly firstSpawnDelaySeconds: number;
  /** Relative weights used to pick the enemy type of each spawn. */
  readonly distribution: Readonly<Record<EnemyKind, number>>;
  /** Kinds forced for the first spawns so both types appear in every match. */
  readonly openingSequence: readonly EnemyKind[];
  /** Spawns are skipped while this many enemies are alive. */
  readonly maxAliveEnemies: number;
  /** Minimum distance between a spawn point and the player (world units). */
  readonly minDistanceFromPlayer: number;
  /** Minimum clearance between a spawn point and islands / other ships. */
  readonly clearance: number;
  /** Random candidates tried before falling back to the farthest free point. */
  readonly attempts: number;
  /** The fallback point is rejected if it is closer than this to the player. */
  readonly fallbackMinDistanceFromPlayer: number;
  /** Seconds after spawning during which an enemy cannot attack. */
  readonly graceSeconds: number;
}

export interface MatchConfig {
  /** Active play time of a match (player option, see OPTION_LIMITS). */
  readonly durationSeconds: number;
}

export interface AiConfig {
  /** Seconds between two A* searches of the same enemy. */
  readonly repathIntervalSeconds: number;
  /** Distance at which a path waypoint counts as reached. */
  readonly waypointReachDistance: number;
  /** Clearance a cannonball needs for the Shooter to consider its shot clear. */
  readonly shotClearance: number;
  /** How far ahead an enemy looks for other ships blocking its lane. */
  readonly avoidanceLookahead: number;
  /** Maximum heading offset (radians) used to sail around a blocking ship. */
  readonly avoidanceMaxTurn: number;
}

export interface CollisionConfig {
  /** Cannonball radius used for hits against hulls. */
  readonly projectileRadius: number;
  /** Share of a player/enemy overlap resolved by moving the player (the rest moves the enemy). */
  readonly playerPushShare: number;
  /** Minimum seconds between two "ship bump" feedback events. */
  readonly bumpEventCooldownSeconds: number;
}

export interface GameConfig {
  readonly match: MatchConfig;
  readonly ai: AiConfig;
  readonly collision: CollisionConfig;
  readonly spawn: SpawnConfig;
  readonly player: PlayerConfig;
  readonly chaser: ChaserConfig;
  readonly shooter: ShooterConfig;
  /** Fixed simulation step (seconds). */
  readonly fixedStepSeconds: number;
  /** Upper bound of simulated time processed per rendered frame (seconds). */
  readonly maxFrameCatchUpSeconds: number;
}

/** Player-facing options and their documented limits. */
export interface PlayerOptions {
  readonly sessionTimeSeconds: number;
  readonly spawnIntervalSeconds: number;
}

export const OPTION_LIMITS = {
  sessionTimeSeconds: { min: 60, max: 180, step: 10, default: 120 },
  spawnIntervalSeconds: { min: 1, max: 10, step: 0.5, default: 3 },
} as const;

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionTimeSeconds: OPTION_LIMITS.sessionTimeSeconds.default,
  spawnIntervalSeconds: OPTION_LIMITS.spawnIntervalSeconds.default,
};

export const BASE_GAME_CONFIG: GameConfig = {
  match: {
    durationSeconds: DEFAULT_OPTIONS.sessionTimeSeconds,
  },
  ai: {
    repathIntervalSeconds: 0.5,
    waypointReachDistance: 40,
    shotClearance: 8,
    avoidanceLookahead: 130,
    avoidanceMaxTurn: 1.1,
  },
  collision: {
    projectileRadius: 5,
    playerPushShare: 0.3,
    bumpEventCooldownSeconds: 0.35,
  },
  spawn: {
    intervalSeconds: DEFAULT_OPTIONS.spawnIntervalSeconds,
    firstSpawnDelaySeconds: 1.5,
    distribution: { chaser: 0.55, shooter: 0.45 },
    openingSequence: ['chaser', 'shooter'],
    maxAliveEnemies: 10,
    minDistanceFromPlayer: 700,
    clearance: 24,
    attempts: 40,
    fallbackMinDistanceFromPlayer: 495,
    graceSeconds: 1,
  },
  player: {
    maxHealth: 100,
    radius: 30,
    hitHalfLength: 50,
    hitHalfWidth: 26,
    maxSpeed: 210,
    acceleration: 320,
    deceleration: 240,
    turnSpeed: 2.5,
    steeringMinThrottle: 0.35,
    frontCannon: { damage: 20, projectileSpeed: 720, range: 720, lifetimeSeconds: 1, cooldownSeconds: 0.45 },
    broadside: {
      damage: 20,
      projectileSpeed: 620,
      range: 460,
      lifetimeSeconds: 0.75,
      cooldownSeconds: 1.2,
      projectileCount: 3,
      spacing: 30,
    },
  },
  chaser: {
    maxHealth: 40,
    radius: 30,
    hitHalfLength: 50,
    hitHalfWidth: 26,
    maxSpeed: 150,
    turnSpeed: 2,
    acceleration: 225,
    minTurnThrottle: 0.3,
    ramDamage: 15,
  },
  shooter: {
    maxHealth: 60,
    radius: 30,
    hitHalfLength: 50,
    hitHalfWidth: 26,
    maxSpeed: 125,
    turnSpeed: 1.7,
    acceleration: 187.5,
    minTurnThrottle: 0.3,
    attackRange: 560,
    holdDistance: 380,
    aimTolerance: 0.14,
    leadFactor: 0.7,
    cannon: { damage: 8, projectileSpeed: 520, range: 620, lifetimeSeconds: 1.2, cooldownSeconds: 2.2 },
  },
  fixedStepSeconds: 1 / 60,
  maxFrameCatchUpSeconds: 0.25,
};

export function clampOption(value: number, key: keyof PlayerOptions): number {
  const limits = OPTION_LIMITS[key];
  const stepped = Math.round(value / limits.step) * limits.step;
  return Math.min(limits.max, Math.max(limits.min, Number(stepped.toFixed(2))));
}

/** Builds the immutable config snapshot used by one match. */
export function createMatchConfig(options: PlayerOptions, base: GameConfig = BASE_GAME_CONFIG): GameConfig {
  const snapshot: GameConfig = {
    ...base,
    match: { ...base.match, durationSeconds: options.sessionTimeSeconds },
    spawn: { ...base.spawn, intervalSeconds: options.spawnIntervalSeconds },
  };
  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
