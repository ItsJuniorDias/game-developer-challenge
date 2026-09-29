import type { WeaponConfig } from '../config/gameConfig';
import type { ShipHullConfig } from '../config/gameConfig';
import type { Faction, Projectile, Ship, ShipKind, WorldState } from './types';

export function createShip(
  world: WorldState,
  kind: ShipKind,
  hull: ShipHullConfig,
  x: number,
  y: number,
  rotation: number,
): Ship {
  return {
    id: world.nextId++,
    kind,
    x,
    y,
    rotation,
    prevX: x,
    prevY: y,
    prevRotation: rotation,
    speed: 0,
    health: hull.maxHealth,
    maxHealth: hull.maxHealth,
    radius: hull.radius,
    alive: true,
    spawnedAt: world.time,
    readyAt: { front: world.time, left: world.time, right: world.time },
    lastDamagedAt: Number.NEGATIVE_INFINITY,
    ai: kind === 'player' ? null : { path: [], pathIndex: 0, nextRepathAt: 0 },
  };
}

export function createProjectile(
  world: WorldState,
  owner: Faction,
  ownerId: number,
  x: number,
  y: number,
  angle: number,
  weapon: WeaponConfig,
): Projectile {
  return {
    id: world.nextId++,
    owner,
    ownerId,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * weapon.projectileSpeed,
    vy: Math.sin(angle) * weapon.projectileSpeed,
    damage: weapon.damage,
    range: weapon.range,
    traveled: 0,
    alive: true,
  };
}
