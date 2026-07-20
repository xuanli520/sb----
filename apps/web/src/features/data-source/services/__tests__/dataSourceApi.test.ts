import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dataSourceApi } from '../dataSourceApi';

// Mock the http client
vi.mock('@/lib/http/client', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the config
vi.mock('@/config/api', () => ({
  API_ENDPOINTS: {
    DATA_SOURCES: '/api/data-sources',
    DATA_SOURCE_DETAIL: (id: number) => `/api/data-sources/${id}`,
    DATA_SOURCE_ACTIVATE: (id: number) => `/api/data-sources/${id}/activate`,
    DATA_SOURCE_DEACTIVATE: (id: number) => `/api/data-sources/${id}/deactivate`,
    DATA_SOURCE_VALIDATE: (id: number) => `/api/data-sources/${id}/validate`,
    DATA_SOURCE_SCRAPING_RULES: (id: number) => `/api/data-sources/${id}/scraping-rules`,
    DATA_SOURCE_SHOP_DASHBOARD_LOGIN_STATE: (id: number) => `/api/data-sources/${id}/shop-dashboard/login-state`,
    DATA_SOURCE_SHOP_DASHBOARD_SHOP_CATALOG: (id: number) => `/api/data-sources/${id}/shop-dashboard/shop-catalog`,
  },
}));

import { httpClient } from '@/lib/http/client';

describe('dataSourceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should fetch data sources list', async () => {
      const mockResponse = {
        data: {
          items: [
            { id: 1, name: 'Test Source', type: 'DOUYIN_API', status: 'ACTIVE' },
            { id: 2, name: 'Another Source', type: 'FILE_UPLOAD', status: 'INACTIVE' },
          ],
          meta: { page: 1, size: 10, total: 2, pages: 1, has_next: false, has_prev: false },
        },
      };
      vi.mocked(httpClient.get).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.getAll();

      expect(result.items).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.items[0].name).toBe('Test Source');
    });

    it('should fetch data sources with filters', async () => {
      const mockResponse = {
        data: {
          items: [{ id: 1, name: 'Test Source', type: 'DOUYIN_API', status: 'ACTIVE' }],
          meta: { page: 1, size: 10, total: 1, pages: 1, has_next: false, has_prev: false },
        },
      };
      vi.mocked(httpClient.get).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.getAll({
        source_type: 'DOUYIN_SHOP',
        status: 'ACTIVE',
        page: 2,
        size: 20,
      });

      const calledUrl = vi.mocked(httpClient.get).mock.calls[0][0] as string;
      expect(calledUrl).toContain('source_type=DOUYIN_SHOP');
      expect(calledUrl).toContain('status=ACTIVE');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('size=20');
      expect(calledUrl).not.toContain('name=');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should fetch single data source', async () => {
      const mockResponse = {
        data: { id: 1, name: 'Test Source', type: 'DOUYIN_API', status: 'ACTIVE' },
      };
      vi.mocked(httpClient.get).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.getById(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Test Source');
    });
  });

  describe('create', () => {
    it('should create data source', async () => {
      const config = {
        endpoint: 'https://example.com',
        shop_dashboard_login_state: {
          session: 'cookie-string',
        },
      };
      const mockData = {
        name: 'New Source',
        type: 'DOUYIN_SHOP' as const,
        config,
      };
      const mockResponse = {
        data: { id: 1, name: 'New Source', type: 'DOUYIN_SHOP', status: 'ACTIVE', config },
      };
      vi.mocked(httpClient.post).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.create(mockData);

      expect(httpClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: 'New Source',
          config,
        })
      );
      expect(result.id).toBe(1);
      expect(result.name).toBe('New Source');
      expect(result.config).toEqual(config);
    });
  });

  describe('update', () => {
    it('should update data source', async () => {
      const config = {
        shop_dashboard_login_state: {
          account_id: 'abc',
        },
      };
      const mockData = { name: 'Updated Source', config };
      const mockResponse = {
        data: { id: 1, name: 'Updated Source', type: 'DOUYIN_API', status: 'ACTIVE', config },
      };
      vi.mocked(httpClient.put).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.update(1, mockData);

      expect(httpClient.put).toHaveBeenCalledWith(expect.any(String), mockData);
      expect(result.name).toBe('Updated Source');
      expect(result.config).toEqual(config);
    });
  });

  describe('delete', () => {
    it('should delete data source', async () => {
      vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined });

      await dataSourceApi.delete(1);

      expect(httpClient.delete).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('activate', () => {
    it('should activate data source', async () => {
      const mockResponse = {
        data: { id: 1, name: 'Test Source', type: 'DOUYIN_API', status: 'ACTIVE' },
      };
      vi.mocked(httpClient.post).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.activate(1);

      expect(result.status).toBe('ACTIVE');
    });

    it('should deactivate data source', async () => {
      const mockResponse = {
        data: { id: 1, name: 'Test Source', type: 'DOUYIN_API', status: 'INACTIVE' },
      };
      vi.mocked(httpClient.post).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.deactivate(1);

      expect(result.status).toBe('INACTIVE');
    });
  });

  describe('getScrapingRules', () => {
    it('should fetch rules for data source', async () => {
      const mockResponse = {
        data: [{ id: 1, name: 'Test Rule', target_type: 'SHOP_OVERVIEW' }],
      };
      vi.mocked(httpClient.get).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.getScrapingRules(1);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Rule');
    });
  });

  describe('getShopDashboardShopCatalog', () => {
    it('should fetch shop catalog for shop dashboard source', async () => {
      const mockResponse = {
        data: {
          data_source_id: 99,
          account_id: 'data_source_99',
          shop_ids: ['shop-1', 'shop-2'],
          catalog_stale: false,
          resolve_source: 'cache',
        },
      };
      vi.mocked(httpClient.get).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.getShopDashboardShopCatalog(99);

      expect(httpClient.get).toHaveBeenCalledWith('/api/data-sources/99/shop-dashboard/shop-catalog');
      expect(result.shop_ids).toEqual(['shop-1', 'shop-2']);
    });

    it('should request force refresh when asked', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        data: {
          data_source_id: 99,
          account_id: 'data_source_99',
          shop_ids: [],
          catalog_stale: false,
          resolve_source: 'live',
        },
      });

      await dataSourceApi.getShopDashboardShopCatalog(99, { forceRefresh: true });

      expect(httpClient.get).toHaveBeenCalledWith('/api/data-sources/99/shop-dashboard/shop-catalog?force_refresh=true');
    });
  });

  describe('validate', () => {
    it('should validate connection', async () => {
      const mockResponse = {
        data: { valid: true, message: 'Connection successful' },
      };
      vi.mocked(httpClient.post).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.validate(1);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('Connection successful');
    });
  });

  describe('shop dashboard login state', () => {
    it('should upload login state with dedicated multipart endpoint', async () => {
      const mockResponse = {
        data: { id: 99, name: 'Shop Source', type: 'DOUYIN_SHOP', status: 'ACTIVE', config: {} },
      };
      vi.mocked(httpClient.post).mockResolvedValue(mockResponse);

      const result = await dataSourceApi.uploadShopDashboardLoginState(99, {
        accountId: 'shop-1001',
        storageState: {
          cookies: [{ name: 'sid', value: 'token' }],
          origins: [],
        },
      });

      const calledUrl = vi.mocked(httpClient.post).mock.calls[0][0];
      const calledBody = vi.mocked(httpClient.post).mock.calls[0][1];

      expect(calledUrl).toBe('/api/data-sources/99/shop-dashboard/login-state');
      expect(calledBody).toBeInstanceOf(FormData);
      expect((calledBody as FormData).get('account_id')).toBe('shop-1001');
      expect((calledBody as FormData).get('file')).toBeTruthy();
      expect(result.id).toBe(99);
    });

    it('should clear login state with dedicated endpoint', async () => {
      vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined });

      await dataSourceApi.clearShopDashboardLoginState(99);

      expect(httpClient.delete).toHaveBeenCalledWith('/api/data-sources/99/shop-dashboard/login-state');
    });
  });

  describe('contract alignment', () => {
    it('should expose shop dashboard login state endpoint constant', async () => {
      const actualApi = await vi.importActual<typeof import('@/config/api')>('@/config/api');

      expect(
        actualApi.API_ENDPOINTS.DATA_SOURCE_SHOP_DASHBOARD_LOGIN_STATE(7)
      ).toBe('/api/v1/data-sources/7/shop-dashboard/login-state');
      expect(
        actualApi.API_ENDPOINTS.DATA_SOURCE_SHOP_DASHBOARD_SHOP_CATALOG(7)
      ).toBe('/api/v1/data-sources/7/shop-dashboard/shop-catalog');
    });
  });
});
