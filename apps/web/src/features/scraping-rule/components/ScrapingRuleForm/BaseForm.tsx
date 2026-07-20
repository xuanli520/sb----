import {
  ScrapingRuleConfig,
  ScrapingRuleDataLatency,
  ScrapingRuleGranularity,
  ScrapingRuleIncrementalMode,
  TargetType,
} from '@/types';
import type { HttpError } from '@/lib/http/types';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

export type RuleShopScope = 'all' | 'single' | 'multiple';

export interface RuleConfigFormValues {
  granularity: ScrapingRuleGranularity | '';
  timezone: string;
  time_range_enabled: boolean;
  time_range_start: string;
  time_range_end: string;
  time_range_extra: Record<string, unknown>;
  incremental_mode: ScrapingRuleIncrementalMode | '';
  backfill_last_n_days: string;
  shop_scope: RuleShopScope;
  single_shop_id: string;
  shop_ids: string[];
  filters_extra: Record<string, unknown>;
  dimensions_text: string;
  metrics_text: string;
  dedupe_key: string;
  rate_limit_enabled: boolean;
  rate_limit_qps: string;
  rate_limit_extra: Record<string, unknown>;
  data_latency: ScrapingRuleDataLatency | '';
  top_n: string;
  sort_by: string;
  include_long_tail: boolean;
  session_level: boolean;
  agent_recipe_enabled: boolean;
  agent_recipe_namespace: string;
  agent_recipe_key: string;
  agent_recipe_version: string;
  agent_recipe_stability: string;
  preserved_config: Record<string, unknown>;
}

export const targetTypeOptions: Array<{ value: TargetType; label: string }> = [
  { value: 'SHOP_OVERVIEW', label: '店铺概览' },
  { value: 'TRAFFIC', label: '流量' },
  { value: 'PRODUCT', label: '商品' },
  { value: 'LIVE', label: '直播' },
  { value: 'CONTENT_VIDEO', label: '短视频' },
  { value: 'ORDER_FULFILLMENT', label: '订单履约' },
  { value: 'AFTERSALE_REFUND', label: '售后退款' },
  { value: 'CUSTOMER', label: '客户' },
  { value: 'ADS', label: '广告' },
];

export const granularityOptions: Array<{ value: ScrapingRuleGranularity; label: string }> = [
  { value: 'HOUR', label: '小时' },
  { value: 'DAY', label: '天' },
  { value: 'WEEK', label: '周' },
  { value: 'MONTH', label: '月' },
];

export const incrementalModeOptions: Array<{ value: ScrapingRuleIncrementalMode; label: string }> = [
  { value: 'BY_DATE', label: '按日期' },
  { value: 'BY_CURSOR', label: '按游标' },
];

export const dataLatencyOptions: Array<{ value: ScrapingRuleDataLatency; label: string }> = [
  { value: 'REALTIME', label: '实时' },
  { value: 'T+1', label: 'T+1' },
  { value: 'T+2', label: 'T+2' },
  { value: 'T+3', label: 'T+3' },
];

const managedConfigKeys = new Set([
  'granularity',
  'timezone',
  'time_range',
  'incremental_mode',
  'backfill_last_n_days',
  'filters',
  'dimensions',
  'metrics',
  'dedupe_key',
  'rate_limit',
  'data_latency',
  'top_n',
  'sort_by',
  'include_long_tail',
  'session_level',
  'shop_id',
  'shop_ids',
  'all',
  'resolved_shop_ids',
  'shop_mode',
  'catalog_stale',
  'shop_resolve_source',
  'agent_recipe',
]);

const shopFilterKeys = new Set(['shop_id', 'shop_ids', 'all']);
const timeRangeKeys = new Set(['start', 'end', 'start_date', 'end_date', 'date_from', 'date_to']);
const rateLimitQpsKeys = new Set(['qps', 'rps', 'requests_per_second']);

const scrapingRuleErrorFieldMap = [
  ['time_range', 'time_range_start'],
  ['filters', 'shop_scope'],
  ['shop_scope', 'shop_scope'],
  ['shop_id', 'single_shop_id'],
  ['single_shop_id', 'single_shop_id'],
  ['shop_ids', 'shop_scope'],
  ['all', 'shop_scope'],
  ['agent_recipe', 'agent_recipe_namespace'],
  ['agent_recipe_enabled', 'agent_recipe_enabled'],
  ['agent_recipe_namespace', 'agent_recipe_namespace'],
  ['agent_recipe_version', 'agent_recipe_version'],
  ['agent_recipe_stability', 'agent_recipe_namespace'],
  ['rate_limit', 'rate_limit_qps'],
  ['rate_limit_qps', 'rate_limit_qps'],
  ['backfill_last_n_days', 'backfill_last_n_days'],
  ['top_n', 'top_n'],
  ['name', 'name'],
  ['description', 'description'],
  ['data_source_id', 'data_source_id'],
  ['target_type', 'target_type'],
  ['is_active', 'is_active'],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function copyRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}

