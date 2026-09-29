import { expect, openMenu, setupApp, startMatch, test } from './fixtures';

test.describe('Options', () => {
  test('navigates, validates, saves and persists after refresh', async ({ page, consoleErrors }) => {
    await setupApp(page);
    await openMenu(page);
    await page.getByTestId('menu-options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    const session = page.getByRole('spinbutton', { name: 'Game session time' });
    const spawn = page.getByRole('spinbutton', { name: 'Enemy spawn time' });
    const save = page.getByTestId('options-save');
    await expect(session).toHaveValue('120');
    await expect(spawn).toHaveValue('3');
    await expect(save).toBeDisabled();

    await session.fill('30');
    await expect(page.getByTestId('option-session-time').getByRole('alert')).toHaveText('Game session time must be between 60 and 180 seconds.');
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(save).toBeDisabled();

    await session.fill('90.5');
    await expect(page.getByTestId('option-session-time').getByRole('alert')).toContainText('whole number');

    await spawn.fill('0');
    await expect(page.getByTestId('option-spawn-time').getByRole('alert')).toContainText('between 1 and 10');
    await spawn.fill('2.3');
    await expect(page.getByTestId('option-spawn-time').getByRole('alert')).toContainText('steps of 0.5');

    await session.fill('90');
    await spawn.fill('2.5');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Increase game session time' }).click();
    await expect(session).toHaveValue('100');
    await page.getByRole('button', { name: 'Decrease enemy spawn time' }).click();
    await expect(spawn).toHaveValue('2');

    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByTestId('options-status')).toHaveText('Options saved.');

    await page.reload();
    await expect(session).toHaveValue('100');
    await expect(spawn).toHaveValue('2');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('a match uses a snapshot of the options taken at start', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 }, { options: { sessionTimeSeconds: 90, spawnIntervalSeconds: 4 } });
    await startMatch(page);
    await expect(page.getByTestId('hud-time')).toContainText('01:30');

    // Changing options from the pause menu does not affect the running match.
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-options').click();
    await page.getByRole('spinbutton', { name: 'Game session time' }).fill('150');
    await page.getByTestId('options-save').click();
    await expect(page.getByTestId('options-status')).toContainText('next battle');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('hud-time')).toContainText('01:30');

    // The next match picks the new value.
    await page.getByTestId('hud-pause').click();
    await page.getByTestId('pause-main-menu').click();
    await page.getByTestId('menu-play').click();
    await expect(page.getByTestId('hud-time')).toContainText('02:30');
  });
});
