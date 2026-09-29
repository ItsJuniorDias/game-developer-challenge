import type { EndReason, MatchConfigDto, MatchRecord, MatchRecordInput } from '../api/contracts';
import { isFiniteNumber, isRecord } from './localStore';

/** Deep validators for everything read back from localStorage. */

export function isEndReason(value: unknown): value is EndReason {
  return value === 'time_up' || value === 'defeated';
}

export function isMatchConfig(value: unknown): value is MatchConfigDto {
  return isRecord(value) && isFiniteNumber(value.sessionTimeSeconds) && isFiniteNumber(value.spawnIntervalSeconds);
}

export function isMatchRecordInput(value: unknown): value is MatchRecordInput {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.playerName === 'string' &&
    typeof value.playedAt === 'string' &&
    isFiniteNumber(value.score) &&
    isFiniteNumber(value.durationMs) &&
    isEndReason(value.endReason) &&
    isMatchConfig(value.config)
  );
}

export function isMatchRecord(value: unknown): value is MatchRecord {
  return isMatchRecordInput(value) && typeof (value as unknown as Record<string, unknown>).recordedAt === 'string';
}
