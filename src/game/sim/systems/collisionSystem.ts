import type { ShipHullConfig } from '../../config/gameConfig';
import type { SimContext } from '../context';
import type { Ship, WorldState } from '../types';
import { applyDamage, destroyShip } from './damage';

function separate(a: Ship, b: Ship, weightA: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.sqrt(distSq) || 0.0001;
  const overlap = minDist - dist;
  const nx = dist > 0.0001 ? dx / dist : 1;
  const ny = dist > 0.0001 ? dy / dist : 0;
  a.x -= nx * overlap * weightA;
  a.y -= ny * overlap * weightA;
  b.x += nx * overlap * (1 - weightA);
  b.y += ny * overlap * (1 - weightA);
  return true;
}

function overlaps(a: Ship, b: Ship): boolean {
  const r = a.radius + b.radius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy < r * r;
}

export function hullOf(ctx: SimContext, ship: Ship): ShipHullConfig {
  return ship.kind === 'player' ? ctx.config.player : ship.kind === 'chaser' ? ctx.config.chaser : ctx.config.shooter;
}

/**
 * Resolves ship-vs-ship contacts (including chaser rams) and keeps every ship
 * inside the arena and out of the islands.
 */
export class CollisionSystem {
  private lastBumpAt = Number.NEGATIVE_INFINITY;
  private readonly probe = { x: 0, y: 0 };

  update(world: WorldState, ctx: SimContext, dt: number): void {
    const player = world.player;
    const enemies = world.enemies;

    // Player against enemies: chasers ram and explode, other ships are pushed apart.
    for (const enemy of enemies) {
      if (!player.alive) break;
      if (!enemy.alive || !overlaps(player, enemy)) continue;
      if (enemy.kind === 'chaser') {
        const damage = ctx.config.chaser.ramDamage;
        world.stats.chasersRammed++;
        ctx.emit({ type: 'rammed', shipId: enemy.id, x: enemy.x, y: enemy.y, damage });
        destroyShip(world, ctx, enemy, 'ram');
        applyDamage(world, ctx, player, damage, 'ram');
      } else if (separate(player, enemy, ctx.config.collision.playerPushShare)) {
        this.bump(world, ctx, (player.x + enemy.x) / 2, (player.y + enemy.y) / 2);
      }
    }

    // Enemies keep their distance from each other.
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a?.alive) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b?.alive) continue;
        separate(a, b, 0.5);
      }
    }

    // Islands and arena bounds always win over ship-to-ship pushes.
    this.resolveStatic(player, ctx, dt);
    for (const enemy of enemies) {
      if (enemy.alive) this.resolveStatic(enemy, ctx, dt);
    }
  }

  /**
   * Pushes the hull (three circles along the keel: stern, centre, bow) out of
   * islands and inside the arena. Only the part of that correction pointing
   * against the heading bleeds speed: sliding along a shore keeps momentum,
   * sailing head-on into it stops the ship, and pushes from other ships never
   * slow anyone down.
   */
  private resolveStatic(ship: Ship, ctx: SimContext, dt: number): void {
    if (!ship.alive) return;
    const hull = hullOf(ctx, ship);
    const radius = hull.hitHalfWidth;
    const offset = Math.max(0, hull.hitHalfLength - hull.hitHalfWidth);
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);
    const startX = ship.x;
    const startY = ship.y;
    const probe = this.probe;
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (let k = -1; k <= 1; k++) {
        probe.x = ship.x + cos * offset * k;
        probe.y = ship.y + sin * offset * k;
        const bx = probe.x;
        const by = probe.y;
        if (ctx.arena.resolveCircle(probe, radius)) {
          ship.x += probe.x - bx;
          ship.y += probe.y - by;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const along = (ship.x - startX) * cos + (ship.y - startY) * sin;
    if (along < 0) ship.speed = Math.max(0, ship.speed + along / dt);
  }

  private bump(world: WorldState, ctx: SimContext, x: number, y: number): void {
    if (world.time - this.lastBumpAt < ctx.config.collision.bumpEventCooldownSeconds) return;
    this.lastBumpAt = world.time;
    ctx.emit({ type: 'ship_bump', x, y });
  }
}
