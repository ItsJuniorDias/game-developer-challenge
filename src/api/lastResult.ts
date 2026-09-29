import { useSyncExternalStore } from 'react';
import type { MatchResult } from '../game/session/matchResult';
import { ExternalStore } from '../storage/externalStore';
import { isFiniteNumber, isRecord, readJson, removeKey, STORAGE_KEYS, writeJson } from '../storage/localStore';
import { isEndReason, isMatchConfig } from '../storage/validators';

/** Last completed match, persisted so the result screen survives a refresh. */
export interface LastResult {
  readonly result: MatchResult;
  readonly playerName: string;
  /** True once the server confirmed the record. */
  readonly saved: boolean;
}

function isMatchResult(value: unknown): value is MatchResult {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.endedAt === 'string' &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.durationMs) &&
    isEndReason(value.endReason) &&
    isMatchConfig(value.config) &&
    isFiniteNumber(value.seed) &&
    isRecord(value.stats)
  );
}

function isLastResult(value: unknown): value is LastResult {
  return isRecord(value) && isMatchResult(value.result) && typeof value.playerName === 'string' && typeof value.saved === 'boolean';
}

const store = new ExternalStore<LastResult | null>(readJson(STORAGE_KEYS.lastResult, isLastResult));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.lastResult || event.key === null) store.set(readJson(STORAGE_KEYS.lastResult, isLastResult));
  });
}

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
