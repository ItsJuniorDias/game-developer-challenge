import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { PageMeta } from './contracts';
import { keepNewest } from './queries';

const page = (revision: number, tag: string) => ({ page: 1, pageSize: 5, totalItems: 1, totalPages: 1, revision, tag }) as PageMeta & { tag: string };

describe('keepNewest', () => {
  it('keeps cached data when a late response carries an older revision', () => {
    const client = new QueryClient();
    const key = ['captains-log', 'ranking', 120, 3, 1];
    client.setQueryData(key, page(7, 'fresh'));
    expect(keepNewest(client, key, page(5, 'stale')).tag).toBe('fresh');
  });

  it('accepts equal or newer revisions', () => {
    const client = new QueryClient();
    const key = ['captains-log', 'history', 'p', 1];
    client.setQueryData(key, page(7, 'cached'));
    expect(keepNewest(client, key, page(7, 'same')).tag).toBe('same');
    expect(keepNewest(client, key, page(9, 'newer')).tag).toBe('newer');
  });
});
