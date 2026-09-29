import { useSyncExternalStore } from 'react';
import { DEFAULT_OPTIONS, OPTION_LIMITS, type PlayerOptions } from '../game/config/gameConfig';
import { createId } from '../game/session/matchResult';
import { ExternalStore } from './externalStore';
import { isFiniteNumber, isRecord, readJson, STORAGE_KEYS, writeJson } from './localStore';

export interface StoredOptions extends PlayerOptions {
  readonly soundEnabled: boolean;
}

export interface PlayerProfile {
  readonly playerId: string;
  readonly playerName: string;
}

export const PLAYER_NAME_LIMITS = { min: 2, max: 20 } as const;
export const DEFAULT_PLAYER_NAME = 'Captain Jack';

function withinLimits(value: unknown, key: keyof PlayerOptions): value is number {
  const limits = OPTION_LIMITS[key];
  return isFiniteNumber(value) && value >= limits.min && value <= limits.max;
}

function isStoredOptions(value: unknown): value is StoredOptions {
  return (
    isRecord(value) &&
    withinLimits(value.sessionTimeSeconds, 'sessionTimeSeconds') &&
    withinLimits(value.spawnIntervalSeconds, 'spawnIntervalSeconds') &&
    typeof value.soundEnabled === 'boolean'
  );
}

export function validatePlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < PLAYER_NAME_LIMITS.min) return `Use at least ${PLAYER_NAME_LIMITS.min} characters.`;
  if (trimmed.length > PLAYER_NAME_LIMITS.max) return `Use at most ${PLAYER_NAME_LIMITS.max} characters.`;
  if (!/^[\p{L}\p{N} '._-]+$/u.test(trimmed)) return 'Use letters, numbers, spaces and . _ - only.';
  return null;
}

function isProfile(value: unknown): value is PlayerProfile {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    value.playerId.length >= 8 &&
    typeof value.playerName === 'string' &&
    validatePlayerName(value.playerName) === null
  );
}

const DEFAULT_STORED_OPTIONS: StoredOptions = { ...DEFAULT_OPTIONS, soundEnabled: true };

const optionsStore = new ExternalStore<StoredOptions>(readJson(STORAGE_KEYS.options, isStoredOptions) ?? DEFAULT_STORED_OPTIONS);

function loadProfile(): PlayerProfile {
  const stored = readJson(STORAGE_KEYS.profile, isProfile);
  if (stored) return stored;
  const profile: PlayerProfile = { playerId: createId(), playerName: DEFAULT_PLAYER_NAME };
  writeJson(STORAGE_KEYS.profile, profile);
  return profile;
}

const profileStore = new ExternalStore<PlayerProfile>(loadProfile());

export function getOptions(): StoredOptions {
  return optionsStore.get();
}

export function saveOptions(options: StoredOptions): void {
  writeJson(STORAGE_KEYS.options, options);
  optionsStore.set({ ...options });
}

export function useOptions(): StoredOptions {
  return useSyncExternalStore(optionsStore.subscribe, optionsStore.get);
}

export function getProfile(): PlayerProfile {
  return profileStore.get();
}

export function saveProfileName(playerName: string): void {
  const next = { ...profileStore.get(), playerName: playerName.trim() };
  writeJson(STORAGE_KEYS.profile, next);
  profileStore.set(next);
}

export function useProfile(): PlayerProfile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get);
}

export const DEFAULTS = DEFAULT_STORED_OPTIONS;
