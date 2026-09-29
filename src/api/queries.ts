import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchHistory, fetchRanking } from './endpoints';
import { PAGE_SIZE, type HistoryPage, type MatchConfigDto, type PageMeta, type RankingPage } from './contracts';

export const queryKeys = {
  all: ['captains-log'] as const,
  ranking: (config: MatchConfigDto, page: number) =>
    ['captains-log', 'ranking', config.sessionTimeSeconds, config.spawnIntervalSeconds, page] as const,
  rankingAll: ['captains-log', 'ranking'] as const,
  history: (playerId: string, page: number) => ['captains-log', 'history', playerId, page] as const,
  historyAll: ['captains-log', 'history'] as const,
};

/**
 * Guards against late responses: if the cache already holds data with a newer
 * server revision, the stale payload is dropped and the newer data is kept.
 */
export function keepNewest<T extends PageMeta>(client: QueryClient, key: readonly unknown[], incoming: T): T {
  const cached = client.getQueryData<T>(key);
  if (cached && cached.revision > incoming.revision) return cached;
  return incoming;
}

export function useRankingQuery(config: MatchConfigDto, page: number) {
  const client = useQueryClient();
  const key = queryKeys.ranking(config, page);
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => keepNewest<RankingPage>(client, key, await fetchRanking({ config, page, pageSize: PAGE_SIZE }, signal)),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  const client = useQueryClient();
  const key = queryKeys.history(playerId, page);
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => keepNewest<HistoryPage>(client, key, await fetchHistory({ playerId, page, pageSize: PAGE_SIZE }, signal)),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}
