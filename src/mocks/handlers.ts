import { delay, http, HttpResponse, passthrough } from 'msw';
import {
  API_ROUTES,
  compareRanking,
  MAX_PAGE_SIZE,
  sameConfig,
  type ApiErrorBody,
  type HistoryPage,
  type MatchConfigDto,
  type MatchRecord,
  type MatchRecordInput,
  type RankingPage,
  type SubmitMatchResponse,
} from '../api/contracts';
import { OPTION_LIMITS } from '../game/config/gameConfig';
import { Rng } from '../game/core/rng';
import { isFiniteNumber, isRecord } from '../storage/localStore';
import { mockDb } from './db';
import { FIXTURE_PREFIX, manyPagesFixtures } from './fixtures';
import { getScenario, type ScenarioId } from './scenarios';

type Resource = 'ranking' | 'history' | 'submit';

function testOverrides(): { latency?: number; seed?: number } {
  const t = typeof window !== 'undefined' ? window.__PIRATE_TEST__ : undefined;
  return { latency: t?.mockLatencyMs, seed: t?.mockSeed };
}

let latencyRng = new Rng(testOverrides().seed ?? 20260908);
let requestCounter = 0;

/** Resets per-page mock state (request counter, jitter RNG). */
export function resetMockRuntime(): void {
  latencyRng = new Rng(testOverrides().seed ?? 20260908);
  requestCounter = 0;
}

function latencyFor(scenario: ScenarioId, counter: number): number {
  if (scenario === 'out-of-order') return counter % 2 === 1 ? 1500 : 100;
  const override = testOverrides().latency;
  if (override !== undefined) return override;
  switch (scenario) {
    case 'slow':
      return 2500;
    case 'variable-latency':
      return Math.round(latencyRng.range(100, 3000));
    default:
      return Math.round(latencyRng.range(120, 350));
  }
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return HttpResponse.json(body, { status });
}

/** Scenario-driven failures, evaluated before any business logic. */
function failureFor(scenario: ScenarioId, resource: Resource): Response | null {
  switch (scenario) {
    case 'network-error':
    case 'offline':
      return HttpResponse.error();
    case 'server-error':
      return errorResponse(500, 'internal_error', 'The server hit an unexpected error.');
    case 'client-error':
      return resource === 'submit'
        ? errorResponse(422, 'validation_failed', 'The match record was rejected by the server.')
        : errorResponse(400, 'bad_request', 'The request parameters were rejected.');
    case 'ranking-error':
      return resource === 'ranking' ? errorResponse(503, 'ranking_unavailable', 'The ranking service is unavailable.') : null;
    case 'history-error':
      return resource === 'history' ? errorResponse(500, 'history_unavailable', 'The match history service failed.') : null;
    default:
      return null;
  }
}

function dataset(scenario: ScenarioId): readonly MatchRecord[] {
  const records = mockDb.records();
  if (scenario === 'empty') return records.filter((r) => !r.playerId.startsWith(FIXTURE_PREFIX));
  if (scenario === 'many-pages') return [...records, ...manyPagesFixtures(testOverrides().seed ?? 7)];
  return records;
}

function parsePaging(url: URL): { page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '5');
  if (!Number.isInteger(page) || page < 1) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) return null;
  return { page, pageSize };
}

function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; totalItems: number; totalPages: number } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), totalItems, totalPages };
}

function withinOption(value: unknown, key: keyof typeof OPTION_LIMITS): value is number {
  const limits = OPTION_LIMITS[key];
  return isFiniteNumber(value) && value >= limits.min && value <= limits.max;
}

function isConfig(value: unknown): value is MatchConfigDto {
  return isRecord(value) && withinOption(value.sessionTimeSeconds, 'sessionTimeSeconds') && withinOption(value.spawnIntervalSeconds, 'spawnIntervalSeconds');
}

function validateInput(value: unknown): MatchRecordInput | string {
  if (!isRecord(value)) return 'Body must be a JSON object.';
  const { matchId, playerId, playerName, playedAt, score, durationMs, endReason, config } = value;
  if (typeof matchId !== 'string' || matchId.length < 8) return 'matchId is required.';
  if (typeof playerId !== 'string' || playerId.length < 3) return 'playerId is required.';
  if (typeof playerName !== 'string' || playerName.trim().length < 2 || playerName.length > 20) return 'playerName must have 2-20 characters.';
  if (typeof playedAt !== 'string' || Number.isNaN(Date.parse(playedAt))) return 'playedAt must be an ISO date.';
  if (!Number.isInteger(score) || (score as number) < 0) return 'score must be a non-negative integer.';
  if (!isConfig(config)) return 'config is invalid.';
  if (!Number.isInteger(durationMs) || (durationMs as number) < 0 || (durationMs as number) > config.sessionTimeSeconds * 1000) {
    return 'durationMs must be within the session time.';
  }
  if (endReason !== 'time_up' && endReason !== 'defeated') return 'endReason must be time_up or defeated.';
  return { matchId, playerId, playerName, playedAt, score: score as number, durationMs: durationMs as number, endReason, config };
}

function samePayload(a: MatchRecordInput, b: MatchRecordInput): boolean {
  return (
    a.playerId === b.playerId &&
    a.score === b.score &&
    a.durationMs === b.durationMs &&
    a.endReason === b.endReason &&
    a.playedAt === b.playedAt &&
    sameConfig(a.config, b.config)
  );
}

