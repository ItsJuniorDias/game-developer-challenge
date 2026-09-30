import { advance, advanceBy, expect, setupApp, startMatch, state, test } from './fixtures';

test.describe('Pause', () => {
  test('manual pause freezes time and resuming does not replay held input', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    await page.keyboard.down('KeyW');
    await advanceBy(page, 1000);
    const before = await state(page);
    expect(before.player.speed).toBeGreaterThan(100);

    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
    // Focus goes to the dialog heading, so a key still held from combat cannot trigger Resume.
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    await advanceBy(page, 5000, 1000);
    const paused = await state(page);
    expect(paused.phase).toBe('paused');
    expect(paused.time).toBe(before.time);
    expect(paused.player).toEqual(before.player);

    // W is still physically held, but resuming ignores it until pressed again.
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
    const resumed = await state(page);
    expect(resumed.time).toBe(before.time);
    await advance(page, 1000);
    const coasting = await state(page);
    expect(coasting.player.speed).toBeLessThan(before.player.speed);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyW');
    await advance(page, 1000);
    expect((await state(page)).player.speed).toBeGreaterThan(coasting.player.speed);
    await page.keyboard.up('KeyW');
  });

  test('pauses automatically when the window loses focus or the tab is hidden', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    await advance(page, 500);
    const t = (await state(page)).time;

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toContainText('lost focus');
    await advanceBy(page, 3000);
    expect((await state(page)).time).toBe(t);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
    expect((await state(page)).phase).toBe('running');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('pause-dialog')).toContainText('tab was hidden');
    expect((await state(page)).phase).toBe('paused');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Coming back does not resume by itself.
    expect((await state(page)).phase).toBe('paused');
    await page.getByTestId('pause-resume').click();
    expect((await state(page)).phase).toBe('running');
  });

  test('holding P does not resume right after pausing', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    await page.keyboard.down('KeyP');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    // Auto-repeat keydown events while the key stays down.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', repeat: true, bubbles: true })));
    }
    await page.keyboard.up('KeyP');
    await expect(page.getByTestId('pause-dialog')).toBeVisible();
    expect((await state(page)).phase).toBe('paused');
    // A fresh press resumes.
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('pause-dialog')).toBeHidden();
  });

  test('losing focus while assets load starts the match paused', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999, assetDelayMs: 1200 });
    await page.goto('/');
    await page.getByTestId('menu-play').click();
    // Blur while the game assets are downloading (the session exists and is loading).
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pirate?: { hud(): { phase: string } | null } }).__pirate?.hud()?.phase)).toBe('loading');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).phase).toBe('paused');
    expect((await state(page)).time).toBe(0);
    // The "Set sail!" call-out waits for the battle to actually run.
    await expect(page.getByTestId('start-banner')).toHaveCount(0);
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('start-banner')).toBeVisible();
  });

  test('losing focus while the combat screen downloads also starts the match paused', async ({ page }) => {
    // The mock network holds the combat screen chunk, so the blur happens before the session exists.
    await setupApp(page, { firstSpawnDelaySeconds: 999, assetDelayMs: 1500, assetDelayPattern: 'GameScreen-' });
    await page.goto('/');
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('game-route-loading')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-dialog')).toBeVisible({ timeout: 20_000 });
    expect((await state(page)).phase).toBe('paused');
  });

  test('real-time clock does not advance while paused', async ({ page }) => {
    await setupApp(page, { manualClock: false, firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    await page.getByTestId('hud-pause').click();
    const t = (await state(page)).time;
    await page.waitForTimeout(1500);
    expect((await state(page)).time).toBe(t);
    await page.getByTestId('pause-resume').click();
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(t);
  });
});
