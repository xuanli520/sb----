'use client';

import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '@/app/(main)/admin/_components/common/DataTable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { DeleteConfirmDialog } from '@/app/(main)/admin/_components/common/DeleteConfirmDialog';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { MoreHorizontal, Play, XCircle, ListChecks, RefreshCw, Search, Clock3 } from 'lucide-react';
import {
  TaskDefinition,
  TaskDefinitionStatus,
  TaskExecution,
  TaskExecutionStatus,
  ShopDashboardTaskRunPayload,
  TaskTriggerMode,
  TaskType,
} from '@/features/shop-dashboard/services/types';
import { shopDashboardApi } from '@/features/shop-dashboard/services/shopDashboardApi';
import { ROUTES } from '@/config/routes';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface TaskQueryState {
  page: number;
  size: number;
  status?: TaskDefinitionStatus;
  task_type?: TaskType;
}

interface TaskEditFormState {
  name: string;
  status: TaskDefinitionStatus;
  config: string;
  schedule: string;
}

interface RunTaskDialogState {
  task: TaskDefinition | null;
  payload: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_QUERY: TaskQueryState = {
  page: 1,
  size: 20,
};

const TASK_STATUS_LABELS: Record<TaskDefinitionStatus, string> = {
  ACTIVE: '启用',
  PAUSED: '暂停',
  CANCELLED: '已取消',
};

const EXECUTION_STATUS_LABELS: Record<TaskExecutionStatus, string> = {
  QUEUED: '排队中',
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  ETL_ORDERS: '订单 ETL',
  ETL_PRODUCTS: '商品 ETL',
  SHOP_DASHBOARD_COLLECTION: '店铺看板采集',
};

const TASK_TRIGGER_MODE_LABELS: Record<TaskTriggerMode, string> = {
  MANUAL: '手动触发',
  SCHEDULED: '定时触发',
  SYSTEM: '系统触发',
};

// ─────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────

function parsePositiveInt(value: string): number | null {
  const normalized = Number(value.trim());
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    return parsePositiveInt(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map(item => String(item || '').trim())
      .filter(Boolean);
    return items.length > 0 ? [...new Set(items)] : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const items = value
    .split(/[,;|\n]/)
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

function toOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(text)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(text)) {
      return false;
    }
  }
  return undefined;
}

function extractCollectionPayload(source: unknown): ShopDashboardTaskRunPayload | null {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }

  const record = source as Record<string, unknown>;
  const dataSourceId = toPositiveInt(record.data_source_id);
  const ruleId = toPositiveInt(record.rule_id);

  if (!dataSourceId || !ruleId) {
    return null;
  }

  const payload: ShopDashboardTaskRunPayload = {
    data_source_id: dataSourceId,
    rule_id: ruleId,
  };
  const executionId = toOptionalString(record.execution_id);
  const shopId = toOptionalString(record.shop_id);
  const shopIds = toStringArray(record.shop_ids);
  const all = toOptionalBool(record.all);
  const timeRange = asRecord(record.time_range);
  const extraConfig = asRecord(record.extra_config);

  if (executionId) payload.execution_id = executionId;
  if (shopId) payload.shop_id = shopId;
  if (shopIds) payload.shop_ids = shopIds;
  if (typeof all === 'boolean') payload.all = all;
  if (timeRange && typeof timeRange.start === 'string' && typeof timeRange.end === 'string') {
    payload.time_range = {
      start: timeRange.start,
      end: timeRange.end,
    };
  }
  if (extraConfig) payload.extra_config = extraConfig;

  return payload;
}

function toLocalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function taskStatusVariant(status: TaskDefinitionStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'ACTIVE') return 'secondary';
  if (status === 'PAUSED') return 'outline';
  return 'destructive';
}

function executionStatusVariant(status: TaskExecutionStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'SUCCESS') return 'secondary';
  if (status === 'FAILED' || status === 'CANCELLED') return 'destructive';
  if (status === 'RUNNING') return 'default';
  return 'outline';
}

function taskStatusLabel(status: TaskDefinitionStatus): string {
  return TASK_STATUS_LABELS[status];
}

function executionStatusLabel(status: TaskExecutionStatus): string {
  return EXECUTION_STATUS_LABELS[status];
}

