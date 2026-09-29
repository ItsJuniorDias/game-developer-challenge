import { useRef, type KeyboardEvent } from 'react';
import { navigate } from '../../app/router';
import { GameButton } from '../../ui/GameButton';
import { Panel } from '../../ui/Panel';
import { Screen } from '../../ui/Screen';
import { HistoryPanel } from './HistoryPanel';
import { RankingPanel } from './RankingPanel';

type Tab = 'ranking' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

/** Ranking and Match History tabs (WAI-ARIA tabs pattern, URL-addressable). */
export function CaptainsLog({ tab }: { readonly tab: Tab }) {
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const select = (next: Tab, focus = false): void => {
    navigate({ name: 'log', tab: next }, { replace: true });
    if (focus) tabRefs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = TABS[next];
    if (target) select(target.id, true);
  };

  return (
    <Screen title={tab === 'ranking' ? 'Ranking' : 'Match History'}>
      <Panel wide aria-labelledby="log-title" className="log-board">
        <h1 id="log-title" className="panel-title" tabIndex={-1}>
          Captain’s Log
        </h1>
        <div className="tabs" role="tablist" aria-label="Captain's log sections" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={['game-button', 'game-button--small', tab === t.id ? 'game-button--primary' : 'game-button--secondary'].join(' ')}
              onClick={() => select(t.id)}
              data-testid={`tab-${t.id}`}
            >
              <span className="game-button__label">{t.label}</span>
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-panel" tabIndex={0}>
          {tab === 'ranking' ? <RankingPanel /> : <HistoryPanel />}
        </div>
        <GameButton size="medium" sound="back" onClick={() => navigate({ name: 'menu' })}>
          Main Menu
        </GameButton>
      </Panel>
    </Screen>
  );
}
