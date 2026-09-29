import { expect, test as base, type Page } from '@playwright/test';

/** Mirrors src/game/session/testConfig.ts (kept separate: e2e runs in Node). */
export interface TestConfig {
  seed?: number;
  manualClock?: boolean;
  firstSpawnDelaySeconds?: number;
  maxAliveEnemies?: number;
  playerSpawn?: { x: number; y: number; rotation: number };
  disableSound?: boolean;
  apiTimeoutMs?: number;
  apiRetryDelayMs?: number;
  mockLatencyMs?: number;
  mockSeed?: number;
  assetFailure?: string | null;
  assetDelayMs?: number | null;
}

export interface SeedStorage {
  scenario?: string;
  options?: { sessionTimeSeconds: number; spawnIntervalSeconds: number; soundEnabled?: boolean };
  extra?: Record<string, unknown>;
}

export const STORAGE = {
  options: 'pirate-battle:options:v1',
  profile: 'pirate-battle:profile:v1',
  lastResult: 'pirate-battle:last-result:v1',
  pending: 'pirate-battle:pending-matches:v1',
  mockDb: 'pirate-battle:mock-db:v1',
  scenario: 'pirate-battle:mock-scenario:v1',
} as const;

export const DEFAULT_TEST_CONFIG: TestConfig = {
  seed: 1234,
  manualClock: true,
  disableSound: true,
  apiTimeoutMs: 1500,
  apiRetryDelayMs: 100,
  mockLatencyMs: 40,
  mockSeed: 99,
};

export const PROFILE = { playerId: 'e2e-player-0001', playerName: 'Captain Test' };

/**
 * Installs the test instrumentation before any app code runs and seeds
 * localStorage once per test (not on reloads, so persistence can be tested).
 */
export async function setupApp(page: Page, config: TestConfig = {}, storage: SeedStorage = {}): Promise<void> {
  const merged = { ...DEFAULT_TEST_CONFIG, ...config };
  await page.addInitScript(
    ({ merged, storage, keys, profile }) => {
      (window as unknown as { __PIRATE_TEST__: unknown }).__PIRATE_TEST__ = merged;
      if (sessionStorage.getItem('__e2e_seeded')) return;
      sessionStorage.setItem('__e2e_seeded', '1');
      localStorage.setItem(keys.profile, JSON.stringify(profile));
      if (storage.scenario) localStorage.setItem(keys.scenario, JSON.stringify(storage.scenario));
      if (storage.options) localStorage.setItem(keys.options, JSON.stringify({ soundEnabled: false, ...storage.options }));
      for (const [key, value] of Object.entries(storage.extra ?? {})) localStorage.setItem(key, JSON.stringify(value));
    },
    { merged, storage, keys: STORAGE, profile: PROFILE },
  );
}

export interface ShipState {
  id: number;
  kind: string;
  x: number;
  y: number;
  rotation: number;
  speed: number;
  health: number;
  maxHealth: number;
}

export interface GameState {
  phase: string;
  time: number;
  remaining: number;
  score: number;
  status: string;
  endReason: string | null;
  player: ShipState;
  enemies: ShipState[];
  projectiles: { id: number; owner: string; x: number; y: number }[];
  nextSpawnAt: number;
  cooldowns: { front: number; left: number; right: number };
  stats: Record<string, number>;
}

export async function state(page: Page): Promise<GameState> {
  const value = await page.evaluate(() => (window as unknown as { __pirate?: { state(): unknown } }).__pirate?.state() ?? null);
  if (!value) throw new Error('Game state unavailable');
  return value as GameState;
}

/** Advances the manual simulation clock; `render` draws a frame afterwards. */
export async function advance(page: Page, ms: number, render = true): Promise<void> {
  await page.evaluate(
    ({ ms, render }) => (window as unknown as { __pirate: { advance(ms: number, render: boolean): void } }).__pirate.advance(ms, render),
    { ms, render },
  );
}

/** Advances in slices (inputs are sampled every fixed step) and renders once at the end. */
export async function advanceBy(page: Page, ms: number, slice = 250): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += slice) {
    const step = Math.min(slice, ms - elapsed);
    await advance(page, step, elapsed + step >= ms);
  }
}

export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await advanceBy(page, ms);
  await page.keyboard.up(key);
}

export async function openMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pirate Battle' })).toBeVisible();
}

/** Starts a match from the main menu and waits until combat is running. */
export async function startMatch(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByTestId('menu-play').click();
  await expect(page.getByTestId('game-screen')).toHaveAttribute('data-phase', 'running', { timeout: 20_000 });
  await expect.poll(async () => (await state(page)).phase).toBe('running');
}

export function angleTo(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function wrap(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  else if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/** Rotates the player with real key presses until it faces the given heading. */
export async function turnTo(page: Page, heading: number, tolerance = 0.06): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const s = await state(page);
    const delta = wrap(heading - s.player.rotation);
    if (Math.abs(delta) <= tolerance) return;
    const key = delta > 0 ? 'KeyD' : 'KeyA';
    await page.keyboard.down(key);
    await advance(page, Math.max(17, Math.min(200, (Math.abs(delta) / 2.5) * 1000)), false);
    await page.keyboard.up(key);
  }
  throw new Error('Could not turn to the requested heading');
}

/** Collects console errors and uncaught exceptions for the whole test. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };
