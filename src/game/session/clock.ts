/**
 * Fixed-step accumulator. Real frame time is fed in, whole simulation steps
 * come out, and the remainder is used to interpolate rendering. In manual mode
 * (tests) frame time is ignored and time only advances through `advance`.
 */
export class FixedStepClock {
  private accumulator = 0;
  mode: 'realtime' | 'manual';
  readonly step: number;
  private readonly maxCatchUp: number;

  constructor(step: number, maxCatchUp: number, mode: 'realtime' | 'manual' = 'realtime') {
    this.step = step;
    this.maxCatchUp = maxCatchUp;
    this.mode = mode;
  }

  /** Returns how many fixed steps to run for `frameSeconds` of real time. */
  consume(frameSeconds: number): number {
    this.accumulator += Math.min(Math.max(0, frameSeconds), this.maxCatchUp);
    const steps = Math.floor(this.accumulator / this.step + 1e-9);
    this.accumulator -= steps * this.step;
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }

  /** Interpolation factor between the previous and the current step. */
  get alpha(): number {
    return this.mode === 'manual' ? 1 : Math.min(1, this.accumulator / this.step);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
