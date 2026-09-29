/**
 * REST contracts shared by the Axios client, TanStack Query hooks and the MSW
 * handlers. The mock server and the app can never drift apart.
 */
export type EndReason = 'time_up' | 'defeated';

export interface MatchConfigDto {
  readonly sessionTimeSeconds: number;
  readonly spawnIntervalSeconds: number;
}

/** Body of POST /api/matches. `matchId` doubles as the idempotency key. */
export interface MatchRecordInput {
  readonly matchId: string;
  readonly playerId: string;
  readonly playerName: string;
  /** ISO timestamp of the end of the match. */
  readonly playedAt: string;
  readonly score: number;
  /** Effective active play time in milliseconds. */
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly config: MatchConfigDto;
}

export interface MatchRecord extends MatchRecordInput {
  /** Server time at which the record was first stored. */
  readonly recordedAt: string;
}

export interface SubmitMatchResponse {
  readonly record: MatchRecord;
  /** false when the match had already been recorded (idempotent replay). */
  readonly created: boolean;
  readonly revision: number;
}

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  /** Monotonic data version: a response with a lower revision is stale. */
  readonly revision: number;
}

export interface RankingEntry {
  readonly rank: number;
  readonly matchId: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly score: number;
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly playedAt: string;
}

export interface RankingPage extends PageMeta {
  readonly config: MatchConfigDto;
  readonly items: readonly RankingEntry[];
}

export interface HistoryEntry {
  readonly matchId: string;
  readonly playedAt: string;
  readonly score: number;
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly config: MatchConfigDto;
}

export interface HistoryPage extends PageMeta {
  readonly playerId: string;
  readonly items: readonly HistoryEntry[];
}

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

export const API_ROUTES = {
  ranking: '/api/ranking',
  playerMatches: (playerId: string) => `/api/players/${encodeURIComponent(playerId)}/matches`,
  matches: '/api/matches',
} as const;

export const PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;

/**
 * Deterministic ranking order for matches played with the same configuration:
 * higher score, then longer survival, then earliest played, then match id.
 */
export function compareRanking(a: MatchRecordInput, b: MatchRecordInput): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.durationMs !== b.durationMs) return b.durationMs - a.durationMs;
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export function sameConfig(a: MatchConfigDto, b: MatchConfigDto): boolean {
  return a.sessionTimeSeconds === b.sessionTimeSeconds && a.spawnIntervalSeconds === b.spawnIntervalSeconds;
}
