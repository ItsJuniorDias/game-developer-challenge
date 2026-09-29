import type { BroadsideConfig, WeaponConfig } from '../../config/gameConfig';
import type { SimContext } from '../context';
import { createProjectile } from '../entities';
import type { Faction, Ship, WeaponSlot, WorldState } from '../types';

function isReady(world: WorldState, ship: Ship, slot: WeaponSlot): boolean {
  return world.time >= ship.readyAt[slot];
}

/** Fires a single projectile from the bow. Returns false while on cooldown. */
export function fireFront(
  world: WorldState,
  ctx: SimContext,
  ship: Ship,
  faction: Faction,
  weapon: WeaponConfig,
  muzzleDistance: number,
): boolean {
  if (!ship.alive || !isReady(world, ship, 'front')) return false;
  ship.readyAt.front = world.time + weapon.cooldownSeconds;
  const cos = Math.cos(ship.rotation);
  const sin = Math.sin(ship.rotation);
  const x = ship.x + cos * muzzleDistance;
  const y = ship.y + sin * muzzleDistance;
  world.projectiles.push(createProjectile(world, faction, ship.id, x, y, ship.rotation, weapon));
  world.stats.shotsFired++;
  ctx.emit({ type: 'shot', owner: faction, shipId: ship.id, slot: 'front', x, y, angle: ship.rotation, count: 1 });
  return true;
}

/** Fires parallel projectiles perpendicular to the hull, to port (left) or starboard (right). */
export function fireBroadside(
  world: WorldState,
  ctx: SimContext,
  ship: Ship,
  faction: Faction,
  side: 'left' | 'right',
  weapon: BroadsideConfig,
  muzzleDistance: number,
): boolean {
  if (!ship.alive || !isReady(world, ship, side)) return false;
  ship.readyAt[side] = world.time + weapon.cooldownSeconds;
  const angle = ship.rotation + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);
  const hx = Math.cos(ship.rotation);
  const hy = Math.sin(ship.rotation);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const count = weapon.projectileCount;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * weapon.spacing;
    const x = ship.x + dx * muzzleDistance + hx * offset;
    const y = ship.y + dy * muzzleDistance + hy * offset;
    world.projectiles.push(createProjectile(world, faction, ship.id, x, y, angle, weapon));
  }
  world.stats.shotsFired += count;
  ctx.emit({ type: 'shot', owner: faction, shipId: ship.id, slot: side, x: ship.x + dx * muzzleDistance, y: ship.y + dy * muzzleDistance, angle, count });
  return true;
}
