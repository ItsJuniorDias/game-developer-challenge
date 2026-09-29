import { advance, advanceBy, angleTo, expect, setupApp, startMatch, state, test, turnTo, type GameState } from './fixtures';

test.describe('Combat', () => {
  test('bow cannon fires one projectile forward and respects its cooldown', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    const before = await state(page);
    await page.keyboard.down('Space');
    await advance(page, 50);
    let s = await state(page);
    expect(s.projectiles).toHaveLength(1);
    const shot = s.projectiles[0]!;
    expect(shot.owner).toBe('player');
    expect(shot.y).toBeLessThan(before.player.y);

    // Still held: the 0.45 s cooldown blocks a second shot...
    await advance(page, 300);
    s = await state(page);
    expect(s.projectiles).toHaveLength(1);
    expect(s.projectiles[0]!.y).toBeLessThan(shot.y - 150);
    // ...until it elapses.
    await advance(page, 200);
    expect((await state(page)).projectiles).toHaveLength(2);
    await page.keyboard.up('Space');
    expect((await state(page)).stats.shotsFired).toBe(2);
  });

  test('broadsides fire three parallel projectiles to each side', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    const p = (await state(page)).player;
    await page.keyboard.press('KeyQ');
    await advance(page, 50);
    let s = await state(page);
    expect(s.projectiles).toHaveLength(3);
    // Facing north: port (left) is west. The three balls line up along the hull.
    for (const ball of s.projectiles) expect(ball.x).toBeLessThan(p.x);
    const ys = s.projectiles.map((b) => b.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeCloseTo(30, 0);
    expect(ys[2]! - ys[1]!).toBeCloseTo(30, 0);
    expect(new Set(s.projectiles.map((b) => Math.round(b.x))).size).toBe(1);

    await page.keyboard.press('KeyE');
    await advance(page, 50);
    s = await state(page);
    expect(s.projectiles.filter((b) => b.x > p.x)).toHaveLength(3);

    // Each side has its own cooldown.
    await page.keyboard.press('KeyQ');
    await advance(page, 50);
    expect((await state(page)).projectiles).toHaveLength(6);
    expect((await state(page)).cooldowns.left).toBeGreaterThan(0.9);
  });

  test('hits damage enemies once per projectile and a kill scores exactly one point', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 0.5 }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await advance(page, 600);
    let s = await state(page);
    expect(s.enemies).toHaveLength(1);
    const target = s.enemies[0]!;
    expect(target.kind).toBe('chaser');

    // Fire one cannonball at a time and record the health change it causes.
    const perShot: number[] = [];
    let health = target.health;
    let destroyed: GameState | null = null;
    for (let attempt = 0; attempt < 12 && !destroyed; attempt++) {
      s = await state(page);
      const enemy = s.enemies.find((e) => e.id === target.id);
      if (!enemy) break;
      await turnTo(page, angleTo(s.player, enemy), 0.03);
      await page.keyboard.down('Space');
      await advance(page, 17);
      await page.keyboard.up('Space');
      // Let this ball resolve (hit, expire) before the next one: flight time < 1 s.
      for (let t = 0; t < 10 && (await state(page)).projectiles.some((p) => p.owner === 'player'); t++) await advance(page, 100, false);
      s = await state(page);
      const after = s.enemies.find((e) => e.id === target.id);
      const now = after ? after.health : 0;
      perShot.push(health - now);
      health = now;
      if (!after) destroyed = s;
    }
    expect(destroyed, 'the chaser should have been sunk').not.toBeNull();
    // Every ball deals its 20 damage exactly once (0 on a miss), so a 40 hp chaser needs two hits.
    for (const delta of perShot) expect([0, 20]).toContain(delta);
    expect(perShot.filter((d) => d === 20)).toHaveLength(2);
    expect(destroyed!.score).toBe(1);
    expect(destroyed!.stats.enemiesDestroyed).toBe(1);
    await expect(page.getByTestId('hud-score')).toContainText('1');

    // No double counting afterwards.
    await advanceBy(page, 3000);
    const later = await state(page);
    expect(later.score).toBe(1);
    expect(later.enemies.some((e) => e.id === target.id)).toBe(false);
  });
});
