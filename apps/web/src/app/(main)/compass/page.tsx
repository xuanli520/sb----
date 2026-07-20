'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Responsive,
  noCompactor,
  useContainerWidth,
  type Layout as RglLayout,
  type ResponsiveLayouts as RglResponsiveLayouts,
} from 'react-grid-layout';
import { LayoutDashboard, Sun, Moon, LayoutTemplate } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import ShopCard from '@/components/compass/ShopCard';
import LayoutCustomizer from '@/components/dashboard/LayoutCustomizer';
import { Button } from '@/app/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { useThemeStore } from '@/stores/themeStore';
import { ShopListItem, ShopScoreResponse, shopDashboardApi } from '@/features/shop-dashboard/services';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type CompassStatus = 'live' | 'offline' | 'warning' | 'critical';

type ShopSlot = {
  slotId: string;
  backendId: string;
  card: ReturnType<typeof mapShopCardData>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_BREAKPOINTS: Record<GridBreakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0,
};

const GRID_COLS: Record<GridBreakpoint, number> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2,
};

const GRID_ORDER: GridBreakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];

const PRESET_OPTIONS = ['2', '3', '4'] as const;
type PresetOption = (typeof PRESET_OPTIONS)[number];

const DEFAULT_PRESET: PresetOption = '3';

const LAYOUT_STORAGE_KEY = 'compass-layouts';
const VISIBILITY_STORAGE_KEY = 'compass-visibility';
const PRESET_STORAGE_KEY = 'compass-preset';

const SHOPS_PAGE_SIZE = 100;
const CARD_HEIGHT = 8;
const CARD_MIN_HEIGHT = 6;
const COMPACT_CARD_HEIGHT = 4;
const COMPACT_CARD_MIN_HEIGHT = 4;
const ROW_HEIGHT = 60;

const PRESET_DENSITY: Record<PresetOption, Record<GridBreakpoint, number>> = {
  '2': { lg: 2, md: 2, sm: 1, xs: 1, xxs: 1 },
  '3': { lg: 3, md: 2, sm: 1, xs: 1, xxs: 1 },
  '4': { lg: 4, md: 2, sm: 2, xs: 1, xxs: 1 },
};

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

