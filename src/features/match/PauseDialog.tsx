import { useId, useRef, useState } from 'react';
import type { PauseReason } from '../../game/session/hudStore';
import { ControlsGuide } from '../../ui/ControlsGuide';
import { Dialog } from '../../ui/Dialog';
import { GameButton } from '../../ui/GameButton';
import { OptionsForm } from '../options/OptionsForm';

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  focus_lost: 'Paused because the game lost focus.',
  hidden: 'Paused while the tab was hidden.',
  orientation: 'Rotate your device to landscape to keep playing.',
};

interface PauseDialogProps {
  readonly open: boolean;
  readonly reason: PauseReason | null;
  readonly onResume: () => void;
  readonly onQuit: () => void;
}

export function PauseDialog({ open, reason, onResume, onQuit }: PauseDialogProps) {
  const titleId = useId();
  const textId = useId();
  const resumeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<'menu' | 'options' | 'controls'>('menu');
  const close = (): void => {
    setView('menu');
    onResume();
  };
  return (
    <Dialog
      open={open}
      onCancel={view === 'menu' ? close : () => setView('menu')}
      labelledBy={titleId}
      describedBy={textId}
      initialFocusRef={resumeRef}
      testId="pause-dialog"
    >
      <div
        onKeyDown={(event) => {
          if (event.code === 'KeyP' && view === 'menu') {
            event.preventDefault();
            close();
          }
        }}
      >
        <h2 id={titleId} className="dialog__title">
          {view === 'options' ? 'Options' : view === 'controls' ? 'Controls' : 'Paused'}
        </h2>
        {view === 'menu' ? (
          <>
            <p id={textId} className="dialog__text">
              {reason ? REASON_TEXT[reason] : REASON_TEXT.manual}
            </p>
            <div className="dialog__stack">
              <button ref={resumeRef} type="button" className="game-button game-button--primary game-button--large" onClick={close} data-testid="pause-resume">
                <span className="game-button__label">Resume</span>
              </button>
              <GameButton onClick={() => setView('options')} data-testid="pause-options">
                Options
              </GameButton>
              <GameButton variant="secondary" size="medium" onClick={() => setView('controls')}>
                Controls
              </GameButton>
              <GameButton sound="back" onClick={onQuit} data-testid="pause-main-menu" aria-describedby={`${textId}-quit`}>
                Main Menu
              </GameButton>
              <p id={`${textId}-quit`} className="dialog__hint">
                Leaving ends this battle without recording it.
              </p>
            </div>
          </>
        ) : view === 'options' ? (
          <>
            <p id={textId} className="dialog__text">
              The current battle keeps its settings.
            </p>
            <OptionsForm context="pause" />
            <GameButton size="medium" sound="back" onClick={() => setView('menu')}>
              Back
            </GameButton>
          </>
        ) : (
          <>
            <p id={textId} className="visually-hidden">
              Keyboard and touch controls.
            </p>
            <ControlsGuide headingId={`${titleId}-controls`} compact />
            <GameButton size="medium" sound="back" onClick={() => setView('menu')}>
              Back
            </GameButton>
          </>
        )}
      </div>
    </Dialog>
  );
}
