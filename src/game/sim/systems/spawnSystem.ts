import type { EnemyKind } from '../../config/gameConfig';
import { distanceSq, type Vec2 } from '../../core/math';
import type { SimContext } from '../context';
import { createShip } from '../entities';
import type { WorldState } from '../types';

const SPAWN_ATTEMPTS = 40;

function aliveEnemies(world: WorldState): number {
  let count = 0;
  for (const e of world.enemies) if (e.alive) count++;
  return count;
}

function isClearOfShips(world: WorldState, point: Vec2, radius: number): boolean {
  const ships = [world.player, ...world.enemies];
  for (const ship of ships) {
    if (!ship.alive) continue;
    const min = ship.radius + radius;
    if (distanceSq(ship.x, ship.y, point.x, point.y) < min * min) return false;
  }
  return true;
}

/** Picks a free, open-water spawn point far enough from the player. */
export function findSpawnPoint(world: WorldState, ctx: SimContext, radius: number): Vec2 | null {
  const points = ctx.spawnPoints;
  if (points.length === 0) return null;
  const player = world.player;
  const minDistSq = ctx.config.spawn.minDistanceFromPlayer ** 2;
  const shipClearance = radius + ctx.config.spawn.clearance;

  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const point = ctx.rng.pick(points);
    if (distanceSq(point.x, point.y, player.x, player.y) < minDistSq) continue;
    if (!isClearOfShips(world, point, shipClearance)) continue;
    return point;
  }

  // Deterministic fallback: the free point farthest from the player.
  let best: Vec2 | null = null;
  let bestDist = -1;
  for (const point of points) {
    if (!isClearOfShips(world, point, shipClearance)) continue;
    const d = distanceSq(point.x, point.y, player.x, player.y);
    if (d > bestDist) {
      bestDist = d;
      best = point;
    }
  }
  return best && bestDist >= minDistSq * 0.5 ? best : null;
}

export function nextEnemyKind(world: WorldState, ctx: SimContext): EnemyKind {
  const opening = ctx.config.spawn.openingSequence[world.spawnCount];
  return opening ?? ctx.rng.weighted(ctx.config.spawn.distribution);
}

export function updateSpawner(world: WorldState, ctx: SimContext): void {
  const spawn = ctx.config.spawn;
  if (world.time < world.nextSpawnAt) return;
  world.nextSpawnAt += spawn.intervalSeconds;
  if (aliveEnemies(world) >= spawn.maxAliveEnemies) return;

  const kind = nextEnemyKind(world, ctx);
  const hull = kind === 'chaser' ? ctx.config.chaser : ctx.config.shooter;
  const point = findSpawnPoint(world, ctx, hull.radius);
  if (!point) return;

  const player = world.player;
  const rotation = Math.atan2(player.y - point.y, player.x - point.x);
  const ship = createShip(world, kind, hull, point.x, point.y, rotation);
  world.enemies.push(ship);
  world.spawnCount++;
  world.stats.enemiesSpawned++;
  ctx.emit({ type: 'enemy_spawned', shipId: ship.id, kind, x: ship.x, y: ship.y });
}
