import { useRef, useSyncExternalStore, type PointerEvent } from 'react';
import { KEY_HINTS, ACTION_LABELS, type GameAction } from '../../game/input/bindings';
import type { InputState } from '../../game/input/inputState';
import type { HudState } from '../../game/session/hudStore';
import type { IconName } from '../../ui/assets';
import { Icon } from '../../ui/Icon';
import { Joystick } from './Joystick';

const COARSE_POINTER = '(pointer: coarse)';

/** True on touch-first devices (phones, tablets): movement uses the joystick there. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(COARSE_POINTER);
      query.addEventListener('change', listener);
      return () => query.removeEventListener('change', listener);
    },
    () => window.matchMedia(COARSE_POINTER).matches,
  );
}

interface PadButtonProps {
  readonly action: GameAction;
  readonly icon: IconName;
  readonly input: InputState;
  readonly disabled: boolean;
  readonly cooling?: boolean;
}

/**
 * Multi-touch button: each pointer is tracked separately so the player can
 * steer and fire with different fingers at the same time.
 */
function PadButton({ action, icon, input, disabled, cooling }: PadButtonProps) {
  const pointers = useRef(new Set<number>());
  const down = (event: PointerEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; tracking by id still works.
    }
    pointers.current.add(event.pointerId);
    input.press(action, `touch:${event.pointerId}`);
    event.currentTarget.dataset.active = 'true';
  };
  const up = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!pointers.current.delete(event.pointerId)) return;
    input.release(action, `touch:${event.pointerId}`);
    if (pointers.current.size === 0) delete event.currentTarget.dataset.active;
  };
  return (
    <button
      type="button"
      tabIndex={-1}
      className={['pad-button', cooling ? 'pad-button--cooling' : ''].join(' ')}
      aria-label={ACTION_LABELS[action]}
      data-testid={`touch-${action}`}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Icon name={icon} size={30} />
      <span className="pad-button__key" aria-hidden="true">
        {KEY_HINTS[action].split(' / ')[0]}
      </span>
    </button>
  );
}

export function TouchControls({ input, hud }: { readonly input: InputState; readonly hud: HudState }) {
  const disabled = hud.phase !== 'running';
  const touchFirst = useCoarsePointer();
  return (
    <div className={['touch-controls', touchFirst ? 'touch-controls--touch' : ''].join(' ')} data-testid="touch-controls">
      {touchFirst ? (
        <Joystick input={input} disabled={disabled} />
      ) : (
        <div className="touch-controls__cluster touch-controls__cluster--move" role="group" aria-label="Steering">
          <PadButton action="turnLeft" icon="turn_left" input={input} disabled={disabled} />
          <PadButton action="forward" icon="forward" input={input} disabled={disabled} />
          <PadButton action="turnRight" icon="turn_right" input={input} disabled={disabled} />
        </div>
      )}
      <div className="touch-controls__cluster touch-controls__cluster--fire" role="group" aria-label="Cannons">
        <PadButton action="fireLeft" icon="fire_left" input={input} disabled={disabled} cooling={!hud.weaponsReady.left} />
        <PadButton action="fireFront" icon="fire_front" input={input} disabled={disabled} cooling={!hud.weaponsReady.front} />
        <PadButton action="fireRight" icon="fire_right" input={input} disabled={disabled} cooling={!hud.weaponsReady.right} />
      </div>
    </div>
  );
}
