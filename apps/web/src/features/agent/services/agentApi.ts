import { API_ENDPOINTS } from '@/config/api';
import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import {
  AgentDiscoveryRequest,
  AgentDiscoveryLoginStateResponse,
  AgentDiscoveryResponse,
  AgentEvent,
  AgentLoginCodeRequest,
  AgentLoginStartRequest,
  AgentLoginStartResponse,
  AgentOkResponse,
  AgentRecipeExportPayload,
  AgentRecipeImportResponse,
  AgentRecipeListResponse,
  AgentRecipeMarkStableRequest,
  AgentRecipeMarkStableResponse,
  AgentResultItem,
  AgentResultListResponse,
  AgentResultsDownloadParams,
  AgentResultsParams,
} from './types';

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.append(key, String(value));
    }
  });
  return query.toString();
}

function toWsUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  const url = new URL(path, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function toPositiveInt(value: string | number, field: string): number {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${field} 无效`);
  }
  return normalized;
}

export const agentApi = {
  async startLogin(payload: AgentLoginStartRequest): Promise<AgentLoginStartResponse> {
    const response = await httpClient.post<ApiResponse<AgentLoginStartResponse>>(
      API_ENDPOINTS.AGENT_LOGIN_START,
      payload,
    );
    return response.data;
  },

  async submitLoginCode(sessionId: string, payload: AgentLoginCodeRequest): Promise<AgentOkResponse> {
    const response = await httpClient.post<ApiResponse<AgentOkResponse>>(
      API_ENDPOINTS.AGENT_LOGIN_CODE(sessionId),
      payload,
    );
    return response.data;
  },

  async cancelLogin(sessionId: string): Promise<AgentOkResponse> {
    const response = await httpClient.post<ApiResponse<AgentOkResponse>>(
      API_ENDPOINTS.AGENT_LOGIN_CANCEL(sessionId),
    );
    return response.data;
  },

  loginEventsUrl(sessionId: string): string {
    return toWsUrl(API_ENDPOINTS.AGENT_LOGIN_EVENTS(sessionId));
  },

  async startDiscovery(payload: AgentDiscoveryRequest): Promise<AgentDiscoveryResponse> {
    const response = await httpClient.post<ApiResponse<AgentDiscoveryResponse>>(
      API_ENDPOINTS.AGENT_DISCOVERY,
      payload,
    );
    return response.data;
  },

  async getDiscoveryLoginState(accountId: string, shopId?: string): Promise<AgentDiscoveryLoginStateResponse> {
    const query = queryString({ account_id: accountId, shop_id: shopId });
    const response = await httpClient.get<ApiResponse<AgentDiscoveryLoginStateResponse>>(
      `${API_ENDPOINTS.AGENT_DISCOVERY_LOGIN_STATE}?${query}`,
    );
    return response.data;
  },

  discoveryEventsUrl(runId: string): string {
    return toWsUrl(API_ENDPOINTS.AGENT_DISCOVERY_EVENTS(runId));
  },

  async listRecipes(): Promise<AgentRecipeListResponse> {
    const response = await httpClient.get<ApiResponse<AgentRecipeListResponse>>(
      API_ENDPOINTS.AGENT_RECIPES,
    );
    return response.data;
  },

  async markRecipeStable(
    recipeId: string | number,
    payload: AgentRecipeMarkStableRequest,
  ): Promise<AgentRecipeMarkStableResponse> {
    const response = await httpClient.post<ApiResponse<AgentRecipeMarkStableResponse>>(
      API_ENDPOINTS.AGENT_RECIPE_MARK_STABLE(toPositiveInt(recipeId, 'recipe_id')),
      payload,
    );
    return response.data;
  },

  async exportRecipe(recipeId: string | number): Promise<AgentRecipeExportPayload> {
    return httpClient.get<AgentRecipeExportPayload>(
      API_ENDPOINTS.AGENT_RECIPE_EXPORT(toPositiveInt(recipeId, 'recipe_id')),
    );
  },

  async importRecipe(file: File): Promise<AgentRecipeImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await httpClient.post<ApiResponse<AgentRecipeImportResponse>>(
      API_ENDPOINTS.AGENT_RECIPE_IMPORT,
      formData,
    );
    return response.data;
  },

  async listResults(params: AgentResultsParams = {}): Promise<AgentResultListResponse> {
    const query = queryString({
      namespace: params.namespace,
      resource_key: params.resource_key,
      date_from: params.date_from,
      date_to: params.date_to,
      page: params.page ?? 1,
      size: params.size ?? 50,
    });
    const url = query ? `${API_ENDPOINTS.AGENT_RESULTS}?${query}` : API_ENDPOINTS.AGENT_RESULTS;
    const response = await httpClient.get<ApiResponse<AgentResultListResponse>>(url);
    return response.data;
  },

  async getResult(resultId: string | number): Promise<AgentResultItem> {
    const response = await httpClient.get<ApiResponse<AgentResultItem>>(
      API_ENDPOINTS.AGENT_RESULT_DETAIL(toPositiveInt(resultId, 'result_id')),
    );
    return response.data;
  },

  downloadResultsUrl(params: AgentResultsDownloadParams): string {
    return `${API_ENDPOINTS.AGENT_RESULTS_DOWNLOAD}?${queryString({ ...params })}`;
  },

  connectEvents(url: string, onEvent: (event: AgentEvent) => void, onClose?: () => void): WebSocket {
    const ws = new WebSocket(url);
    ws.onmessage = event => {
      onEvent(JSON.parse(event.data) as AgentEvent);
    };
    ws.onclose = () => onClose?.();
    return ws;
  },
};
