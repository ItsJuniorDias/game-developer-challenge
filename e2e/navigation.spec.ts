import type { CDPSession, Page } from '@playwright/test';
import { advance, advanceBy, expect, openMenu, setupApp, startMatch, state, STORAGE, test } from './fixtures';

async function storageValue(page: Page, key: string): Promise<unknown> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
}

async function center(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
}

test.describe('Navigation and abandonment', () => {
  test('leaving the combat screen abandons the match without recording it', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 }, { scenario: 'empty' });
    await startMatch(page);
    await advanceBy(page, 3000);
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-main-menu').click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await storageValue(page, STORAGE.pending)).toBeNull();
    expect(await storageValue(page, STORAGE.lastResult)).toBeNull();

    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
  });

  test('refreshing during combat ends the match and returns to the menu', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    await advanceBy(page, 2000);
    await page.reload();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    expect(await storageValue(page, STORAGE.pending)).toBeNull();
  });

  test('repeated navigation between screens keeps a single clean session', async ({ page, consoleErrors }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await openMenu(page);
    for (let round = 0; round < 3; round++) {
      await page.getByTestId('menu-options').click();
      await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await page.getByTestId('menu-ranking').click();
      await expect(page.getByTestId('ranking-table')).toBeVisible();
      await page.getByTestId('tab-history').click();
      await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await page.getByTestId('menu-play').click();
      await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
      await advance(page, 500);
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    expect(await page.evaluate(() => (window as unknown as { __pirate: { sessionCount(): number } }).__pirate.sessionCount())).toBe(3);
    expect(consoleErrors).toEqual([]);
  });

  test('touch controls steer and fire at the same time', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'multi-touch runs on the mobile project (Chrome DevTools Protocol touch events)');
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    const client = await page.context().newCDPSession(page);
    const forward = await center(page, 'touch-forward');
    const right = await center(page, 'touch-turnRight');
    const fire = await center(page, 'touch-fireFront');
    const start = await state(page);

    await touch(client, 'touchStart', [{ ...forward, id: 1 }]);
    await advanceBy(page, 800);
    await touch(client, 'touchStart', [
      { ...forward, id: 1 },
      { ...fire, id: 2 },
    ]);
    await advance(page, 50);
    let s = await state(page);
    expect(s.player.y).toBeLessThan(start.player.y - 30);
    expect(s.projectiles.filter((p) => p.owner === 'player')).toHaveLength(1);

    await touch(client, 'touchEnd', [{ ...forward, id: 1 }]);
    await touch(client, 'touchEnd', []);
    await touch(client, 'touchStart', [{ ...right, id: 3 }]);
    await advance(page, 400);
    await touch(client, 'touchEnd', []);
    s = await state(page);
    expect(s.player.rotation).toBeGreaterThan(start.player.rotation + 0.5);
    const afterRelease = s.player.rotation;
    await advance(page, 400);
    expect((await state(page)).player.rotation).toBeCloseTo(afterRelease, 5);
  });
});
