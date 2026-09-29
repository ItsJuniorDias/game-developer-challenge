import type { ChaserConfig, ShooterConfig } from '../../config/gameConfig';
import { angleDelta, distance, rotateTowards } from '../../core/math';
import type { SimContext } from '../context';
import type { Ship, WorldState } from '../types';
import { fireFront } from './weapons';

const REPATH_INTERVAL = 0.5;
const WAYPOINT_REACHED = 40;
/** Clearance used when checking if a cannonball can reach the player. */
const SHOT_CLEARANCE = 8;

interface SteerTarget {
  x: number;
  y: number;
}

/**
 * Chooses where the ship should head to reach (tx, ty): straight when the
 * lane is clear, otherwise along an A* path around the islands.
 */
function navigationTarget(world: WorldState, ctx: SimContext, ship: Ship, tx: number, ty: number): SteerTarget {
  const ai = ship.ai;
  if (!ai) return { x: tx, y: ty };
  if (ctx.arena.hasLineOfSight(ship.x, ship.y, tx, ty, ship.radius * 0.9)) {
    ai.path.length = 0;
    return { x: tx, y: ty };
  }
  if (world.time >= ai.nextRepathAt || ai.pathIndex >= ai.path.length) {
    ai.path = ctx.nav.findPath(ship.x, ship.y, tx, ty);
    ai.pathIndex = 0;
    // Stagger repaths so enemies spawned together do not search on the same step.
    ai.nextRepathAt = world.time + REPATH_INTERVAL + (ship.id % 7) * 0.03;
  }
  let waypoint = ai.path[ai.pathIndex];
  while (waypoint && distance(ship.x, ship.y, waypoint.x, waypoint.y) < WAYPOINT_REACHED && ai.pathIndex < ai.path.length - 1) {
    ai.pathIndex++;
    waypoint = ai.path[ai.pathIndex];
  }
  return waypoint ?? { x: tx, y: ty };
}

function steer(ship: Ship, hull: ChaserConfig | ShooterConfig, target: SteerTarget, desiredSpeed: number, dt: number): void {
  const desiredAngle = Math.atan2(target.y - ship.y, target.x - ship.x);
  ship.rotation = rotateTowards(ship.rotation, desiredAngle, hull.turnSpeed * dt);
  // Slow down while turning hard so ships can round islands instead of drifting into them.
  const alignment = Math.max(0.3, Math.cos(angleDelta(ship.rotation, desiredAngle)));
  const targetSpeed = desiredSpeed * alignment;
  const accel = hull.maxSpeed * 1.5 * dt;
  ship.speed = ship.speed < targetSpeed ? Math.min(targetSpeed, ship.speed + accel) : Math.max(targetSpeed, ship.speed - accel);
  ship.x += Math.cos(ship.rotation) * ship.speed * dt;
  ship.y += Math.sin(ship.rotation) * ship.speed * dt;
}

function updateChaser(world: WorldState, ctx: SimContext, ship: Ship, dt: number): void {
  const cfg = ctx.config.chaser;
  const player = world.player;
  const target = navigationTarget(world, ctx, ship, player.x, player.y);
  steer(ship, cfg, target, cfg.maxSpeed, dt);
}

function updateShooter(world: WorldState, ctx: SimContext, ship: Ship, dt: number): void {
  const cfg = ctx.config.shooter;
  const player = world.player;
  const dist = distance(ship.x, ship.y, player.x, player.y);
  const clearShot = ctx.arena.hasLineOfSight(ship.x, ship.y, player.x, player.y, SHOT_CLEARANCE);

  // Lead the target slightly so a moving player can still be hit.
  const travelTime = dist / cfg.cannon.projectileSpeed;
  const playerVx = Math.cos(player.rotation) * player.speed;
  const playerVy = Math.sin(player.rotation) * player.speed;
  const aimX = player.x + playerVx * travelTime * 0.7;
  const aimY = player.y + playerVy * travelTime * 0.7;

  if (clearShot && dist <= cfg.holdDistance) {
    // In position: stop and turn the bow towards the player.
    steer(ship, cfg, { x: aimX, y: aimY }, 0, dt);
  } else {
    const target = navigationTarget(world, ctx, ship, player.x, player.y);
    steer(ship, cfg, target, cfg.maxSpeed, dt);
  }

  const inGrace = world.time - ship.spawnedAt < ctx.config.spawn.graceSeconds;
  if (inGrace || !clearShot || dist > cfg.attackRange) return;
  const aimAngle = Math.atan2(aimY - ship.y, aimX - ship.x);
  if (Math.abs(angleDelta(ship.rotation, aimAngle)) <= cfg.aimTolerance) {
    fireFront(world, ctx, ship, 'enemy', cfg.cannon, cfg.hitHalfLength + 4);
  }
}

export function updateEnemies(world: WorldState, ctx: SimContext, dt: number): void {
  if (!world.player.alive) return;
  for (const enemy of world.enemies) {
    if (!enemy.alive) continue;
    if (enemy.kind === 'chaser') updateChaser(world, ctx, enemy, dt);
    else if (enemy.kind === 'shooter') updateShooter(world, ctx, enemy, dt);
  }
}
