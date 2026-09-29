import { useState } from 'react';
import { useHistoryQuery } from '../../api/queries';
import { useProfile } from '../../storage/settings';
import { formatDay, formatDuration, formatEndReason, formatSpawn, formatTime } from '../../ui/format';
import { PendingBanner } from '../menu/PendingBanner';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, LoadingRows, RefreshStatus } from './QueryStates';

export function HistoryPanel() {
  const profile = useProfile();
  const [page, setPage] = useState(1);
  const query = useHistoryQuery(profile.playerId, page);
  const data = query.data;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="log-panel">
      <p className="log-subtitle">{profile.playerName} · Your recent battles</p>
      <PendingBanner />
      <RefreshStatus fetching={query.isFetching && !query.isPending} error={data ? query.error : null} onRetry={() => void query.refetch()} />
      {query.isPending ? (
        <LoadingRows label="match history" />
      ) : query.isError && !data ? (
        <ErrorState label="match history" error={query.error} onRetry={() => void query.refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState>No battles recorded yet. Finish a battle to start your log.</EmptyState>
      ) : data ? (
        <table className="log-table" data-testid="history-table">
          <caption className="visually-hidden">Match history, page {data.page} of {data.totalPages}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Points</th>
              <th scope="col">Duration</th>
              <th scope="col">Result</th>
              <th scope="col" className="log-table__optional">
                Setup
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => (
              <tr key={entry.matchId} data-testid="history-row" data-match-id={entry.matchId}>
                <th scope="row">
                  {formatDay(entry.playedAt)} <span className="log-table__muted">· {formatTime(entry.playedAt)}</span>
                </th>
                <td className="log-table__points">{entry.score}</td>
                <td>{formatDuration(entry.durationMs)}</td>
                <td className={entry.endReason === 'defeated' ? 'log-table__defeated' : 'log-table__survived'}>{formatEndReason(entry.endReason)}</td>
                <td className="log-table__optional log-table__muted">
                  {entry.config.sessionTimeSeconds} s · {formatSpawn(entry.config.spawnIntervalSeconds)} s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {data ? <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} label="Match history" busy={query.isFetching} /> : null}
    </div>
  );
}
