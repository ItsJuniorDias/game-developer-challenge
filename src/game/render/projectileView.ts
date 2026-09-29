import { Container, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { lerp } from '../core/math';
import type { Projectile } from '../sim/types';

const TRAIL_LENGTH = 110;

/** Cannonball sprite with a short tracer, recycled through a pool. */
class ProjectileSprite {
  readonly root = new Container();
  readonly ball: Sprite;
  readonly trail: Sprite;

  constructor(textures: GameTextures) {
    this.trail = new Sprite(textures.fx.trail);
    this.trail.anchor.set(1, 0.5);
    this.ball = new Sprite(textures.ships.textures.cannon_ball ?? Texture.EMPTY);
    this.ball.anchor.set(0.5);
    this.ball.scale.set(1.4);
    this.root.addChild(this.trail, this.ball);
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
      sprite.root.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha));
      sprite.root.rotation = Math.atan2(p.vy, p.vx);
      const length = Math.min(TRAIL_LENGTH, p.traveled + 4);
      sprite.trail.width = length;
      sprite.trail.height = 6;
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
