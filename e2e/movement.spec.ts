import { advanceBy, expect, hold, setupApp, startMatch, state, test, turnTo } from './fixtures';

/** North-west island collision box (see src/game/sim/arena.ts: col 1,row 1, 4x3 tiles, 16u inset). */
const NW_ISLAND = { left: 144, right: 624, top: 144, bottom: 496 };

test.describe('Movement', () => {
  test('sails forward and rotates both ways with the keyboard', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999 });
    await startMatch(page);
    const start = await state(page);
    expect(start.player.rotation).toBeCloseTo(-Math.PI / 2, 3);

    await hold(page, 'KeyW', 1000);
    const moved = await state(page);
    expect(moved.player.y).toBeLessThan(start.player.y - 60);
    expect(moved.player.x).toBeCloseTo(start.player.x, 0);

    await hold(page, 'KeyD', 400);
    const right = await state(page);
    expect(right.player.rotation).toBeGreaterThan(moved.player.rotation + 0.5);

    await hold(page, 'ArrowLeft', 800);
    const left = await state(page);
    expect(left.player.rotation).toBeLessThan(right.player.rotation - 1);

    // Without thrust the ship glides to a stop.
    await advanceBy(page, 2000);
    expect((await state(page)).player.speed).toBe(0);
  });

  test('stays inside the visible arena', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999, playerSpawn: { x: 1200, y: 616, rotation: -Math.PI / 2 } });
    await startMatch(page);
    await hold(page, 'KeyW', 6000);
    let s = await state(page);
    expect(s.player.y).toBeCloseTo(30, 0);
    await turnTo(page, 0);
    await hold(page, 'KeyW', 6000);
    s = await state(page);
    expect(s.player.x).toBeCloseTo(2048 - 30, 0);
    expect(s.player.y).toBeGreaterThanOrEqual(30);
  });

  test('cannot sail through an island', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999, playerSpawn: { x: 900, y: 320, rotation: Math.PI } });
    await startMatch(page);
    await hold(page, 'KeyW', 4000);
    const s = await state(page);
    // Stopped against the island's east shore, radius 30 away from the collision box.
    expect(s.player.x).toBeGreaterThanOrEqual(NW_ISLAND.right + 29);
    expect(s.player.x).toBeLessThan(NW_ISLAND.right + 40);
    expect(s.player.y).toBeCloseTo(320, 0);
    expect(s.player.speed).toBeLessThan(5);
  });
});
