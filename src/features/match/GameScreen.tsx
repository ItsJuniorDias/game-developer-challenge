import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { recordFinishedMatch } from '../../api/matchSubmission';
import { navigate } from '../../app/router';
import { registerDebugSession, unregisterDebugSession } from '../../game/session/debugHooks';
import { GameSession } from '../../game/session/gameSession';
import type { HudState } from '../../game/session/hudStore';
import type { MatchResult } from '../../game/session/matchResult';
import { readTestConfig } from '../../game/session/testConfig';
import { getOptions } from '../../storage/settings';
import { Hud } from './Hud';
import { EndBanner, LoadErrorOverlay, LoadingOverlay, RotateHint } from './Overlays';
import { PauseDialog } from './PauseDialog';
import { TouchControls } from './TouchControls';
import { useAnnouncements } from './useAnnouncements';

const RESULT_DELAY_MS = 2200;
const PORTRAIT_TOUCH = '(orientation: portrait) and (pointer: coarse)';

const noopSubscribe = () => () => {};
const nullSnapshot = () => null;

function usePortraitTouch(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(PORTRAIT_TOUCH);
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
    () => window.matchMedia(PORTRAIT_TOUCH).matches,
  );
}

/**
 * Combat screen. React owns the layout, HUD and dialogs; the GameSession owns
 * the canvas, ticker and simulation. Mounting creates a fresh match, unmounting
 * (navigation, refresh, Strict Mode re-mount) disposes every resource.
 */
export function GameScreen() {
  const hostRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const endTimer = useRef<number | null>(null);
  const portrait = usePortraitTouch();

  const goToResults = useCallback(() => {
    if (endTimer.current !== null) window.clearTimeout(endTimer.current);
    endTimer.current = null;
    navigate({ name: 'result' }, { replace: true });
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const options = getOptions();
    const created = new GameSession({
      host,
      options: { sessionTimeSeconds: options.sessionTimeSeconds, spawnIntervalSeconds: options.spawnIntervalSeconds },
      soundEnabled: options.soundEnabled,
      test: readTestConfig(),
      onEnd: (result: MatchResult) => {
        recordFinishedMatch(result);
        // With a manual (test) clock the player must press "See Results".
        if (created.clockMode === 'realtime') endTimer.current = window.setTimeout(goToResults, RESULT_DELAY_MS);
      },
    });
    registerDebugSession(created);
    // Like every other screen, move focus to the heading of the battle screen.
    headingRef.current?.focus({ preventScroll: true });
    setSession(created);
    void created.start();
    document.title = 'Battle · Pirate Battle';
    return () => {
      if (endTimer.current !== null) window.clearTimeout(endTimer.current);
      endTimer.current = null;
      unregisterDebugSession(created);
      created.destroy();
    };
  }, [goToResults]);

  const hud = useSyncExternalStore<HudState | null>(
    session ? session.store.subscribe : noopSubscribe,
    session ? session.store.getSnapshot : nullSnapshot,
  );
  const announcement = useAnnouncements(hud);
  const hudVisible = hud !== null && hud.phase !== 'loading' && hud.phase !== 'error';

  // Keep the arena below the HUD band so no ship or health bar hides under it.
  useEffect(() => {
    const screen = screenRef.current;
    if (!session || !screen || !hudVisible) return;
    const hudElement = screen.querySelector<HTMLElement>('[data-testid="hud"]');
    if (!hudElement) return;
    const update = (): void => {
      const top = Math.ceil(hudElement.getBoundingClientRect().bottom - screen.getBoundingClientRect().top + 4);
      session.setViewportInsets({ top: Math.max(0, top), right: 0, bottom: 0, left: 0 });
    };
    const observer = new ResizeObserver(update);
    observer.observe(screen);
    observer.observe(hudElement);
    update();
    return () => observer.disconnect();
  }, [session, hudVisible]);

  useEffect(() => {
    if (portrait && session) session.pause('orientation');
  }, [portrait, session, hud?.phase]);

  const quit = useCallback(() => navigate({ name: 'menu' }), []);

  return (
    <div ref={screenRef} className="game-screen" data-testid="game-screen" data-phase={hud?.phase ?? 'loading'}>
      <h1 ref={headingRef} className="visually-hidden" tabIndex={-1}>
        Battle
      </h1>
      <div ref={hostRef} className="game-canvas-host" />
      {session && hud ? (
        <>
          {hud.phase !== 'loading' && hud.phase !== 'error' ? (
            <>
              <Hud hud={hud} onPause={() => session.pause('manual')} />
              <TouchControls input={session.input} hud={hud} />
            </>
          ) : null}
          {hud.phase === 'loading' ? <LoadingOverlay progress={hud.loadProgress} /> : null}
          {hud.phase === 'error' ? <LoadErrorOverlay message={hud.loadError ?? 'Unknown error'} onRetry={() => void session.retry()} onMenu={quit} /> : null}
          {hud.phase === 'ended' ? <EndBanner reason={hud.endReason} score={hud.score} onContinue={goToResults} /> : null}
          <PauseDialog open={hud.phase === 'paused' && !portrait} reason={hud.pauseReason} onResume={() => session.resume()} onQuit={quit} />
        </>
      ) : (
        <LoadingOverlay progress={0} />
      )}
      {portrait && hud?.phase !== 'ended' ? <RotateHint /> : null}
      <p className="visually-hidden" aria-live="polite" data-testid="announcer">
        {announcement}
      </p>
    </div>
  );
}
