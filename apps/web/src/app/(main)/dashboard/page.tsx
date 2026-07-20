'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { 
  Moon, Sun, LayoutDashboard, LayoutTemplate, Download
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import CompassWidget from '@/components/dashboard/CompassWidget';
import MetricCard from '@/components/dashboard/MetricCard';
import LayoutCustomizer from '@/components/dashboard/LayoutCustomizer';
import { useThemeStore } from '@/stores/themeStore';
import {
  MetricDetailResponse,
  MetricSubMetric,
  MetricType,
  ShopDashboardQueryResponse,
  shopDashboardApi,
} from '@/features/shop-dashboard/services';

// --- 样式包装器 ---
const GlassPanel = ({ children, className = "", noBorder = false }: { children: React.ReactNode, className?: string, noBorder?: boolean }) => (
  <div className={`
    glass-panel relative overflow-hidden transition-all duration-300
    bg-white/40 dark:bg-[#0f172a]/20 backdrop-blur-xl
    ${!noBorder ? 'rounded-2xl border border-white/20 dark:border-white/5 shadow-sm dark:shadow-none' : ''}
    ${className}
  `}>
    {children}
  </div>
);

type GridBreakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

type GridItemLayout = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

type GridLayouts = Partial<Record<GridBreakpoint, GridItemLayout[]>>;

const GRID_BREAKPOINTS: Record<GridBreakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0,
};

const GRID_COLS: Record<GridBreakpoint, number> = {
  lg: 12,
  md: 6,
  sm: 4,
  xs: 2,
  xxs: 2,
};

const GRID_ORDER: GridBreakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];
const PRESET_OPTIONS = ['standard', 'focus', 'grid'] as const;
const DEFAULT_PRESET = 'standard';
const LAYOUT_STORAGE_KEY = 'compass_layouts';
const VISIBILITY_STORAGE_KEY = 'compass_visibility';
const PRESET_STORAGE_KEY = 'compass_layout_preset';

