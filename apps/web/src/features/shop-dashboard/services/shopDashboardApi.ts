import { API_ENDPOINTS } from '@/config/api';
import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import {
  MetricDetailParams,
  MetricDetailResponse,
  MetricType,
  ShopDimensionScore,
  ShopListItem,
  ShopListParams,
  ShopListResponse,
  ShopScoreResponse,
  ShopDashboardCollectionTriggerRequest,
  ShopDashboardCollectionTriggerResult,
  ShopDashboardQueryRequest,
  ShopDashboardQueryResponse,
  TaskDefinition,
  TaskDefinitionCreateRequest,
  TaskDefinitionUpdateRequest,
  TaskExecution,
  TaskExecutionListResponse,
  TaskListParams,
  TaskListResponse,
  TaskRunRequest,
  normalizeMetricDetailResponse,
  normalizeShopDashboardQueryResponse,
} from './types';

const SHOP_DASHBOARD_TASK_NAME = 'shop-dashboard-collection';
const INVALID_SCORE_THRESHOLD = -9000;

function buildQueryString(params: ShopDashboardQueryRequest): string {
  const query = new URLSearchParams();
  query.append('shop_id', params.shop_id);
  query.append('start_date', params.start_date);
  query.append('end_date', params.end_date);

  return query.toString();
}

function buildTaskQueryString(params: TaskListParams): string {
  const query = new URLSearchParams();

  if (typeof params.page === 'number') {
    query.append('page', String(params.page));
  }
  if (typeof params.size === 'number') {
    query.append('size', String(params.size));
  }
  if (params.status) {
    query.append('status', params.status);
  }
  if (params.task_type) {
    query.append('task_type', params.task_type);
  }

  return query.toString();
}

function buildMetricQueryString(params: MetricDetailParams): string {
  const query = new URLSearchParams();

  if (typeof params.shop_id === 'number' && Number.isInteger(params.shop_id) && params.shop_id > 0) {
    query.append('shop_id', String(params.shop_id));
  }
  if (params.period) {
    query.append('period', params.period);
  }
  if (params.date_range) {
    query.append('date_range', params.date_range);
  }

  return query.toString();
}

function toTaskId(taskId: string | number): number {
  const normalized = Number(taskId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('任务 ID 无效');
  }
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
}

function normalizeShopId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return null;
  }

  return trimmed;
}

function dedupeShopIds(shopIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const id of shopIds) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    output.push(id);
  }

  return output;
}

function isUnavailableScore(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value <= INVALID_SCORE_THRESHOLD;
}

function sanitizeScore(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || isUnavailableScore(value)) {
    return 0;
  }
  return roundScore(value);
}

function toNumericShopId(shopId: string, fallback: number): number {
  const numeric = Number(shopId);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  const extracted = Number(shopId.replace(/\D/g, ''));
  if (Number.isInteger(extracted) && extracted > 0) {
    return extracted;
  }
  return fallback;
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') {
    return Number.NaN;
  }
  return Date.parse(value);
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveDateRange(dateRange = '7d'): { startDate: string; endDate: string; rangeLabel: string } {
  const match = dateRange.trim().match(/^(\d+)d$/i);
  const days = match ? Math.max(1, Number(match[1])) : 7;

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));

  return {
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
    rangeLabel: `${days}d`,
  };
}

