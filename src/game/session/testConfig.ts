import type { Vec2 } from '../core/math';

/**
 * Optional instrumentation injected by end-to-end tests (see e2e/fixtures.ts)
 * through `window.__PIRATE_TEST__` before the app boots. It only selects
 * scenarios (seed, clock mode, spawn timing); rules still run unmodified.
 */
export interface TestConfig {
  seed?: number;
  manualClock?: boolean;
  firstSpawnDelaySeconds?: number;
  maxAliveEnemies?: number;
  playerSpawn?: Vec2 & { rotation: number };
  disableSound?: boolean;
  /** Axios timeout used by the ranking/history client. */
  apiTimeoutMs?: number;
  /** Base delay between TanStack Query retries. */
  apiRetryDelayMs?: number;
  /** Mock server: forces a fixed latency (ms) for every scenario. */
  mockLatencyMs?: number;
  /** Mock server: seed for latency jitter and generated fixtures. */
  mockSeed?: number;
  /** Mock network: regex source of asset URLs that fail at the network level. */
  assetFailure?: string | null;
  /** Mock network: extra latency (ms) applied to game asset downloads. */
  assetDelayMs?: number | null;
}

declare global {
  interface Window {
    __PIRATE_TEST__?: TestConfig;
  }
}

export function readTestConfig(): TestConfig | null {
  if (typeof window === 'undefined') return null;
  return window.__PIRATE_TEST__ ?? null;
}

export function isInstrumentationEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__PIRATE_TEST__) || new URLSearchParams(window.location.search).has('debug');
}
