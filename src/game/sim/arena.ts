import { clamp, type Vec2 } from '../core/math';

/**
 * Arena layout shared by the simulation (collision shapes) and the renderer
 * (tiles). World units map 1:1 to retina tile pixels: one tile is 128 units.
 */
export const TILE_SIZE = 128;
export const ARENA_COLS = 16;
export const ARENA_ROWS = 9;
export const ARENA_WIDTH = TILE_SIZE * ARENA_COLS;
export const ARENA_HEIGHT = TILE_SIZE * ARENA_ROWS;

export type IslandStyle = 'sand' | 'grass';

export interface IslandDef {
  readonly id: string;
  readonly style: IslandStyle;
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
}

export interface RockDef {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  /** Tile id from the tile sheet (49-51 plain rocks, 65-67 mossy rocks). */
  readonly tile: number;
  readonly radius: number;
}

export interface DecorationDef {
  readonly tile: number;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly rotation?: number;
}

export interface ArenaLayout {
  readonly width: number;
  readonly height: number;
  readonly playerSpawn: Vec2 & { rotation: number };
  readonly islands: readonly IslandDef[];
  readonly rocks: readonly RockDef[];
  readonly decorations: readonly DecorationDef[];
}

export type Obstacle =
  | { readonly kind: 'roundRect'; readonly id: string; readonly cx: number; readonly cy: number; readonly hx: number; readonly hy: number; readonly radius: number }
  | { readonly kind: 'circle'; readonly id: string; readonly cx: number; readonly cy: number; readonly radius: number };

/** Transparent margin around the sand silhouette inside island tiles (retina tiles are opaque from ~4-8 px in). */
const ISLAND_INSET = 8;
const ISLAND_CORNER_RADIUS = 56;

export const DEFAULT_LAYOUT: ArenaLayout = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  playerSpawn: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 + 40, rotation: -Math.PI / 2 },
  islands: [
    { id: 'north-west', style: 'grass', col: 1, row: 1, cols: 4, rows: 3 },
    { id: 'north-east', style: 'sand', col: 11, row: 1, cols: 3, rows: 2 },
    { id: 'south-east', style: 'grass', col: 9, row: 6, cols: 4, rows: 2 },
    { id: 'south-west', style: 'sand', col: 2, row: 6, cols: 2, rows: 2 },
  ],
  rocks: [
    { id: 'rock-a', col: 7, row: 1, tile: 50, radius: 44 },
    { id: 'rock-b', col: 14, row: 5, tile: 65, radius: 34 },
    { id: 'rock-c', col: 6, row: 7, tile: 67, radius: 34 },
  ],
  decorations: [
    { tile: 71, x: 256, y: 256, scale: 1 },
    { tile: 72, x: 480, y: 330, scale: 0.9, rotation: 0.6 },
    { tile: 70, x: 380, y: 200, scale: 0.8, rotation: -0.4 },
    { tile: 88, x: 560, y: 220, scale: 1 },
    { tile: 49, x: 200, y: 400, scale: 0.6 },
    { tile: 71, x: 1300, y: 860, scale: 0.9, rotation: 0.3 },
    { tile: 70, x: 1480, y: 900, scale: 0.8, rotation: 1.2 },
    { tile: 87, x: 1560, y: 830, scale: 1 },
    { tile: 66, x: 1560, y: 230, scale: 0.55 },
    { tile: 87, x: 1480, y: 300, scale: 0.9 },
    { tile: 88, x: 360, y: 900, scale: 0.9, rotation: 0.8 },
  ],
};

export function buildObstacles(layout: ArenaLayout): Obstacle[] {
  const islands: Obstacle[] = layout.islands.map((island) => {
    const w = island.cols * TILE_SIZE - ISLAND_INSET * 2;
    const h = island.rows * TILE_SIZE - ISLAND_INSET * 2;
    return {
      kind: 'roundRect',
      id: island.id,
      cx: (island.col + island.cols / 2) * TILE_SIZE,
      cy: (island.row + island.rows / 2) * TILE_SIZE,
      hx: w / 2,
      hy: h / 2,
      radius: Math.min(ISLAND_CORNER_RADIUS, w / 2, h / 2),
    };
  });
  const rocks: Obstacle[] = layout.rocks.map((rock) => ({
    kind: 'circle',
    id: rock.id,
    cx: (rock.col + 0.5) * TILE_SIZE,
    cy: (rock.row + 0.5) * TILE_SIZE,
    radius: rock.radius,
  }));
  return [...islands, ...rocks];
}

