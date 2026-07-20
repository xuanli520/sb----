export type TaskType = 'ETL_ORDERS' | 'ETL_PRODUCTS' | 'SHOP_DASHBOARD_COLLECTION';
export type TaskDefinitionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type TaskExecutionStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type TaskTriggerMode = 'MANUAL' | 'SCHEDULED' | 'SYSTEM';

export interface TaskListParams {
  page?: number;
  size?: number;
  status?: TaskDefinitionStatus;
  task_type?: TaskType;
}

export interface TaskDefinitionCreateRequest {
  name: string;
  task_type: TaskType;
  config?: Record<string, unknown>;
  schedule?: Record<string, unknown> | null;
  status?: TaskDefinitionStatus;
}

export interface TaskDefinitionUpdateRequest {
  name?: string;
  status?: TaskDefinitionStatus;
  config?: Record<string, unknown> | null;
  schedule?: Record<string, unknown> | null;
}

export interface TaskRunRequest {
  payload?: TaskRunPayload;
}

export interface ShopDashboardTimeRange {
  start: string;
  end: string;
}

export interface ShopDashboardAgentRecipeRef {
  namespace: string;
  key: string;
  version?: number;
}

export interface ShopDashboardAgentExtraConfig {
  agent_recipe?: ShopDashboardAgentRecipeRef;
  agent_discovery?: boolean;
  agent_recipe_validation?: boolean;
  agent_recipe_recovery?: boolean;
  [key: string]: unknown;
}

export interface ShopDashboardTaskRunPayload {
  data_source_id: number;
  rule_id: number;
  execution_id?: string;
  shop_id?: string;
  shop_ids?: string[];
  all?: boolean;
  time_range?: ShopDashboardTimeRange;
  extra_config?: ShopDashboardAgentExtraConfig;
  [key: string]: unknown;
}

export type TaskRunPayload = ShopDashboardTaskRunPayload | Record<string, unknown>;

export type MetricType = 'product' | 'logistics' | 'service' | 'risk';

export interface ShopListParams {
  page?: number;
  size?: number;
  date_range?: string;
  shop_ids?: string[];
}

export interface ShopListItem {
  id: number;
  shop_id?: string;
  name: string;
  category?: string;
  status?: string;
  gmv?: number;
  score?: number;
  products_count?: number;
  metric_date?: string;
  updated_at?: string;
  product_score?: number;
  logistics_score?: number;
  service_score?: number;
  risk_score?: number;
  [key: string]: unknown;
}

