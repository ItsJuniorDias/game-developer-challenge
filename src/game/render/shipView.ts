import { Container, Sprite, Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { lerp, lerpAngle } from '../core/math';
import type { Ship, ShipKind } from '../sim/types';
import { HealthBar } from './healthBar';
import { damageTier, shipFrame } from './shipPalette';
import { WakeTrail } from './wakeTrail';

/** Sprites point their bow down (+y); headings are measured from +x. */
export const SPRITE_ROTATION_OFFSET = -Math.PI / 2;
const HIT_FLASH_SECONDS = 0.12;
const HIT_PUNCH_SECONDS = 0.18;
const HIT_PUNCH_SCALE = 0.1;
/** Distance between the ship centre and the nearest edge of its health bar. */
const BAR_OFFSET = 64;
const FIRE_POSITIONS: readonly (readonly [number, number])[] = [
  [-12, 6],
  [14, -18],
  [-4, 30],
];
/** Drop shadow cast on the water (world units, light from the top left). */
const SHADOW_OFFSET_X = 7;
const SHADOW_OFFSET_Y = 10;
const SHADOW_ALPHA = 0.22;
/** Gentle roll on the swell: scale and angle amplitudes, and cycles per second. */
const SWAY_SCALE = 0.015;
const SWAY_ANGLE = 0.025;
const SWAY_RATE = 0.55;
const RECOIL_DECAY = 14;
/** Seconds between smoke puffs for a lightly and a badly damaged ship. */
const SMOKE_INTERVAL: Readonly<Record<0 | 1 | 2, number>> = { 0: 0, 1: 0.3, 2: 0.13 };
const WAKE_STERN_OFFSET = 44;
const WAKE_HALF_BEAM = 11;

export class ShipView {
  readonly id: number;
  readonly kind: ShipKind;
  readonly body = new Container();
  readonly shadow: Sprite;
  readonly wake: WakeTrail;
  readonly healthBar: HealthBar;
  private readonly hull: Sprite;
  private readonly fires: Sprite[] = [];
  private readonly textures: GameTextures;
  private readonly phase: number;
  private tier: 0 | 1 | 2 = 0;
  private tierApplied = false;
  private flashTime = 0;
  private punchTime = 0;
  private lastHealth: number;
  private fireClock = 0;
  private smokeClock = 0;
  private swayTime = 0;
  private recoilX = 0;
  private recoilY = 0;

  constructor(textures: GameTextures, ship: Ship, spawnFadeSeconds: number) {
    this.id = ship.id;
    this.kind = ship.kind;
    this.textures = textures;
    // Each ship rolls out of step with the others.
    this.phase = (ship.id * 2.399) % (Math.PI * 2);
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
    this.shadow = new Sprite(Texture.EMPTY);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x0b2233;
    this.wake = new WakeTrail(textures.fx.wake, WAKE_STERN_OFFSET, WAKE_HALF_BEAM, ship.x, ship.y, ship.rotation);
    this.healthBar = new HealthBar(textures.ui, ship.kind === 'player' ? 'player' : 'enemy', ship.kind === 'player' ? 96 : 76);
    this.lastHealth = ship.health;
    this.body.alpha = spawnFadeSeconds > 0 ? 0 : 1;
    this.sync(ship, 1, 0, spawnFadeSeconds, 1);
  }

  /** Current damage tier (0 intact … 2 badly damaged). */
  get damageTier(): 0 | 1 | 2 {
    return this.tier;
  }

  /** Visual kick away from a shot fired by this ship (never moves the simulated ship). */
  recoil(angle: number, strength: number): void {
    this.recoilX -= Math.cos(angle) * strength;
    this.recoilY -= Math.sin(angle) * strength;
  }

  /** True when a smoke puff is due for a damaged ship (advances its own clock). */
  smokeDue(dt: number): boolean {
    const interval = SMOKE_INTERVAL[this.tier];
    if (interval <= 0 || dt <= 0) return false;
    this.smokeClock += dt;
    if (this.smokeClock < interval) return false;
    this.smokeClock = 0;
    return true;
  }

  /**
   * Copies the interpolated simulation state onto the display objects.
   * `calm` (reduced motion) turns off the sway, recoil and hit punch.
   */
  sync(ship: Ship, alpha: number, dt: number, spawnFadeSeconds: number, maxSpeed: number, calm = false): void {
    if (dt > 0) {
      const decay = Math.exp(-RECOIL_DECAY * dt);
      this.recoilX *= decay;
      this.recoilY *= decay;
      this.swayTime += dt;
    }
    if (calm) {
      this.recoilX = 0;
      this.recoilY = 0;
      this.punchTime = 0;
    }
    const x = lerp(ship.prevX, ship.x, alpha);
    const y = lerp(ship.prevY, ship.y, alpha);
    const rotation = lerpAngle(ship.prevRotation, ship.rotation, alpha);
    const swing = calm ? 0 : Math.sin(this.swayTime * SWAY_RATE * Math.PI * 2 + this.phase);
    this.body.position.set(x + this.recoilX, y + this.recoilY);
    this.body.rotation = rotation + SPRITE_ROTATION_OFFSET + swing * SWAY_ANGLE;

    const tier = damageTier(ship.health, ship.maxHealth);
    if (tier !== this.tier || !this.tierApplied) {
      this.tier = tier;
      this.tierApplied = true;
      const texture = this.textures.ships.textures[shipFrame(ship.kind, tier)] ?? Texture.EMPTY;
      this.hull.texture = texture;
      this.shadow.texture = texture;
      const burning = tier === 0 ? 0 : tier === 1 ? 1 : FIRE_POSITIONS.length;
      this.fires.forEach((fire, i) => {
        fire.visible = i < burning;
      });
    }

    if (ship.health < this.lastHealth) {
      this.flashTime = HIT_FLASH_SECONDS;
      if (!calm) this.punchTime = HIT_PUNCH_SECONDS;
    }
    this.lastHealth = ship.health;

    if (dt > 0) {
      if (this.body.alpha < 1) this.body.alpha = Math.min(1, this.body.alpha + dt / Math.max(0.01, spawnFadeSeconds));
      this.flashTime = Math.max(0, this.flashTime - dt);
      this.punchTime = Math.max(0, this.punchTime - dt);
      this.fireClock += dt;
      const frame = Math.floor(this.fireClock * 10) % 2 === 0 ? 'fire_1' : 'fire_2';
      const fireTexture = this.textures.ships.textures[frame];
      if (fireTexture) for (const fire of this.fires) if (fire.visible) fire.texture = fireTexture;
    }
    const punch = this.punchTime / HIT_PUNCH_SECONDS;
    this.body.scale.set(1 + swing * SWAY_SCALE + punch * punch * HIT_PUNCH_SCALE);
    this.hull.tint = this.flashTime > 0 ? 0xff8a7a : 0xffffff;

    this.shadow.position.set(this.body.x + SHADOW_OFFSET_X, this.body.y + SHADOW_OFFSET_Y);
    this.shadow.rotation = this.body.rotation;
    this.shadow.scale.copyFrom(this.body.scale);
    this.shadow.alpha = SHADOW_ALPHA * this.body.alpha;

    this.wake.update(x, y, rotation, ship.speed, maxSpeed > 0 ? ship.speed / maxSpeed : 0, dt);
    this.wake.view.alpha = this.body.alpha;

    // Above the ship, unless that would leave the arena: then it moves below the hull.
    const above = y - BAR_OFFSET;
    const barBottom = above - this.healthBar.height < 0 ? y + BAR_OFFSET + this.healthBar.height : above;
    this.healthBar.view.position.set(x, barBottom);
    this.healthBar.setRatio(ship.health / ship.maxHealth);
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.shadow.destroy();
    this.wake.destroy();
    this.healthBar.view.destroy({ children: true });
  }
}
