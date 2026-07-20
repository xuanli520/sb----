import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDataSourceMutationFn,
  updateDataSourceMutationFn,
  normalizeDataSourceFilter,
} from '../dataSourceService';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const uploadMock = vi.fn();
const buildPlanMock = vi.fn();

vi.mock('../dataSourceApi', () => ({
  dataSourceApi: {
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    uploadShopDashboardLoginState: (...args: unknown[]) => uploadMock(...args),
  },
}));

vi.mock('../shopDashboardLoginState', () => ({
  buildDataSourceConfigSubmitPlan: (...args: unknown[]) => buildPlanMock(...args),
}));

describe('dataSourceService mutation orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizeDataSourceFilter should keep only name/status/source_type/page/size', () => {
    const normalized = normalizeDataSourceFilter({
      name: 'abc',
      status: 'ACTIVE',
      source_type: 'DOUYIN_SHOP',
      page: 2,
      size: 20,
    });

    expect(normalized).toEqual({
      name: 'abc',
      status: 'ACTIVE',
      source_type: 'DOUYIN_SHOP',
      page: 2,
      size: 20,
    });
  });

  it('createDataSourceMutationFn should upload login state when plan requires it', async () => {
    buildPlanMock.mockReturnValue({
      nextConfig: { endpoint: 'x' },
      upload: { accountId: 'shop-1', storageState: { cookies: [], origins: [] } },
    });
    createMock.mockResolvedValue({ id: 9, name: 'n' });
    uploadMock.mockResolvedValue({ id: 9, name: 'n', status: 'ACTIVE' });

    const result = await createDataSourceMutationFn({
      name: 'n',
      type: 'DOUYIN_SHOP',
      config: {},
    } as any);

    expect(createMock).toHaveBeenCalledWith({
      name: 'n',
      type: 'DOUYIN_SHOP',
      config: { endpoint: 'x' },
    });
    expect(uploadMock).toHaveBeenCalledWith(9, {
      accountId: 'shop-1',
      storageState: { cookies: [], origins: [] },
    });
    expect(result).toEqual({ id: 9, name: 'n', status: 'ACTIVE' });
  });

  it('createDataSourceMutationFn should rollback create when upload fails', async () => {
    buildPlanMock.mockReturnValue({
      nextConfig: {},
      upload: { accountId: 'shop-1', storageState: { cookies: [], origins: [] } },
    });
    createMock.mockResolvedValue({ id: 3, name: 'new' });
    uploadMock.mockRejectedValue(new Error('upload failed'));
    deleteMock.mockResolvedValue(undefined);

    await expect(
      createDataSourceMutationFn({
        name: 'new',
        type: 'DOUYIN_SHOP',
        config: {},
      } as any)
    ).rejects.toThrow('已回滚创建');

    expect(deleteMock).toHaveBeenCalledWith(3);
  });

  it('updateDataSourceMutationFn should upload login state when plan requires it', async () => {
    buildPlanMock.mockReturnValue({
      nextConfig: { endpoint: 'new' },
      upload: { accountId: 'shop-2', storageState: { cookies: [], origins: [] } },
    });
    updateMock.mockResolvedValue({ id: 7, name: 'u' });
    uploadMock.mockResolvedValue({ id: 7, name: 'u', status: 'ACTIVE' });

    const result = await updateDataSourceMutationFn({
      id: 7,
      data: { name: 'u', config: {} } as any,
    });

    expect(updateMock).toHaveBeenCalledWith(7, {
      name: 'u',
      config: { endpoint: 'new' },
    });
    expect(uploadMock).toHaveBeenCalledWith(7, {
      accountId: 'shop-2',
      storageState: { cookies: [], origins: [] },
    });
    expect(result).toEqual({ id: 7, name: 'u', status: 'ACTIVE' });
  });
});
