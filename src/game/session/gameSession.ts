import type { Ticker } from 'pixi.js';
import { loadGameTextures, type GameTextures } from '../assets/gameTextures';
import { COMBAT_SOUNDS, sounds, type SoundName } from '../audio/soundManager';
import { BASE_GAME_CONFIG, createMatchConfig, type GameConfig, type PlayerOptions } from '../config/gameConfig';
import { randomSeed } from '../core/rng';
import { InputState } from '../input/inputState';
import { KeyboardController } from '../input/keyboardController';
import { GameRenderer } from '../render/gameRenderer';
import { NO_INSETS, type ViewportInsets } from '../render/viewport';
import { DEFAULT_LAYOUT, type ArenaLayout } from '../sim/arena';
import { Simulation, type SimSnapshot } from '../sim/simulation';
import type { SimEvent } from '../sim/types';
import { FixedStepClock } from './clock';
import { FrameStats } from './frameStats';
import { HudStore, type HudState, type PauseReason, type SessionPhase } from './hudStore';
import { createId, type MatchResult } from './matchResult';
import { focusTracker } from './focusTracker';
import type { TestConfig } from './testConfig';

export interface GameSessionOptions {
  readonly host: HTMLElement;
  readonly options: PlayerOptions;
  readonly soundEnabled: boolean;
  readonly test?: TestConfig | null;
  readonly onEnd: (result: MatchResult) => void;
}

const TIME_WARNING_SECONDS = 10;
const LOW_HEALTH_RATIO = 0.3;

/**
 * One match: wires the simulation, the Pixi renderer, input and audio, and
 * exposes coarse HUD state to React. Creating a new session is the only way
 * to restart, so every match starts from a clean slate.
 */
export class GameSession {
  readonly store: HudStore;
  readonly input = new InputState();
  readonly config: GameConfig;
  readonly seed: number;
  private readonly host: HTMLElement;
  private readonly playerOptions: PlayerOptions;
  private readonly onEnd: (result: MatchResult) => void;
  private readonly layout: ArenaLayout;
  private readonly keyboard: KeyboardController;
  private readonly clock: FixedStepClock;
  private readonly frameStats = new FrameStats();
  private sim: Simulation;
  private renderer: GameRenderer | null = null;
  private ticker: Ticker | null = null;
  private phase: SessionPhase = 'loading';
  private startedAt = '';
  private endNotified = false;
  private timeWarningPlayed = false;
  private lowHealthPlayed = false;
  private listenersAttached = false;
  private loadToken = 0;
  private pendingCosmetic = 0;
  private insets: ViewportInsets = NO_INSETS;
  private pendingAutoPause: PauseReason | null = null;

  constructor(options: GameSessionOptions) {
    const test = options.test ?? null;
    this.host = options.host;
    this.playerOptions = { ...options.options };
    this.onEnd = options.onEnd;
    this.seed = test?.seed ?? randomSeed();
    const base: GameConfig = {
      ...BASE_GAME_CONFIG,
      player: { ...BASE_GAME_CONFIG.player, maxHealth: test?.playerMaxHealth ?? BASE_GAME_CONFIG.player.maxHealth },
      spawn: {
        ...BASE_GAME_CONFIG.spawn,
        firstSpawnDelaySeconds: test?.firstSpawnDelaySeconds ?? BASE_GAME_CONFIG.spawn.firstSpawnDelaySeconds,
        maxAliveEnemies: test?.maxAliveEnemies ?? BASE_GAME_CONFIG.spawn.maxAliveEnemies,
      },
    };
    this.config = createMatchConfig(this.playerOptions, base);
    this.layout = test?.playerSpawn ? { ...DEFAULT_LAYOUT, playerSpawn: test.playerSpawn } : DEFAULT_LAYOUT;
    this.sim = new Simulation({ config: this.config, seed: this.seed, layout: this.layout });
    this.clock = new FixedStepClock(this.config.fixedStepSeconds, this.config.maxFrameCatchUpSeconds, test?.manualClock ? 'manual' : 'realtime');
    this.keyboard = new KeyboardController(this.input, () => this.togglePause());
    sounds.setEnabled(options.soundEnabled && !test?.disableSound);

    const player = this.sim.world.player;
    this.store = new HudStore({
      phase: 'loading',
      loadProgress: 0,
      loadError: null,
      pauseReason: null,
      score: 0,
      timeLeft: Math.ceil(this.config.match.durationSeconds),
      health: player.health,
      maxHealth: player.maxHealth,
      endReason: null,
      weaponsReady: { front: true, left: true, right: true },
    });
  }

