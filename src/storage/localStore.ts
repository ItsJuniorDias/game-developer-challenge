/**
 * Versioned, validated localStorage access. Corrupted or outdated values are
 * ignored (and replaced by defaults) instead of crashing the app.
 */
export const STORAGE_KEYS = {
  options: 'pirate-battle:options:v1',
  profile: 'pirate-battle:profile:v1',
  lastResult: 'pirate-battle:last-result:v1',
  pendingMatches: 'pirate-battle:pending-matches:v1',
  mockDb: 'pirate-battle:mock-db:v1',
  mockScenario: 'pirate-battle:mock-scenario:v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function readJson<T>(key: StorageKey, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(key: StorageKey, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: StorageKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage unavailable: nothing to remove
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
