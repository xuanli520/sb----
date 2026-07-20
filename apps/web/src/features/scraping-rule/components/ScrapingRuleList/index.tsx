'use client';

import React, { useState } from 'react';
import { Plus, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { RuleTable } from './RuleTable';
import { useScrapingRules } from '../../hooks/useScrapingRules';
import { useDeleteScrapingRule } from '../../hooks/useDeleteScrapingRule';
import { useActivateScrapingRule } from '../../hooks/useActivateScrapingRule';
import { ScrapingRule } from '../../services/types';
import { shopDashboardApi } from '@/features/shop-dashboard/services/shopDashboardApi';
import { Input } from '@/app/components/ui/input';
import { DeleteConfirmDialog } from '@/app/(main)/admin/_components/common/DeleteConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { CreateForm } from '../ScrapingRuleForm/CreateForm';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';

export function ScrapingRuleList() {
  const { data, loading, error, refresh, filters, updateFilters } = useScrapingRules();
  const { remove } = useDeleteScrapingRule();
  const { activate } = useActivateScrapingRule();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [triggeringRuleId, setTriggeringRuleId] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    setRuleToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (ruleToDelete === null) {
      return;
    }
    await remove(ruleToDelete);
    refresh();
    setDeleteDialogOpen(false);
  };

  const handleToggleActive = async (id: number, active: boolean) => {
    await activate(id, active);
    refresh();
  };

  const handleTrigger = async (rule: ScrapingRule) => {
    setTriggeringRuleId(rule.id);
    try {
      const result = await shopDashboardApi.triggerShopDashboardCollection({
        data_source_id: rule.data_source_id,
        rule_id: rule.id,
      });
      toast.success(`触发成功，执行ID: ${result.execution.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '触发采集失败');
    } finally {
      setTriggeringRuleId(null);
    }
  };

  const handleCreateSuccess = () => {
    setIsCreateOpen(false);
    refresh();
  };

  const handlePageChange = (page: number) => {
    updateFilters({ page });
  };

  const handleSizeChange = (size: number) => {
    updateFilters({ size, page: 1 });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">采集规则管理</h2>
        <CyberButton
          onClick={() => setIsCreateOpen(true)}
          className="shadow-lg shadow-cyan-500/20 group"
        >
          <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
          创建规则
        </CyberButton>
      </div>

      <div className="filter-bar-container flex flex-wrap items-center gap-3">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input
            placeholder="搜索规则..."
            value={filters.name || ''}
            onChange={event => updateFilters({ name: event.target.value, page: 1 })}
            className="filter-input w-[220px] pl-9"
          />
        </div>
        <Select
          value={filters.target_type || 'all'}
          onValueChange={value => updateFilters({ target_type: value === 'all' ? undefined : value as any, page: 1 })}
        >
          <SelectTrigger className="filter-input w-[150px]">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="SHOP_OVERVIEW">店铺概览</SelectItem>
            <SelectItem value="TRAFFIC">流量</SelectItem>
            <SelectItem value="PRODUCT">商品</SelectItem>
            <SelectItem value="LIVE">直播</SelectItem>
            <SelectItem value="CONTENT_VIDEO">短视频</SelectItem>
            <SelectItem value="ORDER_FULFILLMENT">订单履约</SelectItem>
            <SelectItem value="AFTERSALE_REFUND">售后退款</SelectItem>
            <SelectItem value="CUSTOMER">客户</SelectItem>
            <SelectItem value="ADS">广告</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <div className="py-8 text-left text-red-500">错误: {error.message}</div>}

      {!error && (
        <RuleTable
          data={data.items}
          loading={loading}
          pagination={{ page: data.meta.page || 1, size: data.meta.size || 10, total: data.meta.total || 0 }}
          onPageChange={handlePageChange}
          onSizeChange={handleSizeChange}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onTrigger={handleTrigger}
          triggeringRuleId={triggeringRuleId}
        />
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        description="确定要删除此规则吗？此操作不可撤销。"
      />

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle>创建采集规则</DialogTitle>
          </DialogHeader>
          <CreateForm onSuccess={handleCreateSuccess} onCancel={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
