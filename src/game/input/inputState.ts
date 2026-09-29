import { IDLE_INTENT, type GameAction, type PlayerIntent } from '../sim/types';

/**
 * Merges every input source (keyboard keys, touch pointers) into a single
 * `PlayerIntent`. Each source is tracked separately so releasing one key does
 * not cancel an action still held by another key or finger. A press shorter
 * than one simulation step is buffered ("tap") until the next step reads it.
 */
export class InputState {
  private readonly holders = new Map<GameAction, Set<string>>();
  private readonly taps = new Set<GameAction>();
  private readonly intent: PlayerIntent = { ...IDLE_INTENT };
  private generationValue = 0;

  /**
   * Increments every time input is cleared (pause, blur, end). A joystick
   * finger that was already down must be lifted before it steers again, so a
   * resume never replays movement from before the pause.
   */
  get generation(): number {
    return this.generationValue;
  }

  /** Analog steering from the touch joystick (heading in world radians, thrust 0..1). */
  setSteering(heading: number | null, throttle: number): void {
    this.intent.targetHeading = heading;
    this.intent.throttle = heading === null ? 0 : Math.max(0, Math.min(1, throttle));
  }

  press(action: GameAction, source: string): void {
    let set = this.holders.get(action);
    if (!set) {
      set = new Set();
      this.holders.set(action, set);
    }
    set.add(source);
    this.taps.add(action);
    this.intent[action] = true;
  }

  release(action: GameAction, source: string): void {
    const set = this.holders.get(action);
    if (!set) return;
    set.delete(source);
    // Keep a buffered tap active until a simulation step has seen it.
    this.intent[action] = set.size > 0 || this.taps.has(action);
  }

  /** Called after every simulation step: taps that were released are dropped. */
  consumeTaps(): void {
    if (this.taps.size === 0) return;
    for (const action of this.taps) {
      this.intent[action] = (this.holders.get(action)?.size ?? 0) > 0;
    }
    this.taps.clear();
  }

  /** Releases every action held by sources matching the prefix (e.g. "key:"). */
  releaseSource(prefix: string): void {
    this.taps.clear();
    for (const [action, set] of this.holders) {
      for (const source of [...set]) {
        if (source.startsWith(prefix)) set.delete(source);
      }
      this.intent[action] = set.size > 0;
    }
  }

  clear(): void {
    this.holders.clear();
    this.taps.clear();
    this.generationValue++;
    Object.assign(this.intent, IDLE_INTENT);
  }

  isActive(action: GameAction): boolean {
    return this.intent[action];
  }

  /** Live intent object read by the simulation each step. */
  current(): Readonly<PlayerIntent> {
    return this.intent;
  }
}
