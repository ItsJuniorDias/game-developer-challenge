import { Application, Container } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { Rng } from '../core/rng';
import type { ArenaLayout } from '../sim/arena';
import type { SimEvent, WorldState } from '../sim/types';
import { ArenaView } from './arenaView';
import { EffectsLayer } from './effectsLayer';
import { ProjectileLayer } from './projectileView';
import { ShipView } from './shipView';
import { fitWorld, type ViewportFit } from './viewport';

const MAX_RESOLUTION = 2;
const WAKE_INTERVAL = 0.07;
const SHAKE_SECONDS = 0.25;

export interface RenderStats {
  ships: number;
  projectiles: number;
  particles: number;
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
  private readonly shipLayer = new Container({ label: 'ships' });
  private readonly barLayer = new Container({ label: 'health-bars' });
  private arena: ArenaView | null = null;
  private projectiles: ProjectileLayer | null = null;
  private effects: EffectsLayer | null = null;
  private readonly ships = new Map<number, ShipView>();
  private readonly seenShips = new Set<number>();
  private readonly shakeRng = new Rng(7);
  private resizeObserver: ResizeObserver | null = null;
  private fit: ViewportFit = { scale: 1, offsetX: 0, offsetY: 0, screenWidth: 1, screenHeight: 1 };
  private wakeClock = 0;
  private shakeTime = 0;
  private spawnFadeSeconds: number;
  private initialized = false;
  private destroyed = false;

  constructor(host: HTMLElement, textures: GameTextures, layout: ArenaLayout, spawnFadeSeconds: number) {
    this.host = host;
    this.textures = textures;
    this.layout = layout;
    this.spawnFadeSeconds = spawnFadeSeconds;
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
    this.world.addChild(this.arena.view, this.effects.under, this.shipLayer, this.projectiles.view, this.effects.over, this.barLayer);
    this.app.stage.addChild(this.world);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
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
    };
  }

  /** Applies simulation events as visual feedback. */
  handleEvents(events: readonly SimEvent[], world: WorldState): void {
    const fx = this.effects;
    if (!fx) return;
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          fx.muzzle(event.x, event.y, event.angle, event.count);
          break;
        case 'projectile_end':
          if (event.cause === 'expired' || event.cause === 'owner_destroyed') fx.splash(event.x, event.y);
          else if (event.cause === 'island') fx.dust(event.x, event.y);
          break;
        case 'ship_hit':
          fx.hit(event.x, event.y);
          if (event.shipId === world.player.id) this.shakeTime = SHAKE_SECONDS;
          break;
        case 'ship_destroyed':
          fx.wreck(event.kind, event.x, event.y, event.rotation);
          fx.explosion(event.x, event.y, event.kind === 'player' ? 1.6 : 1.1);
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
   * Draws the world. `alpha` interpolates between the last two simulation
   * steps; `dt` advances cosmetic animation (0 while paused).
   */
  render(world: WorldState, alpha: number, dt: number): void {
    if (!this.isReady) return;
    this.syncShips(world, alpha, dt);
    this.projectiles?.sync(world.projectiles, alpha);
    if (dt > 0) {
      this.arena?.update(dt);
      this.effects?.update(dt);
      this.spawnWakes(world, dt);
    }
    this.applyShake(dt);
    this.app.render();
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
        this.shipLayer.addChild(view.body);
        this.barLayer.addChild(view.healthBar.view);
      }
      view.sync(ship, alpha, dt, this.spawnFadeSeconds);
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

  private applyShake(dt: number): void {
    let ox = 0;
    let oy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const strength = (this.shakeTime / SHAKE_SECONDS) * 6;
      ox = this.shakeRng.range(-strength, strength);
      oy = this.shakeRng.range(-strength, strength);
    }
    this.world.position.set(this.fit.offsetX + ox * this.fit.scale, this.fit.offsetY + oy * this.fit.scale);
  }

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
    this.fit = fitWorld(this.layout.width, this.layout.height, width, height);
    this.world.scale.set(this.fit.scale);
    this.world.position.set(this.fit.offsetX, this.fit.offsetY);
    this.app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (!this.initialized) return;
    for (const view of this.ships.values()) view.destroy();
    this.ships.clear();
    this.projectiles?.destroy();
    this.effects?.destroy();
    // Shared textures stay cached (Assets) for the next match; only scene objects are freed.
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
