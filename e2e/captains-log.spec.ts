import { expect, openMenu, PROFILE, setupApp, test } from './fixtures';
import { historyDb } from './mockDb';

test.describe("Captain's Log: ranking and match history", () => {
  test('ranking shows a loading state, then paginated results', async ({ page, consoleErrors }) => {
    await setupApp(page, { mockLatencyMs: 1200 });
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-loading')).toBeVisible();
    const table = page.getByTestId('ranking-table');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('ranking-config')).toHaveText('120 second battles · 3 second spawn interval');
    await expect(table.getByTestId('ranking-row')).toHaveCount(5);
    await expect(table.getByTestId('ranking-row').first()).toContainText('Captain Flint');
    await expect(table.getByTestId('ranking-row').first()).toContainText('38');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('page-prev')).toBeDisabled();

    await page.getByTestId('page-next').click();
    await expect(page.getByTestId('log-updating')).toBeVisible();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 3');
    await expect(table.getByTestId('ranking-row').first()).toContainText('06');
    expect(consoleErrors).toEqual([]);
  });

  test('ranking is scoped to the selected configuration', async ({ page }) => {
    await setupApp(page);
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await page.getByLabel('Battle length').fill('60');
    await page.getByLabel('Spawn interval').selectOption('2');
    await expect(page.getByTestId('ranking-config')).toHaveText('60 second battles · 2 second spawn interval');
    const rows = page.getByTestId('ranking-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Sea Wolf');
    await expect(rows.nth(1)).toContainText('William Kidd');
  });

  test('many pages scenario paginates both tabs from one consistent dataset', async ({ page }) => {
    await setupApp(page, {}, { scenario: 'many-pages' });
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 32');
    for (let i = 0; i < 3; i++) await page.getByTestId('page-next').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 4 of 32');
    await expect(page.getByTestId('ranking-row').first()).toContainText('16');
    // Other configurations and the personal history are paginated too.
    await page.getByLabel('Spawn interval').selectOption('5');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 24');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(5);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 7');

    // One dataset for both tabs: every battle in the history also ranks with its configuration.
    const missing = await page.evaluate(async (playerId) => {
      const get = async (url: string) => (await fetch(url)).json();
      const history = await get(`/api/players/${playerId}/matches?page=1&pageSize=50`);
      const ranked = new Set<string>();
      const configs = new Set<string>(history.items.map((m: { config: { sessionTimeSeconds: number; spawnIntervalSeconds: number } }) => `${m.config.sessionTimeSeconds}/${m.config.spawnIntervalSeconds}`));
      for (const config of configs) {
        const [sessionTime, spawnInterval] = config.split('/');
        for (let pageNumber = 1, total = 1; pageNumber <= total; pageNumber++) {
          const ranking = await get(`/api/ranking?page=${pageNumber}&pageSize=50&sessionTime=${sessionTime}&spawnInterval=${spawnInterval}`);
          total = ranking.totalPages;
          for (const entry of ranking.items) if (entry.playerId === playerId) ranked.add(entry.matchId);
        }
      }
      return { total: history.totalItems, missing: history.items.filter((m: { matchId: string }) => !ranked.has(m.matchId)).length };
    }, PROFILE.playerId);
    expect(missing).toEqual({ total: 32, missing: 0 });
  });

  test('match history paginates the player battles', async ({ page }) => {
    await setupApp(page, {}, { extra: historyDb(7) });
    await openMenu(page);
    await page.getByTestId('menu-history').click();
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toHaveAttribute('data-match-id', 'e2e-match-001');
    await expect(rows.first()).toContainText('Defeated');
    await expect(rows.nth(1)).toContainText('Time up');
    await expect(rows.first()).toContainText('01:15');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 2');
    await page.getByTestId('page-next').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute('data-match-id', 'e2e-match-006');
  });

  test('empty lists show an empty state', async ({ page }) => {
    await setupApp(page, {}, { scenario: 'empty' });
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-empty')).toContainText('No battles recorded with this setup yet');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('log-empty')).toContainText('No battles recorded yet');
  });

  test('a failing ranking shows an accessible error while history keeps working', async ({ page }) => {
    await setupApp(page, {}, { scenario: 'ranking-error', extra: historyDb(2) });
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    const error = page.getByTestId('log-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText('The ranking service is unavailable. (HTTP 503)');

    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(2);

    // Recover: switch the network scenario back to normal and retry.
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('log-error')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByTestId('network-lab-open').click();
    await page.getByLabel('Normal', { exact: true }).check();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('ranking-table')).toBeVisible();
  });

  test('history failure, timeouts and connection errors are reported', async ({ page }) => {
    await setupApp(page, { apiTimeoutMs: 600 }, { scenario: 'history-error' });
    await openMenu(page);
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-error')).toContainText('The match history service failed. (HTTP 500)');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByTestId('network-lab-open').click();
    await page.getByLabel('Timeout', { exact: true }).check();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-error')).toContainText('The server took too long to answer.', { timeout: 15_000 });

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByTestId('network-lab-open').click();
    await page.getByLabel('Connection failure', { exact: true }).check();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('log-error')).toContainText('Could not reach the server.');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByTestId('network-lab-open').click();
    await page.getByLabel('HTTP 4xx', { exact: true }).check();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-error')).toContainText('(HTTP 400)');
  });

  test('tabs support keyboard navigation', async ({ page }) => {
    await setupApp(page);
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await page.getByTestId('tab-ranking').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tab-history')).toBeFocused();
    await expect(page.getByTestId('tab-history')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#\/log\/history$/);
    await page.keyboard.press('Home');
    await expect(page.getByTestId('tab-ranking')).toHaveAttribute('aria-selected', 'true');
  });
});
