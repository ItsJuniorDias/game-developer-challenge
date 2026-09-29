const SOUND_URLS = import.meta.glob<string>('../../../assets/sounds/*.wav', {
  query: '?url',
  import: 'default',
  eager: true,
});

export type SoundName =
  | 'cannon_broadside'
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'game_complete'
  | 'game_over'
  | 'game_pause'
  | 'game_resume'
  | 'game_start'
  | 'health_low'
  | 'ocean_ambience_loop'
  | 'score_point'
  | 'ship_collision'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_sailing_loop'
  | 'ship_sinking'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'time_warning'
  | 'ui_back'
  | 'ui_click'
  | 'ui_close'
  | 'ui_hover'
  | 'ui_open';

/**
 * iOS 17+ plays Web Audio in the "ambient" session by default, which the
 * ring/silent switch mutes. Asking for "playback" makes the game audible like a
 * video. Unsupported browsers simply ignore it.
 */
function preferPlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session || session.type === 'playback') return;
  try {
    session.type = 'playback';
  } catch {
    // Not allowed in this context: keep the browser default.
  }
}

function urlFor(name: SoundName): string | undefined {
  return SOUND_URLS[`../../../assets/sounds/${name}.wav`];
}

interface PlayOptions {
  volume?: number;
  rate?: number;
}

interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Best-effort Web Audio playback. Sounds decode lazily in the background and
 * any failure (unsupported codec, blocked autoplay, network) is swallowed:
 * audio must never block or break gameplay.
 */
class SoundManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
  private readonly loops = new Map<SoundName, Loop>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private enabled = true;
  private primed = false;
  private autoUnlockInstalled = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.7 : 0;
    if (!enabled) this.stopAllLoops();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** AudioContext state ('none' before the first unlock); exposed for diagnostics. */
  get state(): string {
    return this.context?.state ?? 'none';
  }

  /**
   * Unlocks audio output. Must run inside a user gesture: mobile browsers keep
   * an AudioContext suspended until then, and iOS also "interrupts" it when the
   * app goes to the background or the screen locks.
   */
  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    preferPlaybackSession();
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => undefined);
    if (!this.primed) {
      // Starting a buffer inside the gesture fully unlocks output on iOS Safari.
      this.primed = true;
      try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22_050);
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        this.primed = false;
      }
    }
  }

  /**
   * Retries the unlock on every user activation while output is not running
   * (first touch, and after iOS interruptions). Gameplay touch controls use
   * pointer events without clicks, so menu buttons alone are not enough.
   */
  installAutoUnlock(): void {
    if (this.autoUnlockInstalled || typeof document === 'undefined') return;
    this.autoUnlockInstalled = true;
    const retry = (): void => {
      if (!this.context || this.context.state !== 'running') this.unlock();
    };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown', 'mousedown']) {
      document.addEventListener(type, retry, { capture: true, passive: true });
    }
  }

  preload(names: readonly SoundName[]): void {
    for (const name of names) void this.buffer(name);
  }

  play(name: SoundName, options: PlayOptions = {}): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    // Avoid stacking the same sample many times in a single frame.
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.03) return;
    this.lastPlayed.set(name, now);
    void this.buffer(name).then((buffer) => {
      if (!buffer || !this.master || !this.enabled) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = options.rate ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = options.volume ?? 1;
      source.connect(gain).connect(this.master);
      source.start();
    });
  }

  startLoop(name: SoundName, volume: number): void {
    if (!this.enabled || this.loops.has(name)) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    void this.buffer(name).then((buffer) => {
      if (!buffer || !this.master || !this.enabled || this.loops.has(name)) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(this.master);
      source.start();
      this.loops.set(name, { source, gain });
    });
  }

  setLoopVolume(name: SoundName, volume: number): void {
    const loop = this.loops.get(name);
    if (loop && this.context) loop.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.1);
  }

  stopLoop(name: SoundName): void {
    const loop = this.loops.get(name);
    if (!loop) return;
    this.loops.delete(name);
    try {
      loop.source.stop();
    } catch {
      // already stopped
    }
    loop.source.disconnect();
    loop.gain.disconnect();
  }

  stopAllLoops(): void {
    for (const name of [...this.loops.keys()]) this.stopLoop(name);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      this.context = new AudioContextClass();
      this.primed = false;
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.7 : 0;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private buffer(name: SoundName): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(name);
    if (pending) return pending;
    const ctx = this.ensureContext();
    const url = urlFor(name);
    if (!ctx || !url) return Promise.resolve(null);
    pending = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => {
        // Allow a later retry if this sample failed to load.
        this.buffers.delete(name);
        return null;
      });
    this.buffers.set(name, pending);
    return pending;
  }
}

export const sounds = new SoundManager();

export const COMBAT_SOUNDS: readonly SoundName[] = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
  'game_start',
  'health_low',
  'ocean_ambience_loop',
  'score_point',
  'ship_collision',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_sailing_loop',
  'ship_sinking',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'time_warning',
];
