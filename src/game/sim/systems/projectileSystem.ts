import type { SimContext } from '../context';
import type { Projectile, Ship, WorldState } from '../types';
import { applyDamage } from './damage';

export const PROJECTILE_RADIUS = 5;

/** Point-vs-oriented-ellipse test matching the visible hull shape. */
export function hitsHull(ship: Ship, hullHalfLength: number, hullHalfWidth: number, px: number, py: number): boolean {
  const dx = px - ship.x;
  const dy = py - ship.y;
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  const along = dx * cos + dy * sin;
  const across = -dx * sin + dy * cos;
  const a = hullHalfLength + PROJECTILE_RADIUS;
  const b = hullHalfWidth + PROJECTILE_RADIUS;
  return (along * along) / (a * a) + (across * across) / (b * b) <= 1;
}

function hullOf(ctx: SimContext, ship: Ship): { halfLength: number; halfWidth: number } {
  const hull = ship.kind === 'player' ? ctx.config.player : ship.kind === 'chaser' ? ctx.config.chaser : ctx.config.shooter;
  return { halfLength: hull.hitHalfLength, halfWidth: hull.hitHalfWidth };
}

function end(ctx: SimContext, p: Projectile, cause: 'expired' | 'island' | 'bounds' | 'hit'): void {
  p.alive = false;
  ctx.emit({ type: 'projectile_end', id: p.id, cause, x: p.x, y: p.y });
}

export function updateProjectiles(world: WorldState, ctx: SimContext, dt: number): void {
  const arena = ctx.arena;
  for (const p of world.projectiles) {
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;

    if (!arena.isInside(p.x, p.y)) {
      end(ctx, p, 'bounds');
      continue;
    }
    if (arena.obstacleAt(p.x, p.y, 0)) {
      end(ctx, p, 'island');
      continue;
    }

    if (p.owner === 'player') {
      for (const enemy of world.enemies) {
        if (!enemy.alive) continue;
        const hull = hullOf(ctx, enemy);
        if (hitsHull(enemy, hull.halfLength, hull.halfWidth, p.x, p.y)) {
          end(ctx, p, 'hit');
          applyDamage(world, ctx, enemy, p.damage, 'player_fire');
          break;
        }
      }
    } else {
      const player = world.player;
      const hull = hullOf(ctx, player);
      if (player.alive && hitsHull(player, hull.halfLength, hull.halfWidth, p.x, p.y)) {
        end(ctx, p, 'hit');
        applyDamage(world, ctx, player, p.damage, 'enemy_fire');
      }
    }

    if (p.alive && p.traveled >= p.range) end(ctx, p, 'expired');
  }
}
