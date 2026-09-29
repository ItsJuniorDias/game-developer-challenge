import { ACTION_LABELS, GAME_ACTIONS, KEY_HINTS } from '../game/input/bindings';

/** Keyboard and touch control reference shown on the main menu and pause dialog. */
export function ControlsGuide({ headingId, compact = false }: { readonly headingId: string; readonly compact?: boolean }) {
  return (
    <section className={['controls-guide', compact ? 'controls-guide--compact' : ''].join(' ')} aria-labelledby={headingId}>
      <h2 id={headingId} className="controls-guide__title">
        Controls
      </h2>
      <dl className="controls-guide__list">
        {GAME_ACTIONS.map((action) => (
          <div key={action} className="controls-guide__row">
            <dt>{ACTION_LABELS[action]}</dt>
            <dd>
              <kbd>{KEY_HINTS[action]}</kbd>
            </dd>
          </div>
        ))}
        <div className="controls-guide__row">
          <dt>Pause</dt>
          <dd>
            <kbd>P / Esc</kbd>
          </dd>
        </div>
      </dl>
      <p className="controls-guide__touch">
        On touch screens, drag the joystick (bottom left) towards where you want to sail and use the cannon buttons (bottom right). Steering and firing work at the
        same time.
      </p>
    </section>
  );
}
