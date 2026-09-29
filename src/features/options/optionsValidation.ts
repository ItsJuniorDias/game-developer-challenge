import { OPTION_LIMITS, type PlayerOptions } from '../../game/config/gameConfig';

export interface FieldResult {
  readonly value: number | null;
  readonly error: string | null;
}

/**
 * Validation rules (documented in the README):
 * - Game session time: whole seconds between 60 and 180.
 * - Enemy spawn time: 1 to 10 seconds, in 0.5 s increments (always positive).
 */
export function validateOption(key: keyof PlayerOptions, raw: string): FieldResult {
  const limits = OPTION_LIMITS[key];
  const label = key === 'sessionTimeSeconds' ? 'Game session time' : 'Enemy spawn time';
  if (raw.trim() === '') return { value: null, error: `${label} is required.` };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { value: null, error: `${label} must be a number.` };
  if (value < limits.min || value > limits.max) {
    return { value: null, error: `${label} must be between ${limits.min} and ${limits.max} seconds.` };
  }
  if (key === 'sessionTimeSeconds' && !Number.isInteger(value)) {
    return { value: null, error: `${label} must be a whole number of seconds.` };
  }
  if (key === 'spawnIntervalSeconds' && Math.abs(value * 2 - Math.round(value * 2)) > 1e-9) {
    return { value: null, error: `${label} must use steps of 0.5 seconds.` };
  }
  return { value, error: null };
}
