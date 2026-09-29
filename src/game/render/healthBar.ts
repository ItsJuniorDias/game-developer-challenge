import { Container, Rectangle, Sprite, Texture, type Spritesheet } from 'pixi.js';

type BarStyle = 'player' | 'enemy';

interface FillRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FRAME: Record<BarStyle, string> = { player: 'health_frame', enemy: 'enemy_health_frame' };
const STEPS = 50;

/** Cropped fill textures are shared by every bar (keyed by frame and step). */
const croppedCache = new WeakMap<Texture, Map<number, Texture>>();

function fillRectOf(sheet: Spritesheet, frameName: string): FillRect {
  const data = sheet.data.frames[frameName] as unknown as { ui?: { layout?: { fill_rect?: FillRect } } } | undefined;
  return data?.ui?.layout?.fill_rect ?? { x: 0, y: 0, w: 1, h: 1 };
}

function croppedFill(source: Texture, rect: FillRect, step: number): Texture {
  let byStep = croppedCache.get(source);
  if (!byStep) {
    byStep = new Map();
    croppedCache.set(source, byStep);
  }
  let texture = byStep.get(step);
  if (!texture) {
    const frame = source.frame;
    const width = Math.max(0.01, rect.x + (rect.w * step) / STEPS);
    texture = new Texture({
      source: source.source,
      frame: new Rectangle(frame.x, frame.y, Math.min(frame.width, width), frame.height),
    });
    byStep.set(step, texture);
  }
  return texture;
}

/**
 * Health indicator drawn above a ship using the HUD atlas: frame first, then
 * a fill clipped horizontally from the left (as described by the atlas metadata).
 */
export class HealthBar {
  readonly view = new Container();
  /** Height of the bar in world units (after scaling). */
  readonly height: number;
  private readonly fill: Sprite;
  private readonly fillRect: FillRect;
  private readonly sheet: Spritesheet;
  private readonly style: BarStyle;
  private step = -1;
  private colour = '';

  constructor(sheet: Spritesheet, style: BarStyle, width: number) {
    this.sheet = sheet;
    this.style = style;
    const frameTexture = sheet.textures[FRAME[style]] ?? Texture.EMPTY;
    const frame = new Sprite(frameTexture);
    this.fill = new Sprite(Texture.EMPTY);
    this.fillRect = fillRectOf(sheet, FRAME[style]);
    this.view.addChild(frame, this.fill);
    const scale = width / Math.max(1, frameTexture.width);
    this.view.scale.set(scale);
    this.height = frameTexture.height * scale;
    this.view.pivot.set(frameTexture.width / 2, frameTexture.height);
  }

  setRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    const step = Math.ceil(clamped * STEPS);
    const colour = this.fillName(clamped);
    if (step === this.step && colour === this.colour) return;
    this.step = step;
    this.colour = colour;
    const source = this.sheet.textures[colour];
    this.fill.texture = source && step > 0 ? croppedFill(source, this.fillRect, step) : Texture.EMPTY;
  }

  private fillName(ratio: number): string {
    if (this.style === 'enemy') return ratio > 0.5 ? 'enemy_health_fill_green' : 'enemy_health_fill_red';
    if (ratio > 0.6) return 'health_fill_green';
    if (ratio > 0.3) return 'health_fill_amber';
    return 'health_fill_red';
  }
}
