import { http } from './http';
import {
  API_ROUTES,
  type HistoryPage,
  type MatchConfigDto,
  type MatchRecordInput,
  type RankingPage,
  type SubmitMatchResponse,
} from './contracts';

export interface RankingParams {
  readonly config: MatchConfigDto;
  readonly page: number;
  readonly pageSize: number;
}

export interface HistoryParams {
  readonly playerId: string;
  readonly page: number;
  readonly pageSize: number;
}

export async function fetchRanking(params: RankingParams, signal?: AbortSignal): Promise<RankingPage> {
  const { data } = await http.get<RankingPage>(API_ROUTES.ranking, {
    params: {
      page: params.page,
      pageSize: params.pageSize,
      sessionTime: params.config.sessionTimeSeconds,
      spawnInterval: params.config.spawnIntervalSeconds,
    },
    signal,
  });
  return data;
}

export async function fetchHistory(params: HistoryParams, signal?: AbortSignal): Promise<HistoryPage> {
  const { data } = await http.get<HistoryPage>(API_ROUTES.playerMatches(params.playerId), {
    params: { page: params.page, pageSize: params.pageSize },
    signal,
  });
  return data;
}

/** Idempotent: replaying the same matchId returns the stored record. */
export async function submitMatch(input: MatchRecordInput): Promise<SubmitMatchResponse> {
  const { data } = await http.post<SubmitMatchResponse>(API_ROUTES.matches, input, {
    headers: { 'Idempotency-Key': input.matchId },
  });
  return data;
}
