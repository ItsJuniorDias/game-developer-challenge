import { angleDelta, clamp, rotateTowards, wrapAngle } from '../../core/math';
import type { SimContext } from '../context';
import type { PlayerIntent, WorldState } from '../types';
import { fireBroadside, fireFront } from './weapons';

export function updatePlayer(world: WorldState, ctx: SimContext, intent: PlayerIntent, dt: number): void {
  const player = world.player;
  if (!player.alive) return;
  const cfg = ctx.config.player;

  const turn = (intent.turnRight ? 1 : 0) - (intent.turnLeft ? 1 : 0);
  let throttle = intent.forward ? 1 : clamp(intent.throttle, 0, 1);
  if (turn !== 0) {
    player.rotation = wrapAngle(player.rotation + turn * cfg.turnSpeed * dt);
  } else if (intent.targetHeading !== null) {
    // Joystick: the ship still only sails forward and turns; the stick picks the side and the thrust.
    player.rotation = rotateTowards(player.rotation, intent.targetHeading, cfg.turnSpeed * dt);
    if (!intent.forward) {
      const alignment = Math.max(0, Math.cos(angleDelta(player.rotation, intent.targetHeading)));
      throttle *= cfg.steeringMinThrottle + (1 - cfg.steeringMinThrottle) * alignment;
    }
  }

  const targetSpeed = cfg.maxSpeed * throttle;
  if (player.speed < targetSpeed) {
    player.speed = Math.min(targetSpeed, player.speed + cfg.acceleration * dt);
  } else {
    player.speed = Math.max(targetSpeed, player.speed - cfg.deceleration * dt);
  }
  player.x += Math.cos(player.rotation) * player.speed * dt;
  player.y += Math.sin(player.rotation) * player.speed * dt;

  if (intent.fireFront) fireFront(world, ctx, player, 'player', cfg.frontCannon, cfg.hitHalfLength + 4);
  if (intent.fireLeft) fireBroadside(world, ctx, player, 'player', 'left', cfg.broadside, cfg.hitHalfWidth + 6);
  if (intent.fireRight) fireBroadside(world, ctx, player, 'player', 'right', cfg.broadside, cfg.hitHalfWidth + 6);
}
