import shipUrl from '../../../assets/png/default/ships/ship_2.png?url';
import { navigate } from '../../app/router';
import { ControlsGuide } from '../../ui/ControlsGuide';
import { GameButton } from '../../ui/GameButton';
import { Panel } from '../../ui/Panel';
import { Screen } from '../../ui/Screen';
import { uiSprite } from '../../ui/assets';
import { NetworkLabButton } from '../network/NetworkLab';
import { PendingBanner } from './PendingBanner';

export function MainMenu() {
  const title = uiSprite('menu', 'title_pirate_battle');
  return (
    <Screen title="Main menu" footer={<NetworkLabButton />}>
      <div className="menu-layout">
        <Panel aria-labelledby="menu-title" className="menu-panel">
          <h1 id="menu-title" className="menu-title" tabIndex={-1}>
            <img src={title.src} srcSet={title.srcSet} alt="Pirate Battle" width={384} height={128} />
          </h1>
          <p className="menu-tagline">Set sail. Take command.</p>
          <nav className="menu-actions" aria-label="Game">
            <GameButton data-testid="menu-play" onClick={() => navigate({ name: 'play' })}>
              Play
            </GameButton>
            <GameButton data-testid="menu-options" onClick={() => navigate({ name: 'options' })}>
              Options
            </GameButton>
          </nav>
          <img className="menu-ship" src={shipUrl} alt="" aria-hidden="true" width={33} height={56} />
          <p className="menu-subtitle">Navigate the islands. Survive the battle.</p>
          <nav className="menu-log" aria-label="Captain's log">
            <GameButton variant="secondary" size="small" data-testid="menu-ranking" onClick={() => navigate({ name: 'log', tab: 'ranking' })}>
              Ranking
            </GameButton>
            <GameButton variant="secondary" size="small" data-testid="menu-history" onClick={() => navigate({ name: 'log', tab: 'history' })}>
              Match History
            </GameButton>
          </nav>
          <PendingBanner />
        </Panel>
        <Panel className="controls-panel" aria-label="How to play">
          <ControlsGuide headingId="menu-controls" />
        </Panel>
      </div>
    </Screen>
  );
}
