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
    await expect(page.getByTestId('pause-resume')).toBeFocused();
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
