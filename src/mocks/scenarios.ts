import { readJson, STORAGE_KEYS, writeJson } from '../storage/localStore';

export const SCENARIOS = [
  { id: 'normal', label: 'Normal', description: 'Fast, successful responses with fixture captains.' },
  { id: 'empty', label: 'Empty lists', description: 'Only your own confirmed battles; no rival fixtures.' },
  { id: 'many-pages', label: 'Many pages', description: '120 seeded rival battles for any ranking setup, plus 32 of your own that show in your history and rank with their setup.' },
  { id: 'slow', label: 'Slow network', description: 'Every response takes 2.5 seconds.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Seeded latency between 0.1 and 3 seconds.' },
  { id: 'out-of-order', label: 'Out-of-order responses', description: 'Odd requests take 1.5 s, even ones 0.1 s.' },
  { id: 'timeout', label: 'Timeout', description: 'The API never answers; the client times out.' },
  { id: 'network-error', label: 'Connection failure', description: 'Every request fails at the network level.' },
  { id: 'server-error', label: 'HTTP 500', description: 'Every request fails with an internal server error.' },
  { id: 'client-error', label: 'HTTP 4xx', description: 'Queries return 400, match registration returns 422.' },
  { id: 'ranking-error', label: 'Ranking fails', description: 'Ranking returns 503; history keeps working.' },
  { id: 'history-error', label: 'History fails', description: 'History returns 500; ranking keeps working.' },
  { id: 'submit-timeout', label: 'Timeout after registering', description: 'The first POST of a match is stored, then times out.' },
  { id: 'offline', label: 'Unavailable at match end', description: 'The API is down; switch back to recover pending records.' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export const DEFAULT_SCENARIO: ScenarioId = 'normal';
export const SCENARIO_EVENT = 'pirate:scenario-changed';

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && SCENARIOS.some((s) => s.id === value);
}

let current: ScenarioId = readInitialScenario();

function readInitialScenario(): ScenarioId {
  if (typeof window === 'undefined') return DEFAULT_SCENARIO;
  const fromUrl = new URLSearchParams(window.location.search).get('scenario');
  if (isScenarioId(fromUrl)) {
    writeJson(STORAGE_KEYS.mockScenario, fromUrl);
    return fromUrl;
  }
  return readJson(STORAGE_KEYS.mockScenario, isScenarioId) ?? DEFAULT_SCENARIO;
}

export function getScenario(): ScenarioId {
  return current;
}

export function setScenario(id: ScenarioId): void {
  current = id;
  writeJson(STORAGE_KEYS.mockScenario, id);
  window.dispatchEvent(new CustomEvent(SCENARIO_EVENT, { detail: id }));
}