function resolveShopStatus(hasData: boolean, score: number, riskDeduct: number): string {
  if (!hasData) {
    return 'offline';
  }
  if (riskDeduct >= 20 || score < 60) {
    return 'critical';
  }
  if (riskDeduct > 0 || score < 75) {
    return 'warning';
  }
  return 'live';
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function buildDimensionsFromDashboard(data: ShopDashboardQueryResponse): ShopDimensionScore[] {
  const productScore = sanitizeScore(data.scores.product);
  const logisticsScore = sanitizeScore(data.scores.logistics);
  const serviceScore = sanitizeScore(data.scores.service);
  const riskDeduct = sanitizeScore(data.scores.risk);

  return [
    { dimension: 'product', score: productScore },
    { dimension: 'logistics', score: logisticsScore },
    { dimension: 'service', score: serviceScore },
    { dimension: 'risk', score: roundScore(Math.max(0, 100 - riskDeduct)) },
  ];
}

function buildShopListItemFromCollectionRow(row: Record<string, unknown>, index: number): ShopListItem | null {
  const normalizedShopId = normalizeShopId(row.shop_id ?? row.id);
  if (!normalizedShopId) {
    return null;
  }

  const rawOverallScore = asNumber(row.total_score) ?? asNumber(row.score);
  const rawRiskScore = asNumber(row.bad_behavior_score) ?? asNumber(row.risk_score) ?? asNumber(row.risk);
  const score = sanitizeScore(rawOverallScore);
  const riskDeduct = sanitizeScore(rawRiskScore);

  return {
    ...row,
    id: toNumericShopId(normalizedShopId, index + 1),
    shop_id: normalizedShopId,
    name: asString(row.shop_name) || asString(row.name) || `店铺 ${normalizedShopId}`,
    status: resolveShopStatus(!isUnavailableScore(rawOverallScore), score, riskDeduct),
    score,
    category: asString(row.source) || asString(row.category),
    gmv: asNumber(row.gmv),
    products_count: asNumber(row.products_count),
    metric_date: asString(row.metric_date),
    updated_at: asString(row.updated_at),
    product_score: sanitizeScore(asNumber(row.product_score)),
    logistics_score: sanitizeScore(asNumber(row.logistics_score)),
    service_score: sanitizeScore(asNumber(row.service_score)),
    risk_score: riskDeduct,
  };
}

function pickPreferredShopItem(current: ShopListItem, candidate: ShopListItem): ShopListItem {
  const currentMetricAt = parseTimestamp(current.metric_date);
  const candidateMetricAt = parseTimestamp(candidate.metric_date);

  if (Number.isFinite(candidateMetricAt) && (!Number.isFinite(currentMetricAt) || candidateMetricAt > currentMetricAt)) {
    return candidate;
  }

  if (candidateMetricAt === currentMetricAt) {
    const currentUpdatedAt = parseTimestamp(current.updated_at);
    const candidateUpdatedAt = parseTimestamp(candidate.updated_at);
    if (Number.isFinite(candidateUpdatedAt) && (!Number.isFinite(currentUpdatedAt) || candidateUpdatedAt > currentUpdatedAt)) {
      return candidate;
    }
  }

  const currentScore = asNumber(current.score) ?? 0;
  const candidateScore = asNumber(candidate.score) ?? 0;
  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  return current;
}

function mergeShopItems(items: ShopListItem[]): ShopListItem[] {
  const merged = new Map<string, ShopListItem>();

  for (const item of items) {
    const key = item.shop_id || String(item.id);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }
    merged.set(key, pickPreferredShopItem(current, item));
  }

  return [...merged.values()];
}

function extractShopListRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(item => asRecord(item));
  }

  const root = asRecord(payload);
  const directItems = asArray(root.items);
  if (directItems.length > 0) {
    return directItems.map(item => asRecord(item));
  }

  const nested = asRecord(root.data);
  const nestedItems = asArray(nested.items);
  if (nestedItems.length > 0) {
    return nestedItems.map(item => asRecord(item));
  }

  const nestedData = asRecord(nested.data);
  const nestedDataItems = asArray(nestedData.items);
  if (nestedDataItems.length > 0) {
    return nestedDataItems.map(item => asRecord(item));
  }

  return [];
}

async function findShopDashboardTask(): Promise<TaskDefinition | null> {
  const active = await shopDashboardApi.listTasks({
    page: 1,
    size: 20,
    status: 'ACTIVE',
    task_type: 'SHOP_DASHBOARD_COLLECTION',
  });
  if (active.items.length > 0) {
    return active.items[0];
  }

  const all = await shopDashboardApi.listTasks({
    page: 1,
    size: 20,
    task_type: 'SHOP_DASHBOARD_COLLECTION',
  });

  const availableTask = all.items.find(item => item.status !== 'CANCELLED') ?? null;
  return availableTask;
}

