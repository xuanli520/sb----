'use client';

import React from 'react';
import { ScrapingRule } from '../../services/types';
import { DataTable, DataTableColumn } from '@/app/(main)/admin/_components/common/DataTable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { Button } from '@/app/components/ui/button';
import { MoreHorizontal, Pencil, Trash, Play, Pause, Eye, Gauge, Clock3 } from 'lucide-react';
import { RuleTypeTag } from '../common/RuleTypeTag';
import { RuleStatusTag } from '../common/RuleStatusTag';
import { ScheduleDisplay } from '../common/ScheduleDisplay';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/config/routes';

interface RuleTableProps {
  data: ScrapingRule[];
  loading: boolean;
  pagination: { page: number; size: number; total: number };
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  onDelete: (id: number) => void;
  onToggleActive: (id: number, active: boolean) => void;
  onTrigger: (rule: ScrapingRule) => void;
  triggeringRuleId: number | null;
}

export function RuleTable({
  data,
  loading,
  pagination,
  onPageChange,
  onSizeChange,
  onDelete,
  onToggleActive,
  onTrigger,
  triggeringRuleId,
}: RuleTableProps) {
  const router = useRouter();

  const openScheduleConfig = (rule: ScrapingRule) => {
    const params = new URLSearchParams({
      task_type: 'SHOP_DASHBOARD_COLLECTION',
      data_source_id: String(rule.data_source_id),
      rule_id: String(rule.id),
    });
    router.push(`${ROUTES.TASK_SCHEDULE_COLLECTION_JOBS}?${params.toString()}`);
  };

  const columns: DataTableColumn<ScrapingRule>[] = [
    {
      key: 'name',
      header: '名称',
      render: rule => (
        <div className="flex flex-col">
          <span>{rule.name}</span>
          <span className="max-w-[240px] truncate text-xs text-muted-foreground">{rule.description}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: '类型',
      render: rule => <RuleTypeTag type={rule.target_type} />,
    },
    {
      key: 'schedule',
      header: '调度',
      render: rule => <ScheduleDisplay schedule={rule.schedule} />,
    },
    {
      key: 'status',
      header: '状态',
      render: rule => <RuleStatusTag isActive={rule.is_active} />,
    },
    {
      key: 'last_run',
      header: '最后运行',
      render: rule => (
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      render: rule => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">打开菜单</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push(`/scraping-rule/${rule.id}`)}>
              <Eye className="mr-2 h-4 w-4" />
              查看详情
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/scraping-rule/${rule.id}/edit`)}>
              <Pencil className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTrigger(rule)} disabled={triggeringRuleId === rule.id}>
              <Gauge className="mr-2 h-4 w-4" />
              {triggeringRuleId === rule.id ? '触发中...' : '立即采集'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openScheduleConfig(rule)}>
              <Clock3 className="mr-2 h-4 w-4" />
              配置定时任务
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(rule.id, !rule.is_active)}>
              {rule.is_active ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  停用
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  启用
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(rule.id)} className="text-red-600 focus:text-red-600">
              <Trash className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      isLoading={loading}
      pagination={pagination}
      onPageChange={onPageChange}
      onSizeChange={onSizeChange}
      rowKey={rule => rule.id}
    />
  );
}
