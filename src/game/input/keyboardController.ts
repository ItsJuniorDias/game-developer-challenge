import { actionForCode, PAUSE_KEYS } from './bindings';
import type { InputState } from './inputState';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Captures gameplay keys on the window only while enabled (match running,
 * no dialog open). Auto-repeat events are ignored so keys held through a pause
 * never re-trigger movement or fire until they are pressed again.
 */
export class KeyboardController {
  private enabled = false;
  private attached = false;
  private readonly input: InputState;
  private readonly onPause: () => void;

  constructor(input: InputState, onPause: () => void) {
    this.input = input;
    this.onPause = onPause;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.input.releaseSource('key:');
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.defaultPrevented || isEditableTarget(event.target)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.onPause();
      return;
    }
    const action = actionForCode(event.code);
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    this.input.press(action, `key:${event.code}`);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = actionForCode(event.code);
    if (!action) return;
    if (this.enabled) event.preventDefault();
    this.input.release(action, `key:${event.code}`);
  };
}
