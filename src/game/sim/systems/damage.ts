import type { SimContext } from '../context';
import type { Ship, WorldState } from '../types';

export type DamageCause = 'player_fire' | 'enemy_fire' | 'ram';

/**
 * Applies damage to a ship exactly once and handles its destruction.
 * Returns true when the ship was destroyed by this call.
 */
export function applyDamage(world: WorldState, ctx: SimContext, ship: Ship, amount: number, cause: DamageCause): boolean {
  if (!ship.alive || world.status !== 'running' || amount <= 0) return false;
  ship.health = Math.max(0, ship.health - amount);
  ship.lastDamagedAt = world.time;
  if (ship.kind === 'player') world.stats.damageTaken += amount;
  ctx.emit({ type: 'ship_hit', shipId: ship.id, kind: ship.kind, damage: amount, x: ship.x, y: ship.y, health: ship.health });
  if (ship.health > 0) return false;
  destroyShip(world, ctx, ship, cause);
  return true;
}

export function destroyShip(world: WorldState, ctx: SimContext, ship: Ship, cause: DamageCause): void {
  if (!ship.alive) return;
  ship.alive = false;
  ship.speed = 0;
  ctx.emit({ type: 'ship_destroyed', shipId: ship.id, kind: ship.kind, cause, x: ship.x, y: ship.y, rotation: ship.rotation });
  if (ship.kind === 'player') return;

  world.stats.enemiesDestroyed++;
  if (cause === 'player_fire') {
    world.score += 1;
    ctx.emit({ type: 'score_changed', score: world.score });
  }
  // A destroyed enemy stops dealing damage: its cannonballs still in flight sink.
  for (const projectile of world.projectiles) {
    if (projectile.alive && projectile.ownerId === ship.id) {
      projectile.alive = false;
      ctx.emit({ type: 'projectile_end', id: projectile.id, cause: 'owner_destroyed', x: projectile.x, y: projectile.y });
    }
  }
}