function createSlotIds(shops: readonly ShopListItem[]): string[] {
  const used = new Map<string, number>();

  return shops.map((shop, index) => {
    const raw = shop.shop_id ?? shop.id;
    const normalized = String(raw ?? '').trim();
    const base =
      normalized && normalized.toLowerCase() !== 'undefined' && normalized.toLowerCase() !== 'null'
        ? normalized
        : `idx-${index + 1}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

function cloneLayouts(layouts: GridLayouts): GridLayouts {
  return JSON.parse(JSON.stringify(layouts)) as GridLayouts;
}

function isValidPreset(value: string | null | undefined): value is PresetOption {
  return !!value && PRESET_OPTIONS.includes(value as PresetOption);
}

function serializeLayouts(layouts: GridLayouts): string {
  return JSON.stringify(layouts);
}

function resolveCardHeights(preset: string): { cardHeight: number; cardMinHeight: number } {
  if (preset === '4') {
    return {
      cardHeight: COMPACT_CARD_HEIGHT,
      cardMinHeight: COMPACT_CARD_MIN_HEIGHT,
    };
  }
  return {
    cardHeight: CARD_HEIGHT,
    cardMinHeight: CARD_MIN_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// Layout builders
// ---------------------------------------------------------------------------

function buildPresetLayout(
  bp: GridBreakpoint,
  preset: PresetOption,
  slotIds: readonly string[],
): GridItemLayout[] {
  if (slotIds.length === 0) return [];

  const cols = GRID_COLS[bp];
  const density = PRESET_DENSITY[preset][bp];
  const columnCount = Math.max(1, Math.min(cols, density));
  const { cardHeight, cardMinHeight } = resolveCardHeights(preset);

  return slotIds.map((slotId, index) => {
    const row = Math.floor(index / columnCount);
    const col = index % columnCount;
    const x = Math.floor((col * cols) / columnCount);
    const nextX = Math.floor(((col + 1) * cols) / columnCount);
    const w = Math.max(1, nextX - x);

    return {
      i: slotId,
      x,
      y: row * cardHeight,
      w,
      h: cardHeight,
      minW: Math.max(1, Math.floor(cols / columnCount)),
      minH: cardMinHeight,
    };
  });
}

function getPresetLayouts(preset: string, slotIds: readonly string[]): GridLayouts {
  const p = isValidPreset(preset) ? preset : DEFAULT_PRESET;
  return cloneLayouts(
    GRID_ORDER.reduce<GridLayouts>((acc, bp) => {
      acc[bp] = buildPresetLayout(bp, p, slotIds);
      return acc;
    }, {}),
  );
}

/**
 * Normalise an arbitrary layouts object so every bp contains exactly the items
 * in `slotIds`, with positions clamped to valid grid bounds.
 *
 * Priority per item: source > current > preset-fallback
 */
function normalizeLayouts(
  rawLayouts: unknown,
  preset: string,
  slotIds: readonly string[],
  currentLayouts?: GridLayouts,
): GridLayouts {
  const source = (rawLayouts && typeof rawLayouts === 'object' ? rawLayouts : {}) as GridLayouts;
  const presetLayouts = getPresetLayouts(preset, slotIds);
  const result: GridLayouts = {};

  GRID_ORDER.forEach((bp) => {
    const cols = GRID_COLS[bp];
    const { cardHeight, cardMinHeight } = resolveCardHeights(preset);
    const sourceMap = new Map((source[bp] ?? []).map((it) => [it.i, it]));
    const currentMap = new Map((currentLayouts?.[bp] ?? []).map((it) => [it.i, it]));
    const fallbackList = presetLayouts[bp] ?? [];
    const fallbackMap = new Map(fallbackList.map((it) => [it.i, it]));

    result[bp] = slotIds.map((id, idx) => {
      const fb = fallbackMap.get(id) ?? fallbackList[idx];

      if (!fb) {
        return { i: id, x: 0, y: idx * cardHeight, w: cols, h: cardHeight, minW: 1, minH: cardMinHeight };
      }

      const candidate = sourceMap.get(id) ?? currentMap.get(id) ?? fb;
      const minW = Math.min(cols, Math.max(1, fb.minW ?? Math.min(3, fb.w)));
      const minH = Math.max(4, fb.minH ?? cardMinHeight);
      const w = clampNumber(candidate.w, minW, cols, fb.w);
      const h = clampNumber(candidate.h, minH, 40, fb.h);
      const x = clampNumber(candidate.x, 0, Math.max(0, cols - w), fb.x);
      const y = clampNumber(candidate.y, 0, 2000, fb.y);

      return { i: id, x, y, w, h, minW, minH };
    });
  });

  return result;
}

function filterLayoutsBySlotIds(layouts: GridLayouts, slotIds: readonly string[]): GridLayouts {
  const set = new Set(slotIds);
  return GRID_ORDER.reduce<GridLayouts>((acc, bp) => {
    acc[bp] = (layouts[bp] ?? []).filter((it) => set.has(it.i));
    return acc;
  }, {});
}

/**
 * Merge a patch (visible-only layouts) back into a full layouts object,
 * keeping hidden items untouched.
 */
function mergeLayouts(base: GridLayouts, patch: GridLayouts): GridLayouts {
  return GRID_ORDER.reduce<GridLayouts>((acc, bp) => {
    const patchMap = new Map((patch[bp] ?? []).map((it) => [it.i, it]));
    const baseList = base[bp] ?? [];
    const merged = baseList.map((it) => patchMap.get(it.i) ?? it);

    // Append any items in patch that don't exist in base (safety net)
    (patch[bp] ?? []).forEach((it) => {
      if (!baseList.some((b) => b.i === it.i)) merged.push(it);
    });

    acc[bp] = merged;
    return acc;
  }, {});
}

function detectPresetByLayouts(layouts: GridLayouts): PresetOption {
  const w = layouts.lg?.[0]?.w ?? 4;
  if (w >= 6) return '2';
  if (w <= 3) return '4';
  return '3';
}

// ---------------------------------------------------------------------------
// Data mappers
// ---------------------------------------------------------------------------

function formatScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function createFallbackTrend(score: number): number[] {
  return Array.from({ length: 7 }, (_, i) =>
    formatScore(Math.max(0, Math.min(100, score - (6 - i) * 0.8))),
  );
}

function resolveShopStatus(
  rawStatus: string | undefined,
  score: number,
  riskDeduct: number,
): CompassStatus {
  if (rawStatus === 'paused' || rawStatus === 'inactive') return 'offline';
  if (riskDeduct >= 20 || score < 60) return 'critical';
  if (riskDeduct > 0 || score < 75) return 'warning';
  return 'live';
}

function mapShopCardData(slotId: string, shop: ShopListItem, scoreData?: ShopScoreResponse) {
  const dims = new Map(
    (scoreData?.dimensions ?? []).map((d) => [d.dimension, formatScore(d.score)]),
  );
  const overall = formatScore(scoreData?.overall_score ?? shop.score ?? 0);
  const riskDeduct = formatScore(Math.max(0, 100 - (dims.get('risk') ?? 100)));
  const rawTrend = scoreData?.trend
    ?.map((p) => formatScore(p.value))
    .filter((v) => Number.isFinite(v));

  return {
    id: slotId,
    name: shop.name,
    score: overall,
    status: resolveShopStatus(shop.status, overall, riskDeduct),
    risk: riskDeduct,
    trend: rawTrend?.length ? rawTrend : createFallbackTrend(overall),
    serviceScore: formatScore(dims.get('service') ?? overall),
    productScore: formatScore(dims.get('product') ?? overall),
    logisticsScore: formatScore(dims.get('logistics') ?? overall),
    comprehensiveScore: overall,
  };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const GlassPanel = ({
  children,
  className = '',
  noBorder = false,
}: {
  children: React.ReactNode;
  className?: string;
  noBorder?: boolean;
}) => (
  <div
    className={`
      glass-panel relative overflow-hidden transition-all duration-300
      bg-white/40 dark:bg-[#0f172a]/20 backdrop-blur-xl
      ${!noBorder ? 'rounded-2xl border border-white/20 dark:border-white/5 shadow-sm dark:shadow-none' : ''}
      ${className}
    `}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CompassPage() {
  const router = useRouter();
  const { appTheme, colorMode, setColorMode } = useThemeStore();

  // ── Grid measurement ─────────────────────────────────────────────────────
  // FIX: measureBeforeMount gives us a real width on first paint in Next.js.
  const {
    width: gridWidth,
    containerRef,
    mounted: isGridMeasured,
    measureWidth,
  } = useContainerWidth({ measureBeforeMount: true, initialWidth: 1280 });

  // ── Single "ready" gate (replaces the old 3-layer mounted/gridReady/isGridMeasured race) ──
  // We only block rendering until the container has a real width. We do NOT
  // add a separate requestAnimationFrame delay – that was causing layout
  // calculations to run before the width was stable, causing the blank-page bug.
  const resolvedGridWidth = gridWidth > 0 ? gridWidth : 1280;
  const ready = resolvedGridWidth > 0;

  // ── Component state ───────────────────────────────────────────────────────
  const [clientReady, setClientReady] = useState(false); // hydration guard
  const [isEditing, setIsEditing] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<PresetOption>(DEFAULT_PRESET);
  const [layouts, setLayouts] = useState<GridLayouts>(() => getPresetLayouts(DEFAULT_PRESET, []));
  // FIX: start as undefined so we can distinguish "not loaded yet" from "all hidden"
  const [visibleShops, setVisibleShops] = useState<Record<string, boolean> | undefined>(undefined);

  // Refs to avoid stale closures without triggering extra renders
  const latestLayoutsRef = useRef<GridLayouts>(layouts);
  const layoutSignatureRef = useRef<string>(serializeLayouts(layouts));
  // FIX: track which slotIds the layouts were last built for, so we can force
  // a rebuild when the shop list changes even if the serialization looks identical.
  const lastSlotIdsRef = useRef<string>('');

  // ── Data fetching ─────────────────────────────────────────────────────────
  const dateRange = '1d';

  const shopsQuery = useQuery({
    queryKey: ['shop-dashboard', 'compass', 'shops', dateRange],
    queryFn: () => shopDashboardApi.listShops({ page: 1, size: SHOPS_PAGE_SIZE, date_range: dateRange }),
    staleTime: 60_000,
  });

  const shops = useMemo(() => shopsQuery.data?.items ?? [], [shopsQuery.data]);
  const slotIds = useMemo(() => createSlotIds(shops), [shops]);
  const slotIdsKey = slotIds.join(','); // stable string for comparison

  const scoreQueries = useQueries({
    queries: shops.map((shop) => ({
      queryKey: ['shop-dashboard', 'compass', 'shop-score', shop.shop_id ?? shop.id, dateRange],
      queryFn: () => shopDashboardApi.getShopScore(shop.shop_id ?? shop.id, dateRange),
      staleTime: 60_000,
    })),
  });

  // ── Derived shop data ─────────────────────────────────────────────────────
  const shopSlots = useMemo<ShopSlot[]>(() => {
    return shops.map((shop, i) => ({
      slotId: slotIds[i] ?? String(shop.shop_id ?? shop.id ?? i + 1),
      backendId: String(shop.shop_id ?? shop.id),
      card: mapShopCardData(
        slotIds[i] ?? String(shop.shop_id ?? shop.id ?? i + 1),
        shop,
        scoreQueries[i]?.data,
      ),
    }));
  }, [shops, scoreQueries, slotIds]);

  // FIX: only apply saved visibility when it's been loaded from localStorage.
  // While undefined (pre-hydration), treat all shops as visible to avoid the
  // "all shops hidden" flash that caused the blank grid.
  const activeShops = useMemo(() => {
    if (visibleShops === undefined) return shopSlots;
    return shopSlots.filter((s) => visibleShops[s.slotId] !== false);
  }, [shopSlots, visibleShops]);

  const visibleSlotIds = useMemo(() => activeShops.map((s) => s.slotId), [activeShops]);

  // ── Visible layouts (what RGL actually sees) ──────────────────────────────
  const visibleLayouts = useMemo(() => {
    const normalized = normalizeLayouts(layouts, currentPreset, visibleSlotIds, layouts);
    return filterLayoutsBySlotIds(normalized, visibleSlotIds);
  }, [layouts, currentPreset, visibleSlotIds]);

  // ── Hydration: load persisted state from localStorage (runs once) ─────────
  useEffect(() => {
    const savedPreset = localStorage.getItem(PRESET_STORAGE_KEY);
    let preset: PresetOption = isValidPreset(savedPreset) ? savedPreset : DEFAULT_PRESET;

    let nextLayouts: GridLayouts;
    const savedLayouts = localStorage.getItem(LAYOUT_STORAGE_KEY);

    if (savedLayouts) {
      try {
        const parsed = JSON.parse(savedLayouts) as GridLayouts;
        if (!isValidPreset(savedPreset)) preset = detectPresetByLayouts(parsed);
        // Normalize with empty slotIds – will be re-expanded when shops load
        nextLayouts = normalizeLayouts(parsed, preset, [], undefined);
      } catch {
        nextLayouts = getPresetLayouts(preset, []);
      }
    } else {
      nextLayouts = getPresetLayouts(preset, []);
    }

    // FIX: Load visibility and sanitize – we keep it as-is but apply it only
    // after slotIds are known (see the slotIds sync effect below).
    const savedVisibility = localStorage.getItem(VISIBILITY_STORAGE_KEY);
    let parsedVisibility: Record<string, boolean> | undefined;
    if (savedVisibility) {
      try {
        const v = JSON.parse(savedVisibility);
        if (v && typeof v === 'object') parsedVisibility = v as Record<string, boolean>;
      } catch { /* ignore */ }
    }

    setCurrentPreset(preset);
    setLayouts(nextLayouts);
    setVisibleShops(parsedVisibility ?? {}); // empty object = all shops visible
    latestLayoutsRef.current = nextLayouts;
    layoutSignatureRef.current = serializeLayouts(nextLayouts);
    setClientReady(true);
  }, []);

  // ── Sync layouts whenever the shop list changes ───────────────────────────
  // FIX: This replaces the old signature-based guard that incorrectly blocked
  // updates when shops loaded for the first time. We now compare slotIds
  // directly, which is the actual trigger for a layout rebuild.
  useEffect(() => {
    if (!clientReady || slotIds.length === 0) return;
    if (slotIdsKey === lastSlotIdsRef.current) return; // No change in shop list

    lastSlotIdsRef.current = slotIdsKey;

    const normalized = normalizeLayouts(
      latestLayoutsRef.current,
      currentPreset,
      slotIds,
      latestLayoutsRef.current,
    );

    latestLayoutsRef.current = normalized;
    layoutSignatureRef.current = serializeLayouts(normalized);
    setLayouts(normalized);
  }, [clientReady, slotIdsKey, currentPreset, slotIds]);

  useEffect(() => {
    if (!clientReady || visibleShops === undefined || slotIds.length === 0) return;
    if (Object.keys(visibleShops).length === 0) return;

    const hasCurrentSlotKey = slotIds.some((id) => Object.prototype.hasOwnProperty.call(visibleShops, id));
    if (hasCurrentSlotKey) return;

    setVisibleShops({});
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify({}));
  }, [clientReady, visibleShops, slotIds, slotIdsKey]);

  useEffect(() => {
    if (!clientReady) return;
    measureWidth();
    const raf = requestAnimationFrame(() => measureWidth());
    return () => cancelAnimationFrame(raf);
  }, [clientReady, measureWidth, slotIdsKey, isGridMeasured]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const persistLayouts = useCallback((next: GridLayouts) => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayouts(next));
  }, []);

  // FIX: onLayoutChange now receives ALL layouts (visible + hidden merged),
  // preventing hidden items from losing their positions on drag/resize.
  const onLayoutChange = useCallback(
    (_currentLayout: RglLayout, allLayouts: RglResponsiveLayouts<GridBreakpoint>) => {
      const normalizedPatch = normalizeLayouts(
        allLayouts as unknown as GridLayouts,
        currentPreset,
        visibleSlotIds,
        latestLayoutsRef.current,
      );
      const merged = normalizeLayouts(
        mergeLayouts(latestLayoutsRef.current, normalizedPatch),
        currentPreset,
        slotIds,
        latestLayoutsRef.current,
      );

      const sig = serializeLayouts(merged);
      if (sig === layoutSignatureRef.current) return;

      layoutSignatureRef.current = sig;
      latestLayoutsRef.current = merged;
      setLayouts(merged);
    },
    [currentPreset, visibleSlotIds, slotIds],
  );

  const commitLayoutChanges = useCallback(() => {
    if (!isEditing) return;
    persistLayouts(latestLayoutsRef.current);
  }, [isEditing, persistLayouts]);

  const handlePresetChange = useCallback(
    (value: string) => {
      if (!isValidPreset(value)) return;

      const nextLayouts = normalizeLayouts(
        getPresetLayouts(value, slotIds),
        value,
        slotIds,
        latestLayoutsRef.current,
      );

      setCurrentPreset(value);
      setLayouts(nextLayouts);
      latestLayoutsRef.current = nextLayouts;
      layoutSignatureRef.current = serializeLayouts(nextLayouts);
      localStorage.setItem(PRESET_STORAGE_KEY, value);
      persistLayouts(nextLayouts);
    },
    [slotIds, persistLayouts],
  );

  const toggleShop = useCallback((id: string, visible: boolean) => {
    setVisibleShops((cur) => {
      const next = { ...(cur ?? {}), [id]: visible };
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const navigateToCompass = useCallback(
    (shopId: string) => {
      if (isEditing) return;
      router.push(`/dashboard?storeId=${shopId}`);
    },
    [isEditing, router],
  );

  // ── SSR hydration guard – render a placeholder until localStorage is read ──
  if (!clientReady) {
    return <div className="min-h-screen bg-canvas" />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-canvas text-text-primary font-sans overflow-hidden relative transition-colors duration-500">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full mb-4 pt-4 px-6">
        <GlassPanel className="w-full h-20 flex items-center justify-between px-6 shadow-lg backdrop-blur-2xl">
          {/* Left: preset selector */}
          <div className="flex items-center gap-6">
            <Select value={currentPreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-[140px] border-none bg-transparent hover:bg-surface/10 text-text-muted hover:text-text-primary focus:ring-0 transition-all rounded-lg h-9 text-xs font-medium shadow-none pl-2 flex gap-2">
                <LayoutTemplate size={14} />
                <SelectValue placeholder="布局" />
              </SelectTrigger>
              <SelectContent className="bg-surface/95 backdrop-blur-xl border-border/20 text-text-primary shadow-xl">
                <SelectItem value="2">宽屏模式</SelectItem>
                <SelectItem value="3">标准模式</SelectItem>
                <SelectItem value="4">紧凑模式</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right: customizer / edit / theme */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <LayoutCustomizer
                items={shopSlots.map((s) => ({
                  i: s.slotId,
                  title: s.card.name,
                  visible: visibleShops?.[s.slotId] !== false,
                }))}
                onToggle={toggleShop}
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (isEditing) commitLayoutChanges();
                  setIsEditing((v) => !v);
                }}
                className={`w-9 h-9 rounded-full transition-all relative ${
                  isEditing
                    ? 'bg-primary text-white shadow-[0_0_12px_theme(colors.primary)] hover:bg-primary/90'
                    : 'text-text-secondary hover:text-primary hover:bg-primary/10'
                }`}
                title={isEditing ? '完成编辑' : '调整布局'}
              >
                <LayoutDashboard size={16} />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setColorMode(appTheme === 'enterprise' || colorMode === 'dark' ? 'light' : 'dark')
                }
                className="w-9 h-9 text-text-secondary hover:text-secondary hover:bg-secondary/10 rounded-full"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
            </div>
          </div>
        </GlassPanel>
      </header>

      {/* Grid canvas */}
      <main className="px-6 pb-6 relative z-10 min-h-[calc(100vh-100px)] overflow-y-auto overflow-x-hidden sidebar-scrollbar">
        {shopsQuery.isLoading && (
          <div className="mb-3 text-sm text-text-muted">店铺数据加载中...</div>
        )}
        {shopsQuery.error instanceof Error && (
          <div className="mb-3 text-sm text-red-500">{shopsQuery.error.message}</div>
        )}

        {/* FIX: containerRef must be on a div that fills all available width.
            The parent no longer has overflow-hidden so RGL can measure correctly. */}
        <div ref={containerRef as React.RefObject<HTMLDivElement>} className="w-full min-w-0">
          {/* FIX: single gate – only block on width measurement, not on an
              additional rAF-delayed gridReady flag. */}
          {ready ? (
            shops.length > 0 ? (
              activeShops.length > 0 ? (
                <Responsive
                  className={`layout${isEditing ? ' is-edit-mode' : ''}`}
                  width={resolvedGridWidth}
                  layouts={visibleLayouts}
                  breakpoints={GRID_BREAKPOINTS}
                  cols={GRID_COLS}
                  rowHeight={ROW_HEIGHT}
                  dragConfig={{ enabled: isEditing, handle: '.drag-handle' }}
                  resizeConfig={{ enabled: isEditing }}
                  onLayoutChange={onLayoutChange}
                  onDragStop={commitLayoutChanges}
                  onResizeStop={commitLayoutChanges}
                  margin={[24, 24]}
                  containerPadding={[0, 0]}
                  compactor={noCompactor}
                >
                  {activeShops.map((slot) => (
                    // FIX: key must match layout item's `i` exactly. Wrapping div
                    // must fill the cell; ShopCard receives h-full/w-full.
                    <div key={slot.slotId} className={isEditing ? 'z-20' : 'z-auto'}>
                      <ShopCard
                        shop={slot.card}
                        isEditing={isEditing}
                        onClick={() => navigateToCompass(slot.backendId)}
                        className="h-full w-full"
                      />
                    </div>
                  ))}
                </Responsive>
              ) : (
                <EmptyState
                  title="当前没有可见卡片"
                  description="你可能在布局设置里隐藏了所有店铺，请点击右上角的布局定制按钮重新显示。"
                />
              )
            ) : (
              !shopsQuery.isLoading && !(shopsQuery.error instanceof Error) && (
                <EmptyState title="暂无店铺数据" description="当前接口没有返回可展示的店铺列表。" />
              )
            )
          ) : (
            // Placeholder that preserves layout height while width is measured
            <div className="min-h-[calc(100vh-220px)]" />
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-[calc(100vh-220px)] flex items-center justify-center">
      <div className="glass-panel relative overflow-hidden transition-all duration-300 bg-white/40 dark:bg-[#0f172a]/20 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-white/5 shadow-sm dark:shadow-none px-6 py-8 text-center max-w-md">
        <div className="text-base font-medium text-text-primary">{title}</div>
        <div className="text-sm text-text-muted mt-2">{description}</div>
      </div>
    </div>
  );
}