function omitKeys(value: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)));
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  items.forEach(item => {
    const text = item.trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    result.push(text);
  });
  return result;
}

function isAllShopMarker(value: string): boolean {
  return ['all', '*'].includes(value.trim().toLowerCase());
}

function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueItems(value.map(item => readText(item)).filter(Boolean));
  }
  if (value instanceof Set) {
    return readList(Array.from(value));
  }
  if (typeof value !== 'string') {
    const text = readText(value);
    return text ? [text] : [];
  }
  const text = value.trim();
  if (!text) {
    return [];
  }
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return readList(parsed);
      }
    } catch {
      return [text];
    }
  }
  return uniqueItems(
    text
      .replace(/[;\n|]/g, ',')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );
}

function parseListField(value: string): string[] {
  return readList(value);
}

function parseOptionalNonNegativeInteger(value: string, fieldName: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^\d+$/.test(trimmed)) {
    throwFormError(fieldName, `${fieldName} 必须是非负整数`);
  }
  return Number(trimmed);
}

function parseOptionalPositiveInteger(value: string, fieldName: string): number | undefined {
  const parsed = parseOptionalNonNegativeInteger(value, fieldName);
  if (parsed !== undefined && parsed <= 0) {
    throwFormError(fieldName, `${fieldName} 必须是正整数`);
  }
  return parsed;
}

function throwFormError(field: string, message: string): never {
  const error = new Error(message) as Error & { field?: string };
  error.field = field;
  throw error;
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return null;
}

function resolveScrapingRuleErrorField(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const matchedField = scrapingRuleErrorFieldMap.find(([sourceField]) => (
    trimmed === sourceField ||
    trimmed.startsWith(`${sourceField} `) ||
    trimmed.startsWith(`${sourceField}:`)
  ));

  return matchedField?.[1] ?? null;
}

function extractStructuredErrors(error: unknown): Array<{ field?: string; message: string }> {
  const directField = isRecord(error) ? readErrorMessage(error.field) : null;
  const directMessage = error instanceof Error ? readErrorMessage(error.message) : null;
  if (directField && directMessage) {
    return [{ field: directField, message: directMessage }];
  }

  const payloads: Record<string, unknown>[] = [];
  const httpError = error as HttpError | undefined;

  if (isRecord(httpError?.data)) {
    payloads.push(httpError.data);
    if (isRecord(httpError.data.data)) {
      payloads.push(httpError.data.data);
    }
  }

  for (const payload of payloads) {
    if (Array.isArray(payload.errors)) {
      const errors = payload.errors.flatMap(item => {
        if (!isRecord(item)) {
          return [];
        }

        const message = readErrorMessage(item.message) ?? readErrorMessage(item.msg);
        if (!message) {
          return [];
        }

        const field = readErrorMessage(item.field);
        return [{ field: field ?? undefined, message }];
      });

      if (errors.length > 0) {
        return errors;
      }
    }

    const field = readErrorMessage(payload.field);
    const message = readErrorMessage(payload.message) ?? readErrorMessage(payload.msg);
    if (field && message) {
      return [{ field, message }];
    }
  }

  return [];
}

export function validateOptionalNonNegativeIntegerText(value: string): true | string {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return /^\d+$/.test(trimmed) ? true : '请输入非负整数';
}

export function validateOptionalPositiveIntegerText(value: string): true | string {
  const nonNegative = validateOptionalNonNegativeIntegerText(value);
  if (nonNegative !== true) {
    return nonNegative;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return Number(trimmed) > 0 ? true : '请输入正整数';
}

export function applyScrapingRuleFormError<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  error: unknown,
  fallbackField: FieldPath<TFieldValues>,
  fallbackMessage: string,
) {
  const values = form.getValues();
  const structuredErrors = extractStructuredErrors(error);

  if (structuredErrors.length > 0) {
    let applied = false;

    for (const structuredError of structuredErrors) {
      const resolvedField = structuredError.field
        ? resolveScrapingRuleErrorField(structuredError.field)
        : null;

      if (resolvedField && resolvedField in values) {
        form.setError(resolvedField as FieldPath<TFieldValues>, {
          type: 'server',
          message: structuredError.message,
        });
        applied = true;
        continue;
      }

      if (!applied) {
        form.setError(fallbackField, { type: 'server', message: structuredError.message });
        applied = true;
      }
    }

    if (applied) {
      return;
    }
  }

  const message =
    readErrorMessage(error instanceof Error ? error.message : error) ??
    fallbackMessage;
  const resolvedField = resolveScrapingRuleErrorField(message);

  if (resolvedField && resolvedField in values) {
    form.setError(resolvedField as FieldPath<TFieldValues>, { type: 'server', message });
    return;
  }

  form.setError(fallbackField, { type: 'server', message });
}

