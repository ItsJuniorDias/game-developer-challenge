import { useId, useState } from 'react';
import shipUrl from '../../../assets/png/default/ships/ship_2.png?url';
import { navigate } from '../../app/router';
import { ControlsGuide } from '../../ui/ControlsGuide';
import { Dialog } from '../../ui/Dialog';
import { GameButton } from '../../ui/GameButton';
import { Panel } from '../../ui/Panel';
import { Screen } from '../../ui/Screen';
import { uiSprite } from '../../ui/assets';
import { NetworkLabButton } from '../network/NetworkLab';
import { PendingBanner } from './PendingBanner';

export function MainMenu() {
  const title = uiSprite('menu', 'title_pirate_battle');
  const [howToOpen, setHowToOpen] = useState(false);
  const howToTitle = useId();
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
          {/* Short screens (landscape phones) hide the side panel: the same guide opens in a dialog. */}
          <GameButton variant="secondary" size="small" className="menu-howto" data-testid="menu-howto" onClick={() => setHowToOpen(true)}>
            How to Play
          </GameButton>
          <PendingBanner />
        </Panel>
        <Panel className="controls-panel" aria-label="How to play">
          <ControlsGuide headingId="menu-controls" />
        </Panel>
      </div>
      <Dialog open={howToOpen} onCancel={() => setHowToOpen(false)} labelledBy={howToTitle} testId="howto-dialog">
        <h2 id={howToTitle} className="dialog__title">
          How to Play
        </h2>
        <ControlsGuide headingId={`${howToTitle}-controls`} compact />
        <div className="dialog__actions">
          <GameButton size="small" sound="back" onClick={() => setHowToOpen(false)}>
            Close
          </GameButton>
        </div>
      </Dialog>
    </Screen>
  );
}
