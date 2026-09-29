/** Rolling frame-time statistics used by the perf overlay and profiling runs. */
export class FrameStats {
  private readonly samples: Float32Array;
  private index = 0;
  private filled = 0;
  totalFrames = 0;
  peakEntities = 0;

  constructor(capacity = 600) {
    this.samples = new Float32Array(capacity);
  }

  record(frameMs: number, entities: number): void {
    this.samples[this.index] = frameMs;
    this.index = (this.index + 1) % this.samples.length;
    this.filled = Math.min(this.filled + 1, this.samples.length);
    this.totalFrames++;
    if (entities > this.peakEntities) this.peakEntities = entities;
  }

  summary(): { fps: number; avgFrameMs: number; p95FrameMs: number; samples: number } {
    if (this.filled === 0) return { fps: 0, avgFrameMs: 0, p95FrameMs: 0, samples: 0 };
    const values = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0;
    return { fps: avg > 0 ? 1000 / avg : 0, avgFrameMs: avg, p95FrameMs: p95, samples: values.length };
  }

  reset(): void {
    this.index = 0;
    this.filled = 0;
    this.totalFrames = 0;
    this.peakEntities = 0;
  }
}