const LAYOUT_PRESETS: Record<string, GridLayouts> = {
  standard: {
    lg: [
      { i: 'card-product', x: 0, y: 0, w: 6, h: 9, minW: 4, minH: 7 },
      { i: 'card-logistics', x: 6, y: 0, w: 6, h: 9, minW: 4, minH: 7 },
      { i: 'card-service', x: 0, y: 9, w: 6, h: 9, minW: 4, minH: 7 },
      { i: 'card-merchant', x: 6, y: 9, w: 6, h: 9, minW: 4, minH: 7 },
    ],
    md: [
      { i: 'card-product', x: 0, y: 0, w: 6, h: 9, minW: 3, minH: 7 },
      { i: 'card-logistics', x: 0, y: 9, w: 6, h: 9, minW: 3, minH: 7 },
      { i: 'card-service', x: 0, y: 18, w: 6, h: 9, minW: 3, minH: 7 },
      { i: 'card-merchant', x: 0, y: 27, w: 6, h: 9, minW: 3, minH: 7 },
    ],
    sm: [
      { i: 'card-product', x: 0, y: 0, w: 4, h: 8, minW: 2, minH: 6 },
      { i: 'card-logistics', x: 0, y: 8, w: 4, h: 8, minW: 2, minH: 6 },
      { i: 'card-service', x: 0, y: 16, w: 4, h: 8, minW: 2, minH: 6 },
      { i: 'card-merchant', x: 0, y: 24, w: 4, h: 8, minW: 2, minH: 6 },
    ]
  },
  focus: {
    lg: [
      { i: 'card-product', x: 0, y: 0, w: 12, h: 10, minW: 6, minH: 7 },
      { i: 'card-logistics', x: 0, y: 10, w: 4, h: 8, minW: 3, minH: 6 },
      { i: 'card-service', x: 4, y: 10, w: 4, h: 8, minW: 3, minH: 6 },
      { i: 'card-merchant', x: 8, y: 10, w: 4, h: 8, minW: 3, minH: 6 },
    ],
    md: [
      { i: 'card-product', x: 0, y: 0, w: 6, h: 10, minW: 4, minH: 7 },
      { i: 'card-logistics', x: 0, y: 10, w: 3, h: 8, minW: 2, minH: 6 },
      { i: 'card-service', x: 3, y: 10, w: 3, h: 8, minW: 2, minH: 6 },
      { i: 'card-merchant', x: 0, y: 18, w: 6, h: 8, minW: 3, minH: 6 },
    ],
    sm: [
      { i: 'card-product', x: 0, y: 0, w: 4, h: 9, minW: 2, minH: 6 },
      { i: 'card-logistics', x: 0, y: 9, w: 4, h: 7, minW: 2, minH: 6 },
      { i: 'card-service', x: 0, y: 16, w: 4, h: 7, minW: 2, minH: 6 },
      { i: 'card-merchant', x: 0, y: 23, w: 4, h: 7, minW: 2, minH: 6 },
    ]
  },
  grid: {
    lg: [
      { i: 'card-product', x: 0, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: 'card-logistics', x: 3, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: 'card-service', x: 6, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
      { i: 'card-merchant', x: 9, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
    ],
    md: [
      { i: 'card-product', x: 0, y: 0, w: 3, h: 8, minW: 2, minH: 6 },
      { i: 'card-logistics', x: 3, y: 0, w: 3, h: 8, minW: 2, minH: 6 },
      { i: 'card-service', x: 0, y: 8, w: 3, h: 8, minW: 2, minH: 6 },
      { i: 'card-merchant', x: 3, y: 8, w: 3, h: 8, minW: 2, minH: 6 },
    ],
    sm: [
      { i: 'card-product', x: 0, y: 0, w: 2, h: 8, minW: 2, minH: 6 },
      { i: 'card-logistics', x: 2, y: 0, w: 2, h: 8, minW: 2, minH: 6 },
      { i: 'card-service', x: 0, y: 8, w: 2, h: 8, minW: 2, minH: 6 },
      { i: 'card-merchant', x: 2, y: 8, w: 2, h: 8, minW: 2, minH: 6 },
    ]
  }
};

interface WidgetData {
  score?: number;
  totalScore?: number;
  totalLabel?: string;
  items?: Array<{ label: string; score: number; isWarning?: boolean; subLabel?: string }>;
}

interface WidgetItem {
  id: string;
  title: string;
  type: 'metric';
  data?: WidgetData;
}

const WIDGETS: WidgetItem[] = [
  {
    id: 'card-product', title: '商品体验详情', type: 'metric',
    data: {
      totalScore: 100, totalLabel: '商品体验得分',
      items: [
        // 明确等于：商品综合评分得分 + 商品品质退货率得分
        { label: '商品综合评分得分', score: 100 },
        { label: '商品品质退货率得分', score: 100 },
      ]
    }
  },
  {
    id: 'card-logistics', title: '物流体验详情', type: 'metric',
    data: {
      totalScore: 100, totalLabel: '物流体验得分',
      items: [
        // 明确等于：揽收时效 + 运单配送时效 + 发货物流品退率
        { label: '揽收时效达成率得分', score: 100 },
        { label: '运单配送时效达成率得分', score: 100 },
        { label: '发货物流品退率得分', score: 100 },
      ]
    }
  },
  {
    id: 'card-service', title: '服务体验详情', type: 'metric',
    data: {
      totalScore: 100, totalLabel: '服务体验得分',
      items: [
        // 明确等于：飞鸽响应 + 售后处理时长
        { label: '飞鸽平均响应时长得分', score: 100 },
        { label: '售后处理时长达成率得分', score: 100 },
      ]
    }
  },
  {
    id: 'card-merchant', title: '差行为详情', type: 'metric',
    data: {
      totalScore: 0, totalLabel: '差行为扣分',
      items: [
        // 明确等于：虚假交易扣分 + 影响消费者体验扣分
        { label: '虚假交易刷体验分扣分', score: 0 },
        { label: '影响消费者体验扣分', score: 0 },
      ]
    }
  },
];

const METRIC_QUERY_TYPES: MetricType[] = ['product', 'logistics', 'service', 'risk'];
const METRIC_TYPE_BY_WIDGET: Record<string, MetricType> = {
  'card-product': 'product',
  'card-logistics': 'logistics',
  'card-service': 'service',
  'card-merchant': 'risk',
};

const WIDGET_IDS = WIDGETS.map((widget) => widget.id);

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function cloneLayouts(layouts: GridLayouts): GridLayouts {
  return JSON.parse(JSON.stringify(layouts)) as GridLayouts;
}

function isValidPreset(value: string | null): value is (typeof PRESET_OPTIONS)[number] {
  if (!value) {
    return false;
  }
  return PRESET_OPTIONS.includes(value as (typeof PRESET_OPTIONS)[number]);
}

function getPresetLayouts(preset: string): GridLayouts {
  return cloneLayouts(LAYOUT_PRESETS[preset] ?? LAYOUT_PRESETS[DEFAULT_PRESET]);
}

function buildStackedFallback(bp: GridBreakpoint): GridItemLayout[] {
  const cols = GRID_COLS[bp];
  return WIDGET_IDS.map((id, index) => ({
    i: id,
    x: 0,
    y: index * 8,
    w: cols,
    h: 8,
    minW: Math.min(cols, 2),
    minH: 6,
  }));
}

function normalizeLayouts(rawLayouts: unknown, preset: string, currentLayouts?: GridLayouts): GridLayouts {
  const source = (rawLayouts && typeof rawLayouts === 'object' ? rawLayouts : {}) as GridLayouts;
  const presetLayouts = getPresetLayouts(preset);
  const normalized: GridLayouts = {};

  GRID_ORDER.forEach((bp) => {
    const cols = GRID_COLS[bp];
    const sourceList = Array.isArray(source[bp]) ? source[bp]! : [];
    const currentList = Array.isArray(currentLayouts?.[bp]) ? currentLayouts![bp]! : [];
    const fallbackList = Array.isArray(presetLayouts[bp]) && presetLayouts[bp]!.length > 0
      ? presetLayouts[bp]!
      : buildStackedFallback(bp);

    const sourceMap = new Map(sourceList.map((item) => [item.i, item]));
    const currentMap = new Map(currentList.map((item) => [item.i, item]));
    const fallbackMap = new Map(fallbackList.map((item) => [item.i, item]));

    normalized[bp] = WIDGET_IDS.map((widgetId, index) => {
      const fallbackItem = fallbackMap.get(widgetId) ?? buildStackedFallback(bp)[index];
      const sourceItem = sourceMap.get(widgetId);
      const currentItem = currentMap.get(widgetId);
      const candidate = sourceItem ?? currentItem ?? fallbackItem;
      const minW = Math.min(cols, Math.max(1, fallbackItem.minW ?? Math.min(3, fallbackItem.w)));
      const minH = Math.max(4, fallbackItem.minH ?? 6);
      const w = clampNumber(candidate.w, minW, cols, fallbackItem.w);
      const h = clampNumber(candidate.h, minH, 40, fallbackItem.h);
      const x = clampNumber(candidate.x, 0, Math.max(0, cols - w), fallbackItem.x);
      const y = clampNumber(candidate.y, 0, 2000, fallbackItem.y);

      return {
        i: widgetId,
        x,
        y,
        w,
        h,
        minW,
        minH,
      };
    });
  });

  return normalized;
}

function detectPresetByLayouts(layouts: GridLayouts): (typeof PRESET_OPTIONS)[number] {
  const firstWidth = layouts.lg?.find((item) => item.i === WIDGET_IDS[0])?.w ?? layouts.lg?.[0]?.w ?? 6;
  if (firstWidth >= 10) {
    return 'focus';
  }
  if (firstWidth <= 3) {
    return 'grid';
  }
  return 'standard';
}

function serializeLayouts(layouts: GridLayouts): string {
  return JSON.stringify(layouts);
}

function normalizeScore(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value as number) * 100) / 100;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'shop-detail';
}

