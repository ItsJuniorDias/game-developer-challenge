import { advanceBy, expect, hold, setupApp, startMatch, state, test, turnTo } from './fixtures';

/** North-west island collision box (see src/game/sim/arena.ts: col 1,row 1, 4x3 tiles, 8u inset). */
const NW_ISLAND = { left: 136, right: 632, top: 136, bottom: 504 };
/** The hull is three circles along the keel: the bow/stern tips are this far from the centre. */
const HULL_HALF_LENGTH = 50;
const HULL_HALF_WIDTH = 26;

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
    // The bow touches the top edge: the whole hull stays inside the visible arena.
    expect(s.player.y).toBeCloseTo(HULL_HALF_LENGTH, 0);
    await turnTo(page, 0);
    await hold(page, 'KeyW', 6000);
    s = await state(page);
    expect(s.player.x).toBeCloseTo(2048 - HULL_HALF_LENGTH, 0);
    expect(s.player.y).toBeGreaterThanOrEqual(HULL_HALF_WIDTH);
  });

  test('cannot sail through an island', async ({ page }) => {
    await setupApp(page, { firstSpawnDelaySeconds: 999, playerSpawn: { x: 900, y: 320, rotation: Math.PI } });
    await startMatch(page);
    await hold(page, 'KeyW', 4000);
    const s = await state(page);
    // The bow stopped at the island's east shore: it never enters the collision box.
    expect(s.player.x - HULL_HALF_LENGTH).toBeGreaterThanOrEqual(NW_ISLAND.right - 0.5);
    expect(s.player.x - HULL_HALF_LENGTH).toBeLessThan(NW_ISLAND.right + 8);
    expect(s.player.y).toBeCloseTo(320, 0);
    expect(s.player.speed).toBeLessThan(5);
  });
});
