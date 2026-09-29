import { useSyncExternalStore } from 'react';
import { ExternalStore } from '../storage/externalStore';
import { isRecord, readJson, STORAGE_KEYS, writeJson } from '../storage/localStore';
import { isMatchRecordInput } from '../storage/validators';
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

const STATUSES: ReadonlySet<string> = new Set<PendingStatus>(['pending', 'failed', 'rejected']);

function isPendingMatch(value: unknown): value is PendingMatch {
  return (
    isRecord(value) &&
    isMatchRecordInput(value.input) &&
    typeof value.status === 'string' &&
    STATUSES.has(value.status) &&
    typeof value.attempts === 'number' &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    typeof value.createdAt === 'string'
  );
}

/** Reads the stored outbox, keeping only well-formed entries. */
function load(): readonly PendingMatch[] {
  const stored = readJson(STORAGE_KEYS.pendingMatches, (value: unknown): value is unknown[] => Array.isArray(value));
  return stored ? stored.filter(isPendingMatch) : [];
}

const store = new ExternalStore<readonly PendingMatch[]>(load());

/** False when storage is unavailable or the last write failed (e.g. quota): memory is then the source of truth. */
let persisted = true;

/** Read-modify-write against storage so two open tabs never drop each other's entries. */
function update(change: (current: readonly PendingMatch[]) => readonly PendingMatch[]): void {
  const next = change(persisted ? load() : store.get());
  persisted = writeJson(STORAGE_KEYS.pendingMatches, next);
  store.set(next);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.pendingMatches || event.key === null) store.set(load());
  });
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
    update((current) =>
      current.some((p) => p.input.matchId === input.matchId)
        ? current
        : [...current, { input, status: 'pending', attempts: 0, lastError: null, createdAt: new Date().toISOString() }],
    );
  },
  markAttempt(matchId: string): void {
    update((current) => current.map((p) => (p.input.matchId === matchId ? { ...p, attempts: p.attempts + 1 } : p)));
  },
  markFailed(matchId: string, message: string, permanent: boolean): void {
    update((current) =>
      current.map((p) => (p.input.matchId === matchId ? { ...p, status: permanent ? ('rejected' as const) : ('failed' as const), lastError: message } : p)),
    );
  },
  markPending(matchId: string): void {
    update((current) => current.map((p) => (p.input.matchId === matchId ? { ...p, status: 'pending' as const, lastError: null } : p)));
  },
  remove(matchId: string): void {
    update((current) => current.filter((p) => p.input.matchId !== matchId));
  },
  clear(): void {
    update(() => []);
  },
  subscribe: store.subscribe,
};

export function usePendingMatches(): readonly PendingMatch[] {
  return useSyncExternalStore(store.subscribe, store.get);
}
