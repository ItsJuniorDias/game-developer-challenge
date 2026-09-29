import { describe, expect, it } from 'vitest';
import { BASE_GAME_CONFIG, type GameConfig } from '../config/gameConfig';
import { Arena, DEFAULT_LAYOUT, type ArenaLayout } from './arena';
import { createProjectile, createShip } from './entities';
import { NavGrid } from './navigation';
import { Simulation } from './simulation';
import { IDLE_INTENT, type PlayerIntent } from './types';

const STEP = 1 / 60;
const OPEN_SEA: ArenaLayout = { ...DEFAULT_LAYOUT, islands: [], rocks: [], decorations: [] };

function config(overrides: Partial<GameConfig['spawn']> = {}): GameConfig {
  return { ...BASE_GAME_CONFIG, spawn: { ...BASE_GAME_CONFIG.spawn, firstSpawnDelaySeconds: 10_000, ...overrides } };
}

function run(sim: Simulation, seconds: number, intent: Partial<PlayerIntent> = {}): void {
  const full = { ...IDLE_INTENT, ...intent };
  for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step(STEP, full);
}

describe('match rules edge cases', () => {
  it('a player sunk mid-step cannot score or trigger a spawn in that same step', () => {
    const sim = new Simulation({ config: config({ firstSpawnDelaySeconds: STEP }), seed: 3, layout: OPEN_SEA });
    const w = sim.world;
    w.player.health = 10;
    // A chaser overlapping the player rams it this step...
    const chaser = createShip(w, 'chaser', BASE_GAME_CONFIG.chaser, w.player.x + 20, w.player.y, Math.PI);
    // ...while a player cannonball is about to finish off a shooter.
    const shooter = createShip(w, 'shooter', BASE_GAME_CONFIG.shooter, w.player.x + 600, w.player.y, Math.PI);
    shooter.health = 10;
    w.enemies.push(chaser, shooter);
    w.projectiles.push(createProjectile(w, 'player', w.player.id, shooter.x - 60, shooter.y, 0, BASE_GAME_CONFIG.player.frontCannon));
    sim.step(STEP, IDLE_INTENT);
    const events = sim.drainEvents().map((e) => e.type);
    expect(w.status).toBe('ended');
    expect(w.endReason).toBe('defeated');
    expect(w.score).toBe(0);
    expect(shooter.alive).toBe(true);
    expect(events).not.toContain('enemy_spawned');
    expect(events).not.toContain('score_changed');
  });

  it('no enemy spawns on the final step of a match', () => {
    const cfg = { ...config({ firstSpawnDelaySeconds: 60 }), match: { durationSeconds: 60 } };
    const sim = new Simulation({ config: cfg, seed: 1, layout: OPEN_SEA });
    run(sim, 61);
    expect(sim.world.endReason).toBe('time_up');
    expect(sim.world.stats.enemiesSpawned).toBe(0);
  });
});

describe('enemy behaviour', () => {
  it('a shooter fires at a player crossing sideways inside attack range', () => {
    const sim = new Simulation({ config: config(), seed: 1, layout: OPEN_SEA });
    const w = sim.world;
    w.player.x = 600;
    w.player.y = 1100;
    w.player.rotation = -Math.PI / 2;
    const shooter = createShip(w, 'shooter', BASE_GAME_CONFIG.shooter, 1140, 1100, Math.PI);
    w.enemies.push(shooter);
    w.time = 5;
    let firstShotAt: number | null = null;
    for (let i = 0; i < 180 && firstShotAt === null; i++) {
      sim.step(STEP, { ...IDLE_INTENT, forward: true });
      if (sim.drainEvents().some((e) => e.type === 'shot' && e.owner === 'enemy')) firstShotAt = w.time - 5;
    }
    expect(firstShotAt).not.toBeNull();
    expect(firstShotAt!).toBeLessThan(1.5);
  });

  it('a chaser stuck behind a shooter holding position sails around it', () => {
    const sim = new Simulation({ config: config(), seed: 1, layout: OPEN_SEA });
    const w = sim.world;
    w.player.x = 1024;
    w.player.y = 300;
    const shooter = createShip(w, 'shooter', BASE_GAME_CONFIG.shooter, 1024, 600, -Math.PI / 2);
    const chaser = createShip(w, 'chaser', BASE_GAME_CONFIG.chaser, 1024, 662, -Math.PI / 2);
    w.enemies.push(shooter, chaser);
    w.time = 5;
    run(sim, 5);
    expect(w.stats.chasersRammed).toBe(1);
  });
});