function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return 0;
}

function normalizeSubMetricScore(metricType: MetricType, subMetric: MetricSubMetric): { score: number; isWarning: boolean } {
  if (metricType !== 'risk') {
    const score = normalizeScore(subMetric.score);
    return { score, isWarning: score < 60 };
  }

  const deductPoints = subMetric.deduct_points;
  const score = normalizeScore(
    deductPoints === null || deductPoints === undefined
      ? Math.max(0, 100 - toNumeric(subMetric.score))
      : toNumeric(deductPoints)
  );
  return { score, isWarning: score > 0 };
}

function buildWidgetFromMetric(widget: WidgetItem, metric?: MetricDetailResponse): WidgetItem {
  if (!metric) {
    return widget;
  }

  const metricType = METRIC_TYPE_BY_WIDGET[widget.id];
  const isRiskMetric = metricType === 'risk';

  const totalScore = isRiskMetric
    ? normalizeScore(Math.max(0, 100 - toNumeric(metric.category_score)))
    : normalizeScore(metric.category_score);

  const items = metric.sub_metrics.map((subMetric) => {
    const normalized = normalizeSubMetricScore(metricType, subMetric);
    return {
      label: subMetric.title,
      score: normalized.score,
      isWarning: normalized.isWarning,
      subLabel: subMetric.weight ? `权重 ${subMetric.weight}` : subMetric.value,
    };
  });

  return {
    ...widget,
    data: {
      totalScore,
      totalLabel: widget.data?.totalLabel,
      items: items.length > 0 ? items : widget.data?.items,
    },
  };
}

