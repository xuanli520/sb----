'use client';

import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Package, Truck, MessageCircle, AlertTriangle,
  Activity, ChevronDown
} from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import IndicatorDetailPage from '@/components/dashboard/IndicatorDetailPage';
import type { Indicator, IndicatorFormulaVariable, IndicatorScoreRange } from '@/types/indicator';
import {
  MetricDetailResponse,
  MetricSubMetric,
  MetricType,
  ShopDashboardQueryResponse,
  shopDashboardApi,
} from '@/features/shop-dashboard/services';

const GlassPanel = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`
    relative overflow-hidden transition-all duration-300
    bg-white/40 dark:bg-[#0f172a]/20 backdrop-blur-xl
    rounded-2xl border border-white/20 dark:border-white/5 shadow-sm dark:shadow-none
    ${className}
  `}>
    {children}
  </div>
);

const THEME_CONFIG = {
  product: {
    label: '商品体验',
    icon: Package,
  },
  logistics: {
    label: '物流体验',
    icon: Truck,
  },
  service: {
    label: '服务体验',
    icon: MessageCircle,
  },
  risk: {
    label: '差行为/违规',
    icon: AlertTriangle,
  }
};

type MetricKey = MetricType;

const METRIC_KEYS: MetricKey[] = ['product', 'logistics', 'service', 'risk'];

function toNumber(value: unknown): number {
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

function formatScore(value: unknown): number {
  return Math.round(toNumber(value) * 100) / 100;
}

function parseWeight(weight: string | undefined): number {
  if (!weight) {
    return 0;
  }
  const parsed = Number(weight.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRangeBoundary(range: string | undefined): number {
  if (!range) {
    return 0;
  }
  const matches = range.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) {
    return 0;
  }
  const last = Number(matches[matches.length - 1]);
  return Number.isFinite(last) ? last : 0;
}

function buildIndicatorRanges(
  scoreRanges: Record<string, string | number>[],
  fallback: MetricSubMetric
): IndicatorScoreRange[] {
  const normalized = scoreRanges.map((item) => {
    const range = typeof item.range === 'string' ? item.range : '';
    const label = typeof item.label === 'string' ? item.label : '';
    const count = toNumber(item.count);
    const rawScore = toNumber(item.score);
    const score = rawScore > 0 ? rawScore : parseRangeBoundary(range);
    return {
      score: formatScore(score),
      value: label || `${count}`,
      range: range || '-',
    };
  }).filter(item => item.range !== '-' || item.value !== '0');

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      score: formatScore(fallback.score),
      value: fallback.value || '-',
      range: '-',
    },
  ];
}

function buildFormulaVariables(subMetric: MetricSubMetric): IndicatorFormulaVariable[] {
  const score = formatScore(subMetric.score);
  const weight = parseWeight(subMetric.weight);
  const weightedScore = formatScore((score * weight) / 100);
  return [
    { name: subMetric.title, value: score },
    { name: '权重', value: weight },
    { name: '权重得分', value: weightedScore },
  ];
}

function buildFallbackSubMetric(metric: MetricDetailResponse): MetricSubMetric {
  return {
    id: `${metric.metric_type}-total`,
    title: `${THEME_CONFIG[metric.metric_type as MetricKey]?.label || metric.metric_type}总分`,
    score: formatScore(metric.category_score),
    weight: '100%',
    value: `${formatScore(metric.category_score)}分`,
    desc: metric.formula || '',
  };
}

function convertToIndicator(metric: MetricDetailResponse, subMetric: MetricSubMetric): Indicator {
  const key = metric.metric_type as MetricKey;
  return {
    categoryId: metric.metric_type,
    categoryName: THEME_CONFIG[key]?.label || metric.metric_type,
    name: subMetric.title,
    score: formatScore(subMetric.score),
    weight: parseWeight(subMetric.weight),
    scoreRanges: buildIndicatorRanges(metric.score_ranges, subMetric),
    formula: {
      variables: buildFormulaVariables(subMetric),
      display: metric.formula || subMetric.desc || '',
    },
    notes: [subMetric.desc].filter(Boolean),
    trend: metric.trend.map(point => ({
      date: point.date,
      value: formatScore(point.value),
    })),
  };
}

