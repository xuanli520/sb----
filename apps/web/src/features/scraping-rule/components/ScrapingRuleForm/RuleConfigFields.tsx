import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CalendarDays, RefreshCw, SlidersHorizontal, Store } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { cn } from '@/app/components/ui/utils';
import { dataSourceApi } from '@/features/data-source/services/dataSourceApi';
import { agentApi } from '@/features/agent/services/agentApi';
import type { AgentRecipeListItem } from '@/features/agent/services/types';
import type { ShopDashboardShopCatalog } from '@/types';
import {
  RuleConfigFormValues,
  RuleShopScope,
  dataLatencyOptions,
  granularityOptions,
  incrementalModeOptions,
  validateOptionalNonNegativeIntegerText,
  validateOptionalPositiveIntegerText,
} from './BaseForm';

const EMPTY_SELECT_VALUE = '__EMPTY__';

const shopScopeOptions: Array<{ value: RuleShopScope; label: string }> = [
  { value: 'all', label: '全部店铺' },
  { value: 'single', label: '单店' },
  { value: 'multiple', label: '多店' },
];

interface RuleConfigFieldsProps {
  form: UseFormReturn<RuleConfigFormValues>;
  dataSourceId?: number | null;
}

function toOptionalSelectValue(value: string) {
  return value || EMPTY_SELECT_VALUE;
}

function fromOptionalSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? '' : value;
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function recipeValue(recipe: Pick<AgentRecipeListItem, 'namespace' | 'key' | 'version'>): string {
  return `${recipe.namespace}::${recipe.key}::${recipe.version}`;
}

function recipeLabel(recipe: Pick<AgentRecipeListItem, 'namespace' | 'key' | 'version'>) {
  return `${recipe.namespace}/${recipe.key} v${recipe.version}`;
}

function recipeMatches(
  recipe: Pick<AgentRecipeListItem, 'namespace' | 'key' | 'version'>,
  current: { namespace: string; key: string; version: string },
) {
  const currentVersion = Number(current.version);
  const hasCurrentVersion = Number.isInteger(currentVersion) && currentVersion > 0;
  return (
    recipe.namespace === current.namespace &&
    recipe.key === current.key &&
    hasCurrentVersion &&
    recipe.version === currentVersion
  );
}

function buildRecipeOptions(
  recipes: AgentRecipeListItem[],
  current: { namespace: string; key: string; version: string },
  needsStableRecipe: boolean,
): Array<{
  value: string;
  namespace: string;
  key: string;
  version: number;
  label: string;
  status?: string;
  stability?: string;
  validationError?: string | null;
  disabled?: boolean;
}> {
  const options = recipes.filter(recipe => (
    recipe.status === 'active' &&
    !recipe.validation_error &&
    (!needsStableRecipe || recipe.stability === 'stable')
  )).map(recipe => ({
    value: recipeValue(recipe),
    namespace: recipe.namespace,
    key: recipe.key,
    version: recipe.version,
    label: recipeLabel(recipe),
    status: recipe.status,
    stability: recipe.stability,
    validationError: recipe.validation_error,
    disabled: false,
  }));

  if (!current.namespace || !current.key) {
    return options;
  }

  const matched = options.some(option => recipeMatches(option, current));
  if (matched) {
    return options;
  }

  const currentRecipe = recipes.find(recipe => recipeMatches(recipe, current));
  const currentVersion = Number(current.version);
  return [
    {
      value: currentRecipe ? recipeValue(currentRecipe) : `${current.namespace}::${current.key}::${current.version || 'current'}`,
      namespace: currentRecipe?.namespace || current.namespace,
      key: currentRecipe?.key || current.key,
      version: currentRecipe?.version || (Number.isInteger(currentVersion) && currentVersion > 0 ? currentVersion : 0),
      label: currentRecipe ? recipeLabel(currentRecipe) : `${current.namespace}/${current.key}${current.version ? ` v${current.version}` : ''}`,
      status: currentRecipe?.status || 'missing',
      stability: currentRecipe?.stability || 'missing',
      validationError: currentRecipe?.validation_error,
      disabled: true,
    },
    ...options,
  ];
}

