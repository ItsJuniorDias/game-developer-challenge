import { useRef, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react';
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
  /** Reload time shown as a clockwise sweep while `cooling`. */
  readonly cooldownSeconds?: number;
  /** Changes with every shot, so held fire restarts the sweep for each reload. */
  readonly reload?: number;
}

/** Seconds each weapon takes to reload (from the match configuration). */
export interface WeaponCooldowns {
  readonly front: number;
  readonly broadside: number;
}

/**
 * Multi-touch button: each pointer is tracked separately so the player can
 * steer and fire with different fingers at the same time.
 */
function PadButton({ action, icon, input, disabled, cooling, cooldownSeconds, reload }: PadButtonProps) {
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
      {cooling && cooldownSeconds ? (
        // Re-keyed on every shot, so each reload sweeps from zero (also while fire is held).
        <span key={reload} className="pad-button__cooldown" style={{ '--cooldown': `${cooldownSeconds}s` } as CSSProperties} aria-hidden="true" />
      ) : null}
      <span className="pad-button__key" aria-hidden="true">
        {KEY_HINTS[action].split(' / ')[0]}
      </span>
    </button>
  );
}

interface TouchControlsProps {
  readonly input: InputState;
  readonly hud: HudState;
  readonly cooldowns: WeaponCooldowns;
}

export function TouchControls({ input, hud, cooldowns }: TouchControlsProps) {
  const disabled = hud.phase !== 'running';
  const touchFirst = useCoarsePointer();
  return (
    <div
      className={['touch-controls', touchFirst ? 'touch-controls--touch' : ''].join(' ')}
      data-testid="touch-controls"
      data-paused={hud.phase === 'paused' || undefined}
    >
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
        <PadButton action="fireLeft" icon="fire_left" input={input} disabled={disabled} cooling={!hud.weaponsReady.left} cooldownSeconds={cooldowns.broadside} reload={hud.reloads.left} />
        <PadButton action="fireFront" icon="fire_front" input={input} disabled={disabled} cooling={!hud.weaponsReady.front} cooldownSeconds={cooldowns.front} reload={hud.reloads.front} />
        <PadButton action="fireRight" icon="fire_right" input={input} disabled={disabled} cooling={!hud.weaponsReady.right} cooldownSeconds={cooldowns.broadside} reload={hud.reloads.right} />
      </div>
    </div>
  );
}
