import { advance, advanceBy, expect, setupApp, startMatch, state, test } from './fixtures';

const ISLANDS = [
  { left: 144, right: 624, top: 144, bottom: 496 },
  { left: 1424, right: 1776, top: 144, bottom: 368 },
  { left: 1168, right: 1648, top: 784, bottom: 1008 },
  { left: 272, right: 496, top: 784, bottom: 1008 },
];

function insideIsland(x: number, y: number): boolean {
  return ISLANDS.some((r) => x > r.left && x < r.right && y > r.top && y < r.bottom);
}

test.describe('Enemies', () => {
  test('spawn at the configured interval, far from the player, both types', async ({ page }) => {
    await setupApp(page, {}, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 2 } });
    await startMatch(page);
    await advance(page, 1400);
    expect((await state(page)).enemies).toHaveLength(0);
    await advance(page, 200);
    let s = await state(page);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.kind).toBe('chaser');
    expect(s.nextSpawnAt).toBeCloseTo(3.5, 3);
    await advance(page, 1800);
    expect((await state(page)).enemies).toHaveLength(1);
    await advance(page, 200);
    s = await state(page);
    expect(s.enemies.map((e) => e.kind)).toEqual(['chaser', 'shooter']);
    const shooter = s.enemies[1]!;
    expect(Math.hypot(shooter.x - s.player.x, shooter.y - s.player.y)).toBeGreaterThanOrEqual(650);
    expect(insideIsland(shooter.x, shooter.y)).toBe(false);
  });

  test('a chaser pursues, rams the player, explodes and does not score', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 0.5 }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await advance(page, 600);
    const first = await state(page);
    const chaser = first.enemies[0]!;
    const startDistance = Math.hypot(chaser.x - first.player.x, chaser.y - first.player.y);
    let closest = startDistance;
    let rammed = false;
    for (let i = 0; i < 40 && !rammed; i++) {
      await advance(page, 250);
      const s = await state(page);
      const c = s.enemies.find((e) => e.id === chaser.id);
      if (!c) {
        rammed = true;
        expect(s.stats.chasersRammed).toBe(1);
        expect(s.player.health).toBe(85);
        expect(s.score).toBe(0);
        break;
      }
      expect(insideIsland(c.x, c.y)).toBe(false);
      closest = Math.min(closest, Math.hypot(c.x - s.player.x, c.y - s.player.y));
    }
    expect(rammed).toBe(true);
    expect(startDistance).toBeGreaterThan(closest);
    // The destroyed chaser no longer deals damage.
    await advance(page, 1000);
    expect((await state(page)).player.health).toBe(85);
  });

  test('a shooter approaches and fires once within attack range', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 0.5, playerSpawn: { x: 1024, y: 616, rotation: -Math.PI / 2 } }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 1 } });
    await startMatch(page);
    await advance(page, 1600);
    let s = await state(page);
    const shooter = s.enemies.find((e) => e.kind === 'shooter');
    expect(shooter).toBeDefined();
    const startDistance = Math.hypot(shooter!.x - s.player.x, shooter!.y - s.player.y);
    let firedAt: number | null = null;
    for (let i = 0; i < 60 && firedAt === null; i++) {
      await advance(page, 100);
      s = await state(page);
      const me = s.enemies.find((e) => e.id === shooter!.id);
      if (!me) break;
      if (s.projectiles.some((p) => p.owner === 'enemy')) {
        firedAt = Math.hypot(me.x - s.player.x, me.y - s.player.y);
      }
    }
    expect(firedAt, 'the shooter should open fire').not.toBeNull();
    expect(firedAt!).toBeLessThanOrEqual(560 + 20);
    expect(firedAt!).toBeLessThan(startDistance);
  });

  test('stop spawning, moving and attacking once the match ends', async ({ page }) => {
    await setupApp(page, {}, { options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 1 } });
    await startMatch(page);
    await advanceBy(page, 60_000, 1000);
    const ended = await state(page);
    expect(ended.status).toBe('ended');
    await advanceBy(page, 5000, 1000);
    const later = await state(page);
    expect(later.time).toBe(ended.time);
    expect(later.enemies).toEqual(ended.enemies);
    expect(later.projectiles).toEqual(ended.projectiles);
    expect(later.player.health).toBe(ended.player.health);
    expect(later.stats.enemiesSpawned).toBe(ended.stats.enemiesSpawned);
  });
});
