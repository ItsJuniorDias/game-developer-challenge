import { Application, Container } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { Rng } from '../core/rng';
import type { ArenaLayout } from '../sim/arena';
import type { ShipKind, SimEvent, WorldState } from '../sim/types';
import { ArenaView } from './arenaView';
import { EffectsLayer } from './effectsLayer';
import { FloatingTextLayer } from './floatingText';
import { ProjectileLayer } from './projectileView';
import { ShipView } from './shipView';
import { fitWorld, NO_INSETS, type ViewportFit, type ViewportInsets } from './viewport';

const MAX_RESOLUTION = 2;
const WAKE_INTERVAL = 0.07;
const SHAKE_SECONDS = 0.25;
/** Camera nudge (world units) when the player fires a broadside / the bow cannon. */
const KICK_BROADSIDE = 3.5;
const KICK_BOW = 1.5;
const KICK_DECAY = 16;
/** Visual recoil of the firing ship (world units). */
const RECOIL_BROADSIDE = 4;
const RECOIL_BOW = 2.5;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Top speed of each kind of ship, used to scale wakes. */
export type ShipSpeeds = Readonly<Record<ShipKind, number>>;

export interface RenderStats {
  ships: number;
  projectiles: number;
  /** Pooled effect particles (limit 700). */
  particles: number;
  /** Floating numbers ("+1", damage), pooled separately. */
  texts: number;
}

/**
 * Owns the Pixi application and every display object of a match. It reads
 * simulation state (never mutates it) and turns simulation events into
 * visual feedback.
 */
export class GameRenderer {
  readonly app = new Application();
  private readonly host: HTMLElement;
  private readonly layout: ArenaLayout;
  private readonly textures: GameTextures;
  private readonly world = new Container({ label: 'world' });
  private readonly wakeLayer = new Container({ label: 'wakes' });
  private readonly shadowLayer = new Container({ label: 'ship-shadows' });
  private readonly shipLayer = new Container({ label: 'ships' });
  private readonly barLayer = new Container({ label: 'health-bars' });
  private arena: ArenaView | null = null;
  private projectiles: ProjectileLayer | null = null;
  private effects: EffectsLayer | null = null;
  private readonly floatingText = new FloatingTextLayer();
  private readonly ships = new Map<number, ShipView>();
  private readonly seenShips = new Set<number>();
  private readonly shakeRng = new Rng(7);
  private resizeObserver: ResizeObserver | null = null;
  private dprQuery: MediaQueryList | null = null;
  private insets: ViewportInsets = NO_INSETS;
  private shakeX = 0;
  private shakeY = 0;
  private kickX = 0;
  private kickY = 0;
  private readonly reducedMotion: MediaQueryList | null = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
  private readonly speeds: ShipSpeeds;
  private fit: ViewportFit = { scale: 1, offsetX: 0, offsetY: 0, screenWidth: 1, screenHeight: 1 };
  private wakeClock = 0;
  private shakeTime = 0;
  private spawnFadeSeconds: number;
  private initialized = false;
  private destroyed = false;

  constructor(host: HTMLElement, textures: GameTextures, layout: ArenaLayout, spawnFadeSeconds: number, speeds: ShipSpeeds) {
    this.host = host;
    this.textures = textures;
    this.layout = layout;
    this.spawnFadeSeconds = spawnFadeSeconds;
    this.speeds = speeds;
  }

  async init(): Promise<void> {
    const { width, height } = this.hostSize();
    await this.app.init({
      width,
      height,
      // Sprites are already filtered; MSAA would only cost fill rate.
      antialias: false,
      autoDensity: true,
      resolution: this.resolution(),
      backgroundColor: 0x123a5c,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
    });
    if (this.destroyed) {
      // Unmounted while Pixi was initialising (e.g. React Strict Mode double mount).
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      return;
    }
    this.initialized = true;

    const canvas = this.app.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.testid = 'game-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    this.host.appendChild(canvas);

    this.arena = new ArenaView(this.textures, this.layout);
    this.projectiles = new ProjectileLayer(this.textures);
    this.effects = new EffectsLayer(this.textures);

    // No mask: health bars of ships hugging the edge stay readable in the letterbox.
    this.world.addChild(
      this.arena.view,
      this.wakeLayer,
      this.effects.under,
      this.shadowLayer,
      this.shipLayer,
      this.projectiles.view,
      this.effects.over,
      this.barLayer,
      this.floatingText.view,
    );
    this.app.stage.addChild(this.world);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.watchPixelRatio();
    this.resize();
  }

