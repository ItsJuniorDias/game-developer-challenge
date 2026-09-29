import { Container, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { lerp, lerpAngle } from '../core/math';
import type { Ship, ShipKind } from '../sim/types';
import { HealthBar } from './healthBar';
import { damageTier, shipFrame } from './shipPalette';

/** Sprites point their bow down (+y); headings are measured from +x. */
export const SPRITE_ROTATION_OFFSET = -Math.PI / 2;
const HIT_FLASH_SECONDS = 0.12;
const FIRE_POSITIONS: readonly (readonly [number, number])[] = [
  [-12, 6],
  [14, -18],
  [-4, 30],
];

export class ShipView {
  readonly id: number;
  readonly kind: ShipKind;
  readonly body = new Container();
  readonly healthBar: HealthBar;
  private readonly hull: Sprite;
  private readonly fires: Sprite[] = [];
  private readonly textures: GameTextures;
  private tier = -1;
  private flashTime = 0;
  private lastHealth: number;
  private fireClock = 0;

  constructor(textures: GameTextures, ship: Ship, spawnFadeSeconds: number) {
    this.id = ship.id;
    this.kind = ship.kind;
    this.textures = textures;
    this.hull = new Sprite(Texture.EMPTY);
    this.hull.anchor.set(0.5);
    this.body.addChild(this.hull);
    for (const [x, y] of FIRE_POSITIONS) {
      const fire = new Sprite(textures.ships.textures.fire_1 ?? Texture.EMPTY);
      fire.anchor.set(0.5, 0.9);
      fire.position.set(x, y);
      fire.visible = false;
      this.fires.push(fire);
      this.body.addChild(fire);
    }
    this.healthBar = new HealthBar(textures.ui, ship.kind === 'player' ? 'player' : 'enemy', ship.kind === 'player' ? 96 : 76);
    this.lastHealth = ship.health;
    this.body.alpha = spawnFadeSeconds > 0 ? 0 : 1;
    this.sync(ship, 1, 0, spawnFadeSeconds);
  }

  /** Copies the interpolated simulation state onto the display objects. */
  sync(ship: Ship, alpha: number, dt: number, spawnFadeSeconds: number): void {
    const x = lerp(ship.prevX, ship.x, alpha);
    const y = lerp(ship.prevY, ship.y, alpha);
    this.body.position.set(x, y);
    this.body.rotation = lerpAngle(ship.prevRotation, ship.rotation, alpha) + SPRITE_ROTATION_OFFSET;
    this.healthBar.view.position.set(x, y - 64);
    this.healthBar.setRatio(ship.health / ship.maxHealth);

    const tier = damageTier(ship.health, ship.maxHealth);
    if (tier !== this.tier) {
      this.tier = tier;
      this.hull.texture = this.textures.ships.textures[shipFrame(ship.kind, tier)] ?? Texture.EMPTY;
      const burning = tier === 0 ? 0 : tier === 1 ? 1 : FIRE_POSITIONS.length;
      this.fires.forEach((fire, i) => {
        fire.visible = i < burning;
      });
    }

    if (ship.health < this.lastHealth) this.flashTime = HIT_FLASH_SECONDS;
    this.lastHealth = ship.health;

    if (dt > 0) {
      if (this.body.alpha < 1) this.body.alpha = Math.min(1, this.body.alpha + dt / Math.max(0.01, spawnFadeSeconds));
      this.flashTime = Math.max(0, this.flashTime - dt);
      this.fireClock += dt;
      const frame = Math.floor(this.fireClock * 10) % 2 === 0 ? 'fire_1' : 'fire_2';
      const fireTexture = this.textures.ships.textures[frame];
      if (fireTexture) for (const fire of this.fires) if (fire.visible) fire.texture = fireTexture;
    }
    this.hull.tint = this.flashTime > 0 ? 0xff8a7a : 0xffffff;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.healthBar.view.destroy({ children: true });
  }
}
