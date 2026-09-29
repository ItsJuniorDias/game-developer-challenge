import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { TILE_SIZE, type ArenaLayout, type IslandDef } from '../sim/arena';

/**
 * Tile ids from the tile sheet. Edges and centres list the variants in the
 * order they sit next to each other in the sheet, so repeating them keeps the
 * artwork continuous (the grass island is a 4x4 block: 2 edge and 2x2 centre variants).
 */
interface TileSet {
  tl: number;
  tr: number;
  bl: number;
  br: number;
  t: readonly number[];
  b: readonly number[];
  l: readonly number[];
  r: readonly number[];
  c: readonly (readonly number[])[];
}

const SAND: TileSet = { tl: 1, t: [2], tr: 3, l: [17], c: [[18]], r: [19], bl: 33, b: [34], br: 35 };
const GRASS: TileSet = { tl: 6, t: [7, 8], tr: 9, l: [22, 38], c: [[23, 24], [39, 40]], r: [25, 41], bl: 54, b: [55, 56], br: 57 };
const SHALLOW: TileSet = { tl: 10, t: [11], tr: 12, l: [26], c: [[27]], r: [28], bl: 42, b: [43], br: 44 };

function cycle(list: readonly number[], i: number): number {
  return list[i % list.length] ?? list[0] ?? 0;
}

function pickTile(set: TileSet, col: number, row: number, cols: number, rows: number): number {
  const top = row === 0;
  const bottom = row === rows - 1;
  const left = col === 0;
  const right = col === cols - 1;
  if (top && left) return set.tl;
  if (top && right) return set.tr;
  if (bottom && left) return set.bl;
  if (bottom && right) return set.br;
  if (top) return cycle(set.t, col - 1);
  if (bottom) return cycle(set.b, col - 1);
  if (left) return cycle(set.l, row - 1);
  if (right) return cycle(set.r, row - 1);
  return cycle(set.c[(row - 1) % set.c.length] ?? [], col - 1);
}

/** Darkening applied to the sea outside the playable arena. */
const OUT_OF_BOUNDS_ALPHA = 0.18;

/**
 * Static arena scenery (water, shallows, islands, rocks, plants). Built once
 * per match from the shared layout; only the water layer animates. The sea
 * extends to the edges of the screen (letterbox included), slightly dimmed
 * outside the playable area, so wide screens never show empty bars.
 */
export class ArenaView {
  readonly view = new Container({ label: 'arena' });
  private readonly water: TilingSprite;
  private readonly outOfBounds = new Graphics();
  private readonly layout: ArenaLayout;
  private time = 0;

  constructor(textures: GameTextures, layout: ArenaLayout) {
    this.layout = layout;
    this.water = new TilingSprite({ texture: textures.water, width: layout.width, height: layout.height });
    this.water.tileScale.set(1);
    this.water.tint = 0x9fcbe8;
    this.view.addChild(this.water, this.outOfBounds);

    const tile = (id: number): Texture | undefined => textures.tiles.textures[`tile_${id}`];
    const place = (id: number, x: number, y: number, parent: Container): void => {
      const texture = tile(id);
      if (!texture) return;
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      // Exact size: overlapping semi-transparent shallows would draw darker lines.
      sprite.width = TILE_SIZE;
      sprite.height = TILE_SIZE;
      parent.addChild(sprite);
    };

    const shallows = new Container({ label: 'shallows' });
    const islands = new Container({ label: 'islands' });
    const props = new Container({ label: 'props' });

    const drawBlock = (island: Pick<IslandDef, 'col' | 'row' | 'cols' | 'rows'>, set: TileSet, parent: Container): void => {
      for (let r = 0; r < island.rows; r++) {
        for (let c = 0; c < island.cols; c++) {
          place(pickTile(set, c, r, island.cols, island.rows), (island.col + c) * TILE_SIZE, (island.row + r) * TILE_SIZE, parent);
        }
      }
    };

    for (const island of layout.islands) {
      drawBlock({ col: island.col - 1, row: island.row - 1, cols: island.cols + 2, rows: island.rows + 2 }, SHALLOW, shallows);
      drawBlock(island, island.style === 'grass' ? GRASS : SAND, islands);
    }
    shallows.alpha = 0.9;

    for (const rock of layout.rocks) {
      const texture = tile(rock.tile);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set((rock.col + 0.5) * TILE_SIZE, (rock.row + 0.5) * TILE_SIZE);
      sprite.width = TILE_SIZE;
      sprite.height = TILE_SIZE;
      props.addChild(sprite);
    }
    for (const deco of layout.decorations) {
      const texture = tile(deco.tile);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(deco.x, deco.y);
      sprite.scale.set((TILE_SIZE / texture.width) * (deco.scale ?? 1));
      sprite.rotation = deco.rotation ?? 0;
      props.addChild(sprite);
    }

    const border = new Graphics()
      .rect(0, 0, layout.width, layout.height)
      .stroke({ width: 4, color: 0x0b2f4a, alpha: 0.45, alignment: 1 });

    this.view.addChild(shallows, islands, props, border);
  }

  /**
   * Stretches the sea over the part of the world that is visible on screen
   * (world units, may extend beyond the arena) and dims what is out of bounds.
   */
  setVisibleRect(x: number, y: number, width: number, height: number): void {
    const { width: aw, height: ah } = this.layout;
    const left = Math.min(0, x);
    const top = Math.min(0, y);
    const right = Math.max(aw, x + width);
    const bottom = Math.max(ah, y + height);
    this.water.position.set(left, top);
    this.water.width = right - left;
    this.water.height = bottom - top;
    this.syncWaterPattern();

    const g = this.outOfBounds.clear();
    const dim = { color: 0x031526, alpha: OUT_OF_BOUNDS_ALPHA };
    if (top < 0) g.rect(left, top, right - left, -top).fill(dim);
    if (bottom > ah) g.rect(left, ah, right - left, bottom - ah).fill(dim);
    if (left < 0) g.rect(left, 0, -left, ah).fill(dim);
    if (right > aw) g.rect(aw, 0, right - aw, ah).fill(dim);
  }

  update(dt: number): void {
    this.time += dt;
    this.syncWaterPattern();
  }

  /** Keeps the tiled pattern anchored to world space (plus a slow drift) wherever the sprite starts. */
  private syncWaterPattern(): void {
    this.water.tilePosition.set(this.time * 7 - this.water.x, this.time * 3.5 - this.water.y);
  }
}
