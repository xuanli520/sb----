'use client';

import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileUp, Link2, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { SecondaryPageLayout } from '@/app/components/layout/SecondaryPageLayout';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { dataSourceApi } from '@/features/data-source/services/dataSourceApi';
import { scrapingRuleApi } from '@/features/scraping-rule/services/scrapingRuleApi';
import { agentApi } from '@/features/agent/services/agentApi';
import { AgentEvent, AgentRecipeListItem, AgentResultItem, AgentResultsParams } from '@/features/agent/services/types';
import { DataSourceResponse, ScrapingRuleListItem } from '@/types';

const DEFAULT_GOAL = '发现抖店体验分单页采集路径';
const DEFAULT_ENTRYPOINT = 'https://fxg.jinritemai.com/ffa/eco/experience-score?source=fxg-menu';
const DEFAULT_NAMESPACE = 'douyin_shop_dashboard';
const DEFAULT_RECIPE_KEY = 'experience_score_single_page';

interface LoginFormState {
  phone: string;
  code: string;
}

interface DiscoveryFormState {
  goal: string;
  entrypoint_url: string;
  namespace_hint: string;
  key_hint: string;
  max_steps: string;
}

interface ResultsFilterState {
  namespace: string;
  resource_key: string;
  date_from: string;
  date_to: string;
  page: string;
  size: string;
}

type DiscoveryLoginStateStatus = 'unknown' | 'checking' | 'available' | 'missing';

function eventVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const normalized = status.toLowerCase();
  if (['failed', 'cancelled'].includes(normalized)) return 'destructive';
  if (['succeeded', 'success', 'finished', 'completed', 'stable'].includes(normalized)) return 'secondary';
  if (['queued', 'running', 'submitted'].includes(normalized)) return 'default';
  return 'outline';
}

function statusLabel(status: string): string {
  const normalized = status.toLowerCase();
  const labels: Record<string, string> = {
    active: '启用',
    cancelled: '已取消',
    candidate: '候选版',
    completed: '已完成',
    degraded: '降级',
    disabled: '禁用',
    error: '异常',
    failed: '失败',
    finished: '已完成',
    inactive: '停用',
    queued: '排队中',
    running: '运行中',
    stable: '稳定版',
    submitted: '已提交',
    succeeded: '成功',
    success: '成功',
  };
  return labels[normalized] || status;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    code_submitted: '已提交验证码',
    login_cancelled: '登录已取消',
    login_failed: '登录失败',
    login_started: '登录开始',
    login_success: '登录成功',
    page_observed: '已识别页面',
    queued: '排队中',
    recipe_generated: '配方已生成',
    run_failed: '运行失败',
    run_finished: '运行结束',
    run_started: '运行开始',
    tool_finished: '工具结束',
    tool_started: '工具开始',
    waiting_for_code: '等待验证码',
  };
  return labels[type] || type;
}

function eventMessageLabel(message: string): string {
  const labels: Record<string, string> = {
    'discovery failed': '发现任务失败',
    'discovery finished': '发现任务完成',
    'discovery recipe persisted': '发现配方已保存',
    'discovery started': '发现任务开始',
    'login queued': '登录任务已排队',
    'page observed': '已识别页面',
    'recipe generated': '配方已生成',
    'verification code submitted': '验证码已提交',
  };
  return labels[message] || message;
}

function loginStateVariant(status: DiscoveryLoginStateStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'available') return 'secondary';
  if (status === 'missing') return 'destructive';
  if (status === 'checking') return 'default';
  return 'outline';
}

function loginStateLabel(status: DiscoveryLoginStateStatus, accountId: string, shopId: string): string {
  if (!accountId || !shopId) return '未选择';
  if (status === 'available') return '可用';
  if (status === 'missing') return '不可用';
  if (status === 'checking') return '检查中';
  return '未检查';
}

function loginStateReasonLabel(reason?: string): string {
  if (!reason) return '';
  if (reason === 'shop_runtime_state' || reason === 'account_runtime_state' || reason === 'data_source_storage_state') {
    return '已找到登录态';
  }
  if (reason === 'data_source_storage_state_missing') return '数据源未保存可用登录态';
  if (reason === 'account_not_found') return '账号 ID 未匹配数据源';
  if (reason === 'missing_account_id') return '缺少账号 ID';
  return reason;
}