export interface ShopListMeta {
  page: number;
  size: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ShopListResponse {
  items: ShopListItem[];
  meta: ShopListMeta;
}

export interface ShopDimensionScore {
  dimension: MetricType | string;
  score: number;
  weight?: string;
  rank?: number;
}

export interface ShopScoreTrendPoint {
  date: string;
  value: number;
}

export interface ShopScoreResponse {
  shop_id: number;
  shop_name?: string;
  overall_score: number;
  dimensions: ShopDimensionScore[];
  trend: ShopScoreTrendPoint[];
  date_range: string;
}

export interface MetricDetailParams {
  shop_id?: number;
  period?: string;
  date_range?: string;
}

export interface MetricSubMetric {
  id: string;
  title: string;
  score: number;
  weight: string;
  value: string;
  desc: string;
  deduct_points?: number | null;
  impact_score?: number | null;
  status?: string | null;
  owner?: string | null;
  deadline_at?: string | null;
}

export interface MetricScoreRange {
  [key: string]: string | number;
}

export interface MetricDetailResponse {
  shop_id: number;
  metric_type: MetricType | string;
  period: string;
  date_range: string;
  category_score: number;
  sub_metrics: MetricSubMetric[];
  score_ranges: MetricScoreRange[];
  formula: string;
  trend: ShopScoreTrendPoint[];
}

export interface TaskDefinition {
  id: number;
  name: string;
  task_type: TaskType;
  status: TaskDefinitionStatus;
  config: Record<string, unknown> | null;
  schedule: Record<string, unknown> | null;
  created_by_id: number | null;
  updated_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskExecution {
  id: number;
  task_id: number;
  queue_task_id: string | null;
  status: TaskExecutionStatus;
  trigger_mode: TaskTriggerMode;
  payload: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  processed_rows: number;
  error_message: string | null;
  triggered_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponse {
  items: TaskDefinition[];
  meta: {
    page: number;
    size: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface TaskExecutionListResponse {
  task_id: number;
  items: TaskExecution[];
}

export interface ShopDashboardCollectionTriggerRequest {
  data_source_id: number;
  rule_id: number;
  execution_id?: string;
  shop_id?: string;
  shop_ids?: string[];
  all?: boolean;
  time_range?: ShopDashboardTimeRange;
  extra_config?: ShopDashboardAgentExtraConfig;
}

export interface ShopDashboardCollectionTriggerResult {
  task: TaskDefinition;
  execution: TaskExecution;
}

export interface ShopDashboardQueryRequest {
  shop_id: string;
  start_date: string;
  end_date: string;
}

export interface ShopDashboardScores {
  overall: number;
  product: number;
  logistics: number;
  service: number;
  risk: number;
}

export interface ShopDashboardReviewItem {
  id: string;
  content?: string;
  is_replied?: boolean;
  source?: string;
  [key: string]: unknown;
}

export interface ShopDashboardRawViolationItem {
  id: string;
  type: string;
  description?: string;
  score: number;
  source?: string;
  [key: string]: unknown;
}

export interface ShopDashboardColdMetricItem {
  reason?: string;
  source?: string;
  violations_detail: Record<string, unknown>[];
  arbitration_detail: Record<string, unknown>[];
  dsr_trend: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface ShopDashboardTimelineItem {
  shop_id: string;
  shop_name?: string;
  metric_date: string;
  source?: string;
  total_score: number;
  product_score: number;
  logistics_score: number;
  service_score: number;
  bad_behavior_score: number;
  reviews: ShopDashboardReviewItem[];
  violations: ShopDashboardRawViolationItem[];
  cold_metrics: ShopDashboardColdMetricItem[];
}

export interface ShopDashboardCommentSummary {
  total: number;
  negative_count: number;
  negative_rate: number;
  average_rating?: number;
}

export interface ShopDashboardViolationItem {
  id: string;
  level: string;
  type: string;
  title: string;
  description?: string;
  count: number;
  occurred_at?: string;
  status?: string;
  score?: number;
  source?: string;
}

export interface ShopDashboardMetricItem {
  key: string;
  label: string;
  value: number;
  trend?: number[];
  details?: Record<string, unknown>;
}

export interface ShopDashboardQueryResponse {
  shop_id: string;
  start_date: string;
  end_date: string;
  items: ShopDashboardTimelineItem[];
  scores: ShopDashboardScores;
  comments: ShopDashboardCommentSummary;
  violations: ShopDashboardViolationItem[];
  metrics: ShopDashboardMetricItem[];
  raw: Record<string, unknown>;
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

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  return undefined;
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
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function unwrapEndpointPayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (Object.prototype.hasOwnProperty.call(record, 'data')) {
    const hasApiCode = asNumber(record.code) !== undefined;
    const hasApiMessage = asString(record.msg) !== undefined || asString(record.message) !== undefined;
    const hasMockFlag = asBoolean(record.mock) !== undefined || asBoolean(asRecord(record.data).mock) !== undefined;
    const hasRelease = asString(record.expected_release) !== undefined || asString(asRecord(record.data).expected_release) !== undefined;
    if (hasApiCode || hasApiMessage || hasMockFlag || hasRelease) {
      return record.data;
    }
  }
  return payload;
}

function buildTimelineReviews(value: unknown): ShopDashboardReviewItem[] {
  const rows = Array.isArray(value)
    ? value
    : asArray(asRecord(value).items);

  return rows.map((item, index) => {
    const review = asRecord(item);
    return {
      ...review,
      id: asString(review.id) || asString(review.review_id) || `review-${index + 1}`,
      content: asString(review.content),
      is_replied: asBoolean(review.is_replied) ?? asBoolean(review.shop_reply),
      source: asString(review.source),
    };
  });
}

function buildTimelineViolations(value: unknown): ShopDashboardRawViolationItem[] {
  let rows: unknown[] = [];
  if (Array.isArray(value)) {
    rows = value;
  } else {
    const container = asRecord(value);
    rows = asArray(container.waiting_list);
    if (rows.length === 0) {
      rows = asArray(container.items);
    }
  }

  return rows.map((item, index) => {
    const violation = asRecord(item);
    return {
      ...violation,
      id:
        asString(violation.id)
        || asString(violation.violation_id)
        || asString(violation.ticket_id)
        || asString(violation.ticketId)
        || asString(violation.rule_id)
        || `violation-${index + 1}`,
      type:
        asString(violation.type)
        || asString(violation.violation_type)
        || asString(violation.rule_type)
        || 'UNKNOWN',
      description: asString(violation.description) || asString(violation.reason),
      score:
        asNumber(violation.score)
        ?? asNumber(violation.deduct_score)
        ?? asNumber(violation.deductScore)
        ?? asNumber(violation.point)
        ?? asNumber(violation.points)
        ?? 0,
      source: asString(violation.source),
    };
  });
}

function buildTimelineColdMetrics(value: unknown): ShopDashboardColdMetricItem[] {
  return asArray(value).map((item) => {
    const metric = asRecord(item);
    return {
      ...metric,
      reason: asString(metric.reason),
      source: asString(metric.source),
      violations_detail: asArray(metric.violations_detail).map(detail => asRecord(detail)),
      arbitration_detail: asArray(metric.arbitration_detail).map(detail => asRecord(detail)),
      dsr_trend: asArray(metric.dsr_trend).map(detail => asRecord(detail)),
    };
  });
}

function buildTimelineItems(
  payload: Record<string, unknown>,
  request: ShopDashboardQueryRequest
): ShopDashboardTimelineItem[] {
  const rows = [...asArray(payload.items)];

  if (rows.length === 0) {
    const hasSingleScore =
      asNumber(payload.total_score) !== undefined
      || asNumber(payload.product_score) !== undefined
      || asNumber(payload.logistics_score) !== undefined
      || asNumber(payload.service_score) !== undefined
      || asNumber(payload.bad_behavior_score) !== undefined;
    if (!hasSingleScore) {
      return [];
    }
    rows.push(payload);
  }

  return rows
    .map((item) => {
      const row = asRecord(item);
      const nestedScores = asRecord(row.scores);
      return {
        shop_id: asString(row.shop_id) || request.shop_id,
        shop_name: asString(row.shop_name),
        metric_date:
          asString(row.metric_date)
          || asString(row.date)
          || request.end_date,
        source: asString(row.source),
        total_score:
          asNumber(row.total_score)
          ?? asNumber(nestedScores.overall)
          ?? asNumber(nestedScores.total)
          ?? 0,
        product_score:
          asNumber(row.product_score)
          ?? asNumber(nestedScores.product)
          ?? asNumber(nestedScores.product_score)
          ?? 0,
        logistics_score:
          asNumber(row.logistics_score)
          ?? asNumber(nestedScores.logistics)
          ?? asNumber(nestedScores.logistics_score)
          ?? 0,
        service_score:
          asNumber(row.service_score)
          ?? asNumber(nestedScores.service)
          ?? asNumber(nestedScores.service_score)
          ?? 0,
        bad_behavior_score:
          asNumber(row.bad_behavior_score)
          ?? asNumber(nestedScores.bad_behavior)
          ?? asNumber(nestedScores.bad_behavior_score)
          ?? asNumber(nestedScores.risk)
          ?? asNumber(nestedScores.risk_score)
          ?? 0,
        reviews: buildTimelineReviews(row.reviews),
        violations: buildTimelineViolations(row.violations),
        cold_metrics: buildTimelineColdMetrics(row.cold_metrics),
      };
    })
    .sort((a, b) => {
      const timeA = Date.parse(a.metric_date);
      const timeB = Date.parse(b.metric_date);
      if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
        return a.metric_date.localeCompare(b.metric_date);
      }
      return timeA - timeB;
    });
}

function buildScores(
  payload: Record<string, unknown>,
  latestItem?: ShopDashboardTimelineItem
): ShopDashboardScores {
  if (latestItem) {
    return {
      overall: latestItem.total_score,
      product: latestItem.product_score,
      logistics: latestItem.logistics_score,
      service: latestItem.service_score,
      risk: latestItem.bad_behavior_score,
    };
  }

  const scores = asRecord(payload.scores);
  const summary = asRecord(payload.summary);

  const overall =
    asNumber(scores.overall)
    ?? asNumber(scores.total)
    ?? asNumber(summary.overall)
    ?? asNumber(summary.total_score)
    ?? 0;

  const product =
    asNumber(scores.product)
    ?? asNumber(scores.product_score)
    ?? asNumber(payload.product_score)
    ?? 0;

  const logistics =
    asNumber(scores.logistics)
    ?? asNumber(scores.logistics_score)
    ?? asNumber(payload.logistics_score)
    ?? 0;

  const service =
    asNumber(scores.service)
    ?? asNumber(scores.service_score)
    ?? asNumber(payload.service_score)
    ?? 0;

  const risk =
    asNumber(scores.risk)
    ?? asNumber(scores.risk_score)
    ?? asNumber(payload.risk_score)
    ?? 0;

  return { overall, product, logistics, service, risk };
}

function buildCommentSummary(
  payload: Record<string, unknown>,
  latestItem?: ShopDashboardTimelineItem
): ShopDashboardCommentSummary {
  if (latestItem && latestItem.reviews.length > 0) {
    const ratings = latestItem.reviews
      .map(review => asNumber(review.rating) ?? asNumber(review.score))
      .filter((rating): rating is number => typeof rating === 'number');
    const negativeCount = latestItem.reviews.filter((review) => {
      const sentiment = asString(review.sentiment)?.toLowerCase();
      const negative = asBoolean(review.is_negative) ?? asBoolean(review.negative);
      if (negative === true) {
        return true;
      }
      if (sentiment === 'negative') {
        return true;
      }
      const rating = asNumber(review.rating) ?? asNumber(review.score);
      return typeof rating === 'number' && rating <= 2;
    }).length;
    const total = latestItem.reviews.length;
    return {
      total,
      negative_count: negativeCount,
      negative_rate: total > 0 ? negativeCount / total : 0,
      average_rating:
        ratings.length > 0
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          : undefined,
    };
  }

  const comments = asRecord(payload.comments);
  return {
    total: asNumber(comments.total) ?? asNumber(payload.comment_total) ?? 0,
    negative_count: asNumber(comments.negative_count) ?? asNumber(payload.comment_negative_count) ?? 0,
    negative_rate: asNumber(comments.negative_rate) ?? asNumber(payload.comment_negative_rate) ?? 0,
    average_rating: asNumber(comments.average_rating) ?? asNumber(payload.comment_average_rating),
  };
}

function scoreToLevel(score: number): string {
  if (score >= 20) return 'P0';
  if (score >= 10) return 'P1';
  if (score >= 5) return 'P2';
  return 'P3';
}

function mapTimelineViolation(
  violation: ShopDashboardRawViolationItem,
  index: number,
  occurredAt?: string
): ShopDashboardViolationItem {
  return {
    id: violation.id || `violation-${index + 1}`,
    level: scoreToLevel(violation.score),
    type: violation.type || 'UNKNOWN',
    title: violation.type || '未命名违规',
    description: violation.description,
    count: 1,
    occurred_at: occurredAt,
    score: violation.score,
    source: violation.source,
  };
}

function buildViolations(
  payload: Record<string, unknown>,
  latestItem?: ShopDashboardTimelineItem
): ShopDashboardViolationItem[] {
  if (latestItem && latestItem.violations.length > 0) {
    return latestItem.violations.map((item, index) =>
      mapTimelineViolation(item, index, latestItem.metric_date)
    );
  }

  return asArray(payload.violations).map((item, index) => {
    const row = asRecord(item);
    const score = asNumber(row.score) ?? 0;
    return {
      id: asString(row.id) || asString(row.violation_id) || `violation-${index + 1}`,
      level: asString(row.level) || scoreToLevel(score),
      type: asString(row.type) || asString(row.violation_type) || 'UNKNOWN',
      title:
        asString(row.title)
        || asString(row.name)
        || asString(row.type)
        || asString(row.violation_type)
        || '未命名违规',
      description: asString(row.description),
      count: asNumber(row.count) ?? 0,
      occurred_at: asString(row.occurred_at) || asString(row.created_at),
      status: asString(row.status),
      score,
      source: asString(row.source),
    };
  });
}

function mapMetricRow(key: string, value: unknown): ShopDashboardMetricItem {
  const metric = asRecord(value);
  const rawLabel = asString(metric.label);
  return {
    key,
    label: localizeMetricText(rawLabel) || localizeMetricFieldName(key) || key,
    value: asNumber(metric.value) ?? asNumber(metric.score) ?? 0,
    trend: asArray(metric.trend)
      .map(point => asNumber(point))
      .filter((point): point is number => typeof point === 'number'),
    details: metric,
  };
}

function buildTimelineMetrics(
  items: ShopDashboardTimelineItem[],
  scores: ShopDashboardScores
): ShopDashboardMetricItem[] {
  return [
    {
      key: 'overall',
      label: '总分',
      value: scores.overall,
      trend: items.map(item => item.total_score),
    },
    {
      key: 'product',
      label: '商品体验',
      value: scores.product,
      trend: items.map(item => item.product_score),
    },
    {
      key: 'logistics',
      label: '物流体验',
      value: scores.logistics,
      trend: items.map(item => item.logistics_score),
    },
    {
      key: 'service',
      label: '服务体验',
      value: scores.service,
      trend: items.map(item => item.service_score),
    },
    {
      key: 'risk',
      label: '违规风险',
      value: scores.risk,
      trend: items.map(item => item.bad_behavior_score),
    },
  ];
}

function buildMetrics(
  payload: Record<string, unknown>,
  scores: ShopDashboardScores,
  items: ShopDashboardTimelineItem[]
): ShopDashboardMetricItem[] {
  const metricsArray = asArray(payload.metrics);
  if (metricsArray.length > 0) {
    return metricsArray.map((item, index) => {
      const metric = asRecord(item);
      const key = asString(metric.key) || asString(metric.id) || `metric-${index + 1}`;
      return mapMetricRow(key, metric);
    });
  }

  const metricMap = asRecord(payload.metric_map);
  const metricEntries = Object.entries(metricMap);
  if (metricEntries.length > 0) {
    return metricEntries.map(([key, value]) => mapMetricRow(key, value));
  }

  if (items.length > 0) {
    return buildTimelineMetrics(items, scores);
  }

  return [
    { key: 'overall', label: '总分', value: scores.overall },
    { key: 'product', label: '商品体验', value: scores.product },
    { key: 'logistics', label: '物流体验', value: scores.logistics },
    { key: 'service', label: '服务体验', value: scores.service },
    { key: 'risk', label: '违规风险', value: scores.risk },
  ];
}

export function normalizeShopDashboardQueryResponse(
  payload: unknown,
  request: ShopDashboardQueryRequest
): ShopDashboardQueryResponse {
  const data = asRecord(unwrapEndpointPayload(payload));
  const items = buildTimelineItems(data, request);
  const latestItem = items.length > 0 ? items[items.length - 1] : undefined;
  const scores = buildScores(data, latestItem);

  return {
    shop_id: asString(data.shop_id) || request.shop_id,
    start_date: asString(data.start_date) || request.start_date,
    end_date: asString(data.end_date) || request.end_date,
    items,
    scores,
    comments: buildCommentSummary(data, latestItem),
    violations: buildViolations(data, latestItem),
    metrics: buildMetrics(data, scores, items),
    raw: data,
  };
}

export function normalizeShopListResponse(payload: unknown): ShopListResponse {
  const data = asRecord(unwrapEndpointPayload(payload));
  const items = asArray(data.items).map((item, index) => {
    const row = asRecord(item);
    return {
      ...row,
      id: asNumber(row.id) ?? index + 1,
      name: asString(row.name) || `店铺${index + 1}`,
      category: asString(row.category),
      status: asString(row.status),
      gmv: asNumber(row.gmv),
      score: asNumber(row.score),
      products_count: asNumber(row.products_count),
    };
  });

  const meta = asRecord(data.meta);
  return {
    items,
    meta: {
      page: asNumber(meta.page) ?? 1,
      size: asNumber(meta.size) ?? items.length,
      total: asNumber(meta.total) ?? items.length,
      pages: asNumber(meta.pages) ?? 1,
      has_next: asBoolean(meta.has_next) ?? false,
      has_prev: asBoolean(meta.has_prev) ?? false,
    },
  };
}

export function normalizeShopScoreResponse(
  payload: unknown,
  shopId: number,
  dateRange: string
): ShopScoreResponse {
  const data = asRecord(unwrapEndpointPayload(payload));

  const dimensions = asArray(data.dimensions).map((item) => {
    const row = asRecord(item);
    return {
      dimension: asString(row.dimension) || 'product',
      score: asNumber(row.score) ?? 0,
      weight: asString(row.weight),
      rank: asNumber(row.rank),
    };
  });

  const trend = asArray(data.trend).map((item) => {
    const row = asRecord(item);
    return {
      date: asString(row.date) || '',
      value: asNumber(row.value) ?? 0,
    };
  });

  return {
    shop_id: asNumber(data.shop_id) ?? shopId,
    shop_name: asString(data.shop_name),
    overall_score: asNumber(data.overall_score) ?? 0,
    dimensions,
    trend,
    date_range: asString(data.date_range) || dateRange,
  };
}

const METRIC_FIELD_LABELS: Record<string, string> = {
  product_quality_score: '商品品质得分',
  product_return_rate: '商品退货率得分',
  product_negative_review_rate: '商品负向评价率得分',
  product_score: '商品体验得分',
  quality_score: '品质得分',
  return_rate: '退货率得分',
  negative_review_rate: '负向评价率得分',
  pickup_sla: '揽收时效达成率得分',
  delivery_sla: '配送时效达成率得分',
  logistics_return_rate: '物流退货率得分',
  logistics_score: '物流体验得分',
  im_response_time: '飞鸽平均响应时长得分',
  im_response_rate: '飞鸽响应率得分',
  im_response_sla: '飞鸽响应达成率得分',
  aftersales_duration: '售后处理时长达成率得分',
  aftersales_sla: '售后处理时长达成率得分',
  service_score: '服务体验得分',
  fake_transaction_deduct: '虚假交易扣分',
  fake_transaction_score: '虚假交易扣分',
  consumer_experience_deduct: '影响消费者体验扣分',
  consumer_experience_score: '影响消费者体验扣分',
  customer_complaint_penalty: '消费者投诉扣分',
  bad_behavior_score: '差行为扣分',
  risk_score: '风险扣分',
};

const METRIC_FIELD_TOKEN_LABELS: Record<string, string> = {
  product: '商品',
  logistics: '物流',
  service: '服务',
  risk: '风险',
  bad: '差',
  behavior: '行为',
  quality: '品质',
  return: '退货',
  negative: '负向',
  review: '评价',
  rate: '率',
  score: '得分',
  pickup: '揽收',
  delivery: '配送',
  sla: '时效达成率',
  im: '飞鸽',
  response: '响应',
  avg: '平均',
  average: '平均',
  excellent: '优秀',
  good: '良好',
  normal: '正常',
  poor: '较差',
  time: '时长',
  aftersale: '售后',
  aftersales: '售后',
  after: '售后',
  sale: '售后',
  sales: '售后',
  duration: '处理时长',
  process: '处理',
  processing: '处理',
  fake: '虚假',
  transaction: '交易',
  consumer: '消费者',
  experience: '体验',
  deduct: '扣分',
  deduction: '扣分',
  point: '扣分',
  points: '扣分',
  violation: '违规',
  violations: '违规',
  complaint: '投诉',
  refund: '退款',
  order: '订单',
  message: '消息',
  reply: '回复',
};

const METRIC_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  inactive: '停用',
  enabled: '正常',
  disabled: '停用',
  running: '执行中',
  pending: '待处理',
  queued: '排队中',
  success: '成功',
  failed: '失败',
  error: '异常',
  warning: '预警',
  critical: '严重',
  resolved: '已处理',
};

function toSnakeMetricKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function localizeMetricFieldName(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  if (/[^\x00-\x7F]/.test(value)) {
    return undefined;
  }

  const normalized = toSnakeMetricKey(value);
  if (!normalized) {
    return undefined;
  }

  const direct = METRIC_FIELD_LABELS[normalized];
  if (direct) {
    return direct;
  }

  const tokens = normalized.split('_').filter(Boolean);
  if (tokens.length === 0) {
    return undefined;
  }

  const translated = tokens
    .map(token => METRIC_FIELD_TOKEN_LABELS[token])
    .filter((token): token is string => Boolean(token));

  if (translated.length === 0) {
    return undefined;
  }
  if (tokens.length > 1 && translated.length < Math.ceil(tokens.length / 2)) {
    return undefined;
  }

  const merged = translated.reduce<string[]>((acc, token) => {
    if (acc[acc.length - 1] !== token) {
      acc.push(token);
    }
    return acc;
  }, []);

  return merged.join('');
}

function localizeMetricText(value?: string): string | undefined {
  if (!value) {
    return value;
  }

  const direct = localizeMetricFieldName(value);
  if (direct) {
    return direct;
  }

  return value.replace(/[A-Za-z][A-Za-z0-9_-]*/g, (segment) => {
    return localizeMetricFieldName(segment) || segment;
  });
}

function localizeMetricStatus(value?: string): string | undefined {
  if (!value) {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  return METRIC_STATUS_LABELS[normalized] || value;
}

export function normalizeMetricDetailResponse(
  payload: unknown,
  metricType: MetricType,
  request: Required<Pick<MetricDetailParams, 'shop_id' | 'period' | 'date_range'>>
): MetricDetailResponse {
  const data = asRecord(unwrapEndpointPayload(payload));

  const subMetrics = asArray(data.sub_metrics).map((item, index) => {
    const row = asRecord(item);
    const rawTitle = asString(row.title) || asString(row.name);
    return {
      id: asString(row.id) || `${metricType}-${index + 1}`,
      title: localizeMetricFieldName(rawTitle) || localizeMetricText(rawTitle) || `指标${index + 1}`,
      score: asNumber(row.score) ?? 0,
      weight: asString(row.weight) || '0%',
      value: localizeMetricText(asString(row.value)) || '-',
      desc: localizeMetricText(asString(row.desc)) || '',
      deduct_points: asNumber(row.deduct_points),
      impact_score: asNumber(row.impact_score),
      status: localizeMetricStatus(asString(row.status)),
      owner: asString(row.owner),
      deadline_at: asString(row.deadline_at),
    };
  });

  const scoreRanges = asArray(data.score_ranges).map((item) => {
    const row = asRecord(item);
    return Object.entries(row).reduce<MetricScoreRange>((acc, [key, value]) => {
      const numeric = asNumber(value);
      if (numeric !== undefined) {
        acc[key] = numeric;
        return acc;
      }
      const text = asString(value);
      if (text !== undefined) {
        acc[key] = localizeMetricText(text) || text;
      }
      return acc;
    }, {});
  });

  const trend = asArray(data.trend).map((item) => {
    const row = asRecord(item);
    return {
      date: asString(row.date) || '',
      value: asNumber(row.value) ?? 0,
    };
  });

  return {
    shop_id: asNumber(data.shop_id) ?? request.shop_id,
    metric_type: asString(data.metric_type) || metricType,
    period: asString(data.period) || request.period,
    date_range: asString(data.date_range) || request.date_range,
    category_score: asNumber(data.category_score) ?? 0,
    sub_metrics: subMetrics,
    score_ranges: scoreRanges,
    formula: localizeMetricText(asString(data.formula)) || '',
    trend,
  };
}
