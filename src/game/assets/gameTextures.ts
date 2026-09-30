import { Assets, loadTextures, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import { GAME_ASSETS } from './manifest';

export interface GameTextures {
  ships: Spritesheet;
  tiles: Spritesheet;
  ui: Spritesheet;
  water: Texture;
  /** Procedural textures generated once and reused by every match. */
  fx: {
    circle: Texture;
    ring: Texture;
    trail: Texture;
    /** Foam streak stretched along a rope behind each ship (height = streak width). */
    wake: Texture;
  };
}

export class AssetLoadError extends Error {
  readonly failedUrl: string | null;

  constructor(message: string, failedUrl: string | null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AssetLoadError';
    this.failedUrl = failedUrl;
  }
}

const LOAD_TIMEOUT_MS = 20_000;
const TILE_INSET = 1;

// Decode on the main thread: Pixi's worker path does not surface network
// failures reliably, and main-thread fetches go through the same network layer
// (and mocks) as the rest of the app.
if (loadTextures.config) loadTextures.config.preferWorkers = false;

let cache: Promise<GameTextures> | null = null;
let cacheProgress = 0;
const progressListeners = new Set<(progress: number) => void>();

/** Parses the Starling/Sparrow XML atlas shipped with the ship sprites. */
export function parseStarlingAtlas(xml: string, imageName: string): SpritesheetData {
  const frames: SpritesheetData['frames'] = {};
  const pattern = /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"/g;
  for (const match of xml.matchAll(pattern)) {
    const [, rawName, x, y, w, h] = match;
    if (!rawName || !x || !y || !w || !h) continue;
    const name = rawName.replace(/\.png$/, '');
    const width = Number(w);
    const height = Number(h);
    frames[name] = {
      frame: { x: Number(x), y: Number(y), w: width, h: height },
      sourceSize: { w: width, h: height },
      spriteSourceSize: { x: 0, y: 0, w: width, h: height },
    };
  }
  return { frames, meta: { image: imageName, scale: 1 } };
}

function tileSheetData(): SpritesheetData {
  const { tileSize, resolution, columns, rows } = GAME_ASSETS.tilesSheet;
  const frames: SpritesheetData['frames'] = {};
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const id = row * columns + col + 1;
      // Inset by one texel: the sheet has no padding, so linear filtering at a
      // frame edge would otherwise bleed the neighbouring tile (visible seams).
      const inner = tileSize - 2 * TILE_INSET;
      frames[`tile_${id}`] = {
        frame: { x: col * tileSize + TILE_INSET, y: row * tileSize + TILE_INSET, w: inner, h: inner },
        sourceSize: { w: inner, h: inner },
        spriteSourceSize: { x: 0, y: 0, w: inner, h: inner },
      };
    }
  }
  return { frames, meta: { image: 'tiles_sheet_retina.png', scale: resolution } };
}

function createCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AssetLoadError('Canvas 2D context unavailable', null);
  draw(ctx, size);
  return Texture.from(canvas);
}

function createTrailTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AssetLoadError('Canvas 2D context unavailable', null);
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.85)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(64, 0.5);
  ctx.lineTo(64, 7.5);
  ctx.closePath();
  ctx.fill();
  return Texture.from(canvas);
}

/** Horizontal foam streak: transparent at the tail (left), strongest at the stern (right), soft edges. */
function createWakeTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 10;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AssetLoadError('Canvas 2D context unavailable', null);
  const across = ctx.createLinearGradient(0, 0, 0, 10);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  across.addColorStop(0.65, 'rgba(255,255,255,0.9)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 64, 10);
  ctx.globalCompositeOperation = 'destination-in';
  const along = ctx.createLinearGradient(0, 0, 64, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  along.addColorStop(1, 'rgba(255,255,255,0.85)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, 64, 10);
  return Texture.from(canvas);
}

function createFxTextures(): GameTextures['fx'] {
  const circle = createCanvasTexture(64, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
  const ring = createCanvasTexture(64, (ctx, size) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  });
  return { circle, ring, trail: createTrailTexture(), wake: createWakeTexture() };
}

function withTimeout<T>(promise: Promise<T>, ms: number, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AssetLoadError(`Timed out loading ${url}`, url)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof AssetLoadError ? error : new AssetLoadError(`Failed to load ${url}`, url, { cause: error }));
      },
    );
  });
}

async function loadAll(onProgress: (progress: number) => void, retina: boolean): Promise<GameTextures> {
  const ui = retina ? GAME_ASSETS.uiSheetRetina : GAME_ASSETS.uiSheet;
  const urls = [GAME_ASSETS.shipsSheet.url, GAME_ASSETS.tilesSheet.url, GAME_ASSETS.water.url, ui.url];
  let done = 0;
  onProgress(0);
  const textures = await Promise.all(
    urls.map((url) =>
      withTimeout(Assets.load<Texture>({ src: url, parser: 'texture' }), LOAD_TIMEOUT_MS, url).then((texture) => {
        done++;
        onProgress((done / urls.length) * 0.9);
        return texture;
      }),
    ),
  );
  const [shipsTexture, tilesTexture, waterTexture, uiTexture] = textures as [Texture, Texture, Texture, Texture];

  const ships = new Spritesheet(shipsTexture, parseStarlingAtlas(GAME_ASSETS.shipsSheet.xml, 'ships_miscellaneous_sheet.png'));
  const tiles = new Spritesheet(tilesTexture, tileSheetData());
  const uiSheet = new Spritesheet(uiTexture, ui.data as unknown as SpritesheetData);
  await Promise.all([ships.parse(), tiles.parse(), uiSheet.parse()]);

  waterTexture.source.addressMode = 'repeat';
  onProgress(1);
  return { ships, tiles, ui: uiSheet, water: waterTexture, fx: createFxTextures() };
}

/**
 * Loads (once) every texture required by a match. Concurrent callers share the
 * same download and all receive its real progress (a session that joins a
 * load started by a disposed one, e.g. under React Strict Mode, still shows
 * accurate progress). A failure clears the cache so a retry downloads again.
 */
export function loadGameTextures(onProgress: (progress: number) => void = () => {}, options: { retina?: boolean } = {}): Promise<GameTextures> {
  if (!cache) {
    const retina = options.retina ?? (typeof window !== 'undefined' && window.devicePixelRatio >= 1.5);
    cacheProgress = 0;
    const pending = loadAll((progress) => {
      cacheProgress = progress;
      for (const listener of progressListeners) listener(progress);
    }, retina);
    cache = pending;
    pending.then(
      () => {
        cacheProgress = 1;
      },
      () => {
        if (cache === pending) cache = null;
      },
    );
  }
  const shared = cache;
  progressListeners.add(onProgress);
  onProgress(cacheProgress);
  const detach = (): void => {
    progressListeners.delete(onProgress);
  };
  shared.then(detach, detach);
  return shared;
}
