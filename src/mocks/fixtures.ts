import type { EndReason, MatchConfigDto, MatchRecord } from '../api/contracts';
import { Rng } from '../game/core/rng';

/** Rival captains represented by fixtures (other players of the leaderboard). */
export const FIXTURE_CAPTAINS = [
  { playerId: 'fixture-flint', playerName: 'Captain Flint' },
  { playerId: 'fixture-sparrow', playerName: 'Red Sparrow' },
  { playerId: 'fixture-storm', playerName: 'Storm Rider' },
  { playerId: 'fixture-wolf', playerName: 'Sea Wolf' },
  { playerId: 'fixture-bonny', playerName: 'Anne Bonny' },
  { playerId: 'fixture-kidd', playerName: 'William Kidd' },
  { playerId: 'fixture-grace', playerName: "Grace O'Malley" },
  { playerId: 'fixture-roberts', playerName: 'Black Bart' },
  { playerId: 'fixture-ching', playerName: 'Ching Shih' },
  { playerId: 'fixture-drake', playerName: 'Iron Drake' },
] as const;

export const FIXTURE_PREFIX = 'fixture-';

const BASE_TIME = Date.UTC(2026, 8, 8, 18, 0, 0);

function record(
  index: number,
  captain: (typeof FIXTURE_CAPTAINS)[number],
  score: number,
  durationMs: number,
  endReason: EndReason,
  config: MatchConfigDto,
  minutesAgo: number,
): MatchRecord {
  const playedAt = new Date(BASE_TIME - minutesAgo * 60_000).toISOString();
  return {
    matchId: `${FIXTURE_PREFIX}match-${String(index).padStart(4, '0')}`,
    playerId: captain.playerId,
    playerName: captain.playerName,
    playedAt,
    recordedAt: playedAt,
    score,
    durationMs,
    endReason,
    config,
  };
}

const DEFAULT_CONFIG: MatchConfigDto = { sessionTimeSeconds: 120, spawnIntervalSeconds: 3 };

/** Hand-written leaderboard for the default configuration (120 s, 3 s spawns). */
export function baseFixtures(): MatchRecord[] {
  const c = FIXTURE_CAPTAINS;
  const rows: [number, number, number, EndReason, number][] = [
    [0, 38, 120_000, 'time_up', 20],
    [1, 32, 120_000, 'time_up', 104],
    [2, 21, 120_000, 'time_up', 190],
    [3, 19, 120_000, 'time_up', 216],
    [4, 17, 98_000, 'defeated', 240],
    [5, 17, 120_000, 'time_up', 300],
    [6, 15, 120_000, 'time_up', 360],
    [7, 14, 87_000, 'defeated', 420],
    [8, 12, 120_000, 'time_up', 480],
    [9, 11, 76_000, 'defeated', 540],
    [0, 29, 120_000, 'time_up', 1500],
    [1, 9, 64_000, 'defeated', 1600],
    [2, 8, 120_000, 'time_up', 1700],
  ];
  const records = rows.map(([captain, score, duration, reason, ago], i) => {
    const who = c[captain];
    if (!who) throw new Error('fixture captain missing');
    return record(i + 1, who, score, duration, reason, DEFAULT_CONFIG, ago);
  });
  // A few matches with other configurations prove the ranking is scoped by config.
  const other: MatchConfigDto = { sessionTimeSeconds: 60, spawnIntervalSeconds: 2 };
  const fast = c[3];
  const kidd = c[5];
  if (fast && kidd) {
    records.push(record(90, fast, 22, 60_000, 'time_up', other, 30));
    records.push(record(91, kidd, 16, 60_000, 'time_up', other, 50));
  }
  return records;
}

/** Large, seeded set of rival battles used by the "many pages" scenario (for the requested ranking configuration). */
export function manyPagesFixtures(seed: number, config: MatchConfigDto = DEFAULT_CONFIG): MatchRecord[] {
  const rng = new Rng(seed);
  const records: MatchRecord[] = [];
  for (let i = 0; i < 120; i++) {
    const captain = rng.pick(FIXTURE_CAPTAINS);
    const defeated = rng.next() < 0.35;
    const duration = defeated ? Math.round(rng.range(30, config.sessionTimeSeconds - 1)) * 1000 : config.sessionTimeSeconds * 1000;
    const configTag = `${config.sessionTimeSeconds}-${config.spawnIntervalSeconds}`;
    const generated = record(1000 + i, captain, rng.int(0, 45), duration, defeated ? 'defeated' : 'time_up', config, 2000 + i * 37);
    records.push({ ...generated, matchId: `${generated.matchId}-${configTag}` });
  }
  return records;
}

/** Seeded battle history of the current player for the "many pages" scenario (32 battles, 7 pages). */
export function manyPagesHistory(seed: number, playerId: string, playerName: string): MatchRecord[] {
  const rng = new Rng(seed + 1);
  const records: MatchRecord[] = [];
  for (let i = 0; i < 32; i++) {
    const config = i % 4 === 0 ? { sessionTimeSeconds: 60, spawnIntervalSeconds: 2 } : DEFAULT_CONFIG;
    const defeated = rng.next() < 0.4;
    const duration = defeated ? Math.round(rng.range(25, config.sessionTimeSeconds - 1)) * 1000 : config.sessionTimeSeconds * 1000;
    const playedAt = new Date(BASE_TIME - (i + 1) * 5_400_000).toISOString();
    records.push({
      matchId: `${FIXTURE_PREFIX}history-${String(i + 1).padStart(3, '0')}`,
      playerId,
      playerName,
      playedAt,
      recordedAt: playedAt,
      score: rng.int(3, 36),
      durationMs: duration,
      endReason: defeated ? 'defeated' : 'time_up',
      config,
    });
  }
  return records;
}
