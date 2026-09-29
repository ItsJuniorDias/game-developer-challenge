import { ApiError } from '../../api/http';

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'timeout':
        return 'The server took too long to answer.';
      case 'network':
        return 'Could not reach the server.';
      case 'http':
        return `${error.message} (HTTP ${error.status ?? '?'})`;
      default:
        return error.message;
    }
  }
  return 'Something went wrong.';
}
