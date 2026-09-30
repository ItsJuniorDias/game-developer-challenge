import { Container, Text, TextStyle } from 'pixi.js';

export type FloatingTextKind = 'score' | 'damage';

interface Entry {
  readonly text: Text;
  age: number;
  life: number;
  rise: number;
  startY: number;
}

const FONT = 'Rubik, system-ui, sans-serif';
const STYLES: Readonly<Record<FloatingTextKind, TextStyle>> = {
  score: new TextStyle({
    fontFamily: FONT,
    fontWeight: '800',
    fontSize: 46,
    fill: 0xffd774,
    stroke: { color: 0x3a230f, width: 8, join: 'round' },
  }),
  damage: new TextStyle({
    fontFamily: FONT,
    fontWeight: '800',
    fontSize: 34,
    fill: 0xffb3a6,
    stroke: { color: 0x3b0d08, width: 7, join: 'round' },
  }),
};
const MAX_ENTRIES = 16;
const POP_SECONDS = 0.14;

/**
 * Pooled floating numbers in world space ("+1" for a sunk enemy, damage taken
 * by the player). They rise, pop in and fade out; purely cosmetic.
 */
export class FloatingTextLayer {
  readonly view = new Container({ label: 'floating-text' });
  private readonly active: Entry[] = [];
  private readonly pool: Entry[] = [];

  spawn(kind: FloatingTextKind, value: string, x: number, y: number): void {
    if (this.active.length >= MAX_ENTRIES) return;
    const entry = this.pool.pop() ?? { text: new Text({ text: '', style: STYLES[kind], anchor: 0.5 }), age: 0, life: 1, rise: 0, startY: 0 };
    const text = entry.text;
    if (text.style !== STYLES[kind]) text.style = STYLES[kind];
    text.text = value;
    text.position.set(x, y);
    text.alpha = 1;
    text.scale.set(0.5);
    text.visible = true;
    entry.age = 0;
    entry.life = kind === 'score' ? 1.1 : 0.9;
    entry.rise = kind === 'score' ? 70 : 50;
    entry.startY = y;
    this.view.addChild(text);
    this.active.push(entry);
  }

  update(dt: number): void {
    let write = 0;
    for (const entry of this.active) {
      entry.age += dt;
      const t = Math.min(1, entry.age / entry.life);
      const text = entry.text;
      // Ease-out rise, a quick overshooting pop, then fade over the last 40%.
      text.y = entry.startY - entry.rise * (1 - (1 - t) * (1 - t));
      const pop = Math.min(1, entry.age / POP_SECONDS);
      text.scale.set(pop < 1 ? 0.5 + 0.75 * pop : 1.25 - 0.25 * Math.min(1, (entry.age - POP_SECONDS) / POP_SECONDS));
      text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (entry.age >= entry.life) {
        text.visible = false;
        text.parent?.removeChild(text);
        this.pool.push(entry);
      } else {
        this.active[write++] = entry;
      }
    }
    this.active.length = write;
  }

  get count(): number {
    return this.active.length;
  }

  destroy(): void {
    for (const entry of [...this.active, ...this.pool]) entry.text.destroy();
    this.active.length = 0;
    this.pool.length = 0;
    this.view.destroy({ children: true });
  }
}
