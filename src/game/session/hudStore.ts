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
}

type Listener = () => void;

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
    let changed = false;
    for (const key of Object.keys(patch) as (keyof HudState)[]) {
      const next = patch[key];
      const prev = this.state[key];
      if (key === 'weaponsReady' && next && prev) {
        const a = next as HudState['weaponsReady'];
        const b = prev as HudState['weaponsReady'];
        if (a.front !== b.front || a.left !== b.left || a.right !== b.right) changed = true;
      } else if (next !== prev) {
        changed = true;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
