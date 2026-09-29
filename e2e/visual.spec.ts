import { existsSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { advance, expect, openMenu, setupApp, startMatch, STORAGE, test } from './fixtures';

async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Baselines are platform specific (font rasterisation differs between macOS
 * and Linux). On a platform without baselines, the comparison is skipped with
 * instructions instead of failing; `npm run test:e2e:update` creates them.
 */
function requireBaseline(testInfo: TestInfo, name: string): void {
  const updating = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
  test.skip(!updating && !existsSync(testInfo.snapshotPath(name)), `No ${process.platform} baseline for ${name}: run "npm run test:e2e:update" once to create it.`);
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
  test('main menu', async ({ page }, testInfo) => {
    requireBaseline(testInfo, 'menu.png');
    await setupApp(page);
    await openMenu(page);
    await fontsReady(page);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }, testInfo) => {
    requireBaseline(testInfo, 'arena.png');
    await setupApp(page, { firstSpawnDelaySeconds: 0.5, seed: 2024 }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await page.keyboard.down('KeyW');
    await advance(page, 1200);
    await page.keyboard.up('KeyW');
    await advance(page, 1500);
    await fontsReady(page);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }, testInfo) => {
    requireBaseline(testInfo, 'result.png');
    await setupApp(page, {}, { extra: { [STORAGE.lastResult]: RESULT } });
    await page.goto('/#/result');
    await expect(page.getByTestId('result-score')).toHaveText('24');
    await fontsReady(page);
    await expect(page).toHaveScreenshot('result.png', { fullPage: true });
  });
});
