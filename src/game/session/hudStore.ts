import type { EndReason } from '../sim/types';

export type SessionPhase = 'loading' | 'error' | 'running' | 'paused' | 'ended' | 'disposed';
export type PauseReason = 'manual' | 'focus_lost' | 'hidden' | 'orientation';

/** Coarse-grained state the React UI renders. Never updated per frame. */
export interface HudState {
  readonly phase: SessionPhase;
  readonly loadProgress: number;
  readonly loadError: string | null;
  readonly pauseReason: PauseReason | null;
  readonly score: number;
  /** Whole seconds left (ceil), so the HUD changes at most once per second. */
  readonly timeLeft: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly endReason: EndReason | null;
  readonly weaponsReady: { readonly front: boolean; readonly left: boolean; readonly right: boolean };
  /** Shots fired per weapon: each change starts a new reload (the HUD restarts its sweep). */
  readonly reloads: { readonly front: number; readonly left: number; readonly right: number };
}

type Listener = () => void;

/** Equal primitives, or plain objects whose own values are all identical (one level deep). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

export class HudStore {
  private state: HudState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: HudState) {
    this.state = initial;
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): HudState => this.state;

  /** Publishes a new snapshot only when a visible value actually changed. */
  update(patch: Partial<HudState>): void {
    const changed = (Object.keys(patch) as (keyof HudState)[]).some((key) => !sameValue(patch[key], this.state[key]));
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
