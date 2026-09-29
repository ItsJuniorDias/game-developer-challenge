import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, createHttpClient, MOCK_RESPONSE_HEADER, setMockGuard } from './http';

function adapter(status: number, headers: Record<string, string>, body: unknown): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const response = { data: body, status, statusText: String(status), headers, config, request: {} };
    if (status >= 400) {
      const { AxiosError } = await import('axios');
      throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    }
    return response;
  };
}

describe('http client with the mock guard', () => {
  afterEach(() => setMockGuard(null));

  it('accepts responses produced by the mock server', async () => {
    setMockGuard({ ensureReady: async () => undefined });
    const client = createHttpClient();
    client.defaults.adapter = adapter(200, { [MOCK_RESPONSE_HEADER]: '1' }, { ok: true });
    await expect(client.get('/api/ranking')).resolves.toMatchObject({ data: { ok: true } });
  });

  it('turns a real-server 404 (mock bypassed) into a retryable network error', async () => {
    setMockGuard({ ensureReady: async () => undefined });
    const client = createHttpClient();
    client.defaults.adapter = adapter(404, {}, { error: { code: 'NOT_FOUND', message: 'The page could not be found' } });
    const error = await client.post('/api/matches', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
    expect((error as ApiError).retryable).toBe(true);
  });

  it('keeps mocked HTTP errors as HTTP errors', async () => {
    setMockGuard({ ensureReady: async () => undefined });
    const client = createHttpClient();
    client.defaults.adapter = adapter(422, { [MOCK_RESPONSE_HEADER]: '1' }, { error: { code: 'validation_failed', message: 'Bad record' } });
    const error = (await client.post('/api/matches', {}).catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('http');
    expect(error.status).toBe(422);
    expect(error.retryable).toBe(false);
  });

  it('fails as a retryable error when the mock server cannot be reached', async () => {
    setMockGuard({
      ensureReady: async () => {
        throw new Error('not controlled');
      },
    });
    const client = createHttpClient();
    client.defaults.adapter = adapter(200, { [MOCK_RESPONSE_HEADER]: '1' }, {});
    const error = (await client.get('/api/ranking').catch((e: unknown) => e)) as ApiError;
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });
});