function buildWidgetsFromMetrics(metrics: Partial<Record<MetricType, MetricDetailResponse>>): WidgetItem[] {
  return WIDGETS.map((widget) => {
    const metricType = METRIC_TYPE_BY_WIDGET[widget.id];
    return buildWidgetFromMetric(widget, metricType ? metrics[metricType] : undefined);
  });
}

function createEmptyMetric(metricType: MetricType, shopId: number, dateRange: string): MetricDetailResponse {
  return {
    shop_id: shopId,
    metric_type: metricType,
    period: dateRange,
    date_range: dateRange,
    category_score: 0,
    sub_metrics: [],
    score_ranges: [],
    formula: '',
    trend: [],
  };
}

function resolveDashboardMetricScore(metricType: MetricType, dashboard?: ShopDashboardQueryResponse): number | undefined {
  if (!dashboard) {
    return undefined;
  }

  const latest = dashboard.items[dashboard.items.length - 1];
  if (metricType === 'product') {
    return normalizeScore(latest?.product_score ?? dashboard.scores.product);
  }
  if (metricType === 'logistics') {
    return normalizeScore(latest?.logistics_score ?? dashboard.scores.logistics);
  }
  if (metricType === 'service') {
    return normalizeScore(latest?.service_score ?? dashboard.scores.service);
  }

  const riskDeduct = normalizeScore(latest?.bad_behavior_score ?? dashboard.scores.risk);
  return normalizeScore(Math.max(0, 100 - riskDeduct));
}

function resolveDashboardMetricTrend(
  metricType: MetricType,
  dashboard?: ShopDashboardQueryResponse
): MetricDetailResponse['trend'] {
  if (!dashboard) {
    return [];
  }

  return dashboard.items.map((item) => {
    if (metricType === 'product') {
      return { date: item.metric_date, value: normalizeScore(item.product_score) };
    }
    if (metricType === 'logistics') {
      return { date: item.metric_date, value: normalizeScore(item.logistics_score) };
    }
    if (metricType === 'service') {
      return { date: item.metric_date, value: normalizeScore(item.service_score) };
    }

    return {
      date: item.metric_date,
      value: normalizeScore(Math.max(0, 100 - item.bad_behavior_score)),
    };
  });
}

