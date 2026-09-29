import { useId, useState } from 'react';
import { useRankingQuery } from '../../api/queries';
import type { MatchConfigDto } from '../../api/contracts';
import { OPTION_LIMITS } from '../../game/config/gameConfig';
import { useOptions, useProfile } from '../../storage/settings';
import { Icon } from '../../ui/Icon';
import { formatDay, formatSpawn, formatTime } from '../../ui/format';
import { Pagination } from './Pagination';
import { EmptyState, ErrorState, LoadingRows, RefreshStatus } from './QueryStates';

function range(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) values.push(Number(v.toFixed(2)));
  return values;
}

const SESSION_CHOICES = range(OPTION_LIMITS.sessionTimeSeconds.min, OPTION_LIMITS.sessionTimeSeconds.max, 10);
const SPAWN_CHOICES = range(OPTION_LIMITS.spawnIntervalSeconds.min, OPTION_LIMITS.spawnIntervalSeconds.max, 0.5);

function isValidSessionTime(value: number): boolean {
  return Number.isInteger(value) && value >= OPTION_LIMITS.sessionTimeSeconds.min && value <= OPTION_LIMITS.sessionTimeSeconds.max;
}

/** Common presets plus any other valid value in use (e.g. a 95 s option), so every ranking stays reachable. */
function withValues(base: readonly number[], ...extra: number[]): number[] {
  return [...new Set([...base, ...extra])].sort((a, b) => a - b);
}

export function RankingPanel() {
  const options = useOptions();
  const profile = useProfile();
  const id = useId();
  const [config, setConfig] = useState<MatchConfigDto>({
    sessionTimeSeconds: options.sessionTimeSeconds,
    spawnIntervalSeconds: options.spawnIntervalSeconds,
  });
  const [page, setPage] = useState(1);
  const [sessionDraft, setSessionDraft] = useState(String(options.sessionTimeSeconds));
  const sessionDraftValid = isValidSessionTime(Number(sessionDraft));
  const query = useRankingQuery(config, page);
  const data = query.data;
  // Remember the page count so a failed page can still be left through pagination.
  const [knownPages, setKnownPages] = useState(1);
  if (data && data.totalPages !== knownPages) setKnownPages(data.totalPages);
  const totalPages = data?.totalPages ?? knownPages;
  const sessionChoices = withValues(SESSION_CHOICES, options.sessionTimeSeconds, config.sessionTimeSeconds);
  const spawnChoices = withValues(SPAWN_CHOICES, options.spawnIntervalSeconds, config.spawnIntervalSeconds);
  const updateConfig = (patch: Partial<MatchConfigDto>): void => {
    setConfig((c) => ({ ...c, ...patch }));
    setPage(1);
    setKnownPages(1);
  };

  return (
    <div className="log-panel">
      <div className="log-filters">
        <label htmlFor={`${id}-session`}>Battle length</label>
        {/* Any valid session time (60-180 s) can be typed; common values are suggested. */}
        <input
          id={`${id}-session`}
          className="log-filters__number"
          type="number"
          inputMode="numeric"
          min={OPTION_LIMITS.sessionTimeSeconds.min}
          max={OPTION_LIMITS.sessionTimeSeconds.max}
          step={1}
          list={`${id}-session-presets`}
          value={sessionDraft}
          aria-invalid={sessionDraftValid ? undefined : true}
          onChange={(e) => {
            setSessionDraft(e.target.value);
            const value = Number(e.target.value);
            if (isValidSessionTime(value)) updateConfig({ sessionTimeSeconds: value });
          }}
        />
        <datalist id={`${id}-session-presets`}>
          {sessionChoices.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <label htmlFor={`${id}-spawn`}>Spawn interval</label>
        <select id={`${id}-spawn`} value={config.spawnIntervalSeconds} onChange={(e) => updateConfig({ spawnIntervalSeconds: Number(e.target.value) })}>
          {spawnChoices.map((v) => (
            <option key={v} value={v}>
              {formatSpawn(v)} s
            </option>
          ))}
        </select>
      </div>
      <p className="log-subtitle" data-testid="ranking-config">
        {config.sessionTimeSeconds} second battles · {formatSpawn(config.spawnIntervalSeconds)} second spawn interval
        {sessionDraftValid ? null : <span className="field-error"> · Battle length must be 60–180 whole seconds</span>}
      </p>
      <RefreshStatus fetching={query.isFetching && !query.isPending} error={data ? query.error : null} onRetry={() => void query.refetch()} />
      {query.isPending ? (
        <LoadingRows label="ranking" />
      ) : query.isError && !data ? (
        <ErrorState label="ranking" error={query.error} onRetry={() => void query.refetch()} />
      ) : data && data.items.length === 0 ? (
        <EmptyState>No battles recorded with this setup yet. Be the first captain on the board!</EmptyState>
      ) : data ? (
        <table className="log-table" data-testid="ranking-table">
          <caption className="visually-hidden">Ranking, page {data.page} of {data.totalPages}</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Captain</th>
              <th scope="col">Points</th>
              <th scope="col" className="log-table__optional">
                Played
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => {
              const mine = entry.playerId === profile.playerId;
              return (
                <tr key={entry.matchId} className={mine ? 'is-mine' : undefined} data-testid="ranking-row" data-match-id={entry.matchId}>
                  <td className="log-table__rank">{String(entry.rank).padStart(2, '0')}</td>
                  <th scope="row" className="log-table__captain">
                    {entry.rank === 1 ? <Icon name="score" size={20} /> : null}
                    {entry.playerName}
                    {mine ? <span className="badge">You</span> : null}
                  </th>
                  <td className="log-table__points">{entry.score}</td>
                  <td className="log-table__optional log-table__muted">
                    {formatDay(entry.playedAt)} · {formatTime(entry.playedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {data || page > 1 ? <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} label="Ranking" busy={query.isFetching} /> : null}
    </div>
  );
}
