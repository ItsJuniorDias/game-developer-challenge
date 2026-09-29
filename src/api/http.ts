import axios, { AxiosError, type AxiosInstance } from 'axios';
import type { ApiErrorBody } from './contracts';

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'canceled' | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  /** Transient failures worth retrying; 4xx (except 408/429) are not. */
  get retryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network') return true;
    if (this.kind === 'http' && this.status !== null) return this.status >= 500 || this.status === 408 || this.status === 429;
    return false;
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('canceled', 'Request canceled');
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
      return new ApiError('timeout', 'The server took too long to answer.');
    }
    if (error.response) {
      const body = error.response.data as Partial<ApiErrorBody> | undefined;
      const message = body?.error?.message ?? `Request failed with status ${error.response.status}`;
      return new ApiError('http', message, error.response.status, body?.error?.code ?? null);
    }
    if (error.code === AxiosError.ERR_NETWORK || error.request) {
      return new ApiError('network', 'Could not reach the server. Check your connection.');
    }
  }
  return new ApiError('unknown', error instanceof Error ? error.message : 'Unexpected error');
}

export const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 8000) || 8000;

/** Header added by the mock server to every API response it produces. */
export const MOCK_RESPONSE_HEADER = 'x-pirate-mock';

function resolveTimeout(): number {
  const override = typeof window !== 'undefined' ? window.__PIRATE_TEST__?.apiTimeoutMs : undefined;
  return override ?? DEFAULT_TIMEOUT_MS;
}

interface MockGuard {
  /** Resolves once the mock server is ready to answer this page. */
  ensureReady: () => Promise<void>;
}

let mockGuard: MockGuard | null = null;

/**
 * Registers the simulated backend. While registered, every request first makes
 * sure the Service Worker is handling this page, and any response that did not
 * come from the mock server (it reached the hosting server instead, e.g. after
 * the browser restarted the worker) is treated as a transient network error.
 */
export function setMockGuard(guard: MockGuard | null): void {
  mockGuard = guard;
}

function mockUnavailable(): ApiError {
  return new ApiError('network', 'The simulated API is not available right now.');
}

export function createHttpClient(): AxiosInstance {
  const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
    headers: { Accept: 'application/json' },
  });
  client.interceptors.request.use(async (config) => {
    config.timeout = resolveTimeout();
    if (mockGuard) {
      try {
        await mockGuard.ensureReady();
      } catch {
        throw mockUnavailable();
      }
    }
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      if (mockGuard && !response.headers[MOCK_RESPONSE_HEADER]) throw mockUnavailable();
      return response;
    },
    (error: unknown) => {
      if (mockGuard && error instanceof AxiosError && error.response && !error.response.headers[MOCK_RESPONSE_HEADER]) {
        return Promise.reject(mockUnavailable());
      }
      return Promise.reject(toApiError(error));
    },
  );
  return client;
}

export const http = createHttpClient();
