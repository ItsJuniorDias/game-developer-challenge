import { Container, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { lerp } from '../core/math';
import { Rng } from '../core/rng';
import type { ShipKind } from '../sim/types';
import { SPRITE_ROTATION_OFFSET } from './shipView';
import { shipFrame } from './shipPalette';

interface Particle {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  drag: number;
  spin: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  /** Share of the life spent at full `alphaFrom` before fading starts. */
  hold: number;
  frames: readonly Texture[] | null;
}

interface ParticleSpec {
  texture: Texture;
  x: number;
  y: number;
  life: number;
  vx?: number;
  vy?: number;
  drag?: number;
  rotation?: number;
  spin?: number;
  scaleFrom?: number;
  scaleTo?: number;
  alphaFrom?: number;
  alphaTo?: number;
  hold?: number;
  tint?: number;
  frames?: readonly Texture[];
  layer?: 'under' | 'over';
}

const MAX_PARTICLES = 700;

/**
 * Pooled, time-driven visual effects (muzzle flashes, splashes, debris,
 * explosions, wrecks and wakes). Purely cosmetic: it never feeds back into
 * the simulation and uses its own seeded RNG so screenshots stay stable.
 */
export class EffectsLayer {
  /** Drawn below ships (wakes, wrecks, splashes). */
  readonly under = new Container({ label: 'fx-under' });
  /** Drawn above ships (flashes, explosions, debris). */
  readonly over = new Container({ label: 'fx-over' });
  private readonly active: Particle[] = [];
  private readonly pool: Particle[] = [];
  private readonly textures: GameTextures;
  private readonly rng = new Rng(1337);
  private readonly explosionFrames: Texture[];
  private readonly woodFrames: Texture[];
  private readonly crewFrames: Texture[];

  constructor(textures: GameTextures) {
    this.textures = textures;
    const t = textures.ships.textures;
    this.explosionFrames = [t.explosion_3, t.explosion_2, t.explosion_1].filter((x): x is Texture => Boolean(x));
    this.woodFrames = [t.wood_1, t.wood_2, t.wood_3, t.wood_4].filter((x): x is Texture => Boolean(x));
    this.crewFrames = [t.crew_1, t.crew_2, t.crew_3, t.crew_4, t.crew_5, t.crew_6].filter((x): x is Texture => Boolean(x));
  }

  get count(): number {
    return this.active.length;
  }

  private spawn(spec: ParticleSpec): void {
    if (this.active.length >= MAX_PARTICLES) return;
    const particle =
      this.pool.pop() ??
      ({
        sprite: new Sprite(Texture.EMPTY),
        age: 0,
        life: 1,
        vx: 0,
        vy: 0,
        drag: 0,
        spin: 0,
        scaleFrom: 1,
        scaleTo: 1,
        alphaFrom: 1,
        alphaTo: 0,
        hold: 0,
        frames: null,
      } satisfies Particle);
    const sprite = particle.sprite;
    sprite.texture = spec.texture;
    sprite.anchor.set(0.5);
    sprite.position.set(spec.x, spec.y);
    sprite.rotation = spec.rotation ?? 0;
    sprite.tint = spec.tint ?? 0xffffff;
    sprite.visible = true;
    particle.age = 0;
    particle.life = spec.life;
    particle.vx = spec.vx ?? 0;
    particle.vy = spec.vy ?? 0;
    particle.drag = spec.drag ?? 0;
    particle.spin = spec.spin ?? 0;
    particle.scaleFrom = spec.scaleFrom ?? 1;
    particle.scaleTo = spec.scaleTo ?? particle.scaleFrom;
    particle.alphaFrom = spec.alphaFrom ?? 1;
    particle.alphaTo = spec.alphaTo ?? 0;
    particle.hold = spec.hold ?? 0;
    particle.frames = spec.frames ?? null;
    sprite.scale.set(particle.scaleFrom);
    sprite.alpha = particle.alphaFrom;
    (spec.layer === 'under' ? this.under : this.over).addChild(sprite);
    this.active.push(particle);
  }

  update(dt: number): void {
    let write = 0;
    for (const p of this.active) {
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      const s = p.sprite;
      if (p.drag > 0) {
        const damping = Math.max(0, 1 - p.drag * dt);
        p.vx *= damping;
        p.vy *= damping;
      }
      s.x += p.vx * dt;
      s.y += p.vy * dt;
      s.rotation += p.spin * dt;
      s.scale.set(lerp(p.scaleFrom, p.scaleTo, t));
      s.alpha = t <= p.hold ? p.alphaFrom : lerp(p.alphaFrom, p.alphaTo, (t - p.hold) / (1 - p.hold));
      if (p.frames && p.frames.length > 0) {
        const frame = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
        if (frame && s.texture !== frame) s.texture = frame;
      }
      if (p.age >= p.life) {
        s.visible = false;
        s.parent?.removeChild(s);
        this.pool.push(p);
      } else {
        this.active[write++] = p;
      }
    }
    this.active.length = write;
  }

  muzzle(x: number, y: number, angle: number, count: number): void {
    const flash = this.explosionFrames[0];
    if (flash) this.spawn({ texture: flash, x, y, life: 0.14, scaleFrom: 0.35 + count * 0.05, scaleTo: 0.6, alphaFrom: 1, alphaTo: 0 });
    for (let i = 0; i < 2 + count; i++) {
      const spread = this.rng.range(-0.5, 0.5);
      const speed = this.rng.range(30, 70);
      this.spawn({
        texture: this.textures.fx.circle,
        x,
        y,
        life: this.rng.range(0.5, 0.8),
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        drag: 2.5,
        scaleFrom: 0.25,
        scaleTo: 0.8,
        alphaFrom: 0.55,
        alphaTo: 0,
        tint: 0xd8d8d8,
      });
    }
  }

  splash(x: number, y: number): void {
    this.spawn({ texture: this.textures.fx.ring, x, y, life: 0.5, scaleFrom: 0.15, scaleTo: 0.75, alphaFrom: 0.9, alphaTo: 0, layer: 'under' });
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      this.spawn({
        texture: this.textures.fx.circle,
        x,
        y,
        life: 0.35,
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60,
        drag: 4,
        scaleFrom: 0.18,
        scaleTo: 0.05,
        alphaFrom: 0.9,
        alphaTo: 0,
      });
    }
  }

  dust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(40, 90);
      this.spawn({
        texture: this.textures.fx.circle,
        x,
        y,
        life: 0.5,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 4,
        scaleFrom: 0.3,
        scaleTo: 0.6,
        alphaFrom: 0.8,
        alphaTo: 0,
        tint: 0xe5c88f,
      });
    }
  }

  hit(x: number, y: number): void {
    const flash = this.explosionFrames[0];
    if (flash) this.spawn({ texture: flash, x, y, life: 0.25, scaleFrom: 0.45, scaleTo: 0.7, alphaFrom: 1, alphaTo: 0 });
    this.debris(x, y, 4, 120);
    this.sparks(x, y, 4, 170);
  }

  explosion(x: number, y: number, size = 1): void {
    // Bright bloom and a shockwave ring on the water.
    this.spawn({ texture: this.textures.fx.circle, x, y, life: 0.2, scaleFrom: 2.2 * size, scaleTo: 3 * size, alphaFrom: 0.75, alphaTo: 0, tint: 0xfff0c0 });
    this.spawn({ texture: this.textures.fx.ring, x, y, life: 0.5, scaleFrom: 0.3 * size, scaleTo: 3 * size, alphaFrom: 0.85, alphaTo: 0, layer: 'under' });
    const first = this.explosionFrames[0];
    if (first) {
      this.spawn({
        texture: first,
        frames: this.explosionFrames,
        x,
        y,
        life: 0.65,
        scaleFrom: 0.9 * size,
        scaleTo: 1.5 * size,
        alphaFrom: 1,
        alphaTo: 0.1,
        rotation: this.rng.range(0, Math.PI * 2),
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(20, 60);
      this.spawn({
        texture: this.textures.fx.circle,
        x,
        y,
        life: this.rng.range(0.9, 1.4),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 1.5,
        scaleFrom: 0.6 * size,
        scaleTo: 1.6 * size,
        alphaFrom: 0.45,
        alphaTo: 0,
        tint: 0x5a5a5a,
      });
    }
    this.debris(x, y, 8, 200);
    this.sparks(x, y, 10, 260 * size);
  }

  wreck(kind: ShipKind, x: number, y: number, rotation: number): void {
    const texture = this.textures.ships.textures[shipFrame(kind, 3)];
    if (!texture) return;
    this.spawn({
      texture,
      x,
      y,
      life: 2.2,
      rotation: rotation + SPRITE_ROTATION_OFFSET,
      spin: this.rng.range(-0.25, 0.25),
      scaleFrom: 1,
      scaleTo: 0.75,
      alphaFrom: 1,
      alphaTo: 0,
      hold: 0.35,
      layer: 'under',
    });
    this.spawn({ texture: this.textures.fx.ring, x, y, life: 1.4, scaleFrom: 0.8, scaleTo: 2.4, alphaFrom: 0.5, alphaTo: 0, layer: 'under' });
    if (kind === 'player') return;
    // Survivors swim away from the wreck, and a loose cannon floats for a moment.
    const survivors = this.rng.int(1, 3);
    for (let i = 0; i < survivors && this.crewFrames.length > 0; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const distance = this.rng.range(24, 40);
      this.spawn({
        texture: this.rng.pick(this.crewFrames),
        x: x + Math.cos(a) * distance,
        y: y + Math.sin(a) * distance,
        life: 3.2,
        vx: Math.cos(a) * 16,
        vy: Math.sin(a) * 16,
        rotation: a + Math.PI / 2,
        scaleFrom: 1.2,
        scaleTo: 1.2,
        alphaFrom: 1,
        alphaTo: 0,
        hold: 0.7,
        layer: 'under',
      });
    }
    const cannon = this.textures.ships.textures.cannon_loose;
    if (cannon) {
      const a = this.rng.range(0, Math.PI * 2);
      this.spawn({
        texture: cannon,
        x: x + Math.cos(a) * 18,
        y: y + Math.sin(a) * 18,
        life: 2.4,
        vx: Math.cos(a) * 10,
        vy: Math.sin(a) * 10,
        drag: 0.6,
        rotation: a,
        spin: this.rng.range(-0.6, 0.6),
        scaleFrom: 1.3,
        scaleTo: 1,
        alphaFrom: 1,
        alphaTo: 0,
        hold: 0.5,
        layer: 'under',
      });
    }
  }

  /** Dark smoke rising from a damaged ship, drifting with the wind. */
  smoke(x: number, y: number): void {
    this.spawn({
      texture: this.textures.fx.circle,
      x: x + this.rng.range(-10, 10),
      y: y + this.rng.range(-10, 10),
      life: this.rng.range(0.9, 1.3),
      vx: 14 + this.rng.range(-6, 6),
      vy: -10 + this.rng.range(-6, 6),
      drag: 0.4,
      scaleFrom: 0.28,
      scaleTo: 0.9,
      alphaFrom: 0.4,
      alphaTo: 0,
      tint: 0x3d3d3d,
    });
  }

  /** Soft churned foam right behind the stern (the streaks come from the wake trails). */
  wake(x: number, y: number, angle: number): void {
    this.spawn({
      texture: this.textures.fx.circle,
      x: x + this.rng.range(-6, 6),
      y: y + this.rng.range(-6, 6),
      life: 0.8,
      vx: -Math.cos(angle) * 12,
      vy: -Math.sin(angle) * 12,
      scaleFrom: 0.35,
      scaleTo: 0.95,
      alphaFrom: 0.22,
      alphaTo: 0,
      layer: 'under',
    });
  }

  ripple(x: number, y: number): void {
    this.spawn({ texture: this.textures.fx.ring, x, y, life: 0.9, scaleFrom: 0.4, scaleTo: 2.2, alphaFrom: 0.8, alphaTo: 0, layer: 'under' });
  }

  /** Short-lived glowing embers. */
  private sparks(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(speed * 0.35, speed);
      this.spawn({
        texture: this.textures.fx.circle,
        x,
        y,
        life: this.rng.range(0.3, 0.6),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 3.5,
        scaleFrom: 0.14,
        scaleTo: 0.03,
        alphaFrom: 1,
        alphaTo: 0,
        tint: this.rng.pick([0xffb347, 0xffd774, 0xff7b3a]),
      });
    }
  }

  private debris(x: number, y: number, count: number, speed: number): void {
    if (this.woodFrames.length === 0) return;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(speed * 0.4, speed);
      this.spawn({
        texture: this.rng.pick(this.woodFrames),
        x,
        y,
        life: this.rng.range(0.5, 0.9),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 3,
        rotation: a,
        spin: this.rng.range(-8, 8),
        scaleFrom: 1.1,
        scaleTo: 0.8,
        alphaFrom: 1,
        alphaTo: 0,
      });
    }
  }

  destroy(): void {
    for (const p of [...this.active, ...this.pool]) p.sprite.destroy();
    this.active.length = 0;
    this.pool.length = 0;
    this.under.destroy({ children: true });
    this.over.destroy({ children: true });
  }
}
