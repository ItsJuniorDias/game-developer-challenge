import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameTextures';
import { TILE_SIZE, type ArenaLayout, type IslandDef } from '../sim/arena';

/** 9-slice tile ids from the tile sheet for each island style. */
const SAND = { tl: 1, t: [2], tr: 3, l: [17], c: [18], r: [19], bl: 33, b: [34], br: 35 };
const GRASS = { tl: 6, t: [7, 8], tr: 9, l: [22, 38], c: [23, 40, 39, 24], r: [25, 41], bl: 54, b: [55, 56], br: 57 };
const SHALLOW = { tl: 10, t: [11], tr: 12, l: [26], c: [27], r: [28], bl: 42, b: [43], br: 44 };

type TileSet = typeof SAND;

function pickTile(set: TileSet, col: number, row: number, cols: number, rows: number): number {
  const top = row === 0;
  const bottom = row === rows - 1;
  const left = col === 0;
  const right = col === cols - 1;
  const cycle = (list: number[], i: number): number => list[i % list.length] ?? list[0] ?? 0;
  if (top && left) return set.tl;
  if (top && right) return set.tr;
  if (bottom && left) return set.bl;
  if (bottom && right) return set.br;
  if (top) return cycle(set.t, col - 1);
  if (bottom) return cycle(set.b, col - 1);
  if (left) return cycle(set.l, row - 1);
  if (right) return cycle(set.r, row - 1);
  return cycle(set.c, (row - 1) * 2 + (col - 1));
}

/**
 * Static arena scenery (water, shallows, islands, rocks, plants). Built once
 * per match from the shared layout; only the water layers animate.
 */
export class ArenaView {
  readonly view = new Container({ label: 'arena' });
  private readonly water: TilingSprite;
  private time = 0;

  constructor(textures: GameTextures, layout: ArenaLayout) {
    this.water = new TilingSprite({ texture: textures.water, width: layout.width, height: layout.height });
    this.water.tileScale.set(1);
    this.water.tint = 0x9fcbe8;
    this.view.addChild(this.water);

    const tile = (id: number): Texture | undefined => textures.tiles.textures[`tile_${id}`];
    const place = (id: number, x: number, y: number, parent: Container): void => {
      const texture = tile(id);
      if (!texture) return;
      const sprite = new Sprite(texture);
      sprite.position.set(x, y);
      // +0.75 units overlap hides hairline seams between neighbouring tiles.
      sprite.width = TILE_SIZE + 0.75;
      sprite.height = TILE_SIZE + 0.75;
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
      .stroke({ width: 10, color: 0x0b2f4a, alpha: 0.55, alignment: 1 });

    this.view.addChild(shallows, islands, props, border);
  }

  update(dt: number): void {
    this.time += dt;
    // A slow drift is enough to make the sea feel alive without extra passes.
    this.water.tilePosition.set(this.time * 7, this.time * 3.5);
  }
}