function sectionTitle(icon: React.ReactNode, title: string, right?: React.ReactNode) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{title}</span>
      </div>
      {right}
    </div>
  );
}

export function RuleConfigFields({ form, dataSourceId }: RuleConfigFieldsProps) {
  const [catalog, setCatalog] = useState<ShopDashboardShopCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [recipes, setRecipes] = useState<AgentRecipeListItem[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState('');

  const shopScope = form.watch('shop_scope');
  const selectedShopIds = form.watch('shop_ids') || [];
  const singleShopId = form.watch('single_shop_id') || '';
  const timeRangeEnabled = form.watch('time_range_enabled');
  const rateLimitEnabled = form.watch('rate_limit_enabled');
  const agentRecipeEnabled = form.watch('agent_recipe_enabled');
  const agentRecipeNamespace = form.watch('agent_recipe_namespace') || '';
  const agentRecipeKey = form.watch('agent_recipe_key') || '';
  const agentRecipeVersion = form.watch('agent_recipe_version') || '';
  const agentRecipeStability = form.watch('agent_recipe_stability') || '';

  useEffect(() => {
    let ignore = false;

    async function loadCatalog() {
      if (!dataSourceId) {
        setCatalog(null);
        setCatalogError('');
        setCatalogLoading(false);
        return;
      }
      setCatalogLoading(true);
      setCatalogError('');
      try {
        const nextCatalog = await dataSourceApi.getShopDashboardShopCatalog(dataSourceId);
        if (!ignore) {
          setCatalog(nextCatalog);
        }
      } catch (error) {
        if (!ignore) {
          setCatalog(null);
          setCatalogError(errorMessage(error, '店铺目录读取失败'));
        }
      } finally {
        if (!ignore) {
          setCatalogLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      ignore = true;
    };
  }, [dataSourceId]);

  const loadRecipes = useCallback(async (isStale?: () => boolean) => {
    setRecipesLoading(true);
    setRecipesError('');
    try {
      const response = await agentApi.listRecipes();
      if (!isStale?.()) {
        setRecipes(response.items);
      }
    } catch (error) {
      if (!isStale?.()) {
        setRecipes([]);
        setRecipesError(errorMessage(error, 'Recipe 读取失败'));
      }
    } finally {
      if (!isStale?.()) {
        setRecipesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    void loadRecipes(() => ignore);

    return () => {
      ignore = true;
    };
  }, [loadRecipes]);

  const needsStableRecipe = shopScope !== 'single';
  const stableRecipes = useMemo(
    () => recipes.filter(recipe => recipe.status === 'active' && recipe.stability === 'stable' && !recipe.validation_error),
    [recipes],
  );
  const recipeOptions = useMemo(
    () => buildRecipeOptions(
      recipes,
      {
        namespace: agentRecipeNamespace,
        key: agentRecipeKey,
        version: agentRecipeVersion,
      },
      needsStableRecipe,
    ),
    [agentRecipeKey, agentRecipeNamespace, agentRecipeVersion, needsStableRecipe, recipes],
  );
  const selectedRecipeValue = useMemo(() => {
    if (!agentRecipeNamespace || !agentRecipeKey) {
      return EMPTY_SELECT_VALUE;
    }
    const currentVersion = Number(agentRecipeVersion);
    const hasCurrentVersion = Number.isInteger(currentVersion) && currentVersion > 0;
    const matched = recipeOptions.find(option => (
      option.namespace === agentRecipeNamespace &&
      option.key === agentRecipeKey &&
      hasCurrentVersion &&
      option.version === currentVersion
    ));
    const unavailable = recipeOptions.find(option => (
      option.disabled &&
      option.namespace === agentRecipeNamespace &&
      option.key === agentRecipeKey
    ));
    return matched?.value || unavailable?.value || EMPTY_SELECT_VALUE;
  }, [agentRecipeKey, agentRecipeNamespace, agentRecipeVersion, recipeOptions]);
  const stableRecipeAvailable = stableRecipes.length > 0;
  const selectedRecipe = recipeOptions.find(option => option.value === selectedRecipeValue);
  const selectedRecipeUnavailable = selectedRecipe?.disabled === true;

  useEffect(() => {
    const nextStability = selectedRecipe?.disabled ? 'unavailable' : selectedRecipe?.stability || '';
    if (agentRecipeStability !== nextStability) {
      form.setValue('agent_recipe_stability', nextStability, { shouldDirty: false, shouldValidate: true });
    }
  }, [agentRecipeStability, form, selectedRecipe]);

  useEffect(() => {
    if (!needsStableRecipe || form.getValues('agent_recipe_enabled')) {
      return;
    }
    const recipe = stableRecipes[0];
    if (!recipe) {
      return;
    }
    form.setValue('agent_recipe_enabled', true, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_namespace', recipe.namespace, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_key', recipe.key, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_version', String(recipe.version), { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_stability', recipe.stability, { shouldDirty: true, shouldValidate: true });
  }, [form, needsStableRecipe, stableRecipes]);

  const catalogShopIds = catalog?.shop_ids || [];
  const visibleShopIds = uniqueItems([...catalogShopIds, singleShopId, ...selectedShopIds]);
  const hasVisibleShopIds = visibleShopIds.length > 0;
  const catalogStatus = !dataSourceId
    ? '未选择数据源'
    : catalogLoading
      ? '读取店铺中'
      : catalog
        ? `${catalog.shop_ids.length} 个店铺`
        : '暂无目录';

  useEffect(() => {
    if (!catalogLoading && shopScope !== 'all' && !hasVisibleShopIds) {
      form.setValue('shop_scope', 'all', { shouldDirty: true, shouldValidate: true });
    }
  }, [catalogLoading, form, hasVisibleShopIds, shopScope]);

  async function refreshCatalog() {
    if (!dataSourceId) {
      return;
    }
    setCatalogLoading(true);
    setCatalogError('');
    try {
      setCatalog(await dataSourceApi.getShopDashboardShopCatalog(dataSourceId, { forceRefresh: true }));
    } catch (error) {
      setCatalog(null);
      setCatalogError(errorMessage(error, '店铺目录刷新失败'));
    } finally {
      setCatalogLoading(false);
    }
  }

  function updateShopScope(scope: RuleShopScope) {
    if (scope !== 'all' && !hasVisibleShopIds) {
      return;
    }
    form.setValue('shop_scope', scope, { shouldDirty: true, shouldValidate: true });
    if (scope === 'single' && !form.getValues('single_shop_id')) {
      const firstShopId = (form.getValues('shop_ids') || [])[0] || catalogShopIds[0] || '';
      form.setValue('single_shop_id', firstShopId, { shouldDirty: true, shouldValidate: true });
    }
    if (scope === 'multiple' && (form.getValues('shop_ids') || []).length === 0) {
      const firstShopId = form.getValues('single_shop_id') || catalogShopIds[0] || '';
      form.setValue('shop_ids', firstShopId ? [firstShopId] : [], { shouldDirty: true, shouldValidate: true });
    }
  }

  function updateSingleShopId(shopId: string) {
    form.setValue('single_shop_id', shopId, { shouldDirty: true, shouldValidate: true });
    form.setValue('shop_ids', shopId ? [shopId] : [], { shouldDirty: true });
  }

  function toggleShopId(shopId: string, checked: boolean) {
    const nextShopIds = checked
      ? uniqueItems([...selectedShopIds, shopId])
      : selectedShopIds.filter(item => item !== shopId);
    form.setValue('shop_ids', nextShopIds, { shouldDirty: true, shouldValidate: true });
    if (nextShopIds.length > 0 && !form.getValues('single_shop_id')) {
      form.setValue('single_shop_id', nextShopIds[0], { shouldDirty: true });
    }
  }

  function selectRecipe(value: string) {
    if (value === EMPTY_SELECT_VALUE) {
      form.setValue('agent_recipe_enabled', false, { shouldDirty: true, shouldValidate: true });
      form.setValue('agent_recipe_namespace', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('agent_recipe_key', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('agent_recipe_version', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('agent_recipe_stability', '', { shouldDirty: true, shouldValidate: true });
      return;
    }
    const recipe = recipeOptions.find(option => option.value === value);
    if (!recipe || recipe.disabled) {
      return;
    }
    form.setValue('agent_recipe_enabled', true, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_namespace', recipe.namespace, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_key', recipe.key, { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_version', recipe.version > 0 ? String(recipe.version) : '', { shouldDirty: true, shouldValidate: true });
    form.setValue('agent_recipe_stability', recipe.stability || '', { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="space-y-5 rounded-lg border bg-muted/30 p-4">
      <h3 className="font-medium">规则配置</h3>

      <div className="space-y-4 rounded-md border bg-background p-4">
        {sectionTitle(
          <Store className="h-4 w-4 text-muted-foreground" />,
          '采集范围',
          <div className="flex items-center gap-2">
            <Badge variant={catalog && catalog.shop_ids.length > 0 ? 'secondary' : 'outline'}>
              {catalogStatus}
            </Badge>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={refreshCatalog}
              disabled={!dataSourceId || catalogLoading}
              aria-label="刷新店铺目录"
            >
              <RefreshCw className={cn('h-4 w-4', catalogLoading && 'animate-spin')} />
            </Button>
          </div>,
        )}

        <FormField
          control={form.control}
          name="shop_scope"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="grid grid-cols-3 gap-2">
                  {shopScopeOptions.map(option => (
                    <Button
                      key={option.value}
                      type="button"
                      disabled={catalogLoading || (option.value !== 'all' && !hasVisibleShopIds)}
                      variant={field.value === option.value ? 'default' : 'outline'}
                      onClick={() => updateShopScope(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {catalogError && (
          <p className="text-sm text-destructive">{catalogError}</p>
        )}

        {shopScope === 'all' && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            已绑定店铺会在采集时自动解析；目录为空时请先刷新登录态。
          </div>
        )}

        {shopScope === 'single' && (
          <FormField
            control={form.control}
            name="single_shop_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>店铺</FormLabel>
                <Select
                  value={field.value || undefined}
                  onValueChange={updateSingleShopId}
                  disabled={catalogLoading || !hasVisibleShopIds}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={catalogLoading ? '读取店铺中...' : '选择店铺'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {visibleShopIds.map(shopId => (
                      <SelectItem key={shopId} value={shopId}>
                        {shopId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasVisibleShopIds && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    暂未解析到可选择的店铺；请刷新店铺目录，或先使用全部店铺运行时自动解析。
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {shopScope === 'multiple' && (
          <FormField
            control={form.control}
            name="shop_ids"
            render={() => (
              <FormItem>
                <FormLabel>店铺</FormLabel>
                {hasVisibleShopIds ? (
                  <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-2">
                    {visibleShopIds.map(shopId => (
                      <label key={shopId} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                        <Checkbox
                          checked={selectedShopIds.includes(shopId)}
                          onCheckedChange={checked => toggleShopId(shopId, checked === true)}
                        />
                        <span className="truncate font-mono">{shopId}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    暂未解析到店铺目录；可先使用全部店铺。
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="space-y-4 rounded-md border bg-background p-4">
        {sectionTitle(
          <Bot className="h-4 w-4 text-muted-foreground" />,
          'Agent Recipe',
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={recipesLoading}
            onClick={() => void loadRecipes()}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', recipesLoading && 'animate-spin')} />
            刷新
          </Button>,
        )}

        <FormField
          control={form.control}
          name="agent_recipe_enabled"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <FormLabel>启用 Recipe</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {agentRecipeEnabled && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <FormField
              control={form.control}
              name="agent_recipe_namespace"
              render={() => (
                <FormItem>
                  <FormLabel>Recipe</FormLabel>
                  <Select
                    value={selectedRecipeValue}
                    onValueChange={selectRecipe}
                    disabled={recipesLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={recipesLoading ? '读取 Recipe 中...' : '选择 Recipe'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
                      {recipeOptions.map(option => (
                        <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                          {option.label}
                          {option.status ? ` · ${option.status}` : ''}
                          {option.stability ? `/${option.stability}` : ''}
                          {option.validationError ? ' · invalid' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="agent_recipe_version"
              rules={{ validate: validateOptionalPositiveIntegerText }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>版本</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" min={1} step={1} type="number" placeholder="选择 Recipe 后自动带出" readOnly {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {recipesError && <p className="text-sm text-destructive">{recipesError}</p>}
        {needsStableRecipe && !stableRecipeAvailable && (
          <p className="text-sm text-amber-700">全店/多店采集需要 stable Recipe；请先在 Agent 工作台标记稳定版本。</p>
        )}
        {selectedRecipeUnavailable && (
          <p className="text-sm text-amber-700">当前规则引用的 Recipe 不可用，请重新选择 active{needsStableRecipe ? ' stable' : ''} 版本。</p>
        )}
        {selectedRecipe && selectedRecipe.stability !== 'stable' && needsStableRecipe && (
          <p className="text-sm text-amber-700">当前 Recipe 不是 stable，批量采集可能被后端拒绝。</p>
        )}
      </div>

      <div className="space-y-4 rounded-md border bg-background p-4">
        {sectionTitle(<CalendarDays className="h-4 w-4 text-muted-foreground" />, '采集窗口')}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="granularity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>粒度</FormLabel>
                <Select
                  onValueChange={value => field.onChange(fromOptionalSelectValue(value))}
                  value={toOptionalSelectValue(field.value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择粒度" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
                    {granularityOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>时区</FormLabel>
                <FormControl>
                  <Input placeholder="Asia/Shanghai" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="time_range_enabled"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <FormLabel>限定日期范围</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="time_range_start"
            render={({ field }) => (
              <FormItem>
                <FormLabel>开始日期</FormLabel>
                <FormControl>
                  <Input type="date" disabled={!timeRangeEnabled} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="time_range_end"
            render={({ field }) => (
              <FormItem>
                <FormLabel>结束日期</FormLabel>
                <FormControl>
                  <Input type="date" disabled={!timeRangeEnabled} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="incremental_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>增量模式</FormLabel>
                <Select
                  onValueChange={value => field.onChange(fromOptionalSelectValue(value))}
                  value={toOptionalSelectValue(field.value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择增量模式" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
                    {incrementalModeOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="backfill_last_n_days"
            rules={{ validate: validateOptionalNonNegativeIntegerText }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>补采最近 N 天</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" min={0} placeholder="7" step={1} type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-md border bg-background p-4">
        {sectionTitle(<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />, '输出与频率')}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="dimensions_text"
            render={({ field }) => (
              <FormItem>
                <FormLabel>维度</FormLabel>
                <FormControl>
                  <Input placeholder="date, shop_id" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="metrics_text"
            render={({ field }) => (
              <FormItem>
                <FormLabel>指标</FormLabel>
                <FormControl>
                  <Input placeholder="gmv, order_count" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="dedupe_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>去重键</FormLabel>
                <FormControl>
                  <Input placeholder="order_id" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="data_latency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>数据延迟</FormLabel>
                <Select
                  onValueChange={value => field.onChange(fromOptionalSelectValue(value))}
                  value={toOptionalSelectValue(field.value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="选择数据延迟" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>未设置</SelectItem>
                    {dataLatencyOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="top_n"
            rules={{ validate: validateOptionalNonNegativeIntegerText }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Top N</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" min={0} placeholder="100" step={1} type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sort_by"
            render={({ field }) => (
              <FormItem>
                <FormLabel>排序字段</FormLabel>
                <FormControl>
                  <Input placeholder="gmv" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="rate_limit_enabled"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <FormLabel>频率限制</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rate_limit_qps"
            rules={{ validate: validateOptionalNonNegativeIntegerText }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>QPS</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" min={0} placeholder="10" step={1} type="number" disabled={!rateLimitEnabled} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="include_long_tail"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <FormLabel>包含长尾</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="session_level"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <FormLabel>会话级别</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
