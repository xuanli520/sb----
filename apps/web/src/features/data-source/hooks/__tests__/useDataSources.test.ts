import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDataSources } from '../useDataSources';
import { queryKeys } from '@/lib/query/keys';
import { DataSourceFilter } from '../../services/dataSourceApi';

const mockGetAll = vi.fn();

vi.mock('../../services/dataSourceApi', () => ({
  dataSourceApi: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/data-source',
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useDataSources', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockGetAll.mockReset();
    mockGetAll.mockResolvedValue({
      items: [{ id: 1, name: 'Test', type: 'DOUYIN_API', status: 'ACTIVE', config: {} }],
      meta: { page: 1, size: 10, total: 1, pages: 1, has_next: false, has_prev: false },
    });
  });

  it('should cache list response by query key', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const filters: DataSourceFilter = {
      name: 'shop',
      status: 'ACTIVE',
      source_type: 'DOUYIN_SHOP',
      page: 1,
      size: 10,
    };

    const { result } = renderHook(() => useDataSources(filters), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data.items).toHaveLength(1);
    });

    expect(mockGetAll).toHaveBeenCalledWith(filters);
    expect(
      queryClient.getQueryData(queryKeys.dataSources.list(filters as Record<string, unknown>))
    ).toEqual({
      items: [{ id: 1, name: 'Test', type: 'DOUYIN_API', status: 'ACTIVE', config: {} }],
      meta: { page: 1, size: 10, total: 1, pages: 1, has_next: false, has_prev: false },
    });
  });

  it('should update filters and create a new cached query entry', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);

    mockGetAll
      .mockResolvedValueOnce({
        items: [],
        meta: { page: 1, size: 10, total: 0, pages: 0, has_next: false, has_prev: false },
      })
      .mockResolvedValueOnce({
        items: [{ id: 2, name: 'Second', type: 'FILE_UPLOAD', status: 'INACTIVE', config: {} }],
        meta: { page: 1, size: 10, total: 1, pages: 1, has_next: false, has_prev: false },
      });

    const { result } = renderHook(() => useDataSources(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.updateFilters({ name: 'second' });
    });

    await waitFor(() => {
      expect(mockGetAll).toHaveBeenCalledTimes(2);
      expect(result.current.data.items[0]?.id).toBe(2);
    });

    expect(
      queryClient.getQueryData(
        queryKeys.dataSources.list({
          page: 1,
          size: 10,
          name: 'second',
          status: undefined,
          source_type: undefined,
        } as Record<string, unknown>)
      )
    ).toEqual({
      items: [{ id: 2, name: 'Second', type: 'FILE_UPLOAD', status: 'INACTIVE', config: {} }],
      meta: { page: 1, size: 10, total: 1, pages: 1, has_next: false, has_prev: false },
    });
  });
});
