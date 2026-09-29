import { useSyncExternalStore } from 'react';
import { ExternalStore } from '../storage/externalStore';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../storage/localStore';
import type { MatchRecordInput } from './contracts';

export type PendingStatus = 'pending' | 'failed' | 'rejected';

/** A finished match waiting to be (re)sent. Survives refreshes. */
export interface PendingMatch {
  readonly input: MatchRecordInput;
  readonly status: PendingStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string;
}

function isPendingList(value: unknown): value is PendingMatch[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && isRecord(item.input) && typeof item.input.matchId === 'string' && typeof item.status === 'string')
  );
}

const store = new ExternalStore<readonly PendingMatch[]>(readJson(STORAGE_KEYS.pendingMatches, isPendingList) ?? []);

function commit(next: readonly PendingMatch[]): void {
  writeJson(STORAGE_KEYS.pendingMatches, next);
  store.set(next);
}

export const pendingMatches = {
  list(): readonly PendingMatch[] {
    return store.get();
  },
  get(matchId: string): PendingMatch | undefined {
    return store.get().find((p) => p.input.matchId === matchId);
  },
  /** Adds a finished match to the outbox; a second call for the same id is ignored. */
  enqueue(input: MatchRecordInput): void {
    if (store.get().some((p) => p.input.matchId === input.matchId)) return;
    commit([...store.get(), { input, status: 'pending', attempts: 0, lastError: null, createdAt: new Date().toISOString() }]);
  },
  markAttempt(matchId: string): void {
    commit(store.get().map((p) => (p.input.matchId === matchId ? { ...p, attempts: p.attempts + 1 } : p)));
  },
  markFailed(matchId: string, message: string, permanent: boolean): void {
    commit(
      store
        .get()
        .map((p) => (p.input.matchId === matchId ? { ...p, status: permanent ? ('rejected' as const) : ('failed' as const), lastError: message } : p)),
    );
  },
  markPending(matchId: string): void {
    commit(store.get().map((p) => (p.input.matchId === matchId ? { ...p, status: 'pending' as const, lastError: null } : p)));
  },
  remove(matchId: string): void {
    commit(store.get().filter((p) => p.input.matchId !== matchId));
  },
  clear(): void {
    commit([]);
  },
  subscribe: store.subscribe,
};

export function usePendingMatches(): readonly PendingMatch[] {
  return useSyncExternalStore(store.subscribe, store.get);
}