function resolveShopDefaults(config?: ScrapingRuleConfig): {
  shop_scope: RuleShopScope;
  single_shop_id: string;
  shop_ids: string[];
  filters_extra: Record<string, unknown>;
} {
  const filters = isRecord(config?.filters) ? config.filters : {};
  const rawShopIds = [
    ...readList(config?.shop_ids),
    ...readList(config?.shop_id),
    ...readList(filters.shop_ids),
    ...readList(filters.shop_id),
  ];
  const hasAll = config?.all === true || filters.all === true || rawShopIds.some(isAllShopMarker);
  const shopIds = uniqueItems(rawShopIds.filter(item => !isAllShopMarker(item)));
  const shop_scope: RuleShopScope = hasAll || shopIds.length === 0
    ? 'all'
    : shopIds.length === 1
      ? 'single'
      : 'multiple';

  return {
    shop_scope,
    single_shop_id: shopIds[0] || '',
    shop_ids: shopIds,
    filters_extra: omitKeys(filters, shopFilterKeys),
  };
}

function resolveTimeRangeDefaults(config?: ScrapingRuleConfig): {
  time_range_enabled: boolean;
  time_range_start: string;
  time_range_end: string;
  time_range_extra: Record<string, unknown>;
} {
  const timeRange = isRecord(config?.time_range) ? config.time_range : {};
  const start = readText(timeRange.start) || readText(timeRange.start_date) || readText(timeRange.date_from);
  const end = readText(timeRange.end) || readText(timeRange.end_date) || readText(timeRange.date_to);
  const extra = omitKeys(timeRange, timeRangeKeys);
  return {
    time_range_enabled: Boolean(start || end || Object.keys(extra).length > 0),
    time_range_start: start,
    time_range_end: end,
    time_range_extra: extra,
  };
}

function resolveRateLimitDefaults(config?: ScrapingRuleConfig): {
  rate_limit_enabled: boolean;
  rate_limit_qps: string;
  rate_limit_extra: Record<string, unknown>;
} {
  const rawRateLimit = config?.rate_limit;
  if (isRecord(rawRateLimit)) {
    const qps = readText(rawRateLimit.qps) || readText(rawRateLimit.rps) || readText(rawRateLimit.requests_per_second);
    const extra = omitKeys(rawRateLimit, rateLimitQpsKeys);
    return {
      rate_limit_enabled: Boolean(qps || Object.keys(extra).length > 0),
      rate_limit_qps: qps,
      rate_limit_extra: extra,
    };
  }

  const qps = rawRateLimit === undefined ? '' : readText(rawRateLimit);
  return {
    rate_limit_enabled: Boolean(qps),
    rate_limit_qps: qps,
    rate_limit_extra: {},
  };
}

function resolveAgentRecipeDefaults(config?: ScrapingRuleConfig): {
  agent_recipe_enabled: boolean;
  agent_recipe_namespace: string;
  agent_recipe_key: string;
  agent_recipe_version: string;
  agent_recipe_stability: string;
} {
  const recipe = isRecord(config?.agent_recipe) ? config.agent_recipe : {};
  const namespace = readText(recipe.namespace);
  const key = readText(recipe.key);
  const version = readText(recipe.version);
  const stability = readText(recipe.stability);
  return {
    agent_recipe_enabled: Boolean(namespace || key),
    agent_recipe_namespace: namespace,
    agent_recipe_key: key,
    agent_recipe_version: version,
    agent_recipe_stability: stability,
  };
}

export function buildRuleConfigFormDefaults(config?: ScrapingRuleConfig): RuleConfigFormValues {
  return {
    granularity: config?.granularity || '',
    timezone: config?.timezone || 'Asia/Shanghai',
    ...resolveTimeRangeDefaults(config),
    incremental_mode: config?.incremental_mode || '',
    backfill_last_n_days: config?.backfill_last_n_days !== undefined ? String(config.backfill_last_n_days) : '',
    ...resolveShopDefaults(config),
    dimensions_text: readList(config?.dimensions).join(', '),
    metrics_text: readList(config?.metrics).join(', '),
    dedupe_key: readText(config?.dedupe_key),
    ...resolveRateLimitDefaults(config),
    data_latency: config?.data_latency || '',
    top_n: config?.top_n !== undefined && config?.top_n !== null ? String(config.top_n) : '',
    sort_by: readText(config?.sort_by),
    include_long_tail: config?.include_long_tail ?? false,
    session_level: config?.session_level ?? false,
    ...resolveAgentRecipeDefaults(config),
    preserved_config: config ? omitKeys(config, managedConfigKeys) : {},
  };
}

