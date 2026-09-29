import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { pendingMatches } from '../../api/pendingMatches';
import { lastResult } from '../../api/lastResult';
import { mockDb } from '../../mocks/db';
import { resetMockRuntime } from '../../mocks/handlers';
import { DEFAULT_SCENARIO, getScenario, SCENARIOS, setScenario, type ScenarioId } from '../../mocks/scenarios';
import { Dialog } from '../../ui/Dialog';
import { GameButton } from '../../ui/GameButton';

/**
 * Demo/test panel to pick an MSW network scenario and restore the initial
 * state. Available in the published build because the API is simulated.
 */
export function NetworkLabButton() {
  const [open, setOpen] = useState(false);
  const [scenario, setLocalScenario] = useState<ScenarioId>(getScenario());
  const [status, setStatus] = useState('');
  const client = useQueryClient();
  const titleId = useId();

  const choose = (id: ScenarioId): void => {
    setScenario(id);
    setLocalScenario(id);
    setStatus(`Scenario set to “${SCENARIOS.find((s) => s.id === id)?.label ?? id}”.`);
    void client.invalidateQueries();
  };

  const resetAll = (): void => {
    setScenario(DEFAULT_SCENARIO);
    setLocalScenario(DEFAULT_SCENARIO);
    mockDb.reset();
    resetMockRuntime();
    pendingMatches.clear();
    lastResult.clear();
    client.clear();
    setStatus('Mock data, scenario and pending records restored to the initial state.');
  };

  return (
    <>
      <button type="button" className="link-button" data-testid="network-lab-open" onClick={() => setOpen(true)}>
        Network lab · <span data-testid="network-lab-current">{SCENARIOS.find((s) => s.id === scenario)?.label}</span>
      </button>
      <Dialog open={open} onCancel={() => setOpen(false)} labelledBy={titleId} testId="network-lab" className="dialog--wide">
        <h2 id={titleId} className="dialog__title">
          Network lab
        </h2>
        <p className="dialog__text">Simulate ranking and history API conditions (Mock Service Worker). Gameplay is never affected.</p>
        <fieldset className="scenario-list">
          <legend>Scenario</legend>
          {SCENARIOS.map((s) => (
            <div key={s.id} className="scenario-option">
              <input
                type="radio"
                id={`${titleId}-${s.id}`}
                name="scenario"
                value={s.id}
                checked={scenario === s.id}
                aria-describedby={`${titleId}-${s.id}-desc`}
                onChange={() => choose(s.id)}
              />
              <label htmlFor={`${titleId}-${s.id}`} className="scenario-option__label">
                {s.label}
              </label>
              <span id={`${titleId}-${s.id}-desc`} className="scenario-option__desc">
                {s.description}
              </span>
            </div>
          ))}
        </fieldset>
        <p className="dialog__status" role="status" aria-live="polite">
          {status}
        </p>
        <div className="dialog__actions">
          <GameButton variant="secondary" size="small" onClick={resetAll} data-testid="network-lab-reset">
            Reset to initial state
          </GameButton>
          <GameButton size="small" sound="back" onClick={() => setOpen(false)}>
            Close
          </GameButton>
        </div>
      </Dialog>
    </>
  );
}
