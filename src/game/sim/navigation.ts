import type { Vec2 } from '../core/math';
import type { Arena } from './arena';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * Grid based navigation used by enemy AI. Cells are blocked when a ship of
 * `clearance` radius centred on them would touch an island or the arena edge.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly clearance: number;
  private readonly arena: Arena;
  private readonly walkable: Uint8Array;
  private readonly gScore: Float32Array;
  private readonly fScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly visitStamp: Uint32Array;
  private readonly closedStamp: Uint32Array;
  private stamp = 0;
  private readonly heap: number[] = [];

  constructor(arena: Arena, cellSize: number, clearance: number) {
    this.arena = arena;
    this.cellSize = cellSize;
    this.clearance = clearance;
    this.cols = Math.ceil(arena.width / cellSize);
    this.rows = Math.ceil(arena.height / cellSize);
    const count = this.cols * this.rows;
    this.walkable = new Uint8Array(count);
    this.gScore = new Float32Array(count);
    this.fScore = new Float32Array(count);
    this.cameFrom = new Int32Array(count);
    this.visitStamp = new Uint32Array(count);
    this.closedStamp = new Uint32Array(count);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * cellSize;
        const y = (r + 0.5) * cellSize;
        const free = arena.isInside(x, y, clearance) && arena.distanceToObstacles(x, y) > clearance;
        this.walkable[r * this.cols + c] = free ? 1 : 0;
      }
    }
  }

  isWalkableCell(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.walkable[r * this.cols + c] === 1;
  }

  cellCenter(index: number, out: Vec2): Vec2 {
    out.x = ((index % this.cols) + 0.5) * this.cellSize;
    out.y = (Math.floor(index / this.cols) + 0.5) * this.cellSize;
    return out;
  }

  /** All walkable cell centres whose distance to obstacles is at least `minClearance`. */
  openPoints(minClearance: number): Vec2[] {
    const points: Vec2[] = [];
    for (let i = 0; i < this.walkable.length; i++) {
      if (this.walkable[i] !== 1) continue;
      const p = this.cellCenter(i, { x: 0, y: 0 });
      if (this.arena.isInside(p.x, p.y, minClearance) && this.arena.distanceToObstacles(p.x, p.y) >= minClearance) {
        points.push(p);
      }
    }
    return points;
  }

  private nearestWalkable(x: number, y: number): number {
    const c0 = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const r0 = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    if (this.isWalkableCell(c0, r0)) return r0 * this.cols + c0;
    for (let radius = 1; radius < Math.max(this.cols, this.rows); radius++) {
      let best = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!this.isWalkableCell(c, r)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestDist) {
            bestDist = d;
            best = r * this.cols + c;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * A* search followed by line-of-sight smoothing. Returns waypoints from the
   * start (excluded) to the goal (included), or an empty list if unreachable.
   */
  findPath(sx: number, sy: number, gx: number, gy: number): Vec2[] {
    const start = this.nearestWalkable(sx, sy);
    const goal = this.nearestWalkable(gx, gy);
    if (start < 0 || goal < 0) return [];
    if (start === goal) return [{ x: gx, y: gy }];

    this.stamp++;
    const stamp = this.stamp;
    const heap = this.heap;
    heap.length = 0;
    const goalC = goal % this.cols;
    const goalR = Math.floor(goal / this.cols);
    const heuristic = (index: number): number => {
      const dc = Math.abs((index % this.cols) - goalC);
      const dr = Math.abs(Math.floor(index / this.cols) - goalR);
      return dc + dr + (SQRT2 - 2) * Math.min(dc, dr);
    };

    this.visitStamp[start] = stamp;
    this.gScore[start] = 0;
    this.fScore[start] = heuristic(start);
    this.cameFrom[start] = -1;
    this.heapPush(start);

    let found = false;
    while (heap.length > 0) {
      const current = this.heapPop();
      if (current === goal) {
        found = true;
        break;
      }
      if (this.closedStamp[current] === stamp) continue;
      this.closedStamp[current] = stamp;
      const cc = current % this.cols;
      const cr = Math.floor(current / this.cols);
      for (const [dc, dr, cost] of NEIGHBORS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.isWalkableCell(nc, nr)) continue;
        // Prevent cutting corners diagonally past blocked cells.
        if (dc !== 0 && dr !== 0 && (!this.isWalkableCell(cc + dc, cr) || !this.isWalkableCell(cc, cr + dr))) continue;
        const neighbor = nr * this.cols + nc;
        if (this.closedStamp[neighbor] === stamp) continue;
        const tentative = (this.gScore[current] ?? 0) + cost;
        if (this.visitStamp[neighbor] !== stamp || tentative < (this.gScore[neighbor] ?? Infinity)) {
          this.visitStamp[neighbor] = stamp;
          this.cameFrom[neighbor] = current;
          this.gScore[neighbor] = tentative;
          this.fScore[neighbor] = tentative + heuristic(neighbor);
          this.heapPush(neighbor);
        }
      }
    }
    if (!found) return [];

    const cells: number[] = [];
    for (let at = goal; at !== -1; at = this.cameFrom[at] ?? -1) {
      cells.push(at);
      if (at === start) break;
    }
    cells.reverse();
    const raw = cells.map((index) => this.cellCenter(index, { x: 0, y: 0 }));
    raw[raw.length - 1] = { x: gx, y: gy };
    return this.smooth({ x: sx, y: sy }, raw);
  }

  private smooth(start: Vec2, points: Vec2[]): Vec2[] {
    const result: Vec2[] = [];
    let anchor = start;
    let i = 0;
    while (i < points.length) {
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        const p = points[j];
        if (p && this.arena.hasLineOfSight(anchor.x, anchor.y, p.x, p.y, this.clearance * 0.9)) {
          furthest = j;
          break;
        }
      }
      const next = points[furthest];
      if (!next) break;
      result.push(next);
      anchor = next;
      i = furthest + 1;
    }
    return result;
  }

  private heapPush(index: number): void {
    const heap = this.heap;
    heap.push(index);
    let i = heap.length - 1;
    const f = this.fScore;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const pi = heap[parent] as number;
      if ((f[pi] as number) <= (f[index] as number)) break;
      heap[i] = pi;
      i = parent;
    }
    heap[i] = index;
  }

  private heapPop(): number {
    const heap = this.heap;
    const top = heap[0] as number;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      const f = this.fScore;
      let i = 0;
      const length = heap.length;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        let smallestF = f[last] as number;
        if (left < length && (f[heap[left] as number] as number) < smallestF) {
          smallest = left;
          smallestF = f[heap[left] as number] as number;
        }
        if (right < length && (f[heap[right] as number] as number) < smallestF) {
          smallest = right;
        }
        if (smallest === i) break;
        heap[i] = heap[smallest] as number;
        i = smallest;
      }
      heap[i] = last;
    }
    return top;
  }
}