const GAME_ASSET = /\.(png|json|xml|wav)(\?|$)/;

/**
 * Test-only network conditions for game assets (see TestConfig): lets E2E
 * tests exercise the loading progress, failure and retry paths at the
 * network layer. Without flags every asset request passes straight through.
 */
const assetConditions = http.get(GAME_ASSET, async ({ request }) => {
  const test = typeof window !== 'undefined' ? window.__PIRATE_TEST__ : undefined;
  if (!test?.assetFailure && !test?.assetDelayMs) return undefined;
  if (test.assetFailure && new RegExp(test.assetFailure).test(request.url)) return HttpResponse.error();
  if (test.assetDelayMs) await delay(test.assetDelayMs);
  return passthrough();
});

export const handlers = [
  assetConditions,
  http.get(API_ROUTES.ranking, async ({ request }) => {
    const scenario = getScenario();
    const counter = ++requestCounter;
    // The response is computed at request time, then delayed in transit:
    // a slow response can therefore carry an older revision.
    const url = new URL(request.url);
    const paging = parsePaging(url);
    const config = {
      sessionTimeSeconds: Number(url.searchParams.get('sessionTime')),
      spawnIntervalSeconds: Number(url.searchParams.get('spawnInterval')),
    };
    const revision = mockDb.revision;
    const ranked = dataset(scenario)
      .filter((r) => sameConfig(r.config, config))
      .slice()
      .sort(compareRanking);

    if (scenario === 'timeout') await delay('infinite');
    await delay(latencyFor(scenario, counter));
    const failure = failureFor(scenario, 'ranking');
    if (failure) return failure;
    if (!paging || !isConfig(config)) return errorResponse(400, 'bad_request', 'Invalid paging or configuration.');

    const page = paginate(ranked, paging.page, paging.pageSize);
    const offset = (paging.page - 1) * paging.pageSize;
    const body: RankingPage = {
      page: paging.page,
      pageSize: paging.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
      revision,
      config,
      items: page.items.map((r, i) => ({
        rank: offset + i + 1,
        matchId: r.matchId,
        playerId: r.playerId,
        playerName: r.playerName,
        score: r.score,
        durationMs: r.durationMs,
        endReason: r.endReason,
        playedAt: r.playedAt,
      })),
    };
    return HttpResponse.json(body);
  }),

  http.get('/api/players/:playerId/matches', async ({ request, params }) => {
    const scenario = getScenario();
    const counter = ++requestCounter;
    const url = new URL(request.url);
    const paging = parsePaging(url);
    const playerId = String(params.playerId);
    const revision = mockDb.revision;
    const mine = dataset(scenario)
      .filter((r) => r.playerId === playerId)
      .slice()
      .sort((a, b) => (a.playedAt !== b.playedAt ? (a.playedAt < b.playedAt ? 1 : -1) : a.matchId < b.matchId ? 1 : -1));

    if (scenario === 'timeout') await delay('infinite');
    await delay(latencyFor(scenario, counter));
    const failure = failureFor(scenario, 'history');
    if (failure) return failure;
    if (!paging) return errorResponse(400, 'bad_request', 'Invalid paging parameters.');

    const page = paginate(mine, paging.page, paging.pageSize);
    const body: HistoryPage = {
      page: paging.page,
      pageSize: paging.pageSize,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
      revision,
      playerId,
      items: page.items.map((r) => ({
        matchId: r.matchId,
        playedAt: r.playedAt,
        score: r.score,
        durationMs: r.durationMs,
        endReason: r.endReason,
        config: r.config,
      })),
    };
    return HttpResponse.json(body);
  }),

  http.post(API_ROUTES.matches, async ({ request }) => {
    const scenario = getScenario();
    const counter = ++requestCounter;
    if (scenario === 'timeout') await delay('infinite');
    await delay(latencyFor(scenario, counter));
    const failure = failureFor(scenario, 'submit');
    if (failure) return failure;

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return errorResponse(400, 'invalid_json', 'Body must be valid JSON.');
    }
    const input = validateInput(json);
    if (typeof input === 'string') return errorResponse(422, 'validation_failed', input);
    const headerKey = request.headers.get('Idempotency-Key');
    if (headerKey && headerKey !== input.matchId) return errorResponse(400, 'idempotency_mismatch', 'Idempotency-Key must equal matchId.');

    const existing = mockDb.find(input.matchId);
    if (existing) {
      if (!samePayload(existing, input)) return errorResponse(409, 'conflict', 'A different record already uses this matchId.');
      const replay: SubmitMatchResponse = { record: existing, created: false, revision: mockDb.revision };
      return HttpResponse.json(replay, { status: 200 });
    }

    const record: MatchRecord = { ...input, recordedAt: new Date().toISOString() };
    mockDb.insert(record);
    if (scenario === 'submit-timeout') {
      // Committed on the server, but the answer never reaches the client.
      await delay('infinite');
    }
    const created: SubmitMatchResponse = { record, created: true, revision: mockDb.revision };
    return HttpResponse.json(created, { status: 201 });
  }),

  http.all('/api/*', () => errorResponse(404, 'not_found', 'Unknown API route.')),
];