function toPositiveInt(value: string, fallback: number): number {
  const normalized = Number(value.trim());
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function textItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [String(value)];
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? textItems(parsed) : [];
      } catch {
        return [];
      }
    }
    return text.split(/[;,|]/).map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function uniqueItems(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function sourceConfig(source: DataSourceResponse | null): Record<string, unknown> {
  return isRecord(source?.config) ? source.config : {};
}

function ruleConfig(rule: ScrapingRuleListItem | null): Record<string, unknown> {
  return isRecord(rule?.config) ? rule.config : {};
}

function ruleFilters(rule: ScrapingRuleListItem | null): Record<string, unknown> {
  const filters = ruleConfig(rule).filters;
  return isRecord(filters) ? filters : {};
}

function resolveShopIds(source: DataSourceResponse | null, rule: ScrapingRuleListItem | null): string[] {
  const dsConfig = sourceConfig(source);
  const config = ruleConfig(rule);
  const filters = ruleFilters(rule);
  const allMode = filters.all === true || config.all === true;
  return uniqueItems([
    ...(allMode ? ['all'] : []),
    ...textItems(config.resolved_shop_ids),
    ...textItems(config.shop_ids),
    ...textItems(config.shop_id),
    ...textItems(filters.shop_ids),
    ...textItems(filters.shop_id),
    ...textItems(dsConfig.shop_ids),
    ...textItems(dsConfig.shop_id),
  ]);
}

function resolveAccountId(source: DataSourceResponse | null, rule: ScrapingRuleListItem | null): string {
  const dsConfig = sourceConfig(source);
  const meta = dsConfig.shop_dashboard_login_state_meta;
  const metaRecord = isRecord(meta) ? meta : undefined;
  return (
    readText(dsConfig, 'account_id') ||
    readText(metaRecord, 'account_id') ||
    readText(dsConfig, 'user_phone') ||
    (source?.id ? `data_source_${source.id}` : '') ||
    (rule?.id ? `rule_${rule.id}` : '')
  );
}

function resolvePhone(source: DataSourceResponse | null): string {
  const config = sourceConfig(source);
  return readText(config, 'phone') || readText(config, 'user_phone');
}

function resolveRecipeRef(rule: ScrapingRuleListItem | null): { namespace: string; key: string; version?: number } | null {
  const ref = ruleConfig(rule).agent_recipe;
  if (!isRecord(ref)) return null;
  const namespace = readText(ref, 'namespace');
  const key = readText(ref, 'key');
  if (!namespace || !key) return null;
  const version = Number(ref.version);
  return Number.isInteger(version) && version > 0 ? { namespace, key, version } : { namespace, key };
}

function resolveEntrypoint(rule: ScrapingRuleListItem | null, selectedRecipe: AgentRecipeListItem | null): string {
  const config = ruleConfig(rule);
  const entrypoint = config.entrypoint_url || config.entrypoint;
  if (typeof entrypoint === 'string' && entrypoint.trim()) {
    return entrypoint.trim();
  }
  if (isRecord(entrypoint)) {
    const url = readText(entrypoint, 'url') || readText(entrypoint, 'url_template');
    if (url) return url;
  }
  if (selectedRecipe?.namespace === DEFAULT_NAMESPACE && selectedRecipe.key === DEFAULT_RECIPE_KEY) {
    return DEFAULT_ENTRYPOINT;
  }
  return DEFAULT_ENTRYPOINT;
}

function dataSourceLabel(source: DataSourceResponse): string {
  return `${source.name} #${source.id} · ${statusLabel(source.status)}`;
}

function ruleLabel(rule: ScrapingRuleListItem): string {
  return `${rule.name} #${rule.id}`;
}

function recipeLabel(recipe: AgentRecipeListItem): string {
  const state = recipe.validation_error
    ? ' · 校验失败'
    : recipe.status !== 'active'
      ? ' · 不可用'
      : recipe.stability !== 'stable'
        ? ' · 待稳定化'
        : ' · 可绑定';
  return `${recipe.namespace}/${recipe.key} v${recipe.version} #${recipe.id} · ${statusLabel(recipe.status)}/${statusLabel(recipe.stability)}${state}`;
}

function isRecipeUsable(recipe: AgentRecipeListItem): boolean {
  return recipe.status === 'active' && !recipe.validation_error;
}

function isRecipeStableUsable(recipe: AgentRecipeListItem): boolean {
  return isRecipeUsable(recipe) && recipe.stability === 'stable';
}

function recipeAvailabilityMessage(recipe: AgentRecipeListItem): string {
  if (recipe.validation_error) return recipe.validation_error;
  if (recipe.status !== 'active') return '当前采集配方未启用，不能标记为稳定版或绑定规则';
  if (recipe.stability !== 'stable') return '当前采集配方仍是候选版，需要先标记为稳定版后才能绑定规则';
  return '当前采集配方可绑定规则';
}

function parseDiscoveryMaxSteps(value: string): number | null {
  const text = value.trim();
  if (!text) return 30;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function recipeMatchesRef(
  recipe: AgentRecipeListItem,
  ref: { namespace: string; key: string; version?: number } | null,
): boolean {
  if (!ref) return false;
  return recipe.namespace === ref.namespace &&
    recipe.key === ref.key &&
    (!ref.version || recipe.version === ref.version);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function EventList({ events }: { events: AgentEvent[] }) {
  return (
    <div className="max-h-[300px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">序号</TableHead>
            <TableHead className="w-[140px]">状态</TableHead>
            <TableHead className="w-[180px]">事件</TableHead>
            <TableHead>消息</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                暂无事件
              </TableCell>
            </TableRow>
          ) : events.map(event => (
            <TableRow key={`${event.run_id}-${event.sequence}`}>
              <TableCell className="font-mono text-xs">{event.sequence}</TableCell>
              <TableCell>
                <Badge variant={eventVariant(String(event.status))}>{statusLabel(String(event.status))}</Badge>
              </TableCell>
              <TableCell className="text-xs">{eventTypeLabel(event.event_type)}</TableCell>
              <TableCell className="max-w-[420px] truncate text-xs">{event.message ? eventMessageLabel(event.message) : '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AgentWorkbenchPage() {
  const loginWsRef = useRef<WebSocket | null>(null);
  const discoveryWsRef = useRef<WebSocket | null>(null);
  const loginStateRequestRef = useRef(0);
  const [dataSources, setDataSources] = useState<DataSourceResponse[]>([]);
  const [rules, setRules] = useState<ScrapingRuleListItem[]>([]);
  const [recipes, setRecipes] = useState<AgentRecipeListItem[]>([]);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [isOptionsLoading, setIsOptionsLoading] = useState(false);
  const [isRulesLoading, setIsRulesLoading] = useState(false);
  const [rulesLoadFailed, setRulesLoadFailed] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>({ phone: '', code: '' });
  const [loginSessionId, setLoginSessionId] = useState('');
  const [loginEvents, setLoginEvents] = useState<AgentEvent[]>([]);
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [discoveryForm, setDiscoveryForm] = useState<DiscoveryFormState>({
    goal: DEFAULT_GOAL,
    entrypoint_url: DEFAULT_ENTRYPOINT,
    namespace_hint: DEFAULT_NAMESPACE,
    key_hint: DEFAULT_RECIPE_KEY,
    max_steps: '30',
  });
  const [discoveryRunId, setDiscoveryRunId] = useState('');
  const [discoveryEvents, setDiscoveryEvents] = useState<AgentEvent[]>([]);
  const [isDiscoverySubmitting, setIsDiscoverySubmitting] = useState(false);
  const [discoveryLoginStateStatus, setDiscoveryLoginStateStatus] = useState<DiscoveryLoginStateStatus>('unknown');
  const [discoveryLoginStateReason, setDiscoveryLoginStateReason] = useState('');
  const [recipeExport, setRecipeExport] = useState('');
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);
  const [isRuleBindingSubmitting, setIsRuleBindingSubmitting] = useState(false);
  const [resultsFilter, setResultsFilter] = useState<ResultsFilterState>({
    namespace: DEFAULT_NAMESPACE,
    resource_key: '',
    date_from: '',
    date_to: '',
    page: '1',
    size: '50',
  });
  const [results, setResults] = useState<AgentResultItem[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [selectedResult, setSelectedResult] = useState<AgentResultItem | null>(null);
  const [isResultsLoading, setIsResultsLoading] = useState(false);

  useEffect(() => () => {
    loginWsRef.current?.close();
    discoveryWsRef.current?.close();
  }, []);

  const selectedDataSource = useMemo(
    () => dataSources.find(item => String(item.id) === selectedDataSourceId) || null,
    [dataSources, selectedDataSourceId],
  );

  const selectedRule = useMemo(
    () => rules.find(item => String(item.id) === selectedRuleId) || null,
    [rules, selectedRuleId],
  );

  const selectedRecipe = useMemo(
    () => recipes.find(item => String(item.id) === selectedRecipeId) || null,
    [recipes, selectedRecipeId],
  );

  const availableShopIds = useMemo(
    () => resolveShopIds(selectedDataSource, selectedRule),
    [selectedDataSource, selectedRule],
  );

  const selectedAccountId = useMemo(
    () => resolveAccountId(selectedDataSource, selectedRule),
    [selectedDataSource, selectedRule],
  );

  const selectedRecipeRef = useMemo(
    () => resolveRecipeRef(selectedRule),
    [selectedRule],
  );

  const isSelectedRecipeBoundToRule = useMemo(
    () => selectedRecipe ? recipeMatchesRef(selectedRecipe, selectedRecipeRef) : false,
    [selectedRecipe, selectedRecipeRef],
  );

  useEffect(() => {
    let ignore = false;
    async function loadOptions() {
      setIsOptionsLoading(true);
      try {
        const [sourceResult, recipeResult] = await Promise.allSettled([
          dataSourceApi.getAll({ source_type: 'DOUYIN_SHOP', page: 1, size: 100 }),
          agentApi.listRecipes(),
        ]);
        if (ignore) return;
        if (sourceResult.status === 'fulfilled') {
          setDataSources(sourceResult.value.items);
          setSelectedDataSourceId(prev => prev || (sourceResult.value.items[0] ? String(sourceResult.value.items[0].id) : ''));
        } else {
          setDataSources([]);
          toast.error(sourceResult.reason instanceof Error ? sourceResult.reason.message : '数据源加载失败');
        }
        if (recipeResult.status === 'fulfilled') {
          setRecipes(recipeResult.value.items);
        } else {
          setRecipes([]);
          toast.error(recipeResult.reason instanceof Error ? recipeResult.reason.message : '采集配方加载失败');
        }
      } finally {
        if (!ignore) setIsOptionsLoading(false);
      }
    }
    void loadOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadRules() {
      if (!selectedDataSource) {
        setRules([]);
        setSelectedRuleId('');
        return;
      }
      setIsRulesLoading(true);
      setRulesLoadFailed(false);
      try {
        const nextRules = await dataSourceApi.getScrapingRules(selectedDataSource.id);
        if (ignore) return;
        setRules(nextRules);
        setSelectedRuleId(prev => (
          nextRules.some(item => String(item.id) === prev)
            ? prev
            : (nextRules[0] ? String(nextRules[0].id) : '')
        ));
      } catch (error) {
        if (!ignore) {
          setRules([]);
          setSelectedRuleId('');
          setRulesLoadFailed(true);
          toast.error(error instanceof Error ? error.message : '关联规则加载失败');
        }
      } finally {
        if (!ignore) setIsRulesLoading(false);
      }
    }
    void loadRules();
    return () => {
      ignore = true;
    };
  }, [selectedDataSource]);

  useEffect(() => {
    setSelectedShopId(prev => (
      availableShopIds.includes(prev) ? prev : (availableShopIds[0] || '')
    ));
  }, [availableShopIds]);

  useEffect(() => {
    const phone = resolvePhone(selectedDataSource);
    if (phone) {
      setLoginForm(prev => ({ ...prev, phone }));
    }
  }, [selectedDataSource]);

  useEffect(() => {
    const defaultRef = { namespace: DEFAULT_NAMESPACE, key: DEFAULT_RECIPE_KEY };
    const matchedStableRecipe = recipes.find(item => recipeMatchesRef(item, selectedRecipeRef) && isRecipeStableUsable(item));
    const defaultStableRecipe = recipes.find(item => recipeMatchesRef(item, defaultRef) && isRecipeStableUsable(item));
    const anyStableRecipe = recipes.find(isRecipeStableUsable);
    const matchedUsableRecipe = recipes.find(item => recipeMatchesRef(item, selectedRecipeRef) && isRecipeUsable(item));
    const defaultUsableRecipe = recipes.find(item => recipeMatchesRef(item, defaultRef) && isRecipeUsable(item));
    const anyUsableRecipe = recipes.find(isRecipeUsable);
    const matchedRecipe = recipes.find(item => recipeMatchesRef(item, selectedRecipeRef));
    const defaultRecipe = recipes.find(item => recipeMatchesRef(item, defaultRef));
    setSelectedRecipeId(prev => {
      const current = recipes.find(item => String(item.id) === prev);
      if (current && isRecipeUsable(current)) return prev;
      const nextRecipe = matchedStableRecipe || defaultStableRecipe || anyStableRecipe || matchedUsableRecipe || defaultUsableRecipe || anyUsableRecipe || matchedRecipe || defaultRecipe || recipes[0];
      return nextRecipe ? String(nextRecipe.id) : '';
    });
  }, [recipes, selectedRecipeRef]);

  useEffect(() => {
    const recipeRef = selectedRecipe
      ? { namespace: selectedRecipe.namespace, key: selectedRecipe.key }
      : selectedRecipeRef;
    setDiscoveryForm(prev => ({
      ...prev,
      entrypoint_url: resolveEntrypoint(selectedRule, selectedRecipe),
      namespace_hint: recipeRef?.namespace || DEFAULT_NAMESPACE,
      key_hint: recipeRef?.key || DEFAULT_RECIPE_KEY,
    }));
    setResultsFilter(prev => ({
      ...prev,
      namespace: recipeRef?.namespace || DEFAULT_NAMESPACE,
      resource_key: selectedShopId,
    }));
  }, [selectedRecipe, selectedRecipeRef, selectedRule, selectedShopId]);

  const resultsParams = useMemo<AgentResultsParams>(() => ({
    namespace: optionalText(resultsFilter.namespace),
    resource_key: optionalText(resultsFilter.resource_key),
    date_from: optionalText(resultsFilter.date_from),
    date_to: optionalText(resultsFilter.date_to),
    page: toPositiveInt(resultsFilter.page, 1),
    size: Math.min(toPositiveInt(resultsFilter.size, 50), 200),
  }), [resultsFilter]);

  const refreshRecipes = useCallback(async (preferred?: { namespace: string; key: string }) => {
    const response = await agentApi.listRecipes();
    setRecipes(response.items);
    if (preferred) {
      const matched = response.items.find(item => (
        item.namespace === preferred.namespace &&
        item.key === preferred.key &&
        isRecipeStableUsable(item)
      )) || response.items.find(item => (
        item.namespace === preferred.namespace &&
        item.key === preferred.key &&
        isRecipeUsable(item)
      )) || response.items.find(item => (
        item.namespace === preferred.namespace &&
        item.key === preferred.key
      ));
      if (matched) {
        setSelectedRecipeId(String(matched.id));
      }
    }
    return response.items;
  }, []);

  const refreshRecipeOptions = useCallback(async () => {
    setIsOptionsLoading(true);
    try {
      await refreshRecipes();
      toast.success('采集配方已刷新');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '采集配方刷新失败');
    } finally {
      setIsOptionsLoading(false);
    }
  }, [refreshRecipes]);

  const checkDiscoveryLoginState = useCallback(async (options: {
    accountId?: string;
    shopId?: string;
    silent?: boolean;
  } = {}): Promise<boolean> => {
    const accountId = options.accountId || optionalText(selectedAccountId);
    const shopId = options.shopId || selectedShopId;
    if (!accountId || !shopId) {
      loginStateRequestRef.current += 1;
      setDiscoveryLoginStateStatus('unknown');
      setDiscoveryLoginStateReason('');
      if (!options.silent) {
        toast.error('请选择账号和店铺范围');
      }
      return false;
    }
    const requestId = loginStateRequestRef.current + 1;
    loginStateRequestRef.current = requestId;
    setDiscoveryLoginStateStatus('checking');
    try {
      const loginState = await agentApi.getDiscoveryLoginState(accountId, shopId);
      if (requestId !== loginStateRequestRef.current) return false;
      setDiscoveryLoginStateStatus(loginState.available ? 'available' : 'missing');
      setDiscoveryLoginStateReason(loginState.reason || '');
      if (!options.silent) {
        if (loginState.available) {
          toast.success('账号登录态可用');
        } else {
          const reason = loginStateReasonLabel(loginState.reason);
          toast.error(reason ? `账号登录态不可用：${reason}` : '账号登录态不可用');
        }
      }
      return loginState.available;
    } catch (error) {
      if (requestId === loginStateRequestRef.current) {
        setDiscoveryLoginStateStatus('unknown');
        setDiscoveryLoginStateReason('');
      }
      if (!options.silent) {
        toast.error(error instanceof Error ? error.message : '登录态检查失败');
      }
      return false;
    }
  }, [selectedAccountId, selectedShopId]);

  const refreshSelectedDataSource = useCallback(async () => {
    if (!selectedDataSource) {
      return;
    }
    try {
      const nextDataSource = await dataSourceApi.getById(selectedDataSource.id);
      setDataSources(prev => prev.map(item => (
        item.id === nextDataSource.id ? nextDataSource : item
      )));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '数据源状态刷新失败');
    }
  }, [selectedDataSource]);

  useEffect(() => {
    const accountId = optionalText(selectedAccountId);
    if (!accountId || !selectedShopId) {
      loginStateRequestRef.current += 1;
      setDiscoveryLoginStateStatus('unknown');
      setDiscoveryLoginStateReason('');
      return;
    }
    void checkDiscoveryLoginState({
      accountId,
      shopId: selectedShopId,
      silent: true,
    });
  }, [checkDiscoveryLoginState, selectedAccountId, selectedShopId]);

  const connectLoginEvents = useCallback((sessionId: string) => {
    loginWsRef.current?.close();
    setLoginEvents([]);
    loginWsRef.current = agentApi.connectEvents(
      agentApi.loginEventsUrl(sessionId),
      event => {
        setLoginEvents(prev => [...prev, event]);
        if (event.event_type === 'login_success') {
          toast.success('登录成功，登录态已刷新');
          void refreshSelectedDataSource();
          void checkDiscoveryLoginState({ silent: true });
        } else if (event.event_type === 'login_failed') {
          toast.error(event.message || '登录失败');
        }
      },
    );
  }, [checkDiscoveryLoginState, refreshSelectedDataSource]);

  const connectDiscoveryEvents = useCallback((runId: string, preferredRecipe?: { namespace: string; key: string }) => {
    discoveryWsRef.current?.close();
    setDiscoveryEvents([]);
    let completed = false;
    discoveryWsRef.current = agentApi.connectEvents(
      agentApi.discoveryEventsUrl(runId),
      event => {
        setDiscoveryEvents(prev => [...prev, event]);
        if (event.event_type === 'run_finished' && event.status === 'completed') {
          completed = true;
          void refreshRecipes(preferredRecipe).then(items => {
            if (!preferredRecipe) {
              return;
            }
            const matched = items.find(item => (
              item.namespace === preferredRecipe.namespace &&
              item.key === preferredRecipe.key &&
              isRecipeStableUsable(item)
            ));
            if (matched) {
              toast.success(`采集配方已生成并可绑定: v${matched.version}`);
            } else {
              toast.error('发现任务已完成，但未生成可绑定的稳定版采集配方');
            }
          });
        } else if (event.event_type === 'run_finished' && event.status === 'failed') {
          toast.error(event.message ? eventMessageLabel(event.message) : '发现任务执行失败');
        }
      },
      () => {
        if (!completed) {
          void refreshRecipes(preferredRecipe);
        }
      },
    );
  }, [refreshRecipes]);

  const startLogin = useCallback(async () => {
    const phone = loginForm.phone.trim();
    const accountId = selectedAccountId;
    if (!phone || !accountId || !selectedDataSource) {
      toast.error('请选择数据源并填写手机号');
      return;
    }
    setIsLoginSubmitting(true);
    try {
      const response = await agentApi.startLogin({
        phone,
        account_id: accountId,
        data_source_id: selectedDataSource.id,
      });
      setLoginSessionId(response.session_id);
      connectLoginEvents(response.session_id);
      toast.success(`登录会话已创建: ${response.session_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录会话创建失败');
    } finally {
      setIsLoginSubmitting(false);
    }
  }, [connectLoginEvents, loginForm.phone, selectedAccountId, selectedDataSource]);

  const submitLoginCode = useCallback(async () => {
    if (!loginSessionId) {
      toast.error('请先创建登录会话');
      return;
    }
    const code = loginForm.code.trim();
    if (!/^\d{4,6}$/.test(code)) {
      toast.error('验证码必须为 4-6 位数字');
      return;
    }
    try {
      await agentApi.submitLoginCode(loginSessionId, { code });
      toast.success('验证码已提交');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '验证码提交失败');
    }
  }, [loginForm.code, loginSessionId]);

  const cancelLogin = useCallback(async () => {
    if (!loginSessionId) return;
    try {
      await agentApi.cancelLogin(loginSessionId);
      loginWsRef.current?.close();
      toast.success('登录会话已取消');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消登录失败');
    }
  }, [loginSessionId]);

  const startDiscovery = useCallback(async () => {
    const maxSteps = parseDiscoveryMaxSteps(discoveryForm.max_steps);
    if (maxSteps === null) {
      toast.error('最大步骤必须是正整数');
      return;
    }
    const payload = {
      shop_id: selectedShopId,
      account_id: optionalText(selectedAccountId),
      goal: discoveryForm.goal.trim(),
      entrypoint_url: discoveryForm.entrypoint_url.trim(),
      namespace_hint: optionalText(discoveryForm.namespace_hint),
      key_hint: optionalText(discoveryForm.key_hint),
      max_steps: maxSteps,
    };
    if (!payload.shop_id || !payload.account_id || !payload.goal || !payload.entrypoint_url) {
      toast.error('请选择数据源、采集规则、账号和店铺范围');
      return;
    }
    setIsDiscoverySubmitting(true);
    try {
      const loginAvailable = await checkDiscoveryLoginState({
        accountId: payload.account_id,
        shopId: payload.shop_id,
        silent: true,
      });
      if (!loginAvailable) {
        toast.error('账号登录态不可用，请先在 Agent 工作台重新登录');
        return;
      }
      const response = await agentApi.startDiscovery(payload);
      setDiscoveryRunId(response.run_id);
      connectDiscoveryEvents(response.run_id, {
        namespace: payload.namespace_hint || DEFAULT_NAMESPACE,
        key: payload.key_hint || DEFAULT_RECIPE_KEY,
      });
      toast.success(`发现任务已创建: ${response.run_id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发现任务创建失败');
    } finally {
      setIsDiscoverySubmitting(false);
    }
  }, [checkDiscoveryLoginState, connectDiscoveryEvents, discoveryForm, selectedAccountId, selectedShopId]);

  const markStable = useCallback(async () => {
    if (!selectedRecipe) {
      toast.error('请选择采集配方');
      return;
    }
    if (!isRecipeUsable(selectedRecipe) || selectedRecipe.stability === 'stable') {
      toast.error('当前采集配方不可标记为稳定版');
      return;
    }
    setIsRecipeSubmitting(true);
    try {
      await agentApi.markRecipeStable(selectedRecipe.id, { expected_version: selectedRecipe.version });
      toast.success('采集配方已标记为稳定版');
      const response = await agentApi.listRecipes();
      setRecipes(response.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标记稳定版失败');
    } finally {
      setIsRecipeSubmitting(false);
    }
  }, [selectedRecipe]);

  const bindSelectedRecipeToRule = useCallback(async () => {
    if (!selectedRule || !selectedRecipe) {
      toast.error('请选择采集规则和采集配方');
      return;
    }
    if (!isRecipeStableUsable(selectedRecipe)) {
      toast.error(recipeAvailabilityMessage(selectedRecipe));
      return;
    }
    if (isSelectedRecipeBoundToRule) {
      toast.info('当前规则已绑定该采集配方');
      return;
    }
    setIsRuleBindingSubmitting(true);
    try {
      const updatedRule = await scrapingRuleApi.update(selectedRule.id, {
        config: {
          ...ruleConfig(selectedRule),
          agent_recipe: {
            namespace: selectedRecipe.namespace,
            key: selectedRecipe.key,
            version: selectedRecipe.version,
          },
        },
      });
      setRules(prev => prev.map(rule => (
        rule.id === updatedRule.id ? { ...rule, ...updatedRule } : rule
      )));
      setSelectedRuleId(String(updatedRule.id));
      toast.success(`已绑定采集配方 v${selectedRecipe.version} 到规则 #${updatedRule.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '绑定采集配方失败');
    } finally {
      setIsRuleBindingSubmitting(false);
    }
  }, [isSelectedRecipeBoundToRule, selectedRecipe, selectedRule]);

  const exportRecipe = useCallback(async () => {
    if (!selectedRecipe) {
      toast.error('请选择采集配方');
      return;
    }
    setIsRecipeSubmitting(true);
    try {
      const payload = await agentApi.exportRecipe(selectedRecipe.id);
      setRecipeExport(formatJson(payload));
      toast.success('采集配方已导出');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出采集配方失败');
    } finally {
      setIsRecipeSubmitting(false);
    }
  }, [selectedRecipe]);

  const importRecipe = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsRecipeSubmitting(true);
    try {
      const response = await agentApi.importRecipe(file);
      const recipesResponse = await agentApi.listRecipes();
      setRecipes(recipesResponse.items);
      setSelectedRecipeId(String(response.id));
      toast.success(`采集配方已导入: ${response.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入采集配方失败');
    } finally {
      setIsRecipeSubmitting(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    setIsResultsLoading(true);
    try {
      const response = await agentApi.listResults(resultsParams);
      setResults(response.items);
      setResultsTotal(response.total);
    } catch (error) {
      setResults([]);
      setResultsTotal(0);
      toast.error(error instanceof Error ? error.message : '采集结果加载失败');
    } finally {
      setIsResultsLoading(false);
    }
  }, [resultsParams]);

  const openResult = useCallback(async (resultId: number) => {
    try {
      setSelectedResult(await agentApi.getResult(resultId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '采集结果详情加载失败');
    }
  }, []);

  const downloadResults = useCallback(() => {
    const namespace = resultsFilter.namespace.trim();
    const resourceKey = resultsFilter.resource_key.trim();
    const dateFrom = resultsFilter.date_from.trim();
    const dateTo = resultsFilter.date_to.trim();
    if (!namespace || !resourceKey || !dateFrom || !dateTo) {
      toast.error('下载 CSV 需要命名空间、资源标识、开始日期和结束日期');
      return;
    }
    window.open(agentApi.downloadResultsUrl({
      namespace,
      resource_key: resourceKey,
      date_from: dateFrom,
      date_to: dateTo,
    }), '_blank');
  }, [resultsFilter]);

  return (
    <SecondaryPageLayout
      breadcrumbs={[]}
      title="智能体工作台"
    >
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>智能体登录</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
              <Field label="数据源">
                <Select
                  value={selectedDataSourceId || undefined}
                  onValueChange={value => {
                    setSelectedDataSourceId(value);
                    setSelectedRuleId('');
                    setSelectedShopId('');
                  }}
                  disabled={isOptionsLoading || dataSources.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isOptionsLoading ? '加载数据源中...' : '选择数据源'} />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.length === 0 ? (
                      <SelectItem value="empty-data-sources" disabled>
                        {isOptionsLoading ? '加载数据源中...' : '暂无可用数据源'}
                      </SelectItem>
                    ) : dataSources.map(source => (
                      <SelectItem key={source.id} value={String(source.id)}>
                        {dataSourceLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="手机号">
                <Input placeholder="手机号" value={loginForm.phone} onChange={event => setLoginForm(prev => ({ ...prev, phone: event.target.value }))} />
              </Field>
              <Field label="账号 ID">
                <Input placeholder="账号 ID" value={selectedAccountId} readOnly />
              </Field>
              <div className="flex items-end">
                <Button onClick={() => void startLogin()} disabled={isLoginSubmitting || !selectedAccountId}>
                  <Play className="mr-2 h-4 w-4" />
                  发起登录
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <Field label="短信验证码">
                <Input placeholder="短信验证码" value={loginForm.code} onChange={event => setLoginForm(prev => ({ ...prev, code: event.target.value }))} />
              </Field>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => void submitLoginCode()} disabled={!loginSessionId}>
                  提交验证码
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => void cancelLogin()} disabled={!loginSessionId}>
                  <XCircle className="mr-2 h-4 w-4" />
                  取消
                </Button>
              </div>
            </div>
            {loginSessionId && <div className="font-mono text-xs text-muted-foreground">登录会话 ID: {loginSessionId}</div>}
            <EventList events={loginEvents} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>智能体发现</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[1.3fr_1.3fr_1fr]">
              <Field label="数据源">
                <Select
                  value={selectedDataSourceId || undefined}
                  onValueChange={value => {
                    setSelectedDataSourceId(value);
                    setSelectedRuleId('');
                    setSelectedShopId('');
                  }}
                  disabled={isOptionsLoading || dataSources.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isOptionsLoading ? '加载数据源中...' : '选择数据源'} />
                  </SelectTrigger>
                  <SelectContent>
                    {dataSources.length === 0 ? (
                      <SelectItem value="empty-discovery-data-sources" disabled>
                        {isOptionsLoading ? '加载数据源中...' : '暂无可用数据源'}
                      </SelectItem>
                    ) : dataSources.map(source => (
                      <SelectItem key={source.id} value={String(source.id)}>
                        {dataSourceLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="采集规则">
                <Select
                  value={selectedRuleId || undefined}
                  onValueChange={value => {
                    setSelectedRuleId(value);
                    setSelectedShopId('');
                  }}
                  disabled={!selectedDataSourceId || isRulesLoading || rules.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedDataSourceId
                          ? '先选择数据源'
                          : isRulesLoading
                            ? '加载规则中...'
                            : '选择采集规则'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {!selectedDataSourceId && (
                      <SelectItem value="rule-need-data-source" disabled>请先选择数据源</SelectItem>
                    )}
                    {selectedDataSourceId && isRulesLoading && (
                      <SelectItem value="rule-loading" disabled>加载规则中...</SelectItem>
                    )}
                    {selectedDataSourceId && !isRulesLoading && rules.length === 0 && (
                      <SelectItem value="empty-rules" disabled>
                        {rulesLoadFailed ? '规则加载失败，请切换数据源重试' : '该数据源下暂无规则'}
                      </SelectItem>
                    )}
                    {selectedDataSourceId && !isRulesLoading && rules.map(rule => (
                      <SelectItem key={rule.id} value={String(rule.id)}>
                        {ruleLabel(rule)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="最大步骤">
                <Input placeholder="30" value={discoveryForm.max_steps} onChange={event => setDiscoveryForm(prev => ({ ...prev, max_steps: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px]">
              <Field label="店铺范围">
                <Select
                  value={selectedShopId || undefined}
                  onValueChange={setSelectedShopId}
                  disabled={availableShopIds.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择店铺范围" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableShopIds.length === 0 ? (
                      <SelectItem value="empty-shop-ids" disabled>当前规则未配置店铺范围</SelectItem>
                    ) : availableShopIds.map(shopId => (
                      <SelectItem key={shopId} value={shopId}>
                        {shopId === 'all' ? '全部店铺' : shopId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="账号 ID">
                <Input placeholder="账号 ID" value={selectedAccountId} readOnly />
              </Field>
              <Field label="登录态">
                <div className="grid gap-1">
                  <div className="flex h-10 items-center gap-2">
                    <Badge variant={loginStateVariant(discoveryLoginStateStatus)}>
                      {loginStateLabel(discoveryLoginStateStatus, selectedAccountId, selectedShopId)}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="检查登录态"
                          disabled={discoveryLoginStateStatus === 'checking' || !selectedAccountId || !selectedShopId}
                          onClick={() => void checkDiscoveryLoginState()}
                        >
                          <RefreshCw className={`h-4 w-4 ${discoveryLoginStateStatus === 'checking' ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>检查登录态</TooltipContent>
                    </Tooltip>
                  </div>
                  {discoveryLoginStateReason && (
                    <span className="text-xs text-muted-foreground">
                      {loginStateReasonLabel(discoveryLoginStateReason)}
                    </span>
                  )}
                </div>
              </Field>
            </div>
            <Field label="目标">
              <Input placeholder="目标" value={discoveryForm.goal} onChange={event => setDiscoveryForm(prev => ({ ...prev, goal: event.target.value }))} />
            </Field>
            <Field label="入口 URL">
              <Input placeholder="入口 URL" value={discoveryForm.entrypoint_url} onChange={event => setDiscoveryForm(prev => ({ ...prev, entrypoint_url: event.target.value }))} />
            </Field>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Field label="命名空间">
                <Input placeholder="命名空间提示" value={discoveryForm.namespace_hint} onChange={event => setDiscoveryForm(prev => ({ ...prev, namespace_hint: event.target.value }))} />
              </Field>
              <Field label="配方标识">
                <Input placeholder="配方标识提示" value={discoveryForm.key_hint} onChange={event => setDiscoveryForm(prev => ({ ...prev, key_hint: event.target.value }))} />
              </Field>
              <div className="flex items-end">
                <Button onClick={() => void startDiscovery()} disabled={isDiscoverySubmitting || !selectedShopId}>
                  <Play className="mr-2 h-4 w-4" />
                  发起发现
                </Button>
              </div>
            </div>
            {discoveryRunId && <div className="font-mono text-xs text-muted-foreground">发现运行 ID: {discoveryRunId}</div>}
            <EventList events={discoveryEvents} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>采集配方</CardTitle>
            <Button variant="outline" size="sm" onClick={() => void refreshRecipeOptions()} disabled={isOptionsLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isOptionsLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto_auto_auto]">
              <Field label="采集配方">
                <Select
                  value={selectedRecipeId || undefined}
                  onValueChange={setSelectedRecipeId}
                  disabled={isOptionsLoading || recipes.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isOptionsLoading ? '加载采集配方中...' : '选择采集配方'} />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.length === 0 ? (
                      <SelectItem value="empty-recipes" disabled>
                        {isOptionsLoading ? '加载采集配方中...' : '暂无采集配方'}
                      </SelectItem>
                    ) : recipes.map(recipe => (
                      <SelectItem key={recipe.id} value={String(recipe.id)}>
                        {recipeLabel(recipe)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="版本">
                <Input placeholder="版本" value={selectedRecipe ? String(selectedRecipe.version) : ''} readOnly />
              </Field>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => void markStable()} disabled={isRecipeSubmitting || !selectedRecipe || selectedRecipe.status !== 'active' || selectedRecipe.stability === 'stable' || Boolean(selectedRecipe.validation_error)}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  标记稳定版
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => void bindSelectedRecipeToRule()} disabled={isRuleBindingSubmitting || !selectedRule || !selectedRecipe || !isRecipeStableUsable(selectedRecipe) || isSelectedRecipeBoundToRule}>
                  <Link2 className="mr-2 h-4 w-4" />
                  {isSelectedRecipeBoundToRule ? '已绑定' : '绑定规则'}
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={() => void exportRecipe()} disabled={isRecipeSubmitting || !selectedRecipe}>
                  <Download className="mr-2 h-4 w-4" />
                  导出
                </Button>
              </div>
              <div className="flex items-end">
                <Button variant="outline" asChild disabled={isRecipeSubmitting}>
                  <label aria-disabled={isRecipeSubmitting}>
                    <FileUp className="mr-2 h-4 w-4" />
                    导入
                    <input type="file" accept=".agent-recipe.json" className="hidden" disabled={isRecipeSubmitting} onChange={event => void importRecipe(event)} />
                  </label>
                </Button>
              </div>
            </div>
            {selectedRecipe && (
              <p className={`text-sm ${isRecipeStableUsable(selectedRecipe) ? 'text-muted-foreground' : 'text-destructive'}`}>
                {recipeAvailabilityMessage(selectedRecipe)}
              </p>
            )}
            <Textarea value={recipeExport} onChange={event => setRecipeExport(event.target.value)} rows={8} className="font-mono text-xs" placeholder="导出 JSON" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>采集结果</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchResults()} disabled={isResultsLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isResultsLoading ? 'animate-spin' : ''}`} />
                查询
              </Button>
              <Button variant="outline" size="sm" onClick={downloadResults}>
                <Download className="mr-2 h-4 w-4" />
                下载 CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Input placeholder="命名空间" value={resultsFilter.namespace} onChange={event => setResultsFilter(prev => ({ ...prev, namespace: event.target.value }))} />
              <Input placeholder="资源标识" value={resultsFilter.resource_key} onChange={event => setResultsFilter(prev => ({ ...prev, resource_key: event.target.value }))} />
              <Input type="date" value={resultsFilter.date_from} onChange={event => setResultsFilter(prev => ({ ...prev, date_from: event.target.value }))} />
              <Input type="date" value={resultsFilter.date_to} onChange={event => setResultsFilter(prev => ({ ...prev, date_to: event.target.value }))} />
              <Input placeholder="页码" value={resultsFilter.page} onChange={event => setResultsFilter(prev => ({ ...prev, page: event.target.value }))} />
              <Input placeholder="每页数量" value={resultsFilter.size} onChange={event => setResultsFilter(prev => ({ ...prev, size: event.target.value }))} />
            </div>

            <div className="overflow-auto rounded-md border">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>命名空间</TableHead>
                    <TableHead>资源</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>配方</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>错误</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isResultsLoading ? '加载中...' : `暂无结果，共 ${resultsTotal} 条`}
                      </TableCell>
                    </TableRow>
                  ) : results.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell className="font-mono text-xs">{item.namespace}</TableCell>
                      <TableCell className="font-mono text-xs">{item.resource_key}</TableCell>
                      <TableCell>{item.resource_date}</TableCell>
                      <TableCell className="font-mono text-xs">{item.recipe_id}</TableCell>
                      <TableCell><Badge variant={eventVariant(String(item.status))}>{statusLabel(String(item.status))}</Badge></TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-red-500">{item.error_message || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void openResult(item.id)}>
                          详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {selectedResult && (
              <Textarea
                value={formatJson(selectedResult)}
                readOnly
                rows={12}
                className="font-mono text-xs"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </SecondaryPageLayout>
  );
}
