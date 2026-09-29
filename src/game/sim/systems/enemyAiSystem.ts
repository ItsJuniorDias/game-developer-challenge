import type { EnemyHullConfig } from '../../config/gameConfig';
import { angleDelta, distance, rotateTowards } from '../../core/math';
import type { SimContext } from '../context';
import type { Ship, WorldState } from '../types';
import { fireFront } from './weapons';

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
    ai.nextRepathAt = world.time + ctx.config.ai.repathIntervalSeconds + (ship.id % 7) * 0.03;
  }
  const reach = ctx.config.ai.waypointReachDistance;
  let waypoint = ai.path[ai.pathIndex];
  while (waypoint && distance(ship.x, ship.y, waypoint.x, waypoint.y) < reach && ai.pathIndex < ai.path.length - 1) {
    ai.pathIndex++;
    waypoint = ai.path[ai.pathIndex];
  }
  return waypoint ?? { x: tx, y: ty };
}

/**
 * Local avoidance: when another enemy sits in the lane ahead, bias the heading
 * to pass beside it instead of pushing into it (e.g. a Chaser stuck behind a
 * Shooter holding position).
 */
function avoidShips(world: WorldState, ctx: SimContext, ship: Ship, desiredAngle: number): number {
  const lookahead = ctx.config.ai.avoidanceLookahead;
  const cos = Math.cos(desiredAngle);
  const sin = Math.sin(desiredAngle);
  let nearestAhead = Number.POSITIVE_INFINITY;
  let lateralOfNearest = 0;
  for (const other of world.enemies) {
    if (other === ship || !other.alive) continue;
    const dx = other.x - ship.x;
    const dy = other.y - ship.y;
    const ahead = dx * cos + dy * sin;
    if (ahead <= 0 || ahead > lookahead) continue;
    const lateral = -dx * sin + dy * cos;
    if (Math.abs(lateral) >= ship.radius + other.radius) continue;
    if (ahead < nearestAhead) {
      nearestAhead = ahead;
      lateralOfNearest = lateral;
    }
  }
  if (!Number.isFinite(nearestAhead)) return desiredAngle;
  const urgency = 1 - nearestAhead / lookahead;
  const offset = ctx.config.ai.avoidanceMaxTurn * (0.35 + 0.65 * urgency);
  // Prefer passing on the side away from the blocker, but only towards open
  // water: never swerve into an island, a rock or the arena edge.
  const preferred = lateralOfNearest > 0 ? -1 : 1;
  for (const side of [preferred, -preferred]) {
    const heading = desiredAngle + side * offset;
    if (laneIsOpen(ctx, ship, heading, lookahead * 0.6)) return heading;
  }
  // Both sides are blocked: keep the direct heading (ship pushes never bleed speed, so it can still squeeze past).
  return desiredAngle;
}

function laneIsOpen(ctx: SimContext, ship: Ship, heading: number, distanceAhead: number): boolean {
  const tx = ship.x + Math.cos(heading) * distanceAhead;
  const ty = ship.y + Math.sin(heading) * distanceAhead;
  const clearance = ship.radius;
  return ctx.arena.isInside(tx, ty, clearance) && ctx.arena.hasLineOfSight(ship.x, ship.y, tx, ty, clearance * 0.9);
}

function steer(world: WorldState, ctx: SimContext, ship: Ship, hull: EnemyHullConfig, target: SteerTarget, desiredSpeed: number, dt: number): void {
  const direct = Math.atan2(target.y - ship.y, target.x - ship.x);
  const desiredAngle = desiredSpeed > 0 ? avoidShips(world, ctx, ship, direct) : direct;
  ship.rotation = rotateTowards(ship.rotation, desiredAngle, hull.turnSpeed * dt);
  // Slow down while turning hard so ships can round islands instead of drifting into them.
  const alignment = Math.max(hull.minTurnThrottle, Math.cos(angleDelta(ship.rotation, desiredAngle)));
  const targetSpeed = desiredSpeed * alignment;
  const accel = hull.acceleration * dt;
  ship.speed = ship.speed < targetSpeed ? Math.min(targetSpeed, ship.speed + accel) : Math.max(targetSpeed, ship.speed - accel);
  ship.x += Math.cos(ship.rotation) * ship.speed * dt;
  ship.y += Math.sin(ship.rotation) * ship.speed * dt;
}

function updateChaser(world: WorldState, ctx: SimContext, ship: Ship, dt: number): void {
  const cfg = ctx.config.chaser;
  const player = world.player;
  const target = navigationTarget(world, ctx, ship, player.x, player.y);
  steer(world, ctx, ship, cfg, target, cfg.maxSpeed, dt);
}

function updateShooter(world: WorldState, ctx: SimContext, ship: Ship, dt: number): void {
  const cfg = ctx.config.shooter;
  const player = world.player;
  const dist = distance(ship.x, ship.y, player.x, player.y);
  const clearShot = ctx.arena.hasLineOfSight(ship.x, ship.y, player.x, player.y, ctx.config.ai.shotClearance);

  // Lead the target so a moving player can still be hit.
  const travelTime = dist / cfg.cannon.projectileSpeed;
  const playerVx = Math.cos(player.rotation) * player.speed;
  const playerVy = Math.sin(player.rotation) * player.speed;
  const aimX = player.x + playerVx * travelTime * cfg.leadFactor;
  const aimY = player.y + playerVy * travelTime * cfg.leadFactor;
  const aim = { x: aimX, y: aimY };

  if (clearShot && dist <= cfg.holdDistance) {
    // In position: stop and turn the bow towards the lead point.
    steer(world, ctx, ship, cfg, aim, 0, dt);
  } else if (clearShot && dist <= cfg.attackRange) {
    // In range but still closing in: sail at the lead point so the bow is already aimed.
    steer(world, ctx, ship, cfg, aim, cfg.maxSpeed, dt);
  } else {
    const target = navigationTarget(world, ctx, ship, player.x, player.y);
    steer(world, ctx, ship, cfg, target, cfg.maxSpeed, dt);
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
