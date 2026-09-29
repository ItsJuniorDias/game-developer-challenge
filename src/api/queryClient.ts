import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

export const MAX_RETRIES = 2;

export function retryDelay(attempt: number): number {
  const base = typeof window !== 'undefined' ? (window.__PIRATE_TEST__?.apiRetryDelayMs ?? 600) : 600;
  return Math.min(base * 2 ** attempt, 5000);
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.retryable && failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: shouldRetry,
        retryDelay,
      },
    },
  });
}
