import { describe, expect, it, vi } from 'vitest';
import { HudStore, type HudState } from './hudStore';

const INITIAL: HudState = {
  phase: 'running',
  loadProgress: 1,
  loadError: null,
  pauseReason: null,
  score: 0,
  timeLeft: 120,
  health: 100,
  maxHealth: 100,
  endReason: null,
  weaponsReady: { front: true, left: true, right: true },
  reloads: { front: 0, left: 0, right: 0 },
};

describe('HudStore', () => {
  it('does not notify when a patch only repeats the current values (fresh nested objects included)', () => {
    const store = new HudStore(INITIAL);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    // The session publishes new objects after every simulation step.
    store.update({ score: 0, health: 100, weaponsReady: { front: true, left: true, right: true }, reloads: { front: 0, left: 0, right: 0 } });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);
  });

  it('notifies once when a nested value changes', () => {
    const store = new HudStore(INITIAL);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ weaponsReady: { front: false, left: true, right: true }, reloads: { front: 1, left: 0, right: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().reloads.front).toBe(1);
    expect(store.getSnapshot().weaponsReady.front).toBe(false);
  });

  it('notifies for every new shot even while the weapon never reports ready (held fire)', () => {
    const store = new HudStore({ ...INITIAL, weaponsReady: { front: false, left: true, right: true } });
    const listener = vi.fn();
    store.subscribe(listener);
    for (let shot = 1; shot <= 3; shot++) store.update({ weaponsReady: { front: false, left: true, right: true }, reloads: { front: shot, left: 0, right: 0 } });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new HudStore(INITIAL);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.update({ score: 1 });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().score).toBe(1);
  });
});