  get isReady(): boolean {
    return this.initialized && !this.destroyed;
  }

  get viewport(): ViewportFit {
    return this.fit;
  }

  stats(): RenderStats {
    return {
      ships: this.ships.size,
      projectiles: this.projectiles?.activeCount ?? 0,
      particles: this.effects?.count ?? 0,
      texts: this.floatingText.count,
    };
  }

  /** Applies simulation events as visual feedback. */
  handleEvents(events: readonly SimEvent[], world: WorldState): void {
    const fx = this.effects;
    if (!fx) return;
    for (const event of events) {
      switch (event.type) {
        case 'shot': {
          fx.muzzle(event.x, event.y, event.angle, event.count);
          const broadside = event.slot !== 'front';
          this.ships.get(event.shipId)?.recoil(event.angle, broadside ? RECOIL_BROADSIDE : RECOIL_BOW);
          if (event.owner === 'player') this.kick(event.angle, broadside ? KICK_BROADSIDE : KICK_BOW);
          break;
        }
        case 'projectile_end':
          if (event.cause === 'expired' || event.cause === 'owner_destroyed') fx.splash(event.x, event.y);
          else if (event.cause === 'island') fx.dust(event.x, event.y);
          break;
        case 'ship_hit':
          fx.hit(event.x, event.y);
          if (event.shipId === world.player.id) {
            this.shakeTime = SHAKE_SECONDS;
            this.floatingText.spawn('damage', `-${event.damage}`, event.x + 26, event.y - 40);
          }
          break;
        case 'ship_destroyed':
          fx.wreck(event.kind, event.x, event.y, event.rotation);
          fx.explosion(event.x, event.y, event.kind === 'player' ? 1.6 : 1.1);
          if (event.kind === 'player') this.shakeTime = SHAKE_SECONDS * 2;
          // Only a sinking caused by the player's cannons scores.
          if (event.kind !== 'player' && event.cause === 'player_fire') this.floatingText.spawn('score', '+1', event.x, event.y - 30);
          break;
        case 'rammed':
          fx.explosion(event.x, event.y, 1.3);
          this.shakeTime = SHAKE_SECONDS * 1.6;
          break;
        case 'enemy_spawned':
          fx.ripple(event.x, event.y);
          break;
        case 'ship_bump':
        case 'score_changed':
        case 'match_ended':
          break;
      }
    }
  }

  /**
   * Updates the scene from the simulation. `alpha` interpolates between the
   * last two simulation steps; `dt` advances cosmetic animation (0 while
   * paused). `present` draws immediately: the realtime ticker leaves it off
   * because Pixi's own ticker hook presents the frame right after.
   */
  render(world: WorldState, alpha: number, dt: number, present = true): void {
    if (!this.isReady) return;
    this.syncShips(world, alpha, dt);
    this.projectiles?.sync(world.projectiles, alpha);
    if (dt > 0) {
      this.arena?.update(dt);
      this.effects?.update(dt);
      this.floatingText.update(dt);
      this.spawnWakes(world, dt);
    }
    this.applyShake(dt);
    if (present) this.app.render();
  }

  /** Screen space reserved around the arena (e.g. the HUD band), in CSS pixels. */
  setInsets(insets: ViewportInsets): void {
    const same =
      insets.top === this.insets.top && insets.right === this.insets.right && insets.bottom === this.insets.bottom && insets.left === this.insets.left;
    if (same) return;
    this.insets = { ...insets };
    this.resize();
  }

