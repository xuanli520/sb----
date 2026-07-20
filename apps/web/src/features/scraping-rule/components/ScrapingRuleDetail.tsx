import React, { useMemo, useState } from 'react';
import { Clock3, Gauge, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ROUTES } from '@/config/routes';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { shopDashboardApi } from '@/features/shop-dashboard/services/shopDashboardApi';
import { ScrapingRule } from '../services/types';
import { RuleStatusTag } from './common/RuleStatusTag';
import { RuleTypeTag } from './common/RuleTypeTag';
import { ScheduleDisplay } from './common/ScheduleDisplay';

interface ScrapingRuleDetailProps {
  rule: ScrapingRule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => readText(item)).filter(Boolean);
  }
  const text = readText(value);
  if (!text) {
    return [];
  }
  return text
    .replace(/[;\n|]/g, ',')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  items.forEach(item => {
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    result.push(item);
  });
  return result;
}

function isAllShopMarker(value: string): boolean {
  return ['all', '*'].includes(value.trim().toLowerCase());
}

function resolveShopSelection(config: Record<string, unknown>) {
  const filters = isRecord(config.filters) ? config.filters : {};
  const rawShopIds = [
    ...readList(config.shop_ids),
    ...readList(config.shop_id),
    ...readList(filters.shop_ids),
    ...readList(filters.shop_id),
  ];
  const all = config.all === true || filters.all === true || rawShopIds.some(isAllShopMarker);
  const shopIds = uniqueItems(rawShopIds.filter(item => !isAllShopMarker(item)));
  if (all) {
    return { label: '全部店铺', shopIds };
  }
  if (shopIds.length === 1) {
    return { label: '单店', shopIds };
  }
  if (shopIds.length > 1) {
    return { label: `多店（${shopIds.length}）`, shopIds };
  }
  return { label: '未限定', shopIds };
}

function resolveRecipe(config: Record<string, unknown>): string {
  const recipe = isRecord(config.agent_recipe) ? config.agent_recipe : {};
  const namespace = readText(recipe.namespace);
  const key = readText(recipe.key);
  if (!namespace || !key) {
    return '未配置';
  }
  const version = readText(recipe.version);
  return `${namespace}/${key}${version ? ` v${version}` : ''}`;
}

function resolveTimeRange(config: Record<string, unknown>): string {
  const timeRange = isRecord(config.time_range) ? config.time_range : {};
  const start = readText(timeRange.start) || readText(timeRange.start_date) || readText(timeRange.date_from);
  const end = readText(timeRange.end) || readText(timeRange.end_date) || readText(timeRange.date_to);
  if (start && end) {
    return `${start} 至 ${end}`;
  }
  return start || end || '未限定';
}

function resolveRateLimit(config: Record<string, unknown>): string {
  const rateLimit = config.rate_limit;
  if (isRecord(rateLimit)) {
    return readText(rateLimit.qps) || readText(rateLimit.rps) || readText(rateLimit.requests_per_second) || '已配置';
  }
  return readText(rateLimit) || '未设置';
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-5 break-words text-sm">{value}</div>
    </div>
  );
}

function ChipList({ items, empty = '未设置' }: { items: string[]; empty?: string }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(item => (
        <Badge key={item} variant="secondary" className="font-mono">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export function ScrapingRuleDetail({ rule }: ScrapingRuleDetailProps) {
  const router = useRouter();
  const [triggering, setTriggering] = useState(false);
  const config = useMemo(() => (isRecord(rule.config) ? rule.config : {}), [rule.config]);
  const shopSelection = useMemo(() => resolveShopSelection(config), [config]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const result = await shopDashboardApi.triggerShopDashboardCollection({
        data_source_id: rule.data_source_id,
        rule_id: rule.id,
      });
      toast.success(`触发成功，执行ID: ${result.execution.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '触发采集失败');
    } finally {
      setTriggering(false);
    }
  };

  const handleConfigureSchedule = () => {
    const params = new URLSearchParams({
      task_type: 'SHOP_DASHBOARD_COLLECTION',
      data_source_id: String(rule.data_source_id),
      rule_id: String(rule.id),
    });
    router.push(`${ROUTES.TASK_SCHEDULE_COLLECTION_JOBS}?${params.toString()}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <RuleTypeTag type={rule.target_type} />
          <RuleStatusTag isActive={rule.is_active} />
          <div>
            <CardTitle className="text-xl font-bold">{rule.name}</CardTitle>
            {rule.description && <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleConfigureSchedule}>
            <Clock3 className="mr-2 h-4 w-4" />
            配置定时任务
          </Button>
          <Button variant="outline" size="sm" onClick={handleTrigger} disabled={triggering}>
            <Gauge className="mr-2 h-4 w-4" />
            {triggering ? '触发中...' : '立即采集'}
          </Button>
          <Button size="sm" onClick={() => router.push(`/scraping-rule/${rule.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            编辑规则
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">调度</h4>
              <ScheduleDisplay schedule={rule.schedule} />
            </div>
            <SummaryItem label="数据源" value={<span className="font-mono">{rule.data_source_name || rule.data_source_id}</span>} />
            <SummaryItem
              label="最后运行"
              value={<span className="font-mono">{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : '从未运行'}</span>}
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SummaryItem label="采集范围" value={shopSelection.label} />
              <SummaryItem label="Agent Recipe" value={<span className="font-mono">{resolveRecipe(config)}</span>} />
              <SummaryItem label="日期范围" value={resolveTimeRange(config)} />
              <SummaryItem label="频率限制" value={resolveRateLimit(config)} />
              <SummaryItem label="粒度" value={readText(config.granularity) || '未设置'} />
              <SummaryItem label="时区" value={readText(config.timezone) || '未设置'} />
              <SummaryItem label="增量模式" value={readText(config.incremental_mode) || '未设置'} />
              <SummaryItem label="补采天数" value={readText(config.backfill_last_n_days) || '未设置'} />
              <SummaryItem label="数据延迟" value={readText(config.data_latency) || '未设置'} />
              <SummaryItem label="Top N" value={readText(config.top_n) || '未设置'} />
            </div>

            <SummaryItem label="店铺 ID" value={<ChipList items={shopSelection.shopIds} empty="运行时自动解析" />} />
            <SummaryItem label="维度" value={<ChipList items={readList(config.dimensions)} />} />
            <SummaryItem label="指标" value={<ChipList items={readList(config.metrics)} />} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