  /** Not a getter on purpose: TypeScript must not narrow it across awaits. */
  private isDisposed(): boolean {
    return this.phase === 'disposed';
  }

  get currentPhase(): SessionPhase {
    return this.phase;
  }

  /** Loads textures (with progress) and starts the match once ready. */
  async start(): Promise<void> {
    if (this.phase === 'disposed') return;
    const token = ++this.loadToken;
    // A focus loss while the combat screen itself was downloading counts too. Only
    // peeked here: under React Strict Mode this session may be disposed and remounted.
    this.pendingAutoPause = focusTracker.peek();
    // Listen for focus loss from the start: a blur while loading must still pause the match.
    this.attachListeners();
    this.setPhase('loading', { loadProgress: 0, loadError: null });
    let textures: GameTextures;
    try {
      textures = await loadGameTextures((progress) => {
        if (token === this.loadToken && this.phase === 'loading') this.store.update({ loadProgress: progress });
      });
    } catch (error) {
      if (token !== this.loadToken || this.isDisposed()) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.pendingAutoPause = null;
      this.setPhase('error', { loadError: message });
      return;
    }
    if (token !== this.loadToken || this.isDisposed()) return;

    const renderer = new GameRenderer(this.host, textures, this.layout, this.config.spawn.graceSeconds);
    this.renderer = renderer;
    try {
      await renderer.init();
      renderer.setInsets(this.insets);
    } catch (error) {
      renderer.destroy();
      this.renderer = null;
      if (this.isDisposed()) return;
      const message = error instanceof Error ? error.message : 'Renderer failed to start';
      this.pendingAutoPause = null;
      this.setPhase('error', { loadError: message });
      return;
    }
    if (this.isDisposed()) {
      renderer.destroy();
      return;
    }

    sounds.preload(COMBAT_SOUNDS);
    this.startedAt = new Date().toISOString();
    this.ticker = renderer.app.ticker;
    // Let the fixed-step clock (not Pixi's 100 ms default cap) decide how much time a hitch may recover.
    this.ticker.minFPS = 1 / this.config.maxFrameCatchUpSeconds;
    this.ticker.add(this.onTick);
    // A manual clock (tests) draws on demand: no animation frames at all.
    if (this.clock.mode === 'realtime') this.ticker.start();
    this.setPhase('running', { loadProgress: 1 });
    this.keyboard.setEnabled(true);
    sounds.unlock();
    sounds.play('game_start', { volume: 0.7 });
    sounds.startLoop('ocean_ambience_loop', 0.35);
    sounds.startLoop('ship_sailing_loop', 0);
    renderer.render(this.sim.world, 1, 0);
    // The window lost focus (or the tab was hidden) while loading: start paused.
    const pending = this.pendingAutoPause ?? focusTracker.peek();
    focusTracker.consume();
    this.pendingAutoPause = null;
    if (pending) this.pause(pending);
  }

  retry(): Promise<void> {
    return this.phase === 'error' ? this.start() : Promise.resolve();
  }

  pause(reason: PauseReason): void {
    if (this.phase !== 'running') return;
    this.keyboard.setEnabled(false);
    this.input.clear();
    this.clock.reset();
    sounds.stopLoop('ship_sailing_loop');
    sounds.play('game_pause', { volume: 0.6 });
    this.setPhase('paused', { pauseReason: reason });
  }

