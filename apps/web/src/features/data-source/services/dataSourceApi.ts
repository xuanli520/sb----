import { httpClient } from '@/lib/http/client';
import { ApiResponse, PaginatedData } from '@/lib/http/types';
import { API_ENDPOINTS } from '@/config/api';
import {
  DataSourceStatus,
  DataSourceType,
  DataSourceCreate,
  DataSourceUpdate,
  DataSourceResponse,
  ShopDashboardShopCatalog,
  ScrapingRuleListItem,
} from '@/types';

export interface DataSourceFilter {
  name?: string;
  status?: DataSourceStatus;
  source_type?: DataSourceType;
  page?: number;
  size?: number;
}

export interface ShopDashboardLoginStateUploadPayload {
  accountId: string;
  storageState: Record<string, unknown>;
}

export const dataSourceApi = {
  getAll: async (params?: DataSourceFilter): Promise<PaginatedData<DataSourceResponse>> => {
    const query = new URLSearchParams();
    if (params) {
      if (params.name) query.append('name', params.name);
      if (params.status) query.append('status', params.status);
      if (params.source_type) query.append('source_type', params.source_type);
      if (params.page) query.append('page', params.page.toString());
      if (params.size) query.append('size', params.size.toString());
    }

    const queryString = query.toString();
    const url = queryString
      ? `${API_ENDPOINTS.DATA_SOURCES}?${queryString}`
      : API_ENDPOINTS.DATA_SOURCES;

    const response = await httpClient.get<ApiResponse<PaginatedData<DataSourceResponse>>>(url);
    return response.data;
  },

  getById: async (id: number): Promise<DataSourceResponse> => {
    const response = await httpClient.get<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCE_DETAIL(id)
    );
    return response.data;
  },

  create: async (data: DataSourceCreate): Promise<DataSourceResponse> => {
    const response = await httpClient.post<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCES,
      data
    );
    return response.data;
  },

  update: async (id: number, data: DataSourceUpdate): Promise<DataSourceResponse> => {
    const response = await httpClient.put<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCE_DETAIL(id),
      data
    );
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await httpClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.DATA_SOURCE_DETAIL(id)
    );
  },

  activate: async (id: number): Promise<DataSourceResponse> => {
    const response = await httpClient.post<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCE_ACTIVATE(id)
    );
    return response.data;
  },

  deactivate: async (id: number): Promise<DataSourceResponse> => {
    const response = await httpClient.post<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCE_DEACTIVATE(id)
    );
    return response.data;
  },

  validate: async (id: number): Promise<Record<string, unknown>> => {
    const response = await httpClient.post<ApiResponse<Record<string, unknown>>>(
      API_ENDPOINTS.DATA_SOURCE_VALIDATE(id)
    );
    return response.data;
  },

  uploadShopDashboardLoginState: async (
    id: number,
    payload: ShopDashboardLoginStateUploadPayload
  ): Promise<DataSourceResponse> => {
    const formData = new FormData();
    formData.append('account_id', payload.accountId);
    formData.append(
      'file',
      new Blob([JSON.stringify(payload.storageState)], { type: 'application/json' }),
      'storage_state.json'
    );

    const response = await httpClient.post<ApiResponse<DataSourceResponse>>(
      API_ENDPOINTS.DATA_SOURCE_SHOP_DASHBOARD_LOGIN_STATE(id),
      formData
    );
    return response.data;
  },

  clearShopDashboardLoginState: async (id: number): Promise<void> => {
    await httpClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.DATA_SOURCE_SHOP_DASHBOARD_LOGIN_STATE(id)
    );
  },

  getShopDashboardShopCatalog: async (
    id: number,
    options?: { forceRefresh?: boolean }
  ): Promise<ShopDashboardShopCatalog> => {
    const query = options?.forceRefresh ? '?force_refresh=true' : '';
    const response = await httpClient.get<ApiResponse<ShopDashboardShopCatalog>>(
      `${API_ENDPOINTS.DATA_SOURCE_SHOP_DASHBOARD_SHOP_CATALOG(id)}${query}`
    );
    return response.data;
  },

  getScrapingRules: async (id: number): Promise<ScrapingRuleListItem[]> => {
    const response = await httpClient.get<ApiResponse<ScrapingRuleListItem[]>>(
      API_ENDPOINTS.DATA_SOURCE_SCRAPING_RULES(id)
    );
    return response.data;
  },
};
