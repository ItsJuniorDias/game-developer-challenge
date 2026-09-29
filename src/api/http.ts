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

function resolveTimeout(): number {
  const override = typeof window !== 'undefined' ? window.__PIRATE_TEST__?.apiTimeoutMs : undefined;
  return override ?? DEFAULT_TIMEOUT_MS;
}

export function createHttpClient(): AxiosInstance {
  const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
    headers: { Accept: 'application/json' },
  });
  client.interceptors.request.use((config) => {
    config.timeout = resolveTimeout();
    return config;
  });
  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(toApiError(error)),
  );
  return client;
}

export const http = createHttpClient();
