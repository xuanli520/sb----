import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionJobApi } from '../collectionJobApi';

vi.mock('@/lib/http/client', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/config/api', () => ({
  API_ENDPOINTS: {
    COLLECTION_JOBS: '/api/collection-jobs',
    COLLECTION_JOB_DETAIL: (id: number) => `/api/collection-jobs/${id}`,
  },
}));

import { httpClient } from '@/lib/http/client';

const jobResponse = {
  id: 7,
  name: '每日采集',
  task_type: 'SHOP_DASHBOARD_COLLECTION',
  status: 'ACTIVE',
  schedule: {
    cron: '0 3 * * *',
    timezone: 'Asia/Shanghai',
    kwargs: {},
  },
};

describe('collectionJobApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates collection jobs through the collection-jobs endpoint', async () => {
    vi.mocked(httpClient.put).mockResolvedValue({ data: jobResponse });

    await collectionJobApi.update(7, { name: ' 每日采集 ' });

    expect(httpClient.put).toHaveBeenCalledWith(
      '/api/collection-jobs/7',
      expect.objectContaining({ name: '每日采集' })
    );
  });

  it('deletes collection jobs through the collection-jobs endpoint', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null });

    await collectionJobApi.remove(7);

    expect(httpClient.delete).toHaveBeenCalledWith('/api/collection-jobs/7');
  });

  it('exposes the backend collection job detail endpoint', async () => {
    const actualApi = await vi.importActual<typeof import('@/config/api')>('@/config/api');

    expect(actualApi.API_ENDPOINTS.COLLECTION_JOB_DETAIL(7)).toBe('/api/v1/collection-jobs/7');
  });
});