function taskTypeLabel(type: TaskType): string {
  return TASK_TYPE_LABELS[type];
}

function triggerModeLabel(mode: TaskTriggerMode): string {
  return TASK_TRIGGER_MODE_LABELS[mode];
}

function formatTaskJson(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return '{}';
  }
  return JSON.stringify(value, null, 2);
}

function formatRunPayload(value: Record<string, unknown>): string {
  if (Object.keys(value).length === 0) {
    return '{}';
  }
  return JSON.stringify(value, null, 2);
}

function buildTaskEditForm(task: TaskDefinition): TaskEditFormState {
  return {
    name: task.name,
    status: task.status,
    config: formatTaskJson(task.config),
    schedule: formatTaskJson(task.schedule),
  };
}

function parseTaskJson(value: string, fieldLabel: string): Record<string, unknown> | null {
  const text = value.trim();
  if (!text || text === 'null') {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed === null) {
      return null;
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel}必须为 JSON 对象`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes('必须为 JSON 对象')) {
      throw error;
    }
    throw new Error(`${fieldLabel}格式不正确`);
  }
}

/** 按创建时间降序排列执行记录 */
function sortExecutionsDesc(items: TaskExecution[]): TaskExecution[] {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

// ─────────────────────────────────────────────
// Custom hooks
// ─────────────────────────────────────────────

/** 管理任务列表的加载与分页 */
function useTasks(query: TaskQueryState) {
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await shopDashboardApi.listTasks({
        page: query.page,
        size: query.size,
        status: query.status,
        task_type: query.task_type,
      });
      setTasks(response.items);
      setTotal(response.meta.total);
    } catch (error) {
      setTasks([]);
      setTotal(0);
      toast.error(error instanceof Error ? error.message : '任务列表加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [query.page, query.size, query.status, query.task_type]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return { tasks, total, isLoading, fetchTasks };
}

/**
 * 管理某个任务的执行记录加载。
 * 使用 abortRef 防止旧请求覆盖新结果（竞态保护）。
 */
function useTaskExecutions() {
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [isExecutionsLoading, setIsExecutionsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchExecutions = useCallback(async (taskId: number) => {
    // 取消上一个尚未完成的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsExecutionsLoading(true);
    try {
      const response = await shopDashboardApi.listTaskExecutions(taskId);
      if (controller.signal.aborted) return;
      setExecutions(sortExecutionsDesc(response.items));
    } catch (error) {
      if (controller.signal.aborted) return;
      setExecutions([]);
      toast.error(error instanceof Error ? error.message : '执行记录加载失败');
    } finally {
      if (!controller.signal.aborted) {
        setIsExecutionsLoading(false);
      }
    }
  }, []);

  const clearExecutions = useCallback(() => {
    abortRef.current?.abort();
    setExecutions([]);
  }, []);

  return { executions, isExecutionsLoading, fetchExecutions, clearExecutions };
}

/**
 * 管理任务操作（执行 / 取消）的 loading 状态。
 * 以 taskId 为 key，支持多行并发操作。
 */
function useTaskActionLoading() {
  const [loadingMap, setLoadingMap] = useState<Record<number, 'running' | 'cancelling'>>({});

  const set = useCallback((taskId: number, action: 'running' | 'cancelling') => {
    setLoadingMap(prev => ({ ...prev, [taskId]: action }));
  }, []);

  const clear = useCallback((taskId: number) => {
    setLoadingMap(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const isRunning = useCallback((taskId: number) => loadingMap[taskId] === 'running', [loadingMap]);
  const isCancelling = useCallback((taskId: number) => loadingMap[taskId] === 'cancelling', [loadingMap]);

  return { set, clear, isRunning, isCancelling };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface FilterBarProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  status: TaskDefinitionStatus | undefined;
  onStatusChange: (value: TaskDefinitionStatus | undefined) => void;
  taskType: TaskType | undefined;
  onTaskTypeChange: (value: TaskType | undefined) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

function FilterBar({
  keyword,
  onKeywordChange,
  status,
  onStatusChange,
  taskType,
  onTaskTypeChange,
  isLoading,
  onRefresh,
}: FilterBarProps) {
  return (
    <div className="filter-bar-container flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="搜索任务ID/名称/类型"
          value={keyword}
          onChange={event => onKeywordChange(event.target.value)}
          className="filter-input h-9 w-[280px] pl-10 pr-4 text-sm focus-visible:ring-0"
        />
      </div>

      <Select
        value={status ?? 'all'}
        onValueChange={value => onStatusChange(value === 'all' ? undefined : (value as TaskDefinitionStatus))}
      >
        <SelectTrigger className="filter-input h-9 w-[170px]">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部状态</SelectItem>
          <SelectItem value="ACTIVE">{taskStatusLabel('ACTIVE')}</SelectItem>
          <SelectItem value="PAUSED">{taskStatusLabel('PAUSED')}</SelectItem>
          <SelectItem value="CANCELLED">{taskStatusLabel('CANCELLED')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={taskType ?? 'all'}
        onValueChange={value => onTaskTypeChange(value === 'all' ? undefined : (value as TaskType))}
      >
        <SelectTrigger className="filter-input h-9 w-[280px]">
          <SelectValue placeholder="全部任务类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部任务类型</SelectItem>
          <SelectItem value="ETL_ORDERS">{taskTypeLabel('ETL_ORDERS')}</SelectItem>
          <SelectItem value="ETL_PRODUCTS">{taskTypeLabel('ETL_PRODUCTS')}</SelectItem>
          <SelectItem value="SHOP_DASHBOARD_COLLECTION">{taskTypeLabel('SHOP_DASHBOARD_COLLECTION')}</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        className="h-9 shrink-0 px-4"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        刷新
      </Button>
    </div>
  );
}

interface TaskActionsMenuProps {
  task: TaskDefinition;
  isRunning: boolean;
  isCancelling: boolean;
  onRun: (task: TaskDefinition) => void;
  onViewExecutions: (task: TaskDefinition) => void;
  onCancel: (task: TaskDefinition) => void;
}

function TaskActionsMenu({
  task,
  isRunning,
  isCancelling,
  onRun,
  onViewExecutions,
  onCancel,
}: TaskActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">打开操作菜单</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>任务操作</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onRun(task)} disabled={isRunning}>
          <Play className="mr-2 h-4 w-4" />
          {isRunning ? '执行中...' : '立即执行'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewExecutions(task)}>
          <ListChecks className="mr-2 h-4 w-4" />
          执行记录
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onCancel(task)}
          disabled={task.status === 'CANCELLED' || isCancelling}
          className="text-red-600 focus:text-red-600"
        >
          <XCircle className="mr-2 h-4 w-4" />
          {isCancelling ? '取消中...' : '取消任务'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TaskActionsProps {
  task: TaskDefinition;
  isRunning: boolean;
  isCancelling: boolean;
  isDeleting: boolean;
  onRun: (task: TaskDefinition) => void;
  onViewExecutions: (task: TaskDefinition) => void;
  onEdit: (task: TaskDefinition) => void;
  onCancel: (task: TaskDefinition) => void;
  onDelete: (task: TaskDefinition) => void;
}

function TaskActions({
  task,
  isRunning,
  isCancelling,
  isDeleting,
  onRun,
  onViewExecutions,
  onEdit,
  onCancel,
  onDelete,
}: TaskActionsProps) {
  return (
    <div className="flex items-center justify-end gap-4 text-sm font-mono">
      <button
        type="button"
        onClick={() => onEdit(task)}
        disabled={isDeleting}
        className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 hover:underline decoration-cyan-500/50 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
      >
        编辑
      </button>
      <button
        type="button"
        onClick={() => onDelete(task)}
        disabled={isDeleting}
        className="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300 hover:underline decoration-rose-500/50 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
      >
        {isDeleting ? '删除中...' : '删除'}
      </button>
      <TaskActionsMenu
        task={task}
        isRunning={isRunning}
        isCancelling={isCancelling}
        onRun={onRun}
        onViewExecutions={onViewExecutions}
        onCancel={onCancel}
      />
    </div>
  );
}

interface EditTaskDialogProps {
  task: TaskDefinition | null;
  form: TaskEditFormState;
  isSubmitting: boolean;
  onChange: Dispatch<SetStateAction<TaskEditFormState>>;
  onSubmit: () => void;
  onClose: () => void;
}

function EditTaskDialog({
  task,
  form,
  isSubmitting,
  onChange,
  onSubmit,
  onClose,
}: EditTaskDialogProps) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={open => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>编辑任务</DialogTitle>
          {task && (
            <DialogDescription>
              任务ID: {task.id} | 任务类型: {taskTypeLabel(task.task_type)}
            </DialogDescription>
          )}
        </DialogHeader>

        <form
          className="grid gap-4 py-2"
          onSubmit={event => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid gap-2">
            <span className="text-sm font-medium">任务名称</span>
            <Input
              value={form.name}
              onChange={event => onChange(prev => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">状态</span>
            <Select
              value={form.status}
              onValueChange={value =>
                onChange(prev => ({ ...prev, status: value as TaskDefinitionStatus }))
              }
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{taskStatusLabel('ACTIVE')}</SelectItem>
                <SelectItem value="PAUSED">{taskStatusLabel('PAUSED')}</SelectItem>
                <SelectItem value="CANCELLED">{taskStatusLabel('CANCELLED')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Config (JSON)</span>
            <Textarea
              value={form.config}
              onChange={event => onChange(prev => ({ ...prev, config: event.target.value }))}
              rows={6}
              className="font-mono text-xs"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Schedule (JSON)</span>
            <Textarea
              value={form.schedule}
              onChange={event => onChange(prev => ({ ...prev, schedule: event.target.value }))}
              rows={6}
              className="font-mono text-xs"
              disabled={isSubmitting}
            />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RunTaskDialogProps {
  state: RunTaskDialogState;
  isSubmitting: boolean;
  onChange: Dispatch<SetStateAction<RunTaskDialogState>>;
  onSubmit: () => void;
  onClose: () => void;
}

function RunTaskDialog({
  state,
  isSubmitting,
  onChange,
  onSubmit,
  onClose,
}: RunTaskDialogProps) {
  const task = state.task;

  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>执行任务</DialogTitle>
          {task && (
            <DialogDescription>
              任务ID: {task.id} | 任务类型: {taskTypeLabel(task.task_type)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <span className="text-sm font-medium">Payload (JSON)</span>
          <Textarea
            value={state.payload}
            onChange={event => onChange(prev => ({ ...prev, payload: event.target.value }))}
            rows={14}
            className="font-mono text-xs"
            disabled={isSubmitting}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? '执行中...' : '确认执行'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExecutionsDialogProps {
  task: TaskDefinition | null;
  executions: TaskExecution[];
  isLoading: boolean;
  onRefresh: (taskId: number) => void;
  onClose: () => void;
}

function ExecutionsDialog({ task, executions, isLoading, onRefresh, onClose }: ExecutionsDialogProps) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="z-[110] flex max-h-[86vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1360px]">
        <DialogHeader className="shrink-0 gap-4 border-b px-6 py-5 pr-20">
          <DialogTitle className="text-xl">任务执行记录</DialogTitle>
          {task && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <DialogDescription className="min-w-0 flex-1 break-all text-base leading-6">
                任务ID: {task.id} | 类型: {taskTypeLabel(task.task_type)} | 状态: {taskStatusLabel(task.status)}
              </DialogDescription>
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 self-start px-4"
                onClick={() => onRefresh(task.id)}
                disabled={isLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 px-6 py-5">
          <div className="h-full overflow-auto">
            <Table className="min-w-[1320px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-950/95">
                <TableRow>
                  <TableHead className="min-w-[120px] px-4 py-3">执行ID</TableHead>
                  <TableHead className="min-w-[140px] px-4 py-3">状态</TableHead>
                  <TableHead className="min-w-[150px] px-4 py-3">触发模式</TableHead>
                  <TableHead className="min-w-[140px] px-4 py-3">处理行数</TableHead>
                  <TableHead className="min-w-[220px] px-4 py-3">开始时间</TableHead>
                  <TableHead className="min-w-[220px] px-4 py-3">结束时间</TableHead>
                  <TableHead className="min-w-[390px] px-4 py-3">错误信息</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && executions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      暂无执行记录
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && executions.map(execution => (
                  <TableRow key={execution.id}>
                    <TableCell className="min-w-[120px] px-4 py-3 font-mono text-xs">{execution.id}</TableCell>
                    <TableCell className="min-w-[140px] px-4 py-3">
                      <Badge variant={executionStatusVariant(execution.status)}>{executionStatusLabel(execution.status)}</Badge>
                    </TableCell>
                    <TableCell className="min-w-[150px] px-4 py-3">{triggerModeLabel(execution.trigger_mode)}</TableCell>
                    <TableCell className="min-w-[140px] px-4 py-3">{execution.processed_rows}</TableCell>
                    <TableCell className="min-w-[220px] px-4 py-3">
                      {execution.started_at ? toLocalTime(execution.started_at) : '-'}
                    </TableCell>
                    <TableCell className="min-w-[220px] px-4 py-3">
                      {execution.completed_at ? toLocalTime(execution.completed_at) : '-'}
                    </TableCell>
                    <TableCell className="min-w-[390px] px-4 py-3 whitespace-normal break-words text-xs text-red-500">
                      {execution.error_message || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────

export default function TaskSchedulePage() {
  const [query, setQuery] = useState<TaskQueryState>(DEFAULT_QUERY);
  const [keyword, setKeyword] = useState('');
  const [detailTask, setDetailTask] = useState<TaskDefinition | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDefinition | null>(null);
  const [editForm, setEditForm] = useState<TaskEditFormState>({
    name: '',
    status: 'ACTIVE',
    config: '{}',
    schedule: '{}',
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [runDialog, setRunDialog] = useState<RunTaskDialogState>({
    task: null,
    payload: '{}',
  });
  const [isRunSubmitting, setIsRunSubmitting] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskDefinition | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTaskIds, setDeletingTaskIds] = useState<number[]>([]);
  const router = useRouter();

  const { tasks, total, isLoading, fetchTasks } = useTasks(query);
  const { executions, isExecutionsLoading, fetchExecutions, clearExecutions } = useTaskExecutions();
  const actionLoading = useTaskActionLoading();
  const isDeletingTask = useCallback(
    (taskId: number) => deletingTaskIds.includes(taskId),
    [deletingTaskIds],
  );
  const isDeleteDialogLoading = taskToDelete ? isDeletingTask(taskToDelete.id) : false;

  // ── 关键字过滤（纯前端，不触发请求）──
  const filteredTasks = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return tasks;
    return tasks.filter(task =>
      [
        String(task.id),
        task.name,
        task.task_type,
        task.status,
        taskTypeLabel(task.task_type),
        taskStatusLabel(task.status),
      ].some(field =>
        field.toLowerCase().includes(text),
      ),
    );
  }, [tasks, keyword]);

  // ── 从任务 config 或历史执行记录中提取采集任务 payload ──
  const resolveCollectionPayload = useCallback(
    async (task: TaskDefinition) => {
      const fromConfig = extractCollectionPayload(task.config);
      if (fromConfig) return fromConfig;

      try {
        const response = await shopDashboardApi.listTaskExecutions(task.id);
        for (const execution of sortExecutionsDesc(response.items)) {
          const fromPayload = extractCollectionPayload(execution.payload);
          if (fromPayload) return fromPayload;
        }
      } catch {
        // 静默失败，返回 null 后由调用方提示用户
      }

      return null;
    },
    [],
  );

  const executeRunTask = useCallback(
    async (task: TaskDefinition, payload: Record<string, unknown> = {}) => {
      actionLoading.set(task.id, 'running');
      try {
        const execution = await shopDashboardApi.runTask(task.id, { payload });
        toast.success(`任务 ${task.id} 已触发，执行ID: ${execution.id}`);
        await fetchTasks();
        if (detailTask?.id === task.id) {
          await fetchExecutions(task.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '任务触发失败');
      } finally {
        actionLoading.clear(task.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailTask?.id, fetchExecutions, fetchTasks],
  );

  const openRunTaskDialog = useCallback(
    async (task: TaskDefinition) => {
      if (task.task_type !== 'SHOP_DASHBOARD_COLLECTION') {
        setRunDialog({ task, payload: '{}' });
        return;
      }

      const payload = await resolveCollectionPayload(task);
      setRunDialog({
        task,
        payload: formatRunPayload(payload ?? {}),
      });
    },
    [resolveCollectionPayload],
  );

  const handleRunTask = useCallback(
    (task: TaskDefinition) => {
      void openRunTaskDialog(task);
    },
    [openRunTaskDialog],
  );

  const handleCloseRunTask = useCallback(() => {
    if (isRunSubmitting) {
      return;
    }
    setRunDialog({ task: null, payload: '{}' });
  }, [isRunSubmitting]);

  const handleSubmitRunTask = useCallback(async () => {
    const task = runDialog.task;
    if (!task) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = parseTaskJson(runDialog.payload, 'Payload') ?? {};
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Payload 格式不正确');
      return;
    }

    if (task.task_type === 'SHOP_DASHBOARD_COLLECTION') {
      const dataSourceId = toPositiveInt(payload.data_source_id);
      const ruleId = toPositiveInt(payload.rule_id);
      if (!dataSourceId || !ruleId) {
        toast.error('抖店采集任务必须包含 data_source_id 和 rule_id');
        return;
      }
    }

    setIsRunSubmitting(true);
    try {
      await executeRunTask(task, payload);
      setRunDialog({ task: null, payload: '{}' });
    } finally {
      setIsRunSubmitting(false);
    }
  }, [executeRunTask, runDialog]);

  const handleCancelTask = useCallback(
    async (task: TaskDefinition) => {
      actionLoading.set(task.id, 'cancelling');
      try {
        await shopDashboardApi.cancelTask(task.id);
        toast.success(`任务 ${task.id} 已取消`);
        await fetchTasks();
        if (detailTask?.id === task.id) {
          await fetchExecutions(task.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '取消任务失败');
      } finally {
        actionLoading.clear(task.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailTask?.id, fetchExecutions, fetchTasks],
  );

  const handleOpenEditTask = useCallback((task: TaskDefinition) => {
    setEditingTask(task);
    setEditForm(buildTaskEditForm(task));
  }, []);

  const handleCloseEditTask = useCallback(() => {
    if (isEditSubmitting) {
      return;
    }
    setEditingTask(null);
  }, [isEditSubmitting]);

  const handleSubmitEditTask = useCallback(async () => {
    if (!editingTask) {
      return;
    }

    const name = editForm.name.trim();
    if (!name) {
      toast.error('任务名称不能为空');
      return;
    }

    let config: Record<string, unknown> | null = null;
    let schedule: Record<string, unknown> | null = null;

    try {
      config = parseTaskJson(editForm.config, 'Config');
      schedule = parseTaskJson(editForm.schedule, 'Schedule');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '任务配置格式不正确');
      return;
    }

    setIsEditSubmitting(true);
    try {
      const updatedTask = await shopDashboardApi.updateTask(editingTask.id, {
        name,
        status: editForm.status,
        config,
        schedule,
      });
      toast.success(`任务 ${editingTask.id} 已更新`);
      setEditingTask(null);
      await fetchTasks();
      if (detailTask?.id === editingTask.id) {
        setDetailTask(updatedTask);
        await fetchExecutions(editingTask.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新任务失败');
    } finally {
      setIsEditSubmitting(false);
    }
  }, [detailTask?.id, editForm, editingTask, fetchExecutions, fetchTasks]);

  const handleRequestDeleteTask = useCallback((task: TaskDefinition) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteDialogChange = useCallback(
    (open: boolean) => {
      if (isDeleteDialogLoading) {
        return;
      }
      setDeleteDialogOpen(open);
      if (!open) {
        setTaskToDelete(null);
      }
    },
    [isDeleteDialogLoading],
  );

  const handleConfirmDeleteTask = useCallback(async () => {
    if (!taskToDelete) {
      return;
    }

    const currentTask = taskToDelete;
    setDeletingTaskIds(prev => (prev.includes(currentTask.id) ? prev : [...prev, currentTask.id]));
    try {
      await shopDashboardApi.deleteTask(currentTask.id);
      toast.success(`任务 ${currentTask.id} 已删除`);
      if (detailTask?.id === currentTask.id) {
        setDetailTask(null);
        clearExecutions();
      }
      if (editingTask?.id === currentTask.id) {
        setEditingTask(null);
      }
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
      await fetchTasks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除任务失败');
    } finally {
      setDeletingTaskIds(prev => prev.filter(id => id !== currentTask.id));
    }
  }, [clearExecutions, detailTask?.id, editingTask?.id, fetchTasks, taskToDelete]);

  const openTaskExecutions = useCallback(
    (task: TaskDefinition) => {
      setDetailTask(task);
      void fetchExecutions(task.id);
    },
    [fetchExecutions],
  );

  const handleCloseExecutions = useCallback(() => {
    setDetailTask(null);
    clearExecutions();
  }, [clearExecutions]);

  // ── 列定义 ──
  const columns: DataTableColumn<TaskDefinition>[] = useMemo(
    () => [
      {
        key: 'id',
        header: '任务ID',
        render: task => <span className="font-mono text-xs">{task.id}</span>,
        width: 90,
      },
      {
        key: 'name',
        header: '任务名称',
        render: task => (
          <span className="font-medium text-cyan-700 dark:text-cyan-300">{task.name}</span>
        ),
      },
      {
        key: 'task_type',
        header: '任务类型',
        render: task => <span className="text-xs">{taskTypeLabel(task.task_type)}</span>,
      },
      {
        key: 'status',
        header: '状态',
        render: task => (
          <Badge variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Badge>
        ),
        width: 120,
      },
      {
        key: 'updated_at',
        header: '更新时间',
        render: task => (
          <span className="text-xs text-slate-500">{toLocalTime(task.updated_at)}</span>
        ),
        width: 170,
      },
      {
        key: 'actions',
        header: '操作',
        width: 220,
        render: task => (
          <TaskActions
            task={task}
            isRunning={actionLoading.isRunning(task.id)}
            isCancelling={actionLoading.isCancelling(task.id)}
            isDeleting={isDeletingTask(task.id)}
            onRun={handleRunTask}
            onViewExecutions={openTaskExecutions}
            onEdit={handleOpenEditTask}
            onCancel={task => void handleCancelTask(task)}
            onDelete={handleRequestDeleteTask}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      actionLoading.isRunning,
      actionLoading.isCancelling,
      handleCancelTask,
      handleRequestDeleteTask,
      handleOpenEditTask,
      handleRunTask,
      isDeletingTask,
      openTaskExecutions,
    ],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">任务调度管理</h2>

      <FilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        status={query.status}
        onStatusChange={status =>
          setQuery(prev => ({ ...prev, page: 1, status }))
        }
        taskType={query.task_type}
        onTaskTypeChange={task_type =>
          setQuery(prev => ({ ...prev, page: 1, task_type }))
        }
        isLoading={isLoading}
        onRefresh={() => void fetchTasks()}
      />

      <DataTable
        data={filteredTasks}
        columns={columns}
        isLoading={isLoading}
        pagination={{ page: query.page, size: query.size, total }}
        onPageChange={page => setQuery(prev => ({ ...prev, page }))}
        onSizeChange={size => setQuery(prev => ({ ...prev, page: 1, size }))}
        rowKey={task => task.id}
      />
      <Button
        className="fixed bottom-6 right-6 z-40 shadow-lg"
        onClick={() => router.push(ROUTES.TASK_SCHEDULE_COLLECTION_JOBS)}
      >
        <Clock3 className="mr-2 h-4 w-4" />
        定时任务配置
      </Button>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogChange}
        onConfirm={() => void handleConfirmDeleteTask()}
        isLoading={isDeleteDialogLoading}
        title="确认删除任务？"
        description={
          taskToDelete
            ? `此操作不可撤销，将永久删除任务 "${taskToDelete.name}"。`
            : '此操作不可撤销，将永久删除该任务。'
        }
      />

      <EditTaskDialog
        task={editingTask}
        form={editForm}
        isSubmitting={isEditSubmitting}
        onChange={setEditForm}
        onSubmit={() => void handleSubmitEditTask()}
        onClose={handleCloseEditTask}
      />

      <RunTaskDialog
        state={runDialog}
        isSubmitting={isRunSubmitting}
        onChange={setRunDialog}
        onSubmit={() => void handleSubmitRunTask()}
        onClose={handleCloseRunTask}
      />

      <ExecutionsDialog
        task={detailTask}
        executions={executions}
        isLoading={isExecutionsLoading}
        onRefresh={fetchExecutions}
        onClose={handleCloseExecutions}
      />
    </div>
  );
}
