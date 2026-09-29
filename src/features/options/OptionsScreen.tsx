import { navigate } from '../../app/router';
import { GameButton } from '../../ui/GameButton';
import { Panel } from '../../ui/Panel';
import { Screen } from '../../ui/Screen';
import { OptionsForm } from './OptionsForm';

export function OptionsScreen() {
  return (
    <Screen title="Options">
      <Panel aria-labelledby="options-title" className="options-panel">
        <h1 id="options-title" className="panel-title" tabIndex={-1}>
          Options
        </h1>
        <OptionsForm context="menu" />
        <GameButton size="medium" sound="back" onClick={() => navigate({ name: 'menu' })}>
          Main Menu
        </GameButton>
      </Panel>
    </Screen>
  );
}
