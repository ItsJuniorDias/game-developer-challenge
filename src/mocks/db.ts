import type { MatchRecord } from '../api/contracts';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../storage/localStore';
import { baseFixtures } from './fixtures';

interface MockDbState {
  readonly version: 1;
  readonly revision: number;
  readonly records: MatchRecord[];
}

function isState(value: unknown): value is MockDbState {
  return isRecord(value) && value.version === 1 && typeof value.revision === 'number' && Array.isArray(value.records);
}

function initialState(): MockDbState {
  return { version: 1, revision: 1, records: baseFixtures() };
}

/**
 * Mock persistence for the ranking/history API. Stored in localStorage so
 * confirmed records survive a refresh, exactly like a real backend would.
 */
class MockDb {
  private state: MockDbState;

  constructor() {
    this.state = readJson(STORAGE_KEYS.mockDb, isState) ?? initialState();
  }

  get revision(): number {
    return this.state.revision;
  }

  records(): readonly MatchRecord[] {
    return this.state.records;
  }

  find(matchId: string): MatchRecord | undefined {
    return this.state.records.find((r) => r.matchId === matchId);
  }

  insert(record: MatchRecord): void {
    this.state = { ...this.state, revision: this.state.revision + 1, records: [...this.state.records, record] };
    writeJson(STORAGE_KEYS.mockDb, this.state);
  }

  reset(): void {
    this.state = { ...initialState(), revision: this.state.revision + 1 };
    writeJson(STORAGE_KEYS.mockDb, this.state);
  }

  /** Re-reads storage (e.g. after another tab or a test changed it). */
  reload(): void {
    this.state = readJson(STORAGE_KEYS.mockDb, isState) ?? initialState();
  }
}

export const mockDb = new MockDb();
