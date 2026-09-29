import type { PlayerOptions } from '../config/gameConfig';
import type { EndReason, MatchStats } from '../sim/types';

export interface MatchResult {
  readonly matchId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly score: number;
  /** Effective active play time (pauses excluded), in milliseconds. */
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly config: PlayerOptions;
  readonly seed: number;
  readonly stats: MatchStats;
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