  private syncShips(world: WorldState, alpha: number, dt: number): void {
    this.seenShips.clear();
    const all = [world.player, ...world.enemies];
    for (const ship of all) {
      if (!ship.alive) continue;
      this.seenShips.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) {
        view = new ShipView(this.textures, ship, ship.kind === 'player' ? 0 : this.spawnFadeSeconds);
        this.ships.set(ship.id, view);
        this.wakeLayer.addChild(view.wake.view);
        this.shadowLayer.addChild(view.shadow);
        this.shipLayer.addChild(view.body);
        this.barLayer.addChild(view.healthBar.view);
      }
      view.sync(ship, alpha, dt, this.spawnFadeSeconds, this.speeds[ship.kind], this.reducedMotion?.matches ?? false);
      if (view.smokeDue(dt)) this.effects?.smoke(view.body.x, view.body.y);
    }
    for (const [id, view] of this.ships) {
      if (this.seenShips.has(id)) continue;
      this.ships.delete(id);
      view.destroy();
    }
  }

  private spawnWakes(world: WorldState, dt: number): void {
    this.wakeClock += dt;
    if (this.wakeClock < WAKE_INTERVAL) return;
    this.wakeClock = 0;
    const fx = this.effects;
    if (!fx) return;
    for (const ship of [world.player, ...world.enemies]) {
      if (!ship.alive || ship.speed < 25) continue;
      const back = 46;
      fx.wake(ship.x - Math.cos(ship.rotation) * back, ship.y - Math.sin(ship.rotation) * back, ship.rotation);
    }
  }

  /** Nudges the camera opposite to a shot (recoil feel). */
  private kick(angle: number, strength: number): void {
    if (this.reducedMotion?.matches) return;
    this.kickX -= Math.cos(angle) * strength;
    this.kickY -= Math.sin(angle) * strength;
  }

  private applyShake(dt: number): void {
    // Shake only evolves while cosmetic time runs: a paused frame keeps its offset.
    if (dt > 0) {
      const calm = this.reducedMotion?.matches ?? false;
      if (this.shakeTime > 0 && !calm) {
        this.shakeTime = Math.max(0, this.shakeTime - dt);
        const strength = (this.shakeTime / SHAKE_SECONDS) * 6;
        this.shakeX = this.shakeRng.range(-strength, strength);
        this.shakeY = this.shakeRng.range(-strength, strength);
      } else {
        this.shakeTime = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
      const decay = Math.exp(-KICK_DECAY * dt);
      this.kickX *= decay;
      this.kickY *= decay;
    }
    const x = this.shakeX + this.kickX;
    const y = this.shakeY + this.kickY;
    this.world.position.set(this.fit.offsetX + x * this.fit.scale, this.fit.offsetY + y * this.fit.scale);
  }

  /** Re-applies the resolution when the device pixel ratio changes without a CSS resize (e.g. moving to another display). */
  private watchPixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.onPixelRatioChange);
    if (typeof window.matchMedia !== 'function') return;
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onPixelRatioChange);
  }

  private readonly onPixelRatioChange = (): void => {
    if (this.destroyed) return;
    this.watchPixelRatio();
    this.resize();
  };

  private hostSize(): { width: number; height: number } {
    const rect = this.host.getBoundingClientRect();
    return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
  }

  private resolution(): number {
    return Math.min(MAX_RESOLUTION, Math.max(1, window.devicePixelRatio || 1));
  }

  /** Fits the arena to the host element, keeping aspect ratio and pixel density. */
  resize(): void {
    if (!this.isReady) return;
    const { width, height } = this.hostSize();
    const resolution = this.resolution();
    if (this.app.renderer.resolution !== resolution) this.app.renderer.resolution = resolution;
    this.app.renderer.resize(width, height);
    this.fit = fitWorld(this.layout.width, this.layout.height, width, height, this.insets);
    this.world.scale.set(this.fit.scale);
    this.world.position.set(this.fit.offsetX, this.fit.offsetY);
    // The sea covers the whole screen; a margin hides the edges during screen shake.
    const margin = 24;
    this.arena?.setVisibleRect(
      -this.fit.offsetX / this.fit.scale - margin,
      -this.fit.offsetY / this.fit.scale - margin,
      width / this.fit.scale + margin * 2,
      height / this.fit.scale + margin * 2,
    );
    this.app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.dprQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.dprQuery = null;
    if (!this.initialized) return;
    for (const view of this.ships.values()) view.destroy();
    this.ships.clear();
    this.projectiles?.destroy();
    this.effects?.destroy();
    this.floatingText.destroy();
    // Shared textures stay cached (Assets) for the next match; only scene objects are freed.
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
