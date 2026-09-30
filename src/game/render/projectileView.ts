import { Container, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { lerp } from '../core/math';
import type { Projectile } from '../sim/types';

const TRAIL_LENGTH = 110;
const BALL_SCALE = 1.4;
/** Cosmetic arc: the ball grows and its shadow drifts away at the top of its flight. */
const ARC_SCALE = 0.3;
const SHADOW_BASE = { x: 3, y: 5 };
const SHADOW_LIFT = { x: 8, y: 11 };

/** Cannonball sprite with a short tracer and a shadow on the water, recycled through a pool. */
class ProjectileSprite {
  readonly root = new Container();
  readonly ball: Sprite;
  readonly trail: Sprite;
  readonly shadow: Sprite;

  constructor(textures: GameTextures) {
    this.shadow = new Sprite(textures.fx.circle);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x0b2233;
    this.trail = new Sprite(textures.fx.trail);
    this.trail.anchor.set(1, 0.5);
    this.ball = new Sprite(textures.ships.textures.cannon_ball ?? Texture.EMPTY);
    this.ball.anchor.set(0.5);
    this.ball.scale.set(BALL_SCALE);
    this.root.addChild(this.shadow, this.trail, this.ball);
  }
}

export class ProjectileLayer {
  readonly view = new Container({ label: 'projectiles' });
  private readonly active = new Map<number, ProjectileSprite>();
  private readonly pool: ProjectileSprite[] = [];
  private readonly textures: GameTextures;
  private readonly seen = new Set<number>();

  constructor(textures: GameTextures) {
    this.textures = textures;
  }

  sync(projectiles: readonly Projectile[], alpha: number): void {
    this.seen.clear();
    for (const p of projectiles) {
      if (!p.alive) continue;
      this.seen.add(p.id);
      let sprite = this.active.get(p.id);
      if (!sprite) {
        sprite = this.pool.pop() ?? new ProjectileSprite(this.textures);
        sprite.root.visible = true;
        this.view.addChild(sprite.root);
        this.active.set(p.id, sprite);
        sprite.trail.tint = p.owner === 'player' ? 0xffffff : 0xffd0c0;
      }
      const rotation = Math.atan2(p.vy, p.vx);
      sprite.root.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha));
      sprite.root.rotation = rotation;
      const length = Math.min(TRAIL_LENGTH, p.traveled + 4);
      sprite.trail.width = length;
      sprite.trail.height = 6;
      // Flight progress by distance or by time, whichever ends the shot first.
      const progress = Math.min(1, Math.max(p.range > 0 ? p.traveled / p.range : 1, p.lifetime > 0 ? p.age / p.lifetime : 1));
      const height = Math.sin(progress * Math.PI);
      sprite.ball.scale.set(BALL_SCALE * (1 + ARC_SCALE * height));
      // The shadow offset is fixed in world space; the sprite is rotated with the shot.
      const sx = SHADOW_BASE.x + SHADOW_LIFT.x * height;
      const sy = SHADOW_BASE.y + SHADOW_LIFT.y * height;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      sprite.shadow.position.set(sx * cos + sy * sin, -sx * sin + sy * cos);
      sprite.shadow.scale.set(0.24 * (1 - 0.3 * height));
      sprite.shadow.alpha = 0.4 * (1 - 0.35 * height);
    }
    for (const [id, sprite] of this.active) {
      if (this.seen.has(id)) continue;
      this.active.delete(id);
      sprite.root.visible = false;
      this.view.removeChild(sprite.root);
      this.pool.push(sprite);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  destroy(): void {
    for (const sprite of [...this.active.values(), ...this.pool]) sprite.root.destroy({ children: true });
    this.active.clear();
    this.pool.length = 0;
    this.view.destroy({ children: true });
  }
}
