import type { HudState } from '../../game/session/hudStore';
import { Icon } from '../../ui/Icon';
import { RoundButton } from '../../ui/RoundButton';
import { uiSprite } from '../../ui/assets';
import { formatClock } from '../../ui/format';

function healthFill(ratio: number): string {
  if (ratio > 0.6) return 'health_fill_green';
  if (ratio > 0.3) return 'health_fill_amber';
  return 'health_fill_red';
}

/**
 * Semantic HUD (React DOM): health, score and time left. It only re-renders
 * when one of those values changes, never per animation frame.
 */
export function Hud({ hud, onPause }: { readonly hud: HudState; readonly onPause: () => void }) {
  const ratio = hud.maxHealth > 0 ? hud.health / hud.maxHealth : 0;
  const frame = uiSprite('hud', 'health_frame');
  const fill = uiSprite('hud', healthFill(ratio));
  const lowTime = hud.timeLeft <= 10;
  const lowHealth = hud.health > 0 && ratio <= 0.3;
  const fillWidth = `${(30 + 196 * ratio) / 2.56}%`;
  return (
    <section className="hud" aria-label="Battle status" data-testid="hud">
      <div className="hud__health">
        <Icon name="heart" size={34} className={['hud__heart', lowHealth ? 'hud__heart--low' : ''].join(' ')} />
        <div
          className="health-bar"
          role="meter"
          aria-label="Hull health"
          aria-valuemin={0}
          aria-valuemax={hud.maxHealth}
          aria-valuenow={hud.health}
          aria-valuetext={`${hud.health} of ${hud.maxHealth}`}
          data-testid="hud-health"
        >
          <img className="health-bar__frame" src={frame.src} srcSet={frame.srcSet} alt="" />
          {/* Lags behind the real fill so each hit leaves a brief light trace. */}
          <div className="health-bar__clip health-bar__clip--ghost" style={{ width: fillWidth }}>
            <img className="health-bar__fill" src={fill.src} srcSet={fill.srcSet} alt="" />
          </div>
          <div className="health-bar__clip" style={{ width: fillWidth }}>
            <img className="health-bar__fill" src={fill.src} srcSet={fill.srcSet} alt="" />
          </div>
          <span className="health-bar__text" aria-hidden="true">
            {hud.health} / {hud.maxHealth}
          </span>
        </div>
      </div>
      <div className="hud__right">
        <p className="counter" data-testid="hud-score">
          <Icon name="score" size={28} />
          <span className="visually-hidden">Score: </span>
          {/* Re-keyed on every point so the pop animation replays. */}
          <span key={hud.score} className={['counter__value', hud.score > 0 ? 'counter__value--pop' : ''].join(' ')}>
            {hud.score}
          </span>
        </p>
        <p className={['counter', lowTime ? 'counter--warning' : ''].join(' ')} data-testid="hud-time">
          <Icon name="time" size={28} />
          <span className="visually-hidden">Time left: </span>
          <span className="counter__value">{formatClock(hud.timeLeft)}</span>
        </p>
        <RoundButton icon="pause" label="Pause (P)" size={50} onClick={onPause} disabled={hud.phase !== 'running'} data-testid="hud-pause" />
      </div>
    </section>
  );
}
