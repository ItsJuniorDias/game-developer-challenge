import { expect, openMenu, setupApp, state, test } from './fixtures';

test.describe('Asset loading', () => {
  test('shows progress while textures load', async ({ page }) => {
    await setupApp(page, { assetDelayMs: 1500 });
    await openMenu(page);
    await page.getByTestId('menu-play').click();
    const overlay = page.getByTestId('loading-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible();
    await expect(overlay).toContainText('% loaded');
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running', { timeout: 20_000 });
    await expect(overlay).toHaveCount(0);
  });

  test('reports a failure and recovers with retry', async ({ page }) => {
    await setupApp(page, { assetFailure: 'tiles_sheet_retina' });
    await openMenu(page);
    await page.getByTestId('menu-play').click();
    const error = page.getByTestId('load-error');
    await expect(error).toBeVisible();
    await expect(error.getByRole('alert')).toContainText('could not set sail');
    await expect(page.getByTestId('hud')).toHaveCount(0);

    // The network comes back: retrying downloads the missing texture.
    await page.evaluate(() => {
      const w = window as unknown as { __PIRATE_TEST__: { assetFailure?: string | null } };
      w.__PIRATE_TEST__.assetFailure = null;
    });
    await page.getByTestId('load-retry').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    expect((await state(page)).phase).toBe('running');
  });

  test('reuses cached textures on the next match', async ({ page }) => {
    await setupApp(page);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (/ships_miscellaneous_sheet|tiles_sheet_retina/.test(request.url())) requests.push(request.url());
    });
    await openMenu(page);
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    const firstLoad = requests.length;
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-main-menu').click();
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    expect(firstLoad).toBeGreaterThan(0);
    expect(requests.length).toBe(firstLoad);
  });
});
