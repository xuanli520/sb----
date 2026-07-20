import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { queryKeys } from '@/lib/query/keys';
import { useCreateDataSource } from '../useCreateDataSource';
import { useUpdateDataSource } from '../useUpdateDataSource';
import { useDeleteDataSource } from '../useDeleteDataSource';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const uploadMock = vi.fn();
const buildPlanMock = vi.fn();

vi.mock('../../services/dataSourceApi', () => ({
  dataSourceApi: {
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    uploadShopDashboardLoginState: (...args: unknown[]) => uploadMock(...args),
  },
}));

vi.mock('../../services/shopDashboardLoginState', () => ({
  buildDataSourceConfigSubmitPlan: (...args: unknown[]) => buildPlanMock(...args),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('data source mutation hooks', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    buildPlanMock.mockReturnValue({ nextConfig: { endpoint: 'x' } });
    createMock.mockResolvedValue({
      id: 1,
      name: 'source',
      type: 'DOUYIN_SHOP',
      status: 'ACTIVE',
      config: {},
    });
    updateMock.mockResolvedValue({
      id: 1,
      name: 'source-updated',
      type: 'DOUYIN_SHOP',
      status: 'ACTIVE',
      config: {},
    });
    deleteMock.mockResolvedValue(undefined);
    uploadMock.mockResolvedValue({
      id: 1,
      name: 'source',
      type: 'DOUYIN_SHOP',
      status: 'ACTIVE',
      config: {},
    });
  });

  it('create should invalidate data source list queries after success', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDataSource(), { wrapper });

    await act(async () => {
      await result.current.create({
        name: 'source',
        type: 'DOUYIN_SHOP',
        config: {},
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.dataSources.all });
  });

  it('update should invalidate data source list queries after success', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateDataSource(), { wrapper });

    await act(async () => {
      await result.current.update(1, { name: 'source-updated', config: {} });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.dataSources.all });
  });

  it('delete should invalidate data source list queries after success', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteDataSource(), { wrapper });

    await act(async () => {
      await result.current.remove(1);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.dataSources.all });
  });
});
