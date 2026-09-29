import { useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
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

/**
 * Keeps the previous page on screen while the next one loads, but only when it
 * belongs to the same list (same configuration or player): switching the
 * ranking configuration shows a loading state instead of the old rows.
 */
function samePrefixPlaceholder<T>(prefixLength: number, key: readonly unknown[]) {
  return (previous: T | undefined, previousQuery: Query<T, Error, T, readonly unknown[]> | undefined): T | undefined => {
    if (!previous || !previousQuery) return undefined;
    const prevKey = previousQuery.queryKey;
    for (let i = 0; i < prefixLength; i++) if (prevKey[i] !== key[i]) return undefined;
    return previous;
  };
}

export function useRankingQuery(config: MatchConfigDto, page: number) {
  const client = useQueryClient();
  const key: readonly unknown[] = queryKeys.ranking(config, page);
  return useQuery<RankingPage, Error, RankingPage, readonly unknown[]>({
    queryKey: key,
    queryFn: async ({ signal }) => keepNewest<RankingPage>(client, key, await fetchRanking({ config, page, pageSize: PAGE_SIZE }, signal)),
    placeholderData: samePrefixPlaceholder<RankingPage>(4, key),
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  const client = useQueryClient();
  const key: readonly unknown[] = queryKeys.history(playerId, page);
  return useQuery<HistoryPage, Error, HistoryPage, readonly unknown[]>({
    queryKey: key,
    queryFn: async ({ signal }) => keepNewest<HistoryPage>(client, key, await fetchHistory({ playerId, page, pageSize: PAGE_SIZE }, signal)),
    placeholderData: samePrefixPlaceholder<HistoryPage>(3, key),
    refetchOnMount: 'always',
  });
}