function mergeMetricWithDashboard(
  metricType: MetricType,
  metric: MetricDetailResponse | undefined,
  dashboard: ShopDashboardQueryResponse | undefined,
  shopId: number,
  dateRange: string
): MetricDetailResponse | undefined {
  const dashboardScore = resolveDashboardMetricScore(metricType, dashboard);
  const dashboardTrend = resolveDashboardMetricTrend(metricType, dashboard);

  if (!metric && dashboardScore === undefined && dashboardTrend.length === 0) {
    return undefined;
  }

  const baseMetric = metric ?? createEmptyMetric(metricType, shopId, dateRange);

  return {
    ...baseMetric,
    metric_type: metricType,
    category_score: dashboardScore ?? baseMetric.category_score,
    trend: dashboardTrend.length > 0 ? dashboardTrend : baseMetric.trend,
  };
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas flex items-center justify-center">加载中...</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const { appTheme, colorMode, setColorMode } = useThemeStore();
  const defaultVisibility = useMemo(
    () =>
      WIDGET_IDS.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {}),
    []
  );
  const defaultLayouts = useMemo(
    () => normalizeLayouts(getPresetLayouts(DEFAULT_PRESET), DEFAULT_PRESET),
    []
  );
  const [mounted, setMounted] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [layouts, setLayouts] = useState<GridLayouts>(defaultLayouts);
  const [currentPreset, setCurrentPreset] = useState<(typeof PRESET_OPTIONS)[number]>(DEFAULT_PRESET);
  const latestLayoutsRef = useRef<GridLayouts>(defaultLayouts);
  const layoutSignatureRef = useRef<string>(serializeLayouts(defaultLayouts));
  const { width: gridWidth, containerRef, measureWidth } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1280,
  });
  const resolvedGridWidth = gridWidth > 0 ? gridWidth : 1280;

  const [visibleWidgets, setVisibleWidgets] = useState<Record<string, boolean>>(defaultVisibility);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dateRange = '1d';

  const shopsQuery = useQuery({
    queryKey: ['shop-dashboard', 'dashboard', 'shops', dateRange],
    queryFn: () => shopDashboardApi.listShops({ page: 1, size: 50, date_range: dateRange }),
    staleTime: 60_000,
  });

  const shopOptions = useMemo(
    () => (shopsQuery.data?.items ?? []).map(shop => ({ value: String(shop.shop_id ?? shop.id), label: shop.name })),
    [shopsQuery.data]
  );

  const selectedStoreId = searchParams.get('storeId');
  const storeId = selectedStoreId || shopOptions[0]?.value || '';
  const resolvedStoreId = useMemo(() => {
    const numericStoreId = Number(storeId);
    return Number.isInteger(numericStoreId) && numericStoreId > 0 ? numericStoreId : 1001;
  }, [storeId]);

  useEffect(() => {
    if (!selectedStoreId && shopOptions.length > 0) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('storeId', shopOptions[0].value);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [selectedStoreId, shopOptions, searchParams, router, pathname]);

  const shopDetailQuery = useQuery({
    queryKey: ['shop-dashboard', 'dashboard', 'shop', storeId, dateRange],
    queryFn: () => shopDashboardApi.getShop(storeId, dateRange),
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });

  const metricQueries = useQueries({
    queries: METRIC_QUERY_TYPES.map((metricType) => ({
      queryKey: ['shop-dashboard', 'dashboard', 'metric', metricType, storeId, dateRange],
      queryFn: () => shopDashboardApi.getMetricDetail(metricType, {
        shop_id: resolvedStoreId,
        period: dateRange,
        date_range: dateRange,
      }),
      enabled: Boolean(storeId),
      staleTime: 60_000,
    })),
  });

  const metricsByType = useMemo(() => {
    return METRIC_QUERY_TYPES.reduce<Partial<Record<MetricType, MetricDetailResponse>>>((acc, metricType, index) => {
      const mergedMetric = mergeMetricWithDashboard(
        metricType,
        metricQueries[index]?.data,
        shopDetailQuery.data,
        resolvedStoreId,
        dateRange
      );
      if (mergedMetric) {
        acc[metricType] = mergedMetric;
      }
      return acc;
    }, {});
  }, [dateRange, metricQueries, resolvedStoreId, shopDetailQuery.data]);

  const widgets = useMemo(() => buildWidgetsFromMetrics(metricsByType), [metricsByType]);

  const isDashboardLoading = shopsQuery.isLoading || shopDetailQuery.isLoading || metricQueries.some(query => query.isLoading);
  const dashboardError =
    (shopsQuery.error as Error | null)
    || (shopDetailQuery.error as Error | null)
    || (metricQueries.find(query => query.error)?.error as Error | undefined)
    || null;

  const handleStoreChange = (newStoreId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('storeId', newStoreId);
    router.push(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    setMounted(true);
    const savedPreset = localStorage.getItem(PRESET_STORAGE_KEY);
    let preset: (typeof PRESET_OPTIONS)[number] = isValidPreset(savedPreset) ? savedPreset : DEFAULT_PRESET;
    const savedLayouts = localStorage.getItem(LAYOUT_STORAGE_KEY);
    let nextLayouts = normalizeLayouts(getPresetLayouts(preset), preset);

    if (savedLayouts) {
      try {
        const parsedLayouts = JSON.parse(savedLayouts) as GridLayouts;
        if (!isValidPreset(savedPreset)) {
          preset = detectPresetByLayouts(parsedLayouts);
        }
        nextLayouts = normalizeLayouts(parsedLayouts, preset, nextLayouts);
      } catch {
        nextLayouts = normalizeLayouts(getPresetLayouts(preset), preset);
      }
    }

    const savedVisibility = localStorage.getItem(VISIBILITY_STORAGE_KEY);
    if (savedVisibility) {
      try {
        const parsed = JSON.parse(savedVisibility) as Record<string, boolean>;
        const normalizedVisibility = WIDGET_IDS.reduce<Record<string, boolean>>((acc, id) => {
          acc[id] = parsed[id] !== false;
          return acc;
        }, {});
        const hasVisible = Object.values(normalizedVisibility).some(Boolean);
        if (hasVisible) {
          setVisibleWidgets(normalizedVisibility);
        } else {
          setVisibleWidgets(defaultVisibility);
          localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(defaultVisibility));
        }
      } catch {}
    }

    setCurrentPreset(preset);
    setLayouts(nextLayouts);
    latestLayoutsRef.current = nextLayouts;
    layoutSignatureRef.current = serializeLayouts(nextLayouts);
  }, [defaultVisibility]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    measureWidth();
    const frame = requestAnimationFrame(() => measureWidth());
    return () => cancelAnimationFrame(frame);
  }, [mounted, measureWidth, storeId]);

  const onLayoutChange = useCallback((_currentLayout: any, allLayouts: any) => {
    const normalized = normalizeLayouts(allLayouts as GridLayouts, currentPreset, latestLayoutsRef.current);
    const signature = serializeLayouts(normalized);
    if (signature === layoutSignatureRef.current) {
      return;
    }
    layoutSignatureRef.current = signature;
    latestLayoutsRef.current = normalized;
    setLayouts(normalized);
  }, [currentPreset]);

  const handlePresetChange = (value: string) => {
    if (!isValidPreset(value)) {
      return;
    }
    const nextLayouts = normalizeLayouts(getPresetLayouts(value), value, latestLayoutsRef.current);
    setCurrentPreset(value);
    setLayouts(nextLayouts);
    latestLayoutsRef.current = nextLayouts;
    layoutSignatureRef.current = serializeLayouts(nextLayouts);
    if (mounted) {
      localStorage.setItem(PRESET_STORAGE_KEY, value);
      localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayouts(nextLayouts));
    }
  };

  const commitLayoutChanges = useCallback(() => {
    if (!mounted || !isEditMode) {
      return;
    }
    localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayouts(latestLayoutsRef.current));
  }, [mounted, isEditMode]);

  const toggleWidget = useCallback((id: string, visible: boolean) => {
    setVisibleWidgets((current) => {
      const next = { ...current, [id]: visible };
      if (mounted) {
        localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [mounted]);

  const handleExportDashboardData = useCallback(() => {
    const selectedShop = shopOptions.find((shop) => shop.value === storeId);
    const filename = `${sanitizeFilename(selectedShop?.label ?? `shop-${storeId}`)}-${dateRange}-detail.json`;

    downloadJsonFile(filename, {
      exportedAt: new Date().toISOString(),
      shopId: storeId,
      shopName: selectedShop?.label,
      dateRange,
      shopDetail: shopDetailQuery.data ?? null,
      metrics: metricsByType,
      widgets,
    });
  }, [dateRange, metricsByType, shopDetailQuery.data, shopOptions, storeId, widgets]);

  if (!mounted) return <div className="min-h-screen bg-canvas" />;

  const activeWidgets = widgets.filter(w => visibleWidgets[w.id]);

  return (
    <div className="min-h-screen bg-canvas text-text-primary font-sans selection:bg-primary selection:text-white overflow-hidden relative transition-colors duration-500">
      
      {/* --- Header (Command Bar) --- */}
      <header className="sticky top-0 z-50 w-full mb-4 pt-4 px-6">
        <GlassPanel className="w-full h-20 flex items-center justify-between px-6 shadow-lg backdrop-blur-2xl">
          
          <div className="flex items-center gap-6">
            {/* Shop Selector */}
            <Select value={storeId} onValueChange={handleStoreChange}>
              <SelectTrigger className="w-[180px] border-none bg-transparent hover:bg-surface/10 text-text-primary focus:ring-0 transition-all rounded-lg h-9 font-medium shadow-none pl-2">
                <SelectValue placeholder="选择店铺" />
              </SelectTrigger>
              <SelectContent className="bg-surface/95 backdrop-blur-xl border-border/20 text-text-primary shadow-xl">
                {shopOptions.map(shop => (
                  <SelectItem key={shop.value} value={shop.value}>
                    {shop.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Layout Preset Selector */}
            <Select value={currentPreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-[140px] border-none bg-transparent hover:bg-surface/10 text-text-muted hover:text-text-primary focus:ring-0 transition-all rounded-lg h-9 text-xs font-medium shadow-none pl-2 flex gap-2">
                 <LayoutTemplate size={14} />
                 <SelectValue placeholder="布局" />
              </SelectTrigger>
              <SelectContent className="bg-surface/95 backdrop-blur-xl border-border/20 text-text-primary shadow-xl">
                <SelectItem value="standard">标准视图</SelectItem>
                <SelectItem value="focus">聚焦模式</SelectItem>
                <SelectItem value="grid">网格布局</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportDashboardData}
              className="w-9 h-9 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-full"
              aria-label="导出数据"
              title="导出数据"
            >
              <Download size={16} />
            </Button>

            <div className="h-4 w-[1px] bg-border/40 mx-1 hidden md:block" />

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
                <LayoutCustomizer 
                  items={widgets.map(w => ({ i: w.id, title: w.title, visible: !!visibleWidgets[w.id] }))}
                  onToggle={toggleWidget}
                />

                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`w-9 h-9 rounded-full transition-all relative ${
                     isEditMode 
                     ? "bg-primary text-white shadow-[0_0_12px_theme(colors.primary)] hover:bg-primary/90" 
                     : "text-text-secondary hover:text-primary hover:bg-primary/10"
                  }`}
                  title={isEditMode ? "完成编辑" : "调整布局"}
                >
                  <LayoutDashboard size={16} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setColorMode(appTheme === 'enterprise' || colorMode === 'dark' ? 'light' : 'dark')}
                  className="w-9 h-9 text-text-secondary hover:text-secondary hover:bg-secondary/10 rounded-full"
                >
                  <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                </Button>
            </div>
          </div>
        </GlassPanel>
      </header>

	      {/* --- Main Content --- */}
	      <main className="relative z-10 p-6 pt-0 h-[calc(100vh-110px)] overflow-y-auto overflow-x-hidden sidebar-scrollbar">
	        <div ref={containerRef as React.RefObject<HTMLDivElement>} className="w-full">
	          {isDashboardLoading && (
	            <div className="mb-3 text-sm text-text-muted">看板数据加载中...</div>
	          )}
	          {dashboardError instanceof Error && (
	            <div className="mb-3 text-sm text-red-500">{dashboardError.message}</div>
	          )}
		          {resolvedGridWidth > 0 ? (
		            <Responsive
		              className={`layout ${isEditMode ? 'is-edit-mode' : ''}`}
		              width={resolvedGridWidth}
		              layouts={layouts}
		              breakpoints={GRID_BREAKPOINTS}
		              cols={GRID_COLS}
	              rowHeight={40}
	              dragConfig={{ enabled: isEditMode, handle: '.drag-handle' }}
	              resizeConfig={{ enabled: isEditMode }}
	              onLayoutChange={onLayoutChange}
	              onDragStop={commitLayoutChanges}
	              onResizeStop={commitLayoutChanges}
	              margin={[20, 20]}
	            >
	              {activeWidgets.map((widget) => (
	                <div key={widget.id} className={isEditMode ? 'is-edit-mode' : ''}>
	                  <GlassPanel className={`h-full flex flex-col group transition-all duration-300 ${
	                    isEditMode 
	                    ? 'border-primary border-dashed bg-primary/5 ring-1 ring-primary/20 z-20' 
	                    : 'hover:border-primary/30'
	                  }`}>
	                    <CompassWidget
	                      title={widget.title}
	                      isEditMode={isEditMode}
	                      hideHeader={widget.type === 'metric' && !isEditMode}
	                      contentClassName={widget.type === 'metric' ? "p-0" : undefined}
	                      onRemove={() => toggleWidget(widget.id, false)}
	                      className="h-full bg-transparent p-0 shadow-none border-none"
	                      headerClassName={`px-5 py-4 flex items-center justify-between border-b border-border/10 transition-colors ${
	                        isEditMode ? 'drag-handle cursor-move bg-primary/5' : 'cursor-default'
	                      }`}
	                    >
	                      <div className="flex-1 h-full overflow-hidden relative select-none p-0">
	                        <MetricCard
	                          totalScore={widget.data?.totalScore ?? 0}
	                          totalLabel={widget.data?.totalLabel ?? ''}
	                          items={widget.data?.items ?? []}
	                          onItemClick={() => {
	                            const typeMap: Record<string, string> = {
	                              'card-product': 'product',
	                              'card-logistics': 'logistics',
	                              'card-service': 'service',
	                              'card-merchant': 'risk'
	                            };
	                            const type = typeMap[widget.id] || 'product';
	                            router.push(`/metric-detail?type=${type}&shopId=${storeId}&dateRange=${dateRange}`);
	                          }}
	                        />
	                      </div>
	                    </CompassWidget>
	                  </GlassPanel>
	                </div>
	              ))}
	            </Responsive>
	          ) : (
	            <div className="min-h-[calc(100vh-220px)]" />
	          )}
	        </div>
	      </main>
	    </div>
	  );
}