export const shopDashboardApi = {
  async listShops(params: ShopListParams = {}): Promise<ShopListResponse> {
    const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
    const size = params.size && params.size > 0 ? Math.floor(params.size) : 20;
    const response = await httpClient.get<ApiResponse<unknown>>(API_ENDPOINTS.SHOPS_LIST);
    const rows = extractShopListRows(response.data);
    const mapped = rows
      .map((row, index) => buildShopListItemFromCollectionRow(row, index))
      .filter((item): item is ShopListItem => Boolean(item));

    const requestedShopIds = dedupeShopIds(
      (params.shop_ids ?? [])
        .map(id => normalizeShopId(id))
        .filter((id): id is string => Boolean(id))
    );

    const filteredItems = requestedShopIds.length > 0
      ? mapped.filter(item => item.shop_id && requestedShopIds.includes(item.shop_id))
      : mapped;

    const items = mergeShopItems(filteredItems);

    const orderedItems = [...items].sort((a, b) => {
      const scoreA = asNumber(a.score) ?? 0;
      const scoreB = asNumber(b.score) ?? 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return (a.shop_id || String(a.id)).localeCompare(b.shop_id || String(b.id));
    });

    const total = orderedItems.length;
    const start = (page - 1) * size;
    const pagedItems = orderedItems.slice(start, start + size);

    return {
      items: pagedItems,
      meta: {
        page,
        size,
        total,
        pages: total === 0 ? 0 : Math.ceil(total / size),
        has_next: start + size < total,
        has_prev: page > 1 && total > 0,
      },
    };
  },

  async getShop(shopId: string | number, dateRange = '7d'): Promise<ShopDashboardQueryResponse> {
    const normalizedShopId = normalizeShopId(shopId);
    if (!normalizedShopId) {
      throw new Error('店铺 ID 无效');
    }

    const { startDate, endDate } = resolveDateRange(dateRange);
    return shopDashboardApi.queryResults({
      shop_id: normalizedShopId,
      start_date: startDate,
      end_date: endDate,
    });
  },

  async getShopScore(shopId: string | number, dateRange = '30d'): Promise<ShopScoreResponse> {
    const normalizedShopId = normalizeShopId(shopId);
    if (!normalizedShopId) {
      throw new Error('店铺 ID 无效');
    }

    const { endDate, rangeLabel } = resolveDateRange(dateRange);
    const dashboard = await shopDashboardApi.getShop(normalizedShopId, dateRange);

    let latest = dashboard.items[dashboard.items.length - 1];
    let overallScore = sanitizeScore(dashboard.scores.overall);
    let dimensions = buildDimensionsFromDashboard(dashboard);
    let trend = dashboard.items.map(item => ({
      date: item.metric_date,
      value: sanitizeScore(item.total_score),
    }));

    if (!latest) {
      const list = await shopDashboardApi.listShops({
        page: 1,
        size: 1,
        shop_ids: [normalizedShopId],
      });
      const fallback = list.items[0];
      if (fallback) {
        latest = {
          shop_id: normalizedShopId,
          shop_name: fallback.name,
          metric_date: endDate,
          source: asString(fallback.category),
          total_score: sanitizeScore(asNumber(fallback.score)),
          product_score: sanitizeScore(asNumber(fallback.product_score)),
          logistics_score: sanitizeScore(asNumber(fallback.logistics_score)),
          service_score: sanitizeScore(asNumber(fallback.service_score)),
          bad_behavior_score: sanitizeScore(asNumber(fallback.risk_score)),
          reviews: [],
          violations: [],
          cold_metrics: [],
        };

        const fallbackRisk = sanitizeScore(asNumber(fallback.risk_score));
        overallScore = sanitizeScore(asNumber(fallback.score));
        dimensions = [
          { dimension: 'product', score: sanitizeScore(asNumber(fallback.product_score)) },
          { dimension: 'logistics', score: sanitizeScore(asNumber(fallback.logistics_score)) },
          { dimension: 'service', score: sanitizeScore(asNumber(fallback.service_score)) },
          { dimension: 'risk', score: roundScore(Math.max(0, 100 - fallbackRisk)) },
        ];
        trend = [
          {
            date: asString(fallback.metric_date) || endDate,
            value: overallScore,
          },
        ];
      }
    }

    return {
      shop_id: toNumericShopId(normalizedShopId, 1001),
      shop_name: latest?.shop_name,
      overall_score: overallScore,
      dimensions,
      trend,
      date_range: dateRange || rangeLabel,
    };
  },

  async getMetricDetail(
    metricType: MetricType,
    params: MetricDetailParams = {}
  ): Promise<MetricDetailResponse> {
    const queryString = buildMetricQueryString(params);
    const url = queryString
      ? `${API_ENDPOINTS.METRIC_DETAIL(metricType)}?${queryString}`
      : API_ENDPOINTS.METRIC_DETAIL(metricType);

    const response = await httpClient.get<ApiResponse<unknown>>(url);
    return normalizeMetricDetailResponse(response.data, metricType, {
      shop_id: params.shop_id ?? 1001,
      period: params.period ?? '30d',
      date_range: params.date_range ?? '30d',
    });
  },

  async listTasks(params: TaskListParams = {}): Promise<TaskListResponse> {
    const queryString = buildTaskQueryString(params);
    const url = queryString ? `${API_ENDPOINTS.TASKS_LIST}?${queryString}` : API_ENDPOINTS.TASKS_LIST;

    const response = await httpClient.get<ApiResponse<TaskListResponse>>(url);
    return response.data;
  },

  async createTask(payload: TaskDefinitionCreateRequest): Promise<TaskDefinition> {
    const response = await httpClient.post<ApiResponse<TaskDefinition>>(API_ENDPOINTS.TASKS_LIST, payload);
    return response.data;
  },

  async updateTask(taskId: string | number, payload: TaskDefinitionUpdateRequest): Promise<TaskDefinition> {
    const normalizedTaskId = toTaskId(taskId);
    const response = await httpClient.put<ApiResponse<TaskDefinition>>(API_ENDPOINTS.TASK_DETAIL(normalizedTaskId), payload);
    return response.data;
  },

  async deleteTask(taskId: string | number): Promise<void> {
    const normalizedTaskId = toTaskId(taskId);
    await httpClient.delete<ApiResponse<null>>(API_ENDPOINTS.TASK_DETAIL(normalizedTaskId));
  },

  async getTask(taskId: string | number): Promise<TaskDefinition> {
    const normalizedTaskId = toTaskId(taskId);
    const response = await httpClient.get<ApiResponse<TaskDefinition>>(API_ENDPOINTS.TASK_DETAIL(normalizedTaskId));
    return response.data;
  },

  async runTask(taskId: string | number, payload: TaskRunRequest = {}): Promise<TaskExecution> {
    const normalizedTaskId = toTaskId(taskId);
    const response = await httpClient.post<ApiResponse<TaskExecution>>(API_ENDPOINTS.TASK_RUN(normalizedTaskId), payload);
    return response.data;
  },

  async cancelTask(taskId: string | number): Promise<TaskDefinition> {
    const normalizedTaskId = toTaskId(taskId);
    const response = await httpClient.post<ApiResponse<TaskDefinition>>(API_ENDPOINTS.TASK_CANCEL(normalizedTaskId));
    return response.data;
  },

  async listTaskExecutions(taskId: string | number): Promise<TaskExecutionListResponse> {
    const normalizedTaskId = toTaskId(taskId);
    const response = await httpClient.get<ApiResponse<TaskExecutionListResponse>>(
      API_ENDPOINTS.TASK_EXECUTIONS(normalizedTaskId)
    );
    return response.data;
  },

  async triggerShopDashboardCollection(
    payload: ShopDashboardCollectionTriggerRequest
  ): Promise<ShopDashboardCollectionTriggerResult> {
    let task = await findShopDashboardTask();

    if (!task) {
      task = await shopDashboardApi.createTask({
        name: SHOP_DASHBOARD_TASK_NAME,
        task_type: 'SHOP_DASHBOARD_COLLECTION',
        config: {},
      });
    }

    const runPayload: Record<string, unknown> = { ...payload };
    if (payload.execution_id) {
      runPayload.execution_id = payload.execution_id;
    }

    const execution = await shopDashboardApi.runTask(task.id, { payload: runPayload });
    return { task, execution };
  },

  async queryResults(params: ShopDashboardQueryRequest): Promise<ShopDashboardQueryResponse> {
    const queryString = buildQueryString(params);
    const url = `${API_ENDPOINTS.SHOPS_LIST}?${queryString}`;

    const response = await httpClient.get<ApiResponse<unknown>>(url);
    return normalizeShopDashboardQueryResponse(response.data, params);
  },
};
