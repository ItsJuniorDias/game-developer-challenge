import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { LoadErrorOverlay, LoadingOverlay } from '../features/match/Overlays';
import { focusTracker } from '../game/session/focusTracker';
import { navigate } from './router';

// The combat screen (PixiJS, simulation, renderer) is a separate chunk: menus
// load without downloading the game engine, which is fetched when Play is pressed.
function loadGameScreen() {
  return lazy(() => import('../features/match/GameScreen').then((module) => ({ default: module.GameScreen })));
}

function Fallback() {
  return (
    <div className="game-screen" data-testid="game-route-loading">
      <LoadingOverlay progress={0} />
    </div>
  );
}

interface BoundaryProps {
  readonly children: ReactNode;
  readonly onRetry: () => void;
}

/** A failed chunk download keeps the in-game Retry / Main Menu flow instead of crashing the app. */
class ChunkErrorBoundary extends Component<BoundaryProps, { failed: boolean; message: string }> {
  override state = { failed: false, message: '' };

  static getDerivedStateFromError(error: unknown): { failed: boolean; message: string } {
    return { failed: true, message: error instanceof Error ? error.message : 'Failed to load the game.' };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="game-screen" data-testid="game-route-error">
        <LoadErrorOverlay message={this.state.message} onRetry={this.props.onRetry} onMenu={() => navigate({ name: 'menu' })} />
      </div>
    );
  }
}

export function GameRoute() {
  const [attempt, setAttempt] = useState(0);
  // A new lazy component per attempt: React.lazy caches a rejected import otherwise.
  const [GameScreen, setGameScreen] = useState(loadGameScreen);

  useEffect(() => {
    focusTracker.arm();
  }, []);

  const retry = (): void => {
    setGameScreen(loadGameScreen);
    setAttempt((value) => value + 1);
  };

  return (
    <ChunkErrorBoundary key={attempt} onRetry={retry}>
      <Suspense fallback={<Fallback />}>
        <GameScreen />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
