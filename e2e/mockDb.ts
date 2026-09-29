import { PROFILE, STORAGE } from './fixtures';

const FIXTURE_TIME = Date.UTC(2026, 8, 20, 12, 0, 0);

/** Builds a mock database payload with N battles of the test captain. */
export function historyDb(count: number): Record<string, unknown> {
  const records = Array.from({ length: count }, (_, i) => {
    const playedAt = new Date(FIXTURE_TIME - i * 3_600_000).toISOString();
    return {
      matchId: `e2e-match-${String(i + 1).padStart(3, '0')}`,
      playerId: PROFILE.playerId,
      playerName: PROFILE.playerName,
      playedAt,
      recordedAt: playedAt,
      score: 10 + i,
      durationMs: i % 3 === 0 ? 75_000 : 120_000,
      endReason: i % 3 === 0 ? 'defeated' : 'time_up',
      config: { sessionTimeSeconds: 120, spawnIntervalSeconds: 3 },
    };
  });
  return { [STORAGE.mockDb]: { version: 1, revision: 5, records } };
}
