import type { Page } from '@playwright/test';
import { advance, expect, openMenu, setupApp, startMatch, STORAGE, test } from './fixtures';

async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

const RESULT = {
  result: {
    matchId: 'visual-match-0001',
    startedAt: '2026-09-08T19:34:00.000Z',
    endedAt: '2026-09-08T19:36:00.000Z',
    score: 24,
    durationMs: 120_000,
    endReason: 'time_up',
    config: { sessionTimeSeconds: 120, spawnIntervalSeconds: 3 },
    seed: 1,
    stats: { shotsFired: 90, enemiesSpawned: 40, enemiesDestroyed: 26, chasersRammed: 2, damageTaken: 64, peakEntities: 30 },
  },
  playerName: 'Captain Test',
  saved: true,
};

test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await setupApp(page);
    await openMenu(page);
    await fontsReady(page);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 0.5, seed: 2024 }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await page.keyboard.down('KeyW');
    await advance(page, 1200);
    await page.keyboard.up('KeyW');
    await advance(page, 1500);
    await fontsReady(page);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await setupApp(page, {}, { extra: { [STORAGE.lastResult]: RESULT } });
    await page.goto('/#/result');
    await expect(page.getByTestId('result-score')).toHaveText('24');
    await fontsReady(page);
    await expect(page).toHaveScreenshot('result.png', { fullPage: true });
  });
});
