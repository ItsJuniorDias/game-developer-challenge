import { useEffect, useRef, type PointerEvent } from 'react';
import type { InputState } from '../../game/input/inputState';

/** Stick deflection (0..1) below which the ship is not steered. */
const DEAD_ZONE = 0.18;
/** Knob travel as a fraction of the base width. */
const TRAVEL = 0.36;

interface JoystickProps {
  readonly input: InputState;
  readonly disabled: boolean;
}

/**
 * Touch joystick for steering: the ship turns towards the stick direction and
 * sails with thrust proportional to the deflection. It writes straight into
 * the InputState and moves its knob through the DOM, so dragging never causes
 * React renders. A finger kept down through a pause must be lifted before it
 * steers again (the input generation changes on every clear).
 */
export function Joystick({ input, disabled }: JoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef<{ pointerId: number; generation: number } | null>(null);

  const moveKnob = (x: number, y: number): void => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  };

  const release = (): void => {
    if (active.current) input.setSteering(null, 0);
    active.current = null;
    moveKnob(0, 0);
    if (baseRef.current) delete baseRef.current.dataset.active;
  };

  const steer = (clientX: number, clientY: number): void => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const max = rect.width * TRAVEL;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, max);
    const scale = distance > 0 ? clamped / distance : 0;
    moveKnob(dx * scale, dy * scale);
    const deflection = max > 0 ? clamped / max : 0;
    // Screen and world share orientation (uniform scale, y down), so the angle maps directly.
    if (deflection < DEAD_ZONE) input.setSteering(null, 0);
    else input.setSteering(Math.atan2(dy, dx), (deflection - DEAD_ZONE) / (1 - DEAD_ZONE));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled || active.current) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers cannot be captured; tracking by id still works.
    }
    active.current = { pointerId: event.pointerId, generation: input.generation };
    event.currentTarget.dataset.active = 'true';
    steer(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.generation !== input.generation) {
      // Input was cleared (pause/blur) while this finger was down: wait for a new touch.
      moveKnob(0, 0);
      return;
    }
    steer(event.clientX, event.clientY);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    if (active.current?.pointerId === event.pointerId) release();
  };

  useEffect(() => {
    if (disabled) release();
    // release only touches refs and the input; it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <div
      ref={baseRef}
      className="joystick"
      role="group"
      aria-label="Steering joystick: drag towards the direction to sail"
      data-testid="touch-joystick"
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={knobRef} className="joystick__knob" />
    </div>
  );
}