function createEmptyMetric(metricType: MetricKey, shopId: number, dateRange: string): MetricDetailResponse {
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

function resolveDashboardMetricScore(metricType: MetricKey, dashboard?: ShopDashboardQueryResponse): number | undefined {
  if (!dashboard) {
    return undefined;
  }

  const latest = dashboard.items[dashboard.items.length - 1];
  if (metricType === 'product') {
    return formatScore(latest?.product_score ?? dashboard.scores.product);
  }
  if (metricType === 'logistics') {
    return formatScore(latest?.logistics_score ?? dashboard.scores.logistics);
  }
  if (metricType === 'service') {
    return formatScore(latest?.service_score ?? dashboard.scores.service);
  }

  const riskDeduct = formatScore(latest?.bad_behavior_score ?? dashboard.scores.risk);
  return formatScore(Math.max(0, 100 - riskDeduct));
}

function resolveDashboardMetricTrend(
  metricType: MetricKey,
  dashboard?: ShopDashboardQueryResponse
): MetricDetailResponse['trend'] {
  if (!dashboard) {
    return [];
  }

  return dashboard.items.map((item) => {
    if (metricType === 'product') {
      return { date: item.metric_date, value: formatScore(item.product_score) };
    }
    if (metricType === 'logistics') {
      return { date: item.metric_date, value: formatScore(item.logistics_score) };
    }
    if (metricType === 'service') {
      return { date: item.metric_date, value: formatScore(item.service_score) };
    }

    return {
      date: item.metric_date,
      value: formatScore(Math.max(0, 100 - item.bad_behavior_score)),
    };
  });
}

function mergeMetricWithDashboard(
  metricType: MetricKey,
  metric: MetricDetailResponse | undefined,
  dashboard: ShopDashboardQueryResponse | undefined,
  shopId: number,
  dateRange: string
): MetricDetailResponse {
  const dashboardScore = resolveDashboardMetricScore(metricType, dashboard);
  const dashboardTrend = resolveDashboardMetricTrend(metricType, dashboard);
  const baseMetric = metric ?? createEmptyMetric(metricType, shopId, dateRange);

  return {
    ...baseMetric,
    metric_type: metricType,
    category_score: dashboardScore ?? baseMetric.category_score,
    trend: dashboardTrend.length > 0 ? dashboardTrend : baseMetric.trend,
  };
}

type MetricMap = Record<MetricKey, MetricDetailResponse>;

const TopNavigation = ({
  activeTab,
  onTabChange,
  openDropdownTab,
  onDropdownTabChange,
  selectedSubMetricMap,
  onSubMetricChange,
  metrics,
}: {
  activeTab: MetricKey;
  onTabChange: (id: MetricKey) => void;
  openDropdownTab: MetricKey | null;
  onDropdownTabChange: (key: MetricKey | null) => void;
  selectedSubMetricMap: Record<MetricKey, number>;
  onSubMetricChange: (tabKey: MetricKey, index: number) => void;
  metrics: MetricMap;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Partial<Record<MetricKey, HTMLButtonElement | null>>>({});
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useEffect(() => {
    if (!openDropdownTab) {
      setDropdownStyle(null);
      return;
    }

    const updateDropdownPosition = () => {
      const anchor = buttonRefs.current[openDropdownTab];
      if (!anchor) {
        setDropdownStyle(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        minWidth: rect.width
      });
    };

    updateDropdownPosition();
    const listElement = listRef.current;
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    listElement?.addEventListener('scroll', updateDropdownPosition);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      listElement?.removeEventListener('scroll', updateDropdownPosition);
    };
  }, [openDropdownTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(targetNode);
      const isInsideDropdown = dropdownRef.current?.contains(targetNode);
      if (!isInsideContainer && !isInsideDropdown) {
        onDropdownTabChange(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDropdownTabChange]);

  return (
    <div ref={containerRef} className="filter-bar-container metric-detail-primary-switch">
      <div ref={listRef} className="metric-detail-primary-switch-list flex items-start gap-2 overflow-x-auto overflow-y-hidden pb-1 sidebar-scrollbar md:justify-center">
        {METRIC_KEYS.map((key) => {
          const config = THEME_CONFIG[key];
          const isActive = activeTab === key;
          const data = metrics[key];

          return (
            <div key={key} className="shrink-0">
              <button
                type="button"
                ref={(node) => {
                  buttonRefs.current[key] = node;
                }}
                onClick={() => onTabChange(key)}
                className={`filter-bar-tab metric-detail-primary-switch-item ${isActive ? 'filter-bar-tab-active' : ''}`}
              >
                <config.icon size={16} />
                <span className="text-sm font-medium">{config.label}</span>
                <span className={`
                  metric-detail-primary-switch-score rounded px-2 py-0.5 text-xs font-mono font-semibold
                  ${isActive ? 'bg-slate-200/80 text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'bg-white/10 text-slate-200 dark:bg-slate-800/70 dark:text-slate-300'}
                `}>
                  {formatScore(data.category_score)}
                </span>
                <ChevronDown size={14} className={`transition-transform ${openDropdownTab === key ? 'rotate-180' : ''}`} />
              </button>
            </div>
          );
        })}
      </div>
      {openDropdownTab && dropdownStyle ? (
        <div
          ref={dropdownRef}
          className="fixed z-30"
          style={{ top: dropdownStyle.top, left: dropdownStyle.left, minWidth: dropdownStyle.minWidth }}
        >
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {metrics[openDropdownTab].sub_metrics.length > 0 ? (
              metrics[openDropdownTab].sub_metrics.map((subMetric, index) => {
                const isSelected = (selectedSubMetricMap[openDropdownTab] ?? 0) === index;
                return (
                  <button
                    key={subMetric.id}
                    type="button"
                    onClick={() => onSubMetricChange(openDropdownTab, index)}
                    className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {subMetric.title}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">暂无子指标</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

function MetricDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const typeParam = searchParams.get('type') as MetricKey | null;
  const shopIdParam = searchParams.get('shopId');
  const dateRangeParam = searchParams.get('dateRange') || '30d';
  const parsedShopId = shopIdParam ? Number(shopIdParam) : NaN;
  const resolvedShopId = Number.isInteger(parsedShopId) && parsedShopId > 0
    ? parsedShopId
    : 1001;

  const initialTab = METRIC_KEYS.includes(typeParam as MetricKey) ? (typeParam as MetricKey) : 'product';
  const [activeTab, setActiveTab] = useState<MetricKey>(initialTab);
  const [openDropdownTab, setOpenDropdownTab] = useState<MetricKey | null>(null);
  const [selectedSubMetricMap, setSelectedSubMetricMap] = useState<Record<MetricKey, number>>({
    product: 0,
    logistics: 0,
    service: 0,
    risk: 0
  });

  useEffect(() => {
    if (typeParam && METRIC_KEYS.includes(typeParam)) {
      setActiveTab(typeParam);
    }
  }, [typeParam]);

  const shopDashboardQuery = useQuery({
    queryKey: ['shop-dashboard', 'metric-detail', 'shop', resolvedShopId, dateRangeParam],
    queryFn: () => shopDashboardApi.getShop(String(resolvedShopId), dateRangeParam),
    staleTime: 60_000,
  });

  const metricQueries = useQueries({
    queries: METRIC_KEYS.map((metricType) => ({
      queryKey: ['shop-dashboard', 'metric-detail', metricType, resolvedShopId, dateRangeParam],
      queryFn: () =>
        shopDashboardApi.getMetricDetail(metricType, {
          shop_id: resolvedShopId,
          period: dateRangeParam,
          date_range: dateRangeParam,
        }),
      staleTime: 60_000,
    })),
  });

  const metrics = useMemo<MetricMap>(() => {
    return METRIC_KEYS.reduce<MetricMap>((acc, metricType, index) => {
      acc[metricType] = mergeMetricWithDashboard(
        metricType,
        metricQueries[index]?.data,
        shopDashboardQuery.data,
        resolvedShopId,
        dateRangeParam
      );
      return acc;
    }, {
      product: createEmptyMetric('product', resolvedShopId, dateRangeParam),
      logistics: createEmptyMetric('logistics', resolvedShopId, dateRangeParam),
      service: createEmptyMetric('service', resolvedShopId, dateRangeParam),
      risk: createEmptyMetric('risk', resolvedShopId, dateRangeParam),
    });
  }, [dateRangeParam, metricQueries, resolvedShopId, shopDashboardQuery.data]);

  const handleTabChange = (key: MetricKey) => {
    setActiveTab(key);
    setOpenDropdownTab((prev) => (prev === key ? null : key));
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('type', key);
    newParams.set('shopId', String(resolvedShopId));
    newParams.set('dateRange', dateRangeParam);
    router.replace(`?${newParams.toString()}`);
  };

  const handleSubMetricChange = (tabKey: MetricKey, index: number) => {
    setActiveTab(tabKey);
    setOpenDropdownTab(null);
    setSelectedSubMetricMap((prev) => ({
      ...prev,
      [tabKey]: index
    }));
  };

  const currentData = metrics[activeTab];
  const subMetrics = currentData.sub_metrics.length > 0 ? currentData.sub_metrics : [buildFallbackSubMetric(currentData)];
  const selectedSubMetricIndex = selectedSubMetricMap[activeTab] ?? 0;
  const safeIndex = Math.max(0, Math.min(selectedSubMetricIndex, subMetrics.length - 1));
  const currentSubMetric = subMetrics[safeIndex];

  const isLoading = shopDashboardQuery.isLoading || metricQueries.some(query => query.isLoading);
  const queryError = shopDashboardQuery.error || metricQueries.find(query => query.error)?.error;

  return (
    <div className={`
      min-h-screen transition-colors duration-300 font-sans
      bg-slate-50 text-slate-900
      dark:bg-[#020617] dark:text-slate-100
    `}>
      <div className="fixed inset-0 pointer-events-none z-0 opacity-0 dark:opacity-100 transition-opacity duration-500">
         <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-900/20 blur-[100px] rounded-full" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-cyan-900/20 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 w-full space-y-4 px-4 py-4 md:px-6 md:py-6">
        <TopNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          openDropdownTab={openDropdownTab}
          onDropdownTabChange={setOpenDropdownTab}
          selectedSubMetricMap={selectedSubMetricMap}
          onSubMetricChange={handleSubMetricChange}
          metrics={metrics}
        />

        <GlassPanel className="p-1 min-h-[400px]">
          {queryError instanceof Error && (
            <div className="flex items-center justify-center h-20 text-red-500 text-sm">{queryError.message}</div>
          )}
          {!queryError && isLoading && !currentSubMetric && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Activity className="mb-2 animate-pulse" />
              <p>加载中...</p>
            </div>
          )}
          {!queryError && currentSubMetric ? (
            <IndicatorDetailPage
              indicator={convertToIndicator(currentData, currentSubMetric)}
              onBack={() => router.back()}
            />
          ) : null}
        </GlassPanel>
      </div>
    </div>
  );
}

export default function MetricDetailPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">加载中...</div>}>
      <MetricDetailContent />
    </Suspense>
  );
}
