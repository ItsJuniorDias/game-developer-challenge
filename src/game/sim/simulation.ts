import type { GameConfig } from '../config/gameConfig';
import type { Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { Arena, DEFAULT_LAYOUT, type ArenaLayout } from './arena';
import type { SimContext } from './context';
import { createShip } from './entities';
import { NavGrid } from './navigation';
import { CollisionSystem } from './systems/collisionSystem';
import { updateEnemies } from './systems/enemyAiSystem';
import { updatePlayer } from './systems/playerSystem';
import { updateProjectiles } from './systems/projectileSystem';
import { updateSpawner } from './systems/spawnSystem';
import type { EndReason, PlayerIntent, SimEvent, WorldState } from './types';

export interface SimulationOptions {
  readonly config: GameConfig;
  readonly seed: number;
  readonly layout?: ArenaLayout;
}

export interface ShipSnapshot {
  id: number;
  kind: string;
  x: number;
  y: number;
  rotation: number;
  speed: number;
  health: number;
  maxHealth: number;
}

export interface SimSnapshot {
  time: number;
  remaining: number;
  score: number;
  status: WorldState['status'];
  endReason: EndReason | null;
  player: ShipSnapshot;
  enemies: ShipSnapshot[];
  projectiles: { id: number; owner: string; x: number; y: number }[];
  nextSpawnAt: number;
  cooldowns: { front: number; left: number; right: number };
  stats: WorldState['stats'];
}

const NAV_CELL_SIZE = 32;

/**
 * Pure, renderer-agnostic combat simulation. It advances in fixed steps,
 * never reads wall-clock time and emits events for presentation layers.
 */
export class Simulation {
  readonly world: WorldState;
  readonly arena: Arena;
  readonly config: GameConfig;
  private readonly ctx: SimContext;
  private readonly collisions = new CollisionSystem();
  private events: SimEvent[] = [];

  constructor(options: SimulationOptions) {
    this.config = options.config;
    this.arena = new Arena(options.layout ?? DEFAULT_LAYOUT);
    const clearance = Math.max(options.config.chaser.radius, options.config.shooter.radius);
    const nav = new NavGrid(this.arena, NAV_CELL_SIZE, clearance);
    const spawnPoints: Vec2[] = nav.openPoints(clearance + options.config.spawn.clearance);
    const rng = new Rng(options.seed);
    this.ctx = {
      config: options.config,
      arena: this.arena,
      nav,
      rng,
      spawnPoints,
      emit: (event) => {
        this.events.push(event);
      },
    };

    const spawn = this.arena.layout.playerSpawn;
    const world: WorldState = {
      time: 0,
      score: 0,
      status: 'running',
      endReason: null,
      player: undefined as never,
      enemies: [],
      projectiles: [],
      nextSpawnAt: options.config.spawn.firstSpawnDelaySeconds,
      spawnCount: 0,
      nextId: 1,
      stats: {
        shotsFired: 0,
        enemiesSpawned: 0,
        enemiesDestroyed: 0,
        chasersRammed: 0,
        damageTaken: 0,
        peakEntities: 1,
      },
    };
    world.player = createShip(world, 'player', options.config.player, spawn.x, spawn.y, spawn.rotation);
    this.world = world;
  }

  get durationSeconds(): number {
    return this.config.match.durationSeconds;
  }

  get remainingSeconds(): number {
    return Math.max(0, this.durationSeconds - this.world.time);
  }

  /** Advances the simulation by one fixed step. */
  step(dt: number, intent: PlayerIntent): void {
    const world = this.world;
    if (world.status !== 'running') return;

    const h = Math.min(dt, this.durationSeconds - world.time);
    if (h <= 0) {
      this.end('time_up');
      return;
    }

    this.storePreviousTransforms();
    world.time += h;

    updatePlayer(world, this.ctx, intent, h);
    updateEnemies(world, this.ctx, h);
    this.collisions.update(world, this.ctx, h);
    updateProjectiles(world, this.ctx, h);
    this.compact();
    updateSpawner(world, this.ctx);

    const entities = 1 + world.enemies.length + world.projectiles.length;
    if (entities > world.stats.peakEntities) world.stats.peakEntities = entities;

    if (!world.player.alive || world.player.health <= 0) this.end('defeated');
    else if (world.time >= this.durationSeconds - 1e-9) this.end('time_up');
  }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): SimEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  snapshot(): SimSnapshot {
    const w = this.world;
    const ship = (s: WorldState['player']): ShipSnapshot => ({
      id: s.id,
      kind: s.kind,
      x: round(s.x),
      y: round(s.y),
      rotation: round(s.rotation, 4),
      speed: round(s.speed),
      health: s.health,
      maxHealth: s.maxHealth,
    });
    return {
      time: round(w.time, 4),
      remaining: round(this.remainingSeconds, 4),
      score: w.score,
      status: w.status,
      endReason: w.endReason,
      player: ship(w.player),
      enemies: w.enemies.filter((e) => e.alive).map(ship),
      projectiles: w.projectiles.filter((p) => p.alive).map((p) => ({ id: p.id, owner: p.owner, x: round(p.x), y: round(p.y) })),
      nextSpawnAt: round(w.nextSpawnAt, 4),
      cooldowns: {
        front: round(Math.max(0, w.player.readyAt.front - w.time), 4),
        left: round(Math.max(0, w.player.readyAt.left - w.time), 4),
        right: round(Math.max(0, w.player.readyAt.right - w.time), 4),
      },
      stats: { ...w.stats },
    };
  }

  private end(reason: EndReason): void {
    const world = this.world;
    if (world.status === 'ended') return;
    world.status = 'ended';
    world.endReason = reason;
    world.player.speed = 0;
    for (const enemy of world.enemies) enemy.speed = 0;
    this.ctx.emit({ type: 'match_ended', reason });
  }

  private storePreviousTransforms(): void {
    const w = this.world;
    const p = w.player;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevRotation = p.rotation;
    for (const e of w.enemies) {
      e.prevX = e.x;
      e.prevY = e.y;
      e.prevRotation = e.rotation;
    }
    for (const pr of w.projectiles) {
      pr.prevX = pr.x;
      pr.prevY = pr.y;
    }
  }

  private compact(): void {
    const w = this.world;
    let write = 0;
    for (const p of w.projectiles) if (p.alive) w.projectiles[write++] = p;
    w.projectiles.length = write;
    write = 0;
    for (const e of w.enemies) if (e.alive) w.enemies[write++] = e;
    w.enemies.length = write;
  }
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
