import { DataCenterResponse } from '@/types/data-center';
import { API_ENDPOINTS } from '@/config/api';
import { httpClient } from '@/lib/http/client';

type TimeRange = 'today' | 'week' | 'month';

interface ShopScoreRow {
  shop_id?: string | number;
  shop_name?: string;
  name?: string;
  metric_date?: string;
  updated_at?: string;
  total_score?: number | string | null;
  score?: number | string | null;
  product_score?: number | string | null;
  logistics_score?: number | string | null;
  service_score?: number | string | null;
  bad_behavior_score?: number | string | null;
  risk_score?: number | string | null;
}

const SCORE_BUCKETS = [
  { name: '优秀 (95分以上)', min: 95, max: Number.POSITIVE_INFINITY },
  { name: '良好 (90~95分)', min: 90, max: 95 },
  { name: '一般 (75~90分)', min: 75, max: 90 },
  { name: '较差 (低于75分)', min: 60, max: 75 },
  { name: '极差 (低于60分)', min: Number.NEGATIVE_INFINITY, max: 60 },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function extractRows(payload: unknown): ShopScoreRow[] {
  if (Array.isArray(payload)) {
    return payload.map(item => asRecord(item));
  }

  const root = asRecord(payload);
  const items = root.items;
  if (Array.isArray(items)) {
    return items.map(item => asRecord(item));
  }

  return [];
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

function unwrapApiPayload(payload: unknown): unknown {
  const root = asRecord(payload);
  if (typeof root.code === 'number' && 'data' in root) {
    return root.data;
  }
  return payload;
}

function score(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric === undefined || numeric <= -9000) {
    return undefined;
  }
  return Math.round(numeric * 100) / 100;
}

function average(values: Array<number | undefined>): number {
  const valid = values.filter((item): item is number => item !== undefined);
  if (valid.length === 0) {
    return 0;
  }
  return Math.round((valid.reduce((sum, item) => sum + item, 0) / valid.length) * 100) / 100;
}

function percent(part: number, total: number): string {
  if (total === 0) {
    return '0%';
  }
  return `${Math.round((part / total) * 1000) / 10}%`;
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveDateRange(timeRange: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  const days: Record<TimeRange, number> = {
    today: 1,
    week: 7,
    month: 30,
  };
  start.setDate(end.getDate() - ((days[timeRange as TimeRange] ?? 1) - 1));
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '暂无数据';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
  return `${formatDate(date)} ${time}`;
}

function buildTrend(rows: ShopScoreRow[]) {
  const grouped = new Map<string, number[]>();
  rows.forEach((row) => {
    const date = typeof row.metric_date === 'string' ? row.metric_date : undefined;
    const value = score(row.total_score ?? row.score);
    if (!date || value === undefined) {
      return;
    }
    grouped.set(date, [...(grouped.get(date) ?? []), value]);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([time, values]) => ({ time, score: average(values) }));
}

function buildDistribution(rows: ShopScoreRow[]) {
  const validScores = rows
    .map(row => score(row.total_score ?? row.score))
    .filter((value): value is number => value !== undefined);
  const total = validScores.length;

  return SCORE_BUCKETS.map((bucket) => {
    const count = validScores.filter(value => value >= bucket.min && value < bucket.max).length;
    return {
      name: bucket.name,
      value: count,
      count,
      percent: percent(count, total),
    };
  });
}

function buildProblemDistribution(rows: ShopScoreRow[]) {
  const dimensions = [
    { key: 'product_score' as const, name: '商品体验问题', threshold: 90 },
    { key: 'logistics_score' as const, name: '物流配送问题', threshold: 90 },
    { key: 'service_score' as const, name: '服务体验问题', threshold: 90 },
  ];
  const items = dimensions.map((dimension) => {
    const count = rows.filter(row => (score(row[dimension.key]) ?? 100) < dimension.threshold).length;
    return { name: dimension.name, value: count, count, percent: '0%' };
  });
  const riskCount = rows.filter(row => (score(row.bad_behavior_score ?? row.risk_score) ?? 0) > 0).length;
  items.push({ name: '差评风险问题', value: riskCount, count: riskCount, percent: '0%' });

  const total = items.reduce((sum, item) => sum + item.count, 0);
  return items.map(item => ({ ...item, percent: percent(item.count, total) }));
}

function toDashboardData(rows: ShopScoreRow[]): DataCenterResponse {
  const totalScores = rows.map(row => score(row.total_score ?? row.score));
  const productScores = rows.map(row => score(row.product_score));
  const logisticsScores = rows.map(row => score(row.logistics_score));
  const serviceScores = rows.map(row => score(row.service_score));
  const riskScores = rows.map(row => score(row.bad_behavior_score ?? row.risk_score));
  const validTotalCount = totalScores.filter(value => value !== undefined).length;
  const updateTime = rows
    .map(row => row.updated_at || row.metric_date)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const trend = buildTrend(rows);

  return {
    updateTime: formatTimestamp(updateTime),
    metrics: {
      comprehensiveScore: { title: '综合评分', value: average(totalScores), change: 0, trend: trend.map(item => ({ time: item.time, value: item.score })) },
      productExperience: { title: '商品体验分', value: average(productScores), change: 0, trend: [] },
      logisticsExperience: { title: '物流体验分', value: average(logisticsScores), change: 0, trend: [] },
      serviceExperience: { title: '服务体验分', value: average(serviceScores), change: 0, trend: [] },
      negativeReviewRisk: { title: '差评风险', value: average(riskScores), change: 0, trend: [] },
    },
    summary: {
      monitoredShops: rows.length,
      dataCoverage: rows.length === 0 ? 0 : Math.round((validTotalCount / rows.length) * 1000) / 10,
    },
    charts: {
      trend,
      radar: [
        { subject: '商品体验分', score: average(productScores), fullMark: 100 },
        { subject: '物流体验分', score: average(logisticsScores), fullMark: 100 },
        { subject: '服务体验分', score: average(serviceScores), fullMark: 100 },
        { subject: '差评风险', score: Math.max(0, 100 - average(riskScores)), fullMark: 100 },
      ],
      rank: rows
        .map((row, index) => ({
          name: row.shop_name || row.name || `店铺 ${row.shop_id ?? index + 1}`,
          score: score(row.total_score ?? row.score) ?? 0,
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 10),
      scoreDistribution: buildDistribution(rows),
      problemDistribution: buildProblemDistribution(rows),
    },
  };
}

export const dataCenterService = {
  async getDashboardData(timeRange: string = 'today', shopId?: string): Promise<DataCenterResponse> {
    const { startDate, endDate } = resolveDateRange(timeRange);
    const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const response = await httpClient.get<unknown>(`${API_ENDPOINTS.SHOPS_LIST}?${query}`);
    const rows = extractRows(unwrapApiPayload(response));
    const filteredRows = shopId && shopId !== '全部店铺'
      ? rows.filter(row => String(row.shop_id) === shopId || row.shop_name === shopId || row.name === shopId)
      : rows;
    return toDashboardData(filteredRows);
  },

  async getAvailableShops(): Promise<string[]> {
    const response = await httpClient.get<unknown>(API_ENDPOINTS.SHOPS_LIST);
    const rows = extractRows(unwrapApiPayload(response));
    return [
      '全部店铺',
      ...rows
        .map(row => row.shop_name || row.name || (row.shop_id ? `店铺 ${row.shop_id}` : undefined))
        .filter((name): name is string => Boolean(name)),
    ];
  }
};