function applyShopSelection(config: ScrapingRuleConfig, values: RuleConfigFormValues) {
  const filters = copyRecord(values.filters_extra);

  if (values.shop_scope === 'all') {
    config.all = true;
    filters.all = true;
    filters.shop_id = ['all'];
    config.filters = filters;
    return;
  }

  const shopIds = values.shop_scope === 'single'
    ? uniqueItems([values.single_shop_id])
    : uniqueItems(values.shop_ids);

  if (shopIds.length === 0) {
    throwFormError(
      values.shop_scope === 'single' ? 'single_shop_id' : 'shop_scope',
      values.shop_scope === 'single' ? '请选择一个店铺' : '请选择至少一个店铺',
    );
  }

  config.all = false;
  config.shop_id = shopIds[0];
  config.shop_ids = shopIds;
  filters.shop_id = shopIds;
  config.filters = filters;
}

export function buildRuleConfigFromForm(values: RuleConfigFormValues): ScrapingRuleConfig {
  const config: ScrapingRuleConfig = {
    ...copyRecord(values.preserved_config),
    include_long_tail: values.include_long_tail,
    session_level: values.session_level,
  };

  if (values.granularity) {
    config.granularity = values.granularity;
  }
  if (values.timezone.trim()) {
    config.timezone = values.timezone.trim();
  }

  const timeRange = copyRecord(values.time_range_extra);
  if (values.time_range_enabled) {
    if (values.time_range_start.trim()) {
      timeRange.start = values.time_range_start.trim();
    }
    if (values.time_range_end.trim()) {
      timeRange.end = values.time_range_end.trim();
    }
  }
  if (Object.keys(timeRange).length > 0) {
    config.time_range = timeRange;
  } else {
    config.time_range = null;
  }

  if (values.incremental_mode) {
    config.incremental_mode = values.incremental_mode;
  }

  const backfillLastNDays = parseOptionalNonNegativeInteger(values.backfill_last_n_days, 'backfill_last_n_days');
  if (backfillLastNDays !== undefined) {
    config.backfill_last_n_days = backfillLastNDays;
  }

  applyShopSelection(config, values);

  const dimensions = parseListField(values.dimensions_text);
  config.dimensions = dimensions;

  const metrics = parseListField(values.metrics_text);
  config.metrics = metrics;

  if (values.dedupe_key.trim()) {
    config.dedupe_key = values.dedupe_key.trim();
  } else {
    config.dedupe_key = null;
  }

  const rateLimit = copyRecord(values.rate_limit_extra);
  if (values.rate_limit_enabled) {
    const qps = parseOptionalNonNegativeInteger(values.rate_limit_qps, 'rate_limit_qps');
    if (qps !== undefined) {
      rateLimit.qps = qps;
    }
  }
  if (Object.keys(rateLimit).length > 0) {
    config.rate_limit = rateLimit;
  } else {
    config.rate_limit = null;
  }

  if (values.data_latency) {
    config.data_latency = values.data_latency;
  }

  const topN = parseOptionalNonNegativeInteger(values.top_n, 'top_n');
  if (topN !== undefined) {
    config.top_n = topN;
  } else {
    config.top_n = null;
  }

  if (values.sort_by.trim()) {
    config.sort_by = values.sort_by.trim();
  } else {
    config.sort_by = null;
  }

  if (values.agent_recipe_enabled) {
    if (!values.agent_recipe_namespace.trim() || !values.agent_recipe_key.trim()) {
      throwFormError('agent_recipe_namespace', '请选择 Agent Recipe');
    }
    const recipe: Record<string, unknown> = {
      namespace: values.agent_recipe_namespace.trim(),
      key: values.agent_recipe_key.trim(),
    };
    const version = parseOptionalPositiveInteger(values.agent_recipe_version, 'agent_recipe_version');
    if (version === undefined) {
      throwFormError('agent_recipe_version', '请选择带版本的 Agent Recipe');
    }
    recipe.version = version;
    if (values.agent_recipe_stability === 'unavailable') {
      throwFormError('agent_recipe_namespace', '当前 Agent Recipe 不可用，请重新选择');
    }
    if (values.shop_scope !== 'single' && values.agent_recipe_stability !== 'stable') {
      throwFormError('agent_recipe_namespace', '全店/多店采集只能使用 stable Agent Recipe');
    }
    config.agent_recipe = recipe;
  } else if (values.shop_scope !== 'single') {
    throwFormError('agent_recipe_enabled', '全店/多店采集需要选择稳定 Agent Recipe');
  } else {
    config.agent_recipe = null;
  }

  return config;
}
