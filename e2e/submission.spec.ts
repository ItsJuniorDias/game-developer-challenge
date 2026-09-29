import type { Page } from '@playwright/test';
import { advanceBy, expect, openMenu, PROFILE, setupApp, startMatch, STORAGE, test } from './fixtures';

interface StoredRecord {
  matchId: string;
  playerId: string;
}

async function playerRecords(page: Page): Promise<StoredRecord[]> {
  return page.evaluate(
    ({ key, playerId }) => {
      const db = JSON.parse(localStorage.getItem(key) ?? '{"records":[]}') as { records: StoredRecord[] };
      return db.records.filter((r) => r.playerId === playerId);
    },
    { key: STORAGE.mockDb, playerId: PROFILE.playerId },
  );
}

/** Plays a deterministic 60 s match (no enemies) and opens the result screen. */
async function finishQuickMatch(page: Page): Promise<void> {
  await startMatch(page);
  await advanceBy(page, 61_000, 1000);
  await page.getByTestId('end-continue').click();
  await expect(page.getByTestId('result-panel')).toBeVisible();
}

async function chooseScenario(page: Page, label: string): Promise<void> {
  await page.getByTestId('network-lab-open').click();
  await page.getByLabel(label, { exact: true }).check();
  await page.getByRole('button', { name: 'Close' }).click();
}

const QUIET = { firstSpawnDelaySeconds: 999 };
const SHORT = { options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 10 } };

test.describe('Match registration', () => {
  test('a finished match is recorded once and both tabs refresh', async ({ page, consoleErrors }) => {
    await setupApp(page, QUIET, SHORT);
    // Visit both tabs first so they are cached before the match.
    await openMenu(page);
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('log-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();

    await finishQuickMatch(page);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-state', 'saved');

    await page.getByTestId('result-main-menu').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.getByTestId('tab-ranking').click();
    const mine = page.locator('[data-testid=ranking-row].is-mine');
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Captain Test');
    await expect(mine).toContainText('You');
    expect(await playerRecords(page)).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a record pending after an outage survives refresh and is sent after recovery', async ({ page }) => {
    await setupApp(page, QUIET, { ...SHORT, scenario: 'offline' });
    await finishQuickMatch(page);
    const status = page.getByTestId('submission-status');
    await expect(status).toHaveAttribute('data-state', 'failed');
    await expect(status.getByRole('alert')).toContainText('saved on this device');

    await page.reload();
    await expect(status).toHaveAttribute('data-state', /failed|sending|pending/);
    await expect(status).toHaveAttribute('data-state', 'failed');
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, STORAGE.pending)).toBe(1);

    // The player can start another battle while the record is pending.
    await page.getByTestId('result-play-again').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-main-menu').click();
    await expect(page.getByTestId('pending-banner')).toBeVisible();

    await chooseScenario(page, 'Normal');
    await expect(page.getByTestId('pending-banner')).toBeHidden();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    expect(await playerRecords(page)).toHaveLength(1);
  });

  test('a timeout after the server stored the match is retried without duplicates', async ({ page }) => {
    await setupApp(page, { ...QUIET, apiTimeoutMs: 700 }, { ...SHORT, scenario: 'submit-timeout' });
    await finishQuickMatch(page);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
    const records = await playerRecords(page);
    expect(records).toHaveLength(1);

    // Manual retries of an already recorded match are harmless.
    await page.getByTestId('result-main-menu').click();
    await page.getByTestId('menu-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').first()).toHaveAttribute('data-match-id', records[0]!.matchId);
  });

  test('repeated retry clicks never duplicate a record', async ({ page }) => {
    await setupApp(page, QUIET, { ...SHORT, scenario: 'client-error' });
    await finishQuickMatch(page);
    const status = page.getByTestId('submission-status');
    await expect(status).toHaveAttribute('data-state', 'rejected');
    await expect(status).toContainText('(HTTP 422)');

    await page.getByTestId('result-main-menu').click();
    await chooseScenario(page, 'Normal');
    await page.goto('/#/result');
    const retry = page.getByTestId('submission-retry');
    await expect(retry).toBeVisible();
    // Three clicks in the same tick, before React can hide the button.
    await retry.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
    await expect(status).toHaveAttribute('data-state', 'saved');
    expect(await playerRecords(page)).toHaveLength(1);
  });

  test('late responses never overwrite newer data', async ({ page }) => {
    // Out-of-order scenario: odd requests take 1.5 s, even ones 0.1 s.
    await setupApp(page, {}, { scenario: 'out-of-order', options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 3 } });
    await openMenu(page);
    // Request #1 (60 s / 3 s, no fixtures) is the slow one...
    await page.getByTestId('menu-ranking').click();
    await expect(page.getByTestId('log-loading')).toBeVisible();
    // ...and request #2 (60 s / 2 s) answers first.
    await page.getByLabel('Spawn interval').selectOption('2');
    const rows = page.getByTestId('ranking-row');
    await expect(rows.first()).toContainText('Sea Wolf');
    // Request #1 lands afterwards (empty list for its old configuration): the table must not change.
    await page.waitForTimeout(1800);
    await expect(page.getByTestId('ranking-config')).toHaveText('60 second battles · 2 second spawn interval');
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('log-empty')).toHaveCount(0);
  });
});
