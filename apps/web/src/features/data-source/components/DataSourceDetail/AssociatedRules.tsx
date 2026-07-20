import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDataSourceRules } from '../../hooks/useDataSourceRules';
import { RuleTable } from '@/features/scraping-rule/components/ScrapingRuleList/RuleTable';
import { useDeleteScrapingRule } from '@/features/scraping-rule/hooks/useDeleteScrapingRule';
import { useActivateScrapingRule } from '@/features/scraping-rule/hooks/useActivateScrapingRule';
import { ScrapingRule } from '@/features/scraping-rule/services/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { useQueryState, QueryCodec } from '@/app/(main)/admin/_components/common/QueryState';
import { shopDashboardApi } from '@/features/shop-dashboard/services/shopDashboardApi';

interface AssociatedRulesProps {
  dataSourceId: number;
}

const rulesQueryCodec: QueryCodec<{ page: number; size: number }> = {
  parse: sp => ({
    page: Number(sp.get('page')) || 1,
    size: Number(sp.get('size')) || 5,
  }),
  serialize: state => ({
    page: state.page?.toString(),
    size: state.size?.toString(),
  }),
  resetPageOnChangeKeys: ['size'],
};

export function AssociatedRules({ dataSourceId }: AssociatedRulesProps) {
  const { rules, loading, error, refresh } = useDataSourceRules(dataSourceId);
  const { remove } = useDeleteScrapingRule();
  const { activate } = useActivateScrapingRule();
  const [query, setQuery] = useQueryState(rulesQueryCodec);
  const [triggeringRuleId, setTriggeringRuleId] = useState<number | null>(null);

  const paginatedRules = useMemo(() => {
    const start = (query.page - 1) * query.size;
    return rules.slice(start, start + query.size);
  }, [rules, query.page, query.size]);

  const handleDelete = async (id: number) => {
    if (confirm('确定要删除此规则吗')) {
      await remove(id);
      refresh();
      setQuery({ page: 1 });
    }
  };

  const handleToggleActive = async (id: number, active: boolean) => {
    await activate(id, active);
    refresh();
  };

  const handleTrigger = async (rule: ScrapingRule) => {
    setTriggeringRuleId(rule.id);
    try {
      const result = await shopDashboardApi.triggerShopDashboardCollection({
        data_source_id: rule.data_source_id || dataSourceId,
        rule_id: rule.id,
      });
      toast.success(`触发成功，执行ID: ${result.execution.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '触发采集失败');
    } finally {
      setTriggeringRuleId(null);
    }
  };

  const handlePageChange = (page: number) => {
    setQuery({ page });
  };

  const handleSizeChange = (size: number) => {
    setQuery({ size, page: 1 });
  };

  if (loading) return <div>加载规则中...</div>;
  if (error) return <div className="text-red-500">加载规则错误: {error.message}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>关联的采集规则 ({rules.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <RuleTable
          data={paginatedRules}
          loading={loading}
          pagination={{ page: query.page, size: query.size, total: rules.length }}
          onPageChange={handlePageChange}
          onSizeChange={handleSizeChange}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onTrigger={handleTrigger}
          triggeringRuleId={triggeringRuleId}
        />
      </CardContent>
    </Card>
  );
}
