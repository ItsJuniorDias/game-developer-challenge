import { describeError } from './describeError';
import { GameButton } from '../../ui/GameButton';

export function LoadingRows({ label }: { readonly label: string }) {
  return (
    <div className="log-state" role="status" data-testid="log-loading">
      <span className="spinner" aria-hidden="true" />
      <p>Loading {label}…</p>
    </div>
  );
}

export function ErrorState({ label, error, onRetry }: { readonly label: string; readonly error: unknown; readonly onRetry: () => void }) {
  return (
    <div className="log-state log-state--error" role="alert" data-testid="log-error">
      <p>
        Couldn’t load the {label}. {describeError(error)}
      </p>
      <GameButton variant="secondary" size="small" onClick={onRetry} data-testid="log-retry">
        Try again
      </GameButton>
    </div>
  );
}

export function EmptyState({ children }: { readonly children: string }) {
  return (
    <div className="log-state" role="status" data-testid="log-empty">
      <p>{children}</p>
    </div>
  );
}

export function RefreshStatus({ fetching, error, onRetry }: { readonly fetching: boolean; readonly error: unknown; readonly onRetry: () => void }) {
  if (fetching) {
    return (
      <p className="refresh-status" role="status" data-testid="log-updating">
        <span className="spinner spinner--small" aria-hidden="true" /> Updating…
      </p>
    );
  }
  if (error) {
    return (
      <p className="refresh-status refresh-status--error" role="alert" data-testid="log-stale">
        Showing saved results: {describeError(error)}{' '}
        <button type="button" className="link-button" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  }
  return null;
}
