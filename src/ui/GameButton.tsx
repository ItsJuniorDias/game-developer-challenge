import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { sounds } from '../game/audio/soundManager';

type Variant = 'primary' | 'secondary';

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: 'large' | 'medium' | 'small';
  readonly children: ReactNode;
  readonly sound?: 'click' | 'back' | 'none';
  /**
   * Looks and announces as disabled but stays focusable (aria-disabled), for
   * buttons that become unavailable right after being used (e.g. Save).
   */
  readonly unavailable?: boolean;
}

/** Wooden plaque button using the menu sprites (9-slice via border-image). */
export function GameButton({ variant = 'primary', size = 'large', sound = 'click', unavailable = false, className, onClick, children, type = 'button', ...rest }: GameButtonProps) {
  return (
    <button
      type={type}
      className={['game-button', `game-button--${variant}`, `game-button--${size}`, className].filter(Boolean).join(' ')}
      aria-disabled={unavailable || undefined}
      onPointerEnter={(event) => {
        // A soft tick for mouse hover only; never unlocks audio on its own.
        if (event.pointerType === 'mouse' && !unavailable && !rest.disabled) sounds.play('ui_hover', { volume: 0.18, ifUnlocked: true });
      }}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        if (sound !== 'none') {
          sounds.unlock();
          sounds.play(sound === 'back' ? 'ui_back' : 'ui_click', { volume: 0.5 });
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <span className="game-button__label">{children}</span>
    </button>
  );
}
