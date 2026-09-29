import { describe, expect, it } from 'vitest';
import { BASE_GAME_CONFIG, createMatchConfig, type GameConfig } from '../config/gameConfig';
import { Simulation } from './simulation';
import { IDLE_INTENT, type PlayerIntent } from './types';

const STEP = 1 / 60;

function run(sim: Simulation, seconds: number, intent: Partial<PlayerIntent> = {}): void {
  const full = { ...IDLE_INTENT, ...intent };
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) sim.step(STEP, full);
}

function makeSim(overrides: Partial<{ duration: number; interval: number }> = {}, seed = 1): Simulation {
  const config = createMatchConfig({
    sessionTimeSeconds: overrides.duration ?? 60,
    spawnIntervalSeconds: overrides.interval ?? 3,
  });
  return new Simulation({ config, seed });
}

/** Config where no enemy ever spawns, to isolate player mechanics. */
function quietConfig(): GameConfig {
  return {
    ...BASE_GAME_CONFIG,
    spawn: { ...BASE_GAME_CONFIG.spawn, firstSpawnDelaySeconds: 10_000 },
  };
}

describe('Simulation', () => {
  it('moves the player forward and rotates in both directions', () => {
    const sim = new Simulation({ config: quietConfig(), seed: 1 });
    const start = { ...sim.world.player };
    run(sim, 1, { forward: true });
    expect(sim.world.player.y).toBeLessThan(start.y - 50);
    const heading = sim.world.player.rotation;
    run(sim, 0.5, { turnRight: true });
    expect(sim.world.player.rotation).toBeGreaterThan(heading);
    run(sim, 1, { turnLeft: true });
    expect(sim.world.player.rotation).toBeLessThan(heading);
  });

  it('steers towards the joystick heading with proportional thrust', () => {
    const sim = new Simulation({ config: quietConfig(), seed: 1 });
    expect(sim.world.player.rotation).toBeCloseTo(-Math.PI / 2, 5);
    // Stick pushed fully to the right (east): the bow turns clockwise towards 0 rad.
    run(sim, 0.3, { targetHeading: 0, throttle: 1 });
    const turning = sim.world.player.rotation;
    expect(turning).toBeGreaterThan(-Math.PI / 2 + 0.5);
    run(sim, 2, { targetHeading: 0, throttle: 1 });
    expect(sim.world.player.rotation).toBeCloseTo(0, 5);
    expect(sim.world.player.speed).toBeCloseTo(BASE_GAME_CONFIG.player.maxSpeed, 0);
    // Half deflection: the ship settles at half of its top speed.
    run(sim, 3, { targetHeading: 0, throttle: 0.5 });
    expect(sim.world.player.speed).toBeCloseTo(BASE_GAME_CONFIG.player.maxSpeed / 2, 0);
    // Released stick: the ship glides to a stop.
    run(sim, 3);
    expect(sim.world.player.speed).toBe(0);
  });

  it('keeps the player inside the arena and out of islands', () => {
    const sim = new Simulation({ config: quietConfig(), seed: 1 });
    run(sim, 20, { forward: true });
    const p = sim.world.player;
    expect(p.y).toBeGreaterThanOrEqual(p.radius - 0.001);
    expect(sim.arena.distanceToObstacles(p.x, p.y)).toBeGreaterThanOrEqual(p.radius - 0.5);
  });

  it('respects weapon cooldowns and fires three parallel broadside shots', () => {
    const sim = new Simulation({ config: quietConfig(), seed: 1 });
    run(sim, 0.1, { fireFront: true });
    expect(sim.world.projectiles.length).toBe(1);
    run(sim, 0.1, { fireLeft: true });
    expect(sim.world.projectiles.length).toBe(4);
    run(sim, 0.2, { fireLeft: true });
    expect(sim.world.projectiles.length).toBe(4);
  });

  it('ends on time up with an exact effective duration', () => {
    const config = { ...quietConfig(), match: { durationSeconds: 60 } };
    const sim = new Simulation({ config, seed: 1 });
    run(sim, 61, { forward: true, fireFront: true });
    expect(sim.world.status).toBe('ended');
    expect(sim.world.time).toBeCloseTo(60, 5);
    expect(sim.world.endReason).toBe('time_up');
    const frozen = sim.snapshot();
    run(sim, 2, { forward: true, fireFront: true });
    expect(sim.snapshot()).toEqual(frozen);
  });

  it('spawns both enemy types at the configured interval', () => {
    const sim = makeSim({ duration: 60, interval: 2 });
    run(sim, 1.6);
    expect(sim.world.stats.enemiesSpawned).toBe(1);
    run(sim, 2);
    expect(sim.world.stats.enemiesSpawned).toBe(2);
    const kinds = new Set(sim.world.enemies.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['chaser', 'shooter']));
    for (const e of sim.world.enemies) {
      const d = Math.hypot(e.x - sim.world.player.x, e.y - sim.world.player.y);
      expect(d).toBeGreaterThan(400);
    }
  });

  it('is deterministic for a given seed and input', () => {
    const a = makeSim({}, 42);
    const b = makeSim({}, 42);
    run(a, 20, { forward: true, turnLeft: true, fireFront: true });
    run(b, 20, { forward: true, turnLeft: true, fireFront: true });
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('ends by defeat when the player health reaches zero', () => {
    const sim = makeSim({ duration: 180, interval: 1 });
    run(sim, 120);
    expect(sim.world.status).toBe('ended');
    expect(sim.world.endReason).toBe('defeated');
    expect(sim.world.player.health).toBe(0);
    expect(sim.world.time).toBeLessThan(120);
  });

  it('a chaser ram damages the player without scoring', () => {
    const sim = makeSim({ duration: 120, interval: 100 });
    run(sim, 30);
    expect(sim.world.stats.chasersRammed).toBeGreaterThanOrEqual(1);
    expect(sim.world.player.health).toBeLessThan(sim.world.player.maxHealth);
    expect(sim.world.score).toBe(0);
  });
});
