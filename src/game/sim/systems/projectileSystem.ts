import type { SimContext } from '../context';
import type { Projectile, Ship, WorldState } from '../types';
import { hullOf } from './collisionSystem';
import { applyDamage } from './damage';

/** Point-vs-oriented-ellipse test matching the visible hull shape. */
export function hitsHull(ship: Ship, hullHalfLength: number, hullHalfWidth: number, px: number, py: number, projectileRadius: number): boolean {
  const dx = px - ship.x;
  const dy = py - ship.y;
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  const along = dx * cos + dy * sin;
  const across = -dx * sin + dy * cos;
  const a = hullHalfLength + projectileRadius;
  const b = hullHalfWidth + projectileRadius;
  return (along * along) / (a * a) + (across * across) / (b * b) <= 1;
}

function end(ctx: SimContext, p: Projectile, cause: 'expired' | 'island' | 'bounds' | 'hit'): void {
  p.alive = false;
  ctx.emit({ type: 'projectile_end', id: p.id, cause, x: p.x, y: p.y });
}

export function updateProjectiles(world: WorldState, ctx: SimContext, dt: number): void {
  const arena = ctx.arena;
  const radius = ctx.config.collision.projectileRadius;
  for (const p of world.projectiles) {
    // Once the player sinks the match is over: nothing else may hit or score this step.
    if (!world.player.alive) break;
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    p.age += dt;

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
        if (hitsHull(enemy, hull.hitHalfLength, hull.hitHalfWidth, p.x, p.y, radius)) {
          end(ctx, p, 'hit');
          applyDamage(world, ctx, enemy, p.damage, 'player_fire');
          break;
        }
      }
    } else {
      const player = world.player;
      const hull = hullOf(ctx, player);
      if (player.alive && hitsHull(player, hull.hitHalfLength, hull.hitHalfWidth, p.x, p.y, radius)) {
        end(ctx, p, 'hit');
        applyDamage(world, ctx, player, p.damage, 'enemy_fire');
      }
    }

    // Range and lifetime are both enforced; the first limit reached sinks the ball.
    if (p.alive && (p.traveled >= p.range || p.age >= p.lifetime)) end(ctx, p, 'expired');
  }
}
