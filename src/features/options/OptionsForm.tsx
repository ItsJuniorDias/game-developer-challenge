import { useId, useState, type FormEvent } from 'react';
import { OPTION_LIMITS } from '../../game/config/gameConfig';
import { sounds } from '../../game/audio/soundManager';
import { DEFAULTS, saveOptions, saveProfileName, useOptions, useProfile, validatePlayerName } from '../../storage/settings';
import { GameButton } from '../../ui/GameButton';
import { Stepper } from '../../ui/Stepper';
import { validateOption } from './optionsValidation';

interface OptionsFormProps {
  readonly context: 'menu' | 'pause';
}

/**
 * Game session time, enemy spawn time, captain name and sound. Values are
 * validated inline and persisted to localStorage on Save; a running match is
 * never affected (each match snapshots the options when it starts).
 */
export function OptionsForm({ context }: OptionsFormProps) {
  const options = useOptions();
  const profile = useProfile();
  const nameId = useId();
  const [session, setSession] = useState(String(options.sessionTimeSeconds));
  const [spawn, setSpawn] = useState(String(options.spawnIntervalSeconds));
  const [name, setName] = useState(profile.playerName);
  const [sound, setSound] = useState(options.soundEnabled);
  const [status, setStatus] = useState('');

  const sessionResult = validateOption('sessionTimeSeconds', session);
  const spawnResult = validateOption('spawnIntervalSeconds', spawn);
  const nameError = validatePlayerName(name);
  const valid = !sessionResult.error && !spawnResult.error && !nameError;
  const dirty =
    sessionResult.value !== options.sessionTimeSeconds ||
    spawnResult.value !== options.spawnIntervalSeconds ||
    name.trim() !== profile.playerName ||
    sound !== options.soundEnabled;

  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setStatus('');
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!valid || sessionResult.value === null || spawnResult.value === null) {
      setStatus('Fix the highlighted fields before saving.');
      return;
    }
    saveOptions({ sessionTimeSeconds: sessionResult.value, spawnIntervalSeconds: spawnResult.value, soundEnabled: sound });
    saveProfileName(name);
    sounds.setEnabled(sound);
    setStatus(context === 'pause' ? 'Options saved. They apply to your next battle.' : 'Options saved.');
  };

  const restoreDefaults = (): void => {
    setSession(String(DEFAULTS.sessionTimeSeconds));
    setSpawn(String(DEFAULTS.spawnIntervalSeconds));
    setSound(DEFAULTS.soundEnabled);
    setStatus('Defaults restored. Press Save to keep them.');
  };

  return (
    <form className="options-form" onSubmit={onSubmit} noValidate aria-describedby={`${nameId}-note`}>
      <Stepper
        testId="option-session-time"
        label="Game session time"
        unit="s"
        value={session}
        min={OPTION_LIMITS.sessionTimeSeconds.min}
        max={OPTION_LIMITS.sessionTimeSeconds.max}
        step={OPTION_LIMITS.sessionTimeSeconds.step}
        hint="60–180 seconds of active play."
        error={sessionResult.error}
        onChange={edit(setSession)}
      />
      <Stepper
        testId="option-spawn-time"
        label="Enemy spawn time"
        unit="s"
        value={spawn}
        min={OPTION_LIMITS.spawnIntervalSeconds.min}
        max={OPTION_LIMITS.spawnIntervalSeconds.max}
        step={OPTION_LIMITS.spawnIntervalSeconds.step}
        hint="1–10 seconds between enemy ships, in 0.5 s steps."
        error={spawnResult.error}
        onChange={edit(setSpawn)}
      />
      <div className="text-field">
        <label htmlFor={nameId}>Captain name</label>
        <input
          id={nameId}
          type="text"
          autoComplete="nickname"
          maxLength={24}
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          onChange={(event) => edit(setName)(event.target.value)}
        />
        {nameError ? (
          <p id={`${nameId}-error`} className="field-error" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={sound} onChange={(event) => edit(setSound)(event.target.checked)} />
        <span>Sound effects</span>
      </label>
      <p id={`${nameId}-note`} className="options-form__note">
        Changes apply to your next battle.
      </p>
      <div className="options-form__actions">
        <GameButton type="submit" size="medium" disabled={!dirty || !valid} data-testid="options-save">
          Save
        </GameButton>
        <GameButton variant="secondary" size="medium" onClick={restoreDefaults}>
          Defaults
        </GameButton>
      </div>
      <p className="options-form__status" role="status" aria-live="polite" data-testid="options-status">
        {status}
      </p>
    </form>
  );
}
