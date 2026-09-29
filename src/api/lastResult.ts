import { useSyncExternalStore } from 'react';
import type { MatchResult } from '../game/session/matchResult';
import { ExternalStore } from '../storage/externalStore';
import { isRecord, readJson, removeKey, STORAGE_KEYS, writeJson } from '../storage/localStore';

/** Last completed match, persisted so the result screen survives a refresh. */
export interface LastResult {
  readonly result: MatchResult;
  readonly playerName: string;
  /** True once the server confirmed the record. */
  readonly saved: boolean;
}

function isLastResult(value: unknown): value is LastResult {
  return (
    isRecord(value) &&
    isRecord(value.result) &&
    typeof value.result.matchId === 'string' &&
    typeof value.result.score === 'number' &&
    typeof value.result.durationMs === 'number' &&
    typeof value.playerName === 'string' &&
    typeof value.saved === 'boolean'
  );
}

const store = new ExternalStore<LastResult | null>(readJson(STORAGE_KEYS.lastResult, isLastResult));

export const lastResult = {
  get: store.get,
  set(value: LastResult): void {
    writeJson(STORAGE_KEYS.lastResult, value);
    store.set(value);
  },
  markSaved(matchId: string): void {
    const current = store.get();
    if (!current || current.result.matchId !== matchId || current.saved) return;
    this.set({ ...current, saved: true });
  },
  clear(): void {
    removeKey(STORAGE_KEYS.lastResult);
    store.set(null);
  },
};

export function useLastResult(): LastResult | null {
  return useSyncExternalStore(store.subscribe, store.get);
}
