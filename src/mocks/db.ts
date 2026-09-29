import type { MatchRecord } from '../api/contracts';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../storage/localStore';
import { isMatchRecord } from '../storage/validators';
import { baseFixtures } from './fixtures';

interface MockDbState {
  readonly version: 1;
  readonly revision: number;
  readonly records: MatchRecord[];
}

function isStateShape(value: unknown): value is { version: 1; revision: number; records: unknown[] } {
  return isRecord(value) && value.version === 1 && typeof value.revision === 'number' && Array.isArray(value.records);
}

function initialState(): MockDbState {
  return { version: 1, revision: 1, records: baseFixtures() };
}

/** Reads the stored database, dropping any corrupted record instead of failing every request. */
function load(): MockDbState {
  const stored = readJson(STORAGE_KEYS.mockDb, isStateShape);
  if (!stored) return initialState();
  return { version: 1, revision: stored.revision, records: stored.records.filter(isMatchRecord) };
}

/**
 * Mock persistence for the ranking/history API. Stored in localStorage so
 * confirmed records survive a refresh, exactly like a real backend would.
 * Writes re-read storage first and other tabs' writes are picked up through
 * the `storage` event, so several open tabs never erase each other's records.
 */
class MockDb {
  private state: MockDbState = load();
  /** Incremented by reset(): lets in-flight requests detect that the data was wiped. */
  private epochValue = 0;
  /** False when the last write failed (storage unavailable or full). */
  private persisted = true;

  get revision(): number {
    return this.state.revision;
  }

  get epoch(): number {
    return this.epochValue;
  }

  records(): readonly MatchRecord[] {
    return this.state.records;
  }

  find(matchId: string): MatchRecord | undefined {
    return this.state.records.find((r) => r.matchId === matchId);
  }

  insert(record: MatchRecord): void {
    // Re-read other tabs' writes, unless storage is unusable (memory is then authoritative).
    if (this.persisted) this.reload();
    if (this.find(record.matchId)) return;
    this.state = { ...this.state, revision: this.state.revision + 1, records: [...this.state.records, record] };
    this.persisted = writeJson(STORAGE_KEYS.mockDb, this.state);
  }

  reset(): void {
    this.epochValue++;
    this.state = { ...initialState(), revision: this.state.revision + 1 };
    this.persisted = writeJson(STORAGE_KEYS.mockDb, this.state);
  }

  /** Re-reads storage (e.g. after another tab or a test changed it). */
  reload(): void {
    this.state = load();
  }
}

export const mockDb = new MockDb();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.mockDb || event.key === null) mockDb.reload();
  });
}
