import { advanceBy, expect, setupApp, startMatch, test } from './fixtures';

test.describe('Result screen', () => {
  test('shows score, time played, end reason and registration, and survives a refresh', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 }, { options: { sessionTimeSeconds: 60, spawnIntervalSeconds: 10 } });
    await startMatch(page);
    await advanceBy(page, 61_000, 1000);
    await page.getByTestId('end-continue').click();

    const panel = page.getByTestId('result-panel');
    await expect(panel.getByRole('heading', { name: 'Battle Complete' })).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText('0');
    await expect(panel).toContainText('Points · 01:00 · Time up');
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-state', 'saved');
    await expect(panel.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Main Menu' })).toBeVisible();

    await page.reload();
    await expect(panel.getByRole('heading', { name: 'Battle Complete' })).toBeVisible();
    await expect(panel).toContainText('Points · 01:00 · Time up');
    await expect(page.getByTestId('result-meta')).toContainText('60 s battle · 10 s spawns · Captain Test');
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-state', 'saved');

    await panel.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
  });
});
