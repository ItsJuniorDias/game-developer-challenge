import type { SimContext } from '../context';
import type { Ship, WorldState } from '../types';
import { applyDamage, destroyShip } from './damage';

const BUMP_EVENT_COOLDOWN = 0.35;

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

/**
 * Resolves ship-vs-ship contacts (including chaser rams) and keeps every ship
 * inside the arena and out of the islands.
 */
export class CollisionSystem {
  private lastBumpAt = Number.NEGATIVE_INFINITY;

  update(world: WorldState, ctx: SimContext, dt: number): void {
    const player = world.player;
    const enemies = world.enemies;

    // Player against enemies: chasers ram and explode, other ships are pushed apart.
    for (const enemy of enemies) {
      if (!enemy.alive || !player.alive) continue;
      if (!overlaps(player, enemy)) continue;
      if (enemy.kind === 'chaser') {
        const damage = ctx.config.chaser.ramDamage;
        world.stats.chasersRammed++;
        ctx.emit({ type: 'rammed', shipId: enemy.id, x: enemy.x, y: enemy.y, damage });
        destroyShip(world, ctx, enemy, 'ram');
        applyDamage(world, ctx, player, damage, 'ram');
      } else if (separate(player, enemy, 0.3)) {
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

  private resolveStatic(ship: Ship, ctx: SimContext, dt: number): void {
    if (!ship.alive) return;
    ctx.arena.resolveCircle(ship, ship.radius);
    // Scraping along an island or the arena edge bleeds speed.
    const travelled = Math.hypot(ship.x - ship.prevX, ship.y - ship.prevY) / dt;
    if (travelled < ship.speed) ship.speed = Math.max(0, travelled);
  }

  private bump(world: WorldState, ctx: SimContext, x: number, y: number): void {
    if (world.time - this.lastBumpAt < BUMP_EVENT_COOLDOWN) return;
    this.lastBumpAt = world.time;
    ctx.emit({ type: 'ship_bump', x, y });
  }
}
