import { sounds } from '../audio/soundManager';
import type { GameSession } from './gameSession';
import { isInstrumentationEnabled } from './testConfig';

export interface PirateDebugApi {
  readonly state: () => ReturnType<GameSession['snapshot']> | null;
  readonly hud: () => ReturnType<GameSession['store']['getSnapshot']> | null;
  readonly advance: (ms: number, render?: boolean) => void;
  readonly setClockMode: (mode: 'realtime' | 'manual') => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly perf: () => ReturnType<GameSession['perf']> | null;
  readonly resetPerf: () => void;
  readonly viewport: () => GameSession['viewport'];
  readonly sessionCount: () => number;
  readonly audioState: () => string;
}

declare global {
  interface Window {
    __pirate?: PirateDebugApi;
  }
}

let current: GameSession | null = null;
let created = 0;

/**
 * Observation and clock control for automated tests and profiling. Only
 * installed when instrumentation is requested (`__PIRATE_TEST__` or ?debug).
 * It cannot change rules or entities: tests still drive the ship with inputs.
 */
export function registerDebugSession(session: GameSession): void {
  current = session;
  created++;
  if (!isInstrumentationEnabled() || window.__pirate) return;
  window.__pirate = {
    state: () => current?.snapshot() ?? null,
    hud: () => current?.store.getSnapshot() ?? null,
    advance: (ms, render) => current?.advance(ms, render),
    setClockMode: (mode) => current?.setClockMode(mode),
    pause: () => current?.pause('manual'),
    resume: () => current?.resume(),
    perf: () => current?.perf() ?? null,
    resetPerf: () => current?.resetPerf(),
    viewport: () => current?.viewport ?? null,
    sessionCount: () => created,
    audioState: () => sounds.state,
  };
}

export function unregisterDebugSession(session: GameSession): void {
  if (current === session) current = null;
}
