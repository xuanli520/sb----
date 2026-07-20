import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import { API_ENDPOINTS } from '@/config/api';
import {
  ScrapingRuleResponse,
  ScrapingRuleCreate,
  ScrapingRuleUpdate,
  PaginatedScrapingRuleListItem,
} from '@/types';

const normalizeScheduleContract = <T extends object>(rule: T): T => {
  const normalized = { ...(rule as Record<string, unknown>) };
  delete normalized.schedule_type;
  delete normalized.schedule_value;
  if (!normalized.last_run_at && typeof normalized.last_executed_at === 'string') {
    normalized.last_run_at = normalized.last_executed_at;
  }
  return normalized as T;
};

const stripDeprecatedScheduleFields = <T extends object>(payload: T): T => {
  const normalized = { ...(payload as Record<string, unknown>) };
  delete normalized.schedule;
  delete normalized.schedule_type;
  delete normalized.schedule_value;
  return normalized as T;
};

export interface ScrapingRuleFilter {
  name?: string;
  target_type?: string;
  status?: string;
  data_source_id?: number;
  page?: number;
  size?: number;
}

export const scrapingRuleApi = {
  getAll: async (params?: ScrapingRuleFilter): Promise<PaginatedScrapingRuleListItem> => {
    const query = new URLSearchParams();
    if (params) {
      if (params.name) query.append('name', params.name);
      if (params.target_type) query.append('target_type', params.target_type);
      if (params.status) query.append('status', params.status);
      if (params.data_source_id) query.append('data_source_id', params.data_source_id.toString());
      if (params.page) query.append('page', params.page.toString());
      if (params.size) query.append('size', params.size.toString());
    }

    const queryString = query.toString();
    const url = queryString
      ? `${API_ENDPOINTS.SCRAPING_RULES}?${queryString}`
      : API_ENDPOINTS.SCRAPING_RULES;

    const response = await httpClient.get<ApiResponse<PaginatedScrapingRuleListItem>>(url);
    return {
      ...response.data,
      items: response.data.items.map(item => normalizeScheduleContract(item)),
    };
  },

  getById: async (id: number): Promise<ScrapingRuleResponse> => {
    const response = await httpClient.get<ApiResponse<ScrapingRuleResponse>>(
      API_ENDPOINTS.SCRAPING_RULE_DETAIL(id)
    );
    return normalizeScheduleContract(response.data);
  },

  create: async (data: ScrapingRuleCreate): Promise<ScrapingRuleResponse> => {
    const payload = stripDeprecatedScheduleFields(data);
    const response = await httpClient.post<ApiResponse<ScrapingRuleResponse>>(
      API_ENDPOINTS.SCRAPING_RULES,
      payload
    );
    return normalizeScheduleContract(response.data);
  },

  update: async (id: number, data: ScrapingRuleUpdate): Promise<ScrapingRuleResponse> => {
    const payload = stripDeprecatedScheduleFields(data);
    const response = await httpClient.put<ApiResponse<ScrapingRuleResponse>>(
      API_ENDPOINTS.SCRAPING_RULE_DETAIL(id),
      payload
    );
    return normalizeScheduleContract(response.data);
  },

  delete: async (id: number): Promise<void> => {
    await httpClient.delete<ApiResponse<void>>(
      API_ENDPOINTS.SCRAPING_RULE_DETAIL(id)
    );
  },

  activate: async (id: number): Promise<ScrapingRuleResponse> => {
    const response = await httpClient.put<ApiResponse<ScrapingRuleResponse>>(
      API_ENDPOINTS.SCRAPING_RULE_DETAIL(id),
      { is_active: true }
    );
    return normalizeScheduleContract(response.data);
  },

  deactivate: async (id: number): Promise<ScrapingRuleResponse> => {
    const response = await httpClient.put<ApiResponse<ScrapingRuleResponse>>(
      API_ENDPOINTS.SCRAPING_RULE_DETAIL(id),
      { is_active: false }
    );
    return normalizeScheduleContract(response.data);
  },
};