/** Signed distance from a point to an obstacle surface (negative inside). */
export function obstacleDistance(o: Obstacle, px: number, py: number): number {
  if (o.kind === 'circle') {
    return Math.hypot(px - o.cx, py - o.cy) - o.radius;
  }
  const qx = Math.abs(px - o.cx) - (o.hx - o.radius);
  const qy = Math.abs(py - o.cy) - (o.hy - o.radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - o.radius;
}

/** Outward surface normal of an obstacle at the given point. */
export function obstacleNormal(o: Obstacle, px: number, py: number, out: Vec2): Vec2 {
  const dx = px - o.cx;
  const dy = py - o.cy;
  if (o.kind === 'circle') {
    const len = Math.hypot(dx, dy) || 1;
    out.x = dx / len;
    out.y = dy / len;
    return out;
  }
  const qx = Math.abs(dx) - (o.hx - o.radius);
  const qy = Math.abs(dy) - (o.hy - o.radius);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1;
    out.x = (sx * qx) / len;
    out.y = (sy * qy) / len;
  } else if (qx > qy) {
    out.x = sx;
    out.y = 0;
  } else {
    out.x = 0;
    out.y = sy;
  }
  return out;
}

export class Arena {
  readonly width: number;
  readonly height: number;
  readonly obstacles: readonly Obstacle[];
  readonly layout: ArenaLayout;
  private readonly scratch: Vec2 = { x: 0, y: 0 };

  constructor(layout: ArenaLayout = DEFAULT_LAYOUT) {
    this.layout = layout;
    this.width = layout.width;
    this.height = layout.height;
    this.obstacles = buildObstacles(layout);
  }

  /** Distance from the point to the closest obstacle surface. */
  distanceToObstacles(px: number, py: number): number {
    let min = Number.POSITIVE_INFINITY;
    for (const o of this.obstacles) {
      const d = obstacleDistance(o, px, py);
      if (d < min) min = d;
    }
    return min;
  }

  isInside(px: number, py: number, margin = 0): boolean {
    return px >= margin && py >= margin && px <= this.width - margin && py <= this.height - margin;
  }

  /** Returns the obstacle containing the point, if any. */
  obstacleAt(px: number, py: number, margin = 0): Obstacle | null {
    for (const o of this.obstacles) {
      if (obstacleDistance(o, px, py) < margin) return o;
    }
    return null;
  }

  /**
   * Pushes a circle out of obstacles and keeps it inside the arena.
   * Returns true when a correction was applied.
   */
  resolveCircle(pos: Vec2, radius: number): boolean {
    let corrected = false;
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (const o of this.obstacles) {
        const penetration = radius - obstacleDistance(o, pos.x, pos.y);
        if (penetration > 0) {
          const n = obstacleNormal(o, pos.x, pos.y, this.scratch);
          pos.x += n.x * penetration;
          pos.y += n.y * penetration;
          moved = true;
        }
      }
      const cx = clamp(pos.x, radius, this.width - radius);
      const cy = clamp(pos.y, radius, this.height - radius);
      if (cx !== pos.x || cy !== pos.y) {
        pos.x = cx;
        pos.y = cy;
        moved = true;
      }
      if (!moved) break;
      corrected = true;
    }
    return corrected;
  }

  /**
   * True when a circle of `radius` can travel in a straight line between the
   * two points without touching an obstacle (sphere tracing).
   */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number, radius = 0): boolean {
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-6) return this.distanceToObstacles(ax, ay) > radius;
    const dx = (bx - ax) / length;
    const dy = (by - ay) / length;
    let t = 0;
    while (t <= length) {
      const d = this.distanceToObstacles(ax + dx * t, ay + dy * t) - radius;
      if (d <= 0) return false;
      t += Math.max(d, 4);
    }
    return this.distanceToObstacles(bx, by) > radius;
  }
}
