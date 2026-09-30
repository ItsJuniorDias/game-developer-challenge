import { useLastResult } from '../../api/lastResult';
import { navigate } from '../../app/router';
import { GameButton } from '../../ui/GameButton';
import { Panel } from '../../ui/Panel';
import { Screen } from '../../ui/Screen';
import { formatDuration, formatEndReason } from '../../ui/format';
import { SubmissionStatus } from './SubmissionStatus';

export function ResultScreen() {
  const last = useLastResult();
  if (!last) {
    return (
      <Screen title="Result">
        <Panel aria-labelledby="result-title" className="result-panel">
          <h1 id="result-title" className="panel-title" tabIndex={-1}>
            No battles yet
          </h1>
          <p className="panel-text">Finish a battle to see your result here.</p>
          <GameButton onClick={() => navigate({ name: 'play' })}>Play</GameButton>
          <GameButton sound="back" onClick={() => navigate({ name: 'menu' })}>
            Main Menu
          </GameButton>
        </Panel>
      </Screen>
    );
  }
  const { result } = last;
  const reason = formatEndReason(result.endReason);
  const stats = [
    { label: 'Enemies faced', value: result.stats.enemiesSpawned },
    { label: 'Shots fired', value: result.stats.shotsFired },
    { label: 'Damage taken', value: result.stats.damageTaken },
  ].filter((stat) => Number.isFinite(stat.value));
  return (
    <Screen title="Result">
      <Panel aria-labelledby="result-title" className="result-panel" data-testid="result-panel">
        <h1 id="result-title" className="panel-title" tabIndex={-1}>
          {result.endReason === 'defeated' ? 'Ship Sunk' : 'Battle Complete'}
        </h1>
        <p className="result-score" data-testid="result-score">
          {result.score}
        </p>
        <p className="result-summary" aria-hidden="true">
          Points · {formatDuration(result.durationMs)} · {reason}
        </p>
        <dl className="visually-hidden">
          <dt>Total score</dt>
          <dd>{result.score} points</dd>
          <dt>Time played</dt>
          <dd>{formatDuration(result.durationMs)}</dd>
          <dt>End reason</dt>
          <dd>{reason}</dd>
        </dl>
        {stats.length > 0 ? (
          <dl className="result-stats" data-testid="result-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="result-stats__item">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="result-meta" data-testid="result-meta">
          {result.config.sessionTimeSeconds} s battle · {result.config.spawnIntervalSeconds} s spawns · {last.playerName}
        </p>
        <SubmissionStatus matchId={result.matchId} saved={last.saved} />
        <div className="result-actions">
          <GameButton onClick={() => navigate({ name: 'play' })} data-testid="result-play-again">
            Play Again
          </GameButton>
          <GameButton sound="back" onClick={() => navigate({ name: 'menu' })} data-testid="result-main-menu">
            Main Menu
          </GameButton>
        </div>
      </Panel>
    </Screen>
  );
}
