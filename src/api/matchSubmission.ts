import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { MatchResult } from '../game/session/matchResult';
import { SCENARIO_EVENT } from '../mocks/scenarios';
import { getProfile } from '../storage/settings';
import type { MatchRecordInput, SubmitMatchResponse } from './contracts';
import { submitMatch } from './endpoints';
import { ApiError } from './http';
import { lastResult } from './lastResult';
import { pendingMatches, usePendingMatches } from './pendingMatches';
import { queryKeys } from './queries';

export const submitMutationKey = ['submit-match'] as const;
const AUTO_RETRY_INTERVAL_MS = 15_000;
/** Server answers meaning "this record itself is invalid": retrying cannot help. */
const PERMANENT_STATUSES = new Set([400, 409, 413, 422]);

/** Match ids currently being sent. Updated synchronously to block double sends. */
const inFlight = new Set<string>();

export function toRecordInput(result: MatchResult): MatchRecordInput {
  const profile = getProfile();
  return {
    matchId: result.matchId,
    playerId: profile.playerId,
    playerName: profile.playerName,
    playedAt: result.endedAt,
    score: result.score,
    durationMs: result.durationMs,
    endReason: result.endReason,
    config: { ...result.config },
  };
}

/**
 * Persists a finished match locally (result screen + outbox) before any
 * network call, so neither a failure nor a refresh can lose it.
 */
export function recordFinishedMatch(result: MatchResult): void {
  const input = toRecordInput(result);
  lastResult.set({ result, playerName: input.playerName, saved: false });
  pendingMatches.enqueue(input);
}

export type SubmissionState = 'saved' | 'sending' | 'pending' | 'failed' | 'rejected' | 'unknown';

/** Combines the outbox and live mutations into one status for a match. */
export function useSubmissionState(matchId: string | null, saved: boolean): { state: SubmissionState; error: string | null } {
  const pending = usePendingMatches();
  const sending = useMutationState({
    filters: { mutationKey: submitMutationKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as MatchRecordInput | undefined)?.matchId,
  });
  if (!matchId) return { state: 'unknown', error: null };
  if (sending.includes(matchId)) return { state: 'sending', error: null };
  const entry = pending.find((p) => p.input.matchId === matchId);
  if (entry) return { state: entry.status === 'pending' ? 'pending' : entry.status, error: entry.lastError };
  return { state: saved ? 'saved' : 'unknown', error: null };
}

/**
 * Background worker that drains the outbox with TanStack Query mutations.
 * Mounted once at the app root; it never blocks gameplay.
 */
export function useMatchSubmissionWorker(): void {
  const client = useQueryClient();
  const pending = usePendingMatches();
  const { mutate } = useMutation<SubmitMatchResponse, unknown, MatchRecordInput>({
    mutationKey: submitMutationKey,
    mutationFn: submitMatch,
    onMutate: (input) => {
      pendingMatches.markAttempt(input.matchId);
    },
    onSuccess: async (_response, input) => {
      pendingMatches.remove(input.matchId);
      lastResult.markSaved(input.matchId);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.rankingAll }),
        client.invalidateQueries({ queryKey: queryKeys.historyAll }),
      ]);
    },
    onError: (error, input) => {
      const apiError = error instanceof ApiError ? error : null;
      // Only a rejected payload is final; anything else (404, 5xx, network) may recover.
      const permanent = apiError !== null && apiError.kind === 'http' && PERMANENT_STATUSES.has(apiError.status ?? 0);
      const message = apiError ? (apiError.status ? `${apiError.message} (HTTP ${apiError.status})` : apiError.message) : 'Unexpected error';
      pendingMatches.markFailed(input.matchId, message, permanent);
    },
    onSettled: (_data, _error, input) => {
      inFlight.delete(input.matchId);
    },
  });

  const send = useCallback(
    (input: MatchRecordInput) => {
      if (inFlight.has(input.matchId)) return;
      inFlight.add(input.matchId);
      mutate(input);
    },
    [mutate],
  );

  // A new page load is a natural retry point: give every stored record another try.
  useEffect(() => {
    for (const entry of pendingMatches.list()) {
      if (entry.status !== 'pending') pendingMatches.markPending(entry.input.matchId);
    }
  }, []);

  // Send every record waiting in the outbox (also resumes after a refresh).
  useEffect(() => {
    for (const entry of pending) {
      if (entry.status === 'pending') send(entry.input);
    }
  }, [pending, send]);

  // Retry transient failures when connectivity may be back.
  useEffect(() => {
    const retryFailed = (): void => {
      for (const entry of pendingMatches.list()) {
        if (entry.status === 'failed' && !inFlight.has(entry.input.matchId)) pendingMatches.markPending(entry.input.matchId);
      }
    };
    const timer = window.setInterval(retryFailed, AUTO_RETRY_INTERVAL_MS);
    window.addEventListener('online', retryFailed);
    window.addEventListener(SCENARIO_EVENT, retryFailed);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retryFailed);
      window.removeEventListener(SCENARIO_EVENT, retryFailed);
    };
  }, []);
}

/** Manual retry (button). Repeated clicks are harmless: sends are deduplicated. */
export function retrySubmission(matchId: string): void {
  if (inFlight.has(matchId)) return;
  const entry = pendingMatches.get(matchId);
  if (entry) pendingMatches.markPending(matchId);
}

export function retryAllSubmissions(): void {
  for (const entry of pendingMatches.list()) retrySubmission(entry.input.matchId);
}