  /** Resuming always needs an explicit player action; held inputs are discarded. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.input.clear();
    this.clock.reset();
    this.setPhase('running', { pauseReason: null });
    this.keyboard.setEnabled(true);
    sounds.unlock();
    sounds.play('game_resume', { volume: 0.6 });
    sounds.startLoop('ship_sailing_loop', 0);
  }

  togglePause(): void {
    if (this.phase === 'running') this.pause('manual');
    else if (this.phase === 'paused') this.resume();
  }

  /** Enables or disables keyboard capture (e.g. while a dialog owns focus). */
  setKeyboardCapture(enabled: boolean): void {
    this.keyboard.setEnabled(enabled && this.phase === 'running');
  }

  /**
   * Test hook: advances the simulation clock by `ms` in manual mode. Frames
   * are drawn on demand (`render`), cosmetic animation still advances.
   */
  advance(ms: number, render = true): void {
    const seconds = Math.max(0, ms) / 1000;
    if (this.phase === 'running') {
      const steps = Math.round(seconds / this.clock.step);
      this.runSteps(steps);
    }
    this.pendingCosmetic += this.phase === 'paused' ? 0 : seconds;
    if (!render) return;
    this.renderer?.render(this.sim.world, 1, this.pendingCosmetic);
    this.pendingCosmetic = 0;
  }

  setClockMode(mode: 'realtime' | 'manual'): void {
    this.clock.mode = mode;
    this.clock.reset();
    if (mode === 'realtime') this.ticker?.start();
    else this.ticker?.stop();
  }

  get clockMode(): 'realtime' | 'manual' {
    return this.clock.mode;
  }

  snapshot(): SimSnapshot & { phase: SessionPhase; seed: number } {
    return { ...this.sim.snapshot(), phase: this.phase, seed: this.seed };
  }

  perf(): ReturnType<FrameStats['summary']> & { peakEntities: number; totalFrames: number; render: ReturnType<GameRenderer['stats']> | null } {
    return {
      ...this.frameStats.summary(),
      peakEntities: this.frameStats.peakEntities,
      totalFrames: this.frameStats.totalFrames,
      render: this.renderer?.stats() ?? null,
    };
  }

  resetPerf(): void {
    this.frameStats.reset();
  }

  /** Reserves screen space around the arena (CSS pixels), e.g. the HUD band at the top. */
  setViewportInsets(insets: ViewportInsets): void {
    this.insets = { ...insets };
    this.renderer?.setInsets(this.insets);
  }

  get viewport(): GameRenderer['viewport'] | null {
    return this.renderer?.viewport ?? null;
  }

  destroy(): void {
    if (this.phase === 'disposed') return;
    this.loadToken++;
    this.phase = 'disposed';
    this.detachListeners();
    this.keyboard.detach();
    this.input.clear();
    this.ticker?.remove(this.onTick);
    this.ticker?.stop();
    this.ticker = null;
    this.renderer?.destroy();
    this.renderer = null;
    sounds.stopAllLoops();
  }

  private readonly onTick = (ticker: Ticker): void => {
    const renderer = this.renderer;
    if (!renderer) return;
    const frameSeconds = ticker.elapsedMS / 1000;
    // Manual clock (tests): frames are only drawn by advance(), keeping the page responsive.
    if (this.clock.mode === 'manual') return;
    const world = this.sim.world;
    this.frameStats.record(ticker.elapsedMS, 1 + world.enemies.length + world.projectiles.length);
    if (this.phase === 'running') {
      this.runSteps(this.clock.consume(frameSeconds));
    }
    const cosmeticDt = this.phase === 'paused' ? 0 : Math.min(frameSeconds, this.config.maxFrameCatchUpSeconds);
    // Pixi's ticker hook presents the frame right after this callback.
    renderer.render(world, this.phase === 'running' ? this.clock.alpha : 1, cosmeticDt, false);
  };

  private runSteps(steps: number): void {
    for (let i = 0; i < steps && this.phase === 'running'; i++) {
      this.sim.step(this.clock.step, this.input.current());
      this.input.consumeTaps();
      const events = this.sim.drainEvents();
      if (events.length > 0) this.handleEvents(events);
    }
    this.publishHud();
  }