describe('projectiles', () => {
  it('expire at the first of their range or lifetime', () => {
    const slow = { ...BASE_GAME_CONFIG.player.frontCannon, projectileSpeed: 100, range: 10_000, lifetimeSeconds: 0.5 };
    const cfg: GameConfig = { ...config(), player: { ...BASE_GAME_CONFIG.player, frontCannon: slow } };
    const sim = new Simulation({ config: cfg, seed: 1, layout: OPEN_SEA });
    run(sim, STEP, { fireFront: true });
    expect(sim.world.projectiles).toHaveLength(1);
    run(sim, 0.4);
    expect(sim.world.projectiles).toHaveLength(1);
    run(sim, 0.15);
    expect(sim.world.projectiles).toHaveLength(0);
  });
});

describe('collisions', () => {
  it('the bow stops at the island shore instead of entering it', () => {
    const sim = new Simulation({ config: config(), seed: 1 });
    const w = sim.world;
    // North-west island collision box right edge: (1 + 4) * 128 - 8 = 632.
    w.player.x = 900;
    w.player.y = 320;
    w.player.rotation = Math.PI;
    run(sim, 4, { forward: true });
    const bowX = w.player.x - BASE_GAME_CONFIG.player.hitHalfLength;
    expect(bowX).toBeGreaterThanOrEqual(632 - 0.5);
    expect(bowX).toBeLessThan(640);
    expect(w.player.speed).toBeLessThan(5);
  });

  it('the hull never leaves the arena', () => {
    const sim = new Simulation({ config: config(), seed: 1, layout: OPEN_SEA });
    run(sim, 6, { forward: true });
    const p = sim.world.player;
    expect(p.y - BASE_GAME_CONFIG.player.hitHalfLength).toBeGreaterThanOrEqual(-0.5);
  });
});

describe('navigation', () => {
  it('A* returns optimal grid costs (checked against Dijkstra)', () => {
    const arena = new Arena(DEFAULT_LAYOUT);
    const nav = new NavGrid(arena, 32, 30);
    const internals = nav as unknown as { gScore: Float32Array; nearestWalkable(x: number, y: number): number };
    const dijkstra = (start: number, goal: number): number => {
      const dist = new Map<number, number>([[start, 0]]);
      const open = new Set([start]);
      while (open.size > 0) {
        let best = -1;
        let bestD = Infinity;
        for (const c of open) {
          const d = dist.get(c) ?? Infinity;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        open.delete(best);
        if (best === goal) return bestD;
        const cc = best % nav.cols;
        const cr = Math.floor(best / nav.cols);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          const nc = cc + dc;
          const nr = cr + dr;
          if (!nav.isWalkableCell(nc, nr)) continue;
          if (dc !== 0 && dr !== 0 && (!nav.isWalkableCell(cc + dc, cr) || !nav.isWalkableCell(cc, cr + dr))) continue;
          const n = nr * nav.cols + nc;
          const nd = bestD + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
          if (nd < (dist.get(n) ?? Infinity)) {
            dist.set(n, nd);
            open.add(n);
          }
        }
      }
      return Infinity;
    };
    const pairs: [number, number, number, number][] = [
      [1136, 1072, 1744, 944],
      [100, 100, 1900, 1050],
      [700, 600, 1500, 100],
      [300, 1100, 1800, 600],
      [1024, 616, 200, 700],
    ];
    for (const [sx, sy, gx, gy] of pairs) {
      nav.findPath(sx, sy, gx, gy);
      const start = internals.nearestWalkable(sx, sy);
      const goal = internals.nearestWalkable(gx, gy);
      expect(internals.gScore[goal]).toBeCloseTo(dijkstra(start, goal), 3);
    }
  });
});
