import { advanceBy, expect, setupApp, startMatch, state, test } from './fixtures';

test.describe('Match lifecycle', () => {
  test('ends when time runs out and freezes the simulation', async ({ page, consoleErrors }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 }, { options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await page.keyboard.down('KeyW');
    await advanceBy(page, 59_000, 1000);
    expect((await state(page)).status).toBe('running');
    await expect(page.getByTestId('hud-time')).toContainText('00:01');
    await advanceBy(page, 1500, 500);
    await page.keyboard.up('KeyW');
    const ended = await state(page);
    expect(ended.status).toBe('ended');
    expect(ended.endReason).toBe('time_up');
    expect(ended.time).toBeCloseTo(60, 3);
    await expect(page.getByTestId('end-banner')).toContainText("Time's up!");

    // Inputs no longer do anything.
    await page.keyboard.down('Space');
    await advanceBy(page, 1000);
    await page.keyboard.up('Space');
    const frozen = await state(page);
    expect(frozen.projectiles).toHaveLength(ended.projectiles.length);
    expect(frozen.player).toEqual(ended.player);

    await page.getByTestId('end-continue').click();
    await expect(page.getByTestId('result-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Battle Complete' })).toBeVisible();
    await expect(page.getByTestId('result-panel')).toContainText('01:00');
    await expect(page.getByTestId('result-panel')).toContainText('Time up');
    expect(consoleErrors).toEqual([]);
  });

  test('ends when the ship sinks', async ({ page }) => {
    await setupApp(page, {}, { options: { sessionTimeSeconds: 180, spawnIntervalSeconds: 1 } });
    await startMatch(page);
    let s = await state(page);
    for (let i = 0; i < 120 && s.status === 'running'; i++) {
      await advanceBy(page, 1000, 500);
      s = await state(page);
    }
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('defeated');
    expect(s.player.health).toBe(0);
    expect(s.time).toBeLessThan(180);
    await expect(page.getByTestId('end-banner')).toContainText('Your ship sank!');
    await page.getByTestId('end-continue').click();
    await expect(page.getByRole('heading', { name: 'Ship Sunk' })).toBeVisible();
    await expect(page.getByTestId('result-panel')).toContainText('Defeated');
  });

  test('play again starts a clean match', async ({ page }) => {
    await setupApp(page, {}, { options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 1 } });
    await startMatch(page);
    await page.keyboard.down('Space');
    await advanceBy(page, 60_000, 1000);
    await page.keyboard.up('Space');
    const finished = await state(page);
    expect(finished.status).toBe('ended');
    await page.getByTestId('end-continue').click();
    await page.getByTestId('result-play-again').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    const fresh = await state(page);
    expect(fresh.time).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(100);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    expect(fresh.stats.shotsFired).toBe(0);
    await expect(page.getByTestId('hud-time')).toContainText('01:00');
    await expect(page.getByTestId('hud-health')).toHaveAttribute('aria-valuenow', '100');
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