  private handleEvents(events: SimEvent[]): void {
    const world = this.sim.world;
    this.renderer?.handleEvents(events, world);
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.owner === 'player') {
            if (event.slot === 'front') this.play(pickVariant(['cannon_fire_1', 'cannon_fire_2'], event.shipId + world.stats.shotsFired), 0.55);
            else this.play('cannon_broadside', 0.6);
          } else {
            this.play('cannon_fire_3', 0.3);
          }
          break;
        case 'projectile_end':
          if (event.cause === 'expired') this.play(pickVariant(['cannonball_water_hit_1', 'cannonball_water_hit_2'], event.id), 0.25);
          break;
        case 'ship_hit':
          this.play(pickVariant(['ship_wood_hit_1', 'ship_wood_hit_2'], event.shipId), event.kind === 'player' ? 0.7 : 0.45);
          break;
        case 'ship_destroyed':
          this.play(pickVariant(['ship_explosion_1', 'ship_explosion_2'], event.shipId), 0.7);
          this.play('ship_sinking', 0.35);
          break;
        case 'rammed':
          this.play('ship_collision', 0.8);
          break;
        case 'ship_bump':
          this.play('ship_collision', 0.35);
          break;
        case 'score_changed':
          this.play('score_point', 0.5);
          break;
        case 'match_ended':
          this.finish();
          break;
        case 'enemy_spawned':
          break;
      }
    }
  }

  private publishHud(): void {
    const world = this.sim.world;
    const player = world.player;
    const timeLeft = Math.ceil(this.sim.remainingSeconds - 1e-9);
    if (!this.timeWarningPlayed && timeLeft <= TIME_WARNING_SECONDS && world.status === 'running') {
      this.timeWarningPlayed = true;
      this.play('time_warning', 0.7);
    }
    if (!this.lowHealthPlayed && player.health > 0 && player.health / player.maxHealth <= LOW_HEALTH_RATIO) {
      this.lowHealthPlayed = true;
      this.play('health_low', 0.7);
    }
    sounds.setLoopVolume('ship_sailing_loop', (player.speed / this.config.player.maxSpeed) * 0.35);
    this.store.update({
      score: world.score,
      timeLeft,
      health: player.health,
      weaponsReady: {
        front: world.time >= player.readyAt.front,
        left: world.time >= player.readyAt.left,
        right: world.time >= player.readyAt.right,
      },
    });
  }

  private finish(): void {
    if (this.endNotified) return;
    this.endNotified = true;
    const world = this.sim.world;
    this.keyboard.setEnabled(false);
    this.input.clear();
    sounds.stopLoop('ship_sailing_loop');
    this.play(world.endReason === 'defeated' ? 'game_over' : 'game_complete', 0.8);
    this.setPhase('ended', { endReason: world.endReason });
    this.publishHud();
    const result: MatchResult = {
      matchId: createId(),
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      score: world.score,
      durationMs: Math.round(world.time * 1000),
      endReason: world.endReason ?? 'time_up',
      config: this.playerOptions,
      seed: this.seed,
      stats: { ...world.stats },
    };
    this.onEnd(result);
  }

  private play(name: SoundName, volume: number): void {
    sounds.play(name, { volume });
  }

  private setPhase(phase: SessionPhase, patch: Partial<HudState> = {}): void {
    if (this.phase === 'disposed') return;
    this.phase = phase;
    this.store.update({ ...patch, phase });
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    this.keyboard.attach();
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onWindowBlur);
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    this.listenersAttached = false;
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onWindowBlur);
  }

  /**
   * Pauses now, or remembers the request if the match has not started yet: a
   * match whose window lost focus (or tab was hidden) while loading starts
   * paused, and the player resumes it explicitly.
   */
  private requestAutoPause(reason: PauseReason): void {
    if (this.phase === 'loading') this.pendingAutoPause = reason;
    else this.pause(reason);
  }

  private readonly onWindowBlur = (): void => {
    this.requestAutoPause('focus_lost');
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.requestAutoPause('hidden');
  };
}

function pickVariant<T>(variants: readonly T[], seed: number): T {
  return variants[Math.abs(seed) % variants.length] as T;
}
