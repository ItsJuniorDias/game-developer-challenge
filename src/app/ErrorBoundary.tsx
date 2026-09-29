import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  readonly failed: boolean;
}

/**
 * Last line of defence: an unexpected render error shows a recovery screen
 * instead of unmounting the whole app.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] Unexpected error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen">
        <main className="screen__main">
          <section className="overlay__card" role="alert">
            <h1 className="overlay__title">Something went wrong</h1>
            <p className="overlay__text">The page hit an unexpected error. Your options and recorded battles are safe.</p>
            <button
              type="button"
              className="game-button game-button--primary game-button--medium"
              onClick={() => {
                window.location.hash = '#/';
                window.location.reload();
              }}
            >
              <span className="game-button__label">Reload</span>
            </button>
          </section>
        </main>
      </div>
    );
  }
}
