import { expect, openMenu, setupApp, test } from './fixtures';

test.describe('Audio', () => {
  test('the first tap unlocks audio output on touch devices', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch activation path');
    await setupApp(page, { firstSpawnDelaySeconds: 999, disableSound: false }, { options: { sessionTimeSeconds: 120, spawnIntervalSeconds: 3, soundEnabled: true } });
    await openMenu(page);
    await page.getByTestId('menu-play').tap();
    await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __pirate: { audioState(): string } }).__pirate.audioState()))
      .toBe('running');
  });
});
