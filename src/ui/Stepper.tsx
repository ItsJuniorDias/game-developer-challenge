import { useId } from 'react';
import { RoundButton } from './RoundButton';

interface StepperProps {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly error: string | null;
  readonly hint: string;
  readonly onChange: (value: string) => void;
  readonly testId: string;
}

/** Numeric field with −/+ buttons, inline validation and an accessible error. */
export function Stepper({ label, value, unit, min, max, step, error, hint, onChange, testId }: StepperProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const numeric = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(numeric);
  const nudge = (direction: 1 | -1): void => {
    const base = valid ? numeric : min;
    const next = Math.min(max, Math.max(min, Math.round((base + direction * step) / step) * step));
    onChange(String(Number(next.toFixed(2))));
  };
  return (
    <div className="stepper" data-testid={testId}>
      <label className="stepper__label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper__row">
        <RoundButton icon="minus" label={`Decrease ${label.toLowerCase()}`} onClick={() => nudge(-1)} unavailable={valid && numeric <= min} />
        <div className="stepper__field">
          <input
            id={id}
            className="stepper__input"
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="stepper__unit" aria-hidden="true">
            {unit}
          </span>
        </div>
        <RoundButton icon="plus" label={`Increase ${label.toLowerCase()}`} onClick={() => nudge(1)} unavailable={valid && numeric >= max} />
      </div>
      <p id={hintId} className="stepper__hint">
        {hint}
      </p>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
