import type { EndReason } from '../../game/sim/types';
import { GameButton } from '../../ui/GameButton';

export function LoadingOverlay({ progress }: { readonly progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="overlay" data-testid="loading-overlay">
      <div className="overlay__card" role="status" aria-live="polite">
        <h2 className="overlay__title">Preparing the fleet…</h2>
        <progress className="progress" max={100} value={percent} aria-label="Loading game assets">
          {percent}%
        </progress>
        <p className="overlay__text">{percent}% loaded</p>
      </div>
    </div>
  );
}

export function LoadErrorOverlay({ message, onRetry, onMenu }: { readonly message: string; readonly onRetry: () => void; readonly onMenu: () => void }) {
  return (
    <div className="overlay" data-testid="load-error">
      <div className="overlay__card" role="alert">
        <h2 className="overlay__title">The fleet could not set sail</h2>
        <p className="overlay__text">Some game assets failed to load. Check your connection and try again.</p>
        <p className="overlay__detail">{message}</p>
        <div className="overlay__actions">
          <GameButton size="medium" onClick={onRetry} data-testid="load-retry">
            Retry
          </GameButton>
          <GameButton size="medium" variant="secondary" sound="back" onClick={onMenu}>
            Main Menu
          </GameButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the battle ends. The button is deliberately not auto-focused: a
 * player still holding Space/Enter from combat must not skip it by accident.
 */
export function EndBanner({ reason, score, onContinue }: { readonly reason: EndReason | null; readonly score: number; readonly onContinue: () => void }) {
  return (
    <div className="overlay overlay--transparent" data-testid="end-banner">
      {/* Announced once by the battle's live region; not a second alert. */}
      <div className="overlay__card overlay__card--banner">
        <h2 className="overlay__title">{reason === 'defeated' ? 'Your ship sank!' : "Time's up!"}</h2>
        <p className="overlay__text">
          Final score: <strong>{score}</strong>
        </p>
        <GameButton size="medium" onClick={onContinue} data-testid="end-continue">
          See Results
        </GameButton>
      </div>
    </div>
  );
}

export function RotateHint() {
  return (
    <div className="overlay rotate-hint" data-testid="rotate-hint">
      <div className="overlay__card" role="alert">
        <h2 className="overlay__title">Rotate your device</h2>
        <p className="overlay__text">Pirate Battle is played in landscape. Turn your phone sideways, then resume.</p>
      </div>
    </div>
  );
}
