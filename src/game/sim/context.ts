import type { GameConfig } from '../config/gameConfig';
import type { Vec2 } from '../core/math';
import type { Rng } from '../core/rng';
import type { Arena } from './arena';
import type { NavGrid } from './navigation';
import type { SimEvent } from './types';

/** Read-only services shared by every system during a step. */
export interface SimContext {
  readonly config: GameConfig;
  readonly arena: Arena;
  readonly nav: NavGrid;
  readonly rng: Rng;
  /** Open-water points where an enemy can safely appear. */
  readonly spawnPoints: readonly Vec2[];
  emit(event: SimEvent): void;
}
