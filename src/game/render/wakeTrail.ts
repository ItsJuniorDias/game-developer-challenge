import { Container, MeshRope, Point, type Texture } from 'pixi.js';

const POINTS = 16;
const SAMPLE_SECONDS = 1 / 30;
/** How fast older foam spreads sideways, as a share of the ship's speed. */
const SPREAD = 0.18;

interface Side {
  readonly rope: MeshRope;
  readonly points: Point[];
  /** Sideways drift of each point (world units per second). */
  readonly drift: Point[];
  readonly sign: 1 | -1;
}

/**
 * Twin foam streaks trailing from the stern (port and starboard), like the
 * speed lines of the art reference. Each streak is a rope through the recent
 * stern positions, so its length follows the ship's speed and it fans out as
 * the foam ages. Purely cosmetic.
 */
export class WakeTrail {
  readonly view = new Container({ label: 'wake' });
  private readonly sides: Side[];
  private readonly sternOffset: number;
  private readonly halfBeam: number;
  private clock = 0;

  constructor(texture: Texture, sternOffset: number, halfBeam: number, x: number, y: number, rotation: number) {
    this.sternOffset = sternOffset;
    this.halfBeam = halfBeam;
    this.sides = ([1, -1] as const).map((sign) => {
      const points = Array.from({ length: POINTS }, () => new Point());
      const drift = Array.from({ length: POINTS }, () => new Point());
      const rope = new MeshRope({ texture, points });
      this.view.addChild(rope);
      return { rope, points, drift, sign };
    });
    this.reset(x, y, rotation);
  }

  /** Collapses both streaks onto the stern (spawn, or a jump in position). */
  reset(x: number, y: number, rotation: number): void {
    for (const side of this.sides) {
      const [sx, sy] = this.sternCorner(x, y, rotation, side.sign);
      for (let i = 0; i < POINTS; i++) {
        side.points[i]?.set(sx, sy);
        side.drift[i]?.set(0, 0);
      }
    }
  }

  /** `speedRatio` is the ship's speed over its top speed (0..1). */
  update(x: number, y: number, rotation: number, speed: number, speedRatio: number, dt: number): void {
    if (dt <= 0) return;
    this.clock += dt;
    // A long manual step (tests) would only resample the same position many times.
    const samples = Math.min(POINTS, Math.floor(this.clock / SAMPLE_SECONDS));
    this.clock = samples === POINTS ? 0 : this.clock - samples * SAMPLE_SECONDS;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (const side of this.sides) {
      for (let i = 0; i < POINTS; i++) {
        const p = side.points[i];
        const d = side.drift[i];
        if (!p || !d) continue;
        p.x += d.x * dt;
        p.y += d.y * dt;
      }
      const [sx, sy] = this.sternCorner(x, y, rotation, side.sign);
      for (let n = 0; n < samples; n++) {
        // Recycle the oldest point as the newest one.
        const p = side.points.shift();
        const d = side.drift.shift();
        if (!p || !d) continue;
        p.set(sx, sy);
        d.set(-sin * side.sign * speed * SPREAD, cos * side.sign * speed * SPREAD);
        side.points.push(p);
        side.drift.push(d);
      }
      // The head always sits exactly on the stern, between samples too.
      side.points[POINTS - 1]?.set(sx, sy);
      side.rope.alpha = Math.min(1, speedRatio * 1.6);
    }
  }

  private sternCorner(x: number, y: number, rotation: number, sign: 1 | -1): [number, number] {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [x - cos * this.sternOffset - sin * this.halfBeam * sign, y - sin * this.sternOffset + cos * this.halfBeam * sign];
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
