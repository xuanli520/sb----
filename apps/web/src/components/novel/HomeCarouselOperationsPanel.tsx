'use client';

import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  History,
  Images,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { BookCover } from '@/components/novel/BookCover';
import { InlineNotice, formatWordCount } from '@/components/novel/NovelShell';
import {
  type AdminHomeCarouselSlide,
  type HomeCarouselSlideAudit,
  type MediaAssetAudit,
  type MediaAssetBinding,
  type PlatformBannerAsset,
  type PlatformBannerAssetPage,
  novelApi,
} from '@/features/novel/api';

const assetStates = ['ACTIVE', 'ARCHIVED', 'PENDING_DELETE', 'DELETED'] as const;

type AssetState = typeof assetStates[number];
type Notice = { tone: 'success' | 'error'; message: string };
type SlideDraft = {
  bookId: string;
  bannerAssetId: string;
  headline: string;
  copy: string;
  enabled: boolean;
  rank: string;
};
type DeleteTarget =
  | { kind: 'slide'; id: number; version: number; label: string }
  | { kind: 'asset'; id: string; label: string };
type AuditEntry = { id: number; action: string; details: string; operatorUserId: number | null; createdAt: string };
type AuditDialogState = { title: string; description: string; entries: AuditEntry[]; bindings?: MediaAssetBinding[]; unavailable?: string };
type AssetPageMeta = { total: number; page: number; size: number };

const assetPageSize = 24;
const assetPickerPageSize = 12;

function emptySlideDraft(): SlideDraft {
  return { bookId: '', bannerAssetId: '', headline: '', copy: '', enabled: true, rank: '' };
}

function draftFor(slide: AdminHomeCarouselSlide, drafts: Record<number, SlideDraft>): SlideDraft {
  return drafts[slide.slideId] ?? {
    bookId: String(slide.book.id),
    bannerAssetId: slide.bannerAssetId ?? '',
    headline: slide.headline ?? '',
    copy: slide.copy ?? '',
    enabled: slide.enabled,
    rank: String(slide.rank),
  };
}

function optionalRank(value: string) {
  if (!value.trim()) return undefined;
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > 100_000) {
    throw new Error('排序必须是 1 到 100000 之间的整数。');
  }
  return rank;
}

function requiredBookId(value: string) {
  const bookId = Number(value);
  if (!Number.isInteger(bookId) || bookId < 1) throw new Error('请输入有效的已发布作品 ID。');
  return bookId;
}

function optionalText(value: string) {
  return value.trim() || null;
}

function formatTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function assetStateLabel(state: AssetState) {
  return {
    ACTIVE: '可用',
    ARCHIVED: '已归档',
    PENDING_DELETE: '待清理',
    DELETED: '已删除',
  }[state];
}

function assetStateClass(state: AssetState) {
  return {
    ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    ARCHIVED: 'border-amber-200 bg-amber-50 text-amber-800',
    PENDING_DELETE: 'border-rose-200 bg-rose-50 text-rose-800',
    DELETED: 'border-stone-300 bg-stone-100 text-stone-600',
  }[state];
}

function slideStatusClass(enabled: boolean, status: string) {
  if (status !== 'PUBLISHED') return 'border-rose-200 bg-rose-50 text-rose-800';
  return enabled
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-stone-300 bg-stone-100 text-stone-700';
}

function assetOptionLabel(asset: PlatformBannerAsset) {
  const name = asset.label?.trim() || '未命名横幅';
  return `${name} · ${asset.id.slice(0, 8)} · ${asset.width}×${asset.height}`;
}

function assetListPath(state: AssetState, page: number, query: string, size = assetPageSize) {
  const parameters = new URLSearchParams({ state, page: String(page), size: String(size) });
  if (query.trim()) parameters.set('query', query.trim());
  return `admin/media/banners?${parameters.toString()}`;
}

function readAssetPageMeta(response: PlatformBannerAssetPage): AssetPageMeta {
  if (!Array.isArray(response.items)
    || !response.meta
    || !Number.isInteger(response.meta.total)
    || !Number.isInteger(response.meta.page)
    || !Number.isInteger(response.meta.size)
    || response.meta.total < 0
    || response.meta.page < 0
    || response.meta.size < 1) {
    throw new Error('横幅素材分页响应无效。');
  }
  return response.meta;
}

function mergeAssets(current: PlatformBannerAsset[], additions: PlatformBannerAsset[]) {
  const assets = new Map(current.map((asset) => [asset.id, asset]));
  additions.forEach((asset) => assets.set(asset.id, asset));
  return [...assets.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function AssetPagination({
  meta,
  loading,
  onPageChange,
  ariaLabel = '横幅素材分页',
  anchor = '#banner-library-heading',
}: {
  meta: AssetPageMeta;
  loading: boolean;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  anchor?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.size)));
  if (totalPages <= 1) return null;
  const previousDisabled = loading || meta.page <= 0;
  const nextDisabled = loading || meta.page >= totalPages - 1;

  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-stone-500">共 {meta.total.toLocaleString('zh-CN')} 项</p>
      <Pagination aria-label={ariaLabel} className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={anchor}
              onClick={(event) => {
                event.preventDefault();
                if (!previousDisabled) onPageChange(meta.page - 1);
              }}
              aria-disabled={previousDisabled}
              tabIndex={previousDisabled ? -1 : undefined}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
          <PaginationItem>
            <span className="inline-flex h-9 min-w-20 items-center justify-center px-2 text-stone-600" aria-live="polite">第 {meta.page + 1} / {totalPages} 页</span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href={anchor}
              onClick={(event) => {
                event.preventDefault();
                if (!nextDisabled) onPageChange(meta.page + 1);
              }}
              aria-disabled={nextDisabled}
              tabIndex={nextDisabled ? -1 : undefined}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function BannerSelector({
  id,
  value,
  assets,
  onChange,
  onAssetSelected,
  disabled,
}: {
  id: string;
  value: string;
  assets: PlatformBannerAsset[];
  onChange: (value: string) => void;
  onAssetSelected: (asset: PlatformBannerAsset) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<PlatformBannerAsset[]>([]);
  const [meta, setMeta] = useState<AssetPageMeta>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef(0);
  const selected = assets.find((asset) => asset.id === value);

  const loadAssets = useCallback(async (nextPage: number, nextQuery: string) => {
    const sequence = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const response = await novelApi<PlatformBannerAssetPage>(
        assetListPath('ACTIVE', nextPage, nextQuery, assetPickerPageSize),
        'admin',
      );
      const nextMeta = readAssetPageMeta(response);
      if (sequence !== request.current) return;
      setResults(response.items);
      setMeta(nextMeta);
    } catch (reason) {
      if (sequence !== request.current) return;
      setError(reason instanceof Error ? reason.message : '可用横幅暂时无法加载。');
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadAssets(page, query);
  }, [loadAssets, open, page, query]);

  const select = (asset: PlatformBannerAsset | undefined) => {
    if (asset) {
      onAssetSelected(asset);
      onChange(asset.id);
    } else {
      onChange('');
    }
    setOpen(false);
  };

  const selectionLabel = selected
    ? assetOptionLabel(selected)
    : value
      ? `当前素材 · ${value.slice(0, 8)}`
      : '使用作品封面';

  return (
    <>
      <Button
        id={id}
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="选择横幅素材"
        className="mt-1 h-9 w-full justify-between rounded-none border-stone-300 bg-white px-2 text-left text-sm font-normal text-stone-900 hover:border-emerald-700 hover:text-stone-900"
      >
        <span className="min-w-0 truncate">{selectionLabel}</span>
        <ChevronDown size={15} className="shrink-0 text-stone-500" aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setPage(0);
            setQuery('');
            setError(undefined);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-200 bg-white p-5 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-950">选择横幅素材</DialogTitle>
            <DialogDescription className="text-stone-600">可用横幅</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`${id}-search`} className="sr-only">搜索可用横幅素材</Label>
            <Input
              id={`${id}-search`}
              aria-label="搜索可用横幅素材"
              value={query}
              maxLength={128}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="按名称或素材 ID 筛选"
              className="h-9 rounded-none border-stone-300 bg-white px-2 text-sm"
            />
          </div>
          <div className="divide-y divide-stone-100 border-y border-stone-100">
            <button
              type="button"
              onClick={() => select(undefined)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-stone-900 hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none"
            >
              <span className="flex h-12 w-20 shrink-0 items-center justify-center border border-dashed border-stone-300 text-xs text-stone-500">封面</span>
              <span className="font-medium">使用作品封面</span>
            </button>
            {loading ? <div className="space-y-3 p-3"><Skeleton className="h-12 rounded-none bg-stone-100" /><Skeleton className="h-12 rounded-none bg-stone-100" /></div> : null}
            {!loading && error ? <div className="p-3"><InlineNotice tone="error">{error}</InlineNotice></div> : null}
            {!loading && !error && results.length === 0 ? <p className="px-3 py-8 text-center text-sm text-stone-500">没有匹配的可用横幅。</p> : null}
            {!loading && !error && results.map((asset) => {
              const label = asset.label?.trim() || asset.id.slice(0, 8);
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => select(asset)}
                  aria-label={`使用横幅 ${label}`}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none"
                >
                  <BookCover cover={asset.publicUrl} title={label} imageAlt="" showLabel={false} className="h-12 w-20 shrink-0" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-stone-950">{label}</span><span className="mt-1 block truncate font-mono text-[11px] text-stone-500">{asset.id}</span></span>
                </button>
              );
            })}
          </div>
          {!loading && !error && meta ? <AssetPagination meta={meta} loading={loading} onPageChange={setPage} ariaLabel="选择横幅素材分页" anchor={`#${id}`} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HomeCarouselOperationsPanel() {
  const [slides, setSlides] = useState<AdminHomeCarouselSlide[]>([]);
  const [activeAssets, setActiveAssets] = useState<PlatformBannerAsset[]>([]);
  const [listedAssets, setListedAssets] = useState<PlatformBannerAsset[]>([]);
  const [assetState, setAssetState] = useState<AssetState>('ACTIVE');
  const [assetPage, setAssetPage] = useState(0);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetMeta, setAssetMeta] = useState<AssetPageMeta>();
  const [slideDrafts, setSlideDrafts] = useState<Record<number, SlideDraft>>({});
  const [newSlide, setNewSlide] = useState<SlideDraft>(emptySlideDraft);
  const [uploadFile, setUploadFile] = useState<File>();
  const [uploadLabel, setUploadLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const [auditDialog, setAuditDialog] = useState<AuditDialogState>();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const assetListRequest = useRef(0);

  const cacheActiveAsset = useCallback((asset: PlatformBannerAsset) => {
    setActiveAssets((current) => mergeAssets(current, [asset]));
  }, []);

  const loadAssetList = useCallback(async (state: AssetState, page: number, query: string) => {
    const request = ++assetListRequest.current;
    setAssetsLoading(true);
    try {
      const response = await novelApi<PlatformBannerAssetPage>(assetListPath(state, page, query), 'admin');
      const meta = readAssetPageMeta(response);
      if (request !== assetListRequest.current) return;
      setListedAssets(response.items);
      setAssetMeta(meta);
      if (state === 'ACTIVE') setActiveAssets((current) => mergeAssets(current, response.items));
    } catch (reason) {
      if (request !== assetListRequest.current) return;
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '横幅素材暂时无法加载。' });
    } finally {
      if (request === assetListRequest.current) setAssetsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextSlides = await novelApi<AdminHomeCarouselSlide[]>('admin/home-carousel', 'admin');
      setSlides(nextSlides);
      setSlideDrafts({});
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '首页轮播配置暂时无法加载。' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAssetList(assetState, assetPage, assetSearch); }, [assetPage, assetSearch, assetState, loadAssetList]);

  const saveSlide = async (
    slide: AdminHomeCarouselSlide,
    values: SlideDraft,
    action: string,
    successMessage: string,
  ) => {
    let bookId: number;
    let rank: number | undefined;
    try {
      bookId = requiredBookId(values.bookId);
      rank = optionalRank(values.rank);
      if (!rank) throw new Error('请输入排序。');
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '轮播配置无效。' });
      return;
    }

    setPendingAction(action);
    try {
      await novelApi<AdminHomeCarouselSlide>(`admin/home-carousel/${slide.slideId}`, 'admin', {
        method: 'PUT',
        body: JSON.stringify({
          bookId,
          bannerAssetId: values.bannerAssetId || null,
          headline: optionalText(values.headline),
          copy: optionalText(values.copy),
          enabled: values.enabled,
          rank,
          version: slide.version,
        }),
      });
      setNotice({ tone: 'success', message: successMessage });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '轮播配置更新失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const createSlide = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let bookId: number;
    let rank: number | undefined;
    try {
      bookId = requiredBookId(newSlide.bookId);
      rank = optionalRank(newSlide.rank);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '轮播配置无效。' });
      return;
    }

    setPendingAction('slide-create');
    try {
      const created = await novelApi<AdminHomeCarouselSlide>('admin/home-carousel', 'admin', {
        method: 'POST',
        body: JSON.stringify({
          bookId,
          bannerAssetId: newSlide.bannerAssetId || undefined,
          headline: optionalText(newSlide.headline) ?? undefined,
          copy: optionalText(newSlide.copy) ?? undefined,
          enabled: newSlide.enabled,
          rank,
        }),
      });
      setNewSlide(emptySlideDraft());
      setNotice({ tone: 'success', message: `《${created.book.title}》已加入首页轮播。` });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '新增首页轮播失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const moveSlide = async (slide: AdminHomeCarouselSlide, direction: -1 | 1) => {
    const ordered = [...slides].sort((left, right) => left.rank - right.rank || left.slideId - right.slideId);
    const index = ordered.findIndex((item) => item.slideId === slide.slideId);
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    const values = { ...draftFor(slide, slideDrafts), rank: String(neighbor.rank) };
    await saveSlide(
      slide,
      values,
      `slide-move-${slide.slideId}`,
      `《${slide.book.title}》已调整至第 ${neighbor.rank} 位。`,
    );
  };

  const uploadBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile) {
      setNotice({ tone: 'error', message: '请选择 PNG 或 JPEG 横幅文件。' });
      return;
    }
    setPendingAction('banner-upload');
    try {
      const body = new FormData();
      body.append('file', uploadFile);
      if (uploadLabel.trim()) body.append('label', uploadLabel.trim());
      const asset = await novelApi<PlatformBannerAsset>('admin/media/banners', 'admin', { method: 'POST', body });
      setUploadFile(undefined);
      setUploadLabel('');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      setNewSlide((current) => ({ ...current, bannerAssetId: asset.id }));
      cacheActiveAsset(asset);
      setNotice({ tone: 'success', message: `横幅“${asset.label?.trim() || asset.id.slice(0, 8)}”已上传。` });
      setAssetState('ACTIVE');
      setAssetPage(0);
      setAssetSearch('');
      await Promise.all([load(), loadAssetList('ACTIVE', 0, '')]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '横幅上传失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const archiveAsset = async (asset: PlatformBannerAsset) => {
    const action = `asset-archive-${asset.id}`;
    setPendingAction(action);
    try {
      await novelApi<void>(`admin/media/assets/${asset.id}/archive`, 'admin', { method: 'POST' });
      setActiveAssets((current) => current.filter((entry) => entry.id !== asset.id));
      setNotice({ tone: 'success', message: `横幅“${asset.label?.trim() || asset.id.slice(0, 8)}”已归档。` });
      await Promise.all([load(), loadAssetList(assetState, assetPage, assetSearch)]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '横幅归档失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const restoreAsset = async (asset: PlatformBannerAsset) => {
    const action = `asset-restore-${asset.id}`;
    setPendingAction(action);
    try {
      const restored = await novelApi<PlatformBannerAsset>(`admin/media/assets/${asset.id}/restore`, 'admin', { method: 'POST' });
      cacheActiveAsset(restored);
      setNotice({ tone: 'success', message: `横幅“${asset.label?.trim() || asset.id.slice(0, 8)}”已恢复为可用素材。` });
      await Promise.all([load(), loadAssetList(assetState, assetPage, assetSearch)]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '横幅恢复失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const action = target.kind === 'slide' ? `slide-delete-${target.id}` : `asset-delete-${target.id}`;
    setPendingAction(action);
    try {
      if (target.kind === 'slide') {
        await novelApi<void>(`admin/home-carousel/${target.id}?version=${target.version}`, 'admin', { method: 'DELETE' });
        setNotice({ tone: 'success', message: `《${target.label}》已从首页轮播移除。` });
      } else {
        await novelApi<void>(`admin/media/assets/${target.id}`, 'admin', { method: 'DELETE' });
        setActiveAssets((current) => current.filter((entry) => entry.id !== target.id));
        setNotice({ tone: 'success', message: `横幅“${target.label}”已加入清理队列。` });
      }
      setDeleteTarget(undefined);
      await Promise.all([load(), loadAssetList(assetState, assetPage, assetSearch)]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '删除操作失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const openCarouselAudits = async () => {
    setPendingAction('carousel-audits');
    try {
      const entries = await novelApi<HomeCarouselSlideAudit[]>('admin/home-carousel/audits?limit=20', 'admin');
      setAuditDialog({
        title: '首页轮播审计',
        description: '最近 20 条首页轮播配置变更',
        entries,
      });
    } catch {
      setAuditDialog({
        title: '首页轮播审计',
        description: '最近 20 条首页轮播配置变更',
        entries: [],
        unavailable: '审计接口暂未就绪，轮播配置不受影响。',
      });
    } finally {
      setPendingAction(undefined);
    }
  };

  const openAssetAudits = async (asset: PlatformBannerAsset) => {
    const action = `asset-audits-${asset.id}`;
    setPendingAction(action);
    try {
      const [entries, bindings] = await Promise.all([
        novelApi<MediaAssetAudit[]>(`admin/media/assets/${asset.id}/audits?limit=20`, 'admin'),
        novelApi<MediaAssetBinding[]>(`admin/media/assets/${asset.id}/bindings`, 'admin'),
      ]);
      setAuditDialog({
        title: asset.label?.trim() || '横幅素材记录',
        description: `素材 ${asset.id} 的最近操作和当前使用位置`,
        entries,
        bindings,
      });
    } catch {
      setAuditDialog({
        title: asset.label?.trim() || '横幅素材记录',
        description: `素材 ${asset.id} 的最近操作和当前使用位置`,
        entries: [],
        unavailable: '素材审计接口暂未就绪，素材本身仍可正常使用。',
      });
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <section className="mt-7" aria-labelledby="home-carousel-operations-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">首页运营</p>
          <h2 id="home-carousel-operations-heading" className="mt-1 text-xl font-semibold text-stone-950">首页轮播与素材</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" title="查看首页轮播审计" aria-label="查看首页轮播审计" onClick={() => void openCarouselAudits()} disabled={pendingAction === 'carousel-audits'} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={16} aria-hidden="true" /></Button>
          <Images className="text-emerald-700" size={22} aria-hidden="true" />
        </div>
      </div>

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
        <section className="border border-stone-200 bg-white" aria-labelledby="home-carousel-configuration-heading">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">展示排序</p>
              <h3 id="home-carousel-configuration-heading" className="mt-1 text-lg font-semibold text-stone-950">首页作品轮播</h3>
            </div>
            <span className="text-xs text-stone-500">仅已发布作品可启用</span>
          </div>

          {loading ? <div className="space-y-3 p-5"><Skeleton className="h-28 rounded-none bg-stone-100" /><Skeleton className="h-28 rounded-none bg-stone-100" /></div> : null}
          {!loading && slides.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">尚未配置首页轮播。</p> : null}
          {!loading && slides.length ? <div className="divide-y divide-stone-100">{slides.map((slide, index) => {
            const values = draftFor(slide, slideDrafts);
            const action = `slide-save-${slide.slideId}`;
            const published = slide.book.status === 'PUBLISHED';
            const selectedAsset = activeAssets.find((asset) => asset.id === values.bannerAssetId);
            const previewCover = values.bannerAssetId
              ? selectedAsset?.publicUrl ?? (values.bannerAssetId === slide.bannerAssetId ? slide.bannerUrl : undefined)
              : slide.book.cover;
            return (
              <article key={slide.slideId} className="grid gap-4 px-5 py-5 xl:grid-cols-[8rem_minmax(0,1fr)]">
                <BookCover cover={previewCover} fallbackCover={slide.book.cover} title={slide.book.title} category={slide.book.category} imageAlt="" showLabel={false} className="aspect-[2/1] w-full self-start" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-medium text-stone-950">《{slide.book.title}》</p><p className="mt-1 text-xs text-stone-500">#{slide.book.id} · {slide.book.author} · {formatWordCount(slide.book.words)}</p></div>
                    <div className="flex items-center gap-2"><Badge variant="outline" className={`rounded-none ${slideStatusClass(values.enabled, slide.book.status)}`}>{slide.book.status === 'PUBLISHED' ? values.enabled ? '展示中' : '已停用' : '作品未发布'}</Badge><Button type="button" variant="outline" size="icon" title="上移轮播项" aria-label={`上移《${slide.book.title}》`} onClick={() => void moveSlide(slide, -1)} disabled={index === 0 || pendingAction !== undefined} className="h-8 w-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><ArrowUp size={15} aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" title="下移轮播项" aria-label={`下移《${slide.book.title}》`} onClick={() => void moveSlide(slide, 1)} disabled={index === slides.length - 1 || pendingAction !== undefined} className="h-8 w-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><ArrowDown size={15} aria-hidden="true" /></Button></div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_6rem]">
                    <div><Label htmlFor={`carousel-book-${slide.slideId}`} className="text-xs text-stone-600">作品 ID</Label><Input id={`carousel-book-${slide.slideId}`} aria-label={`${slide.book.title} 作品 ID`} type="number" min="1" value={values.bookId} onChange={(event) => setSlideDrafts((current) => ({ ...current, [slide.slideId]: { ...values, bookId: event.target.value } }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div>
                    <div><Label htmlFor={`carousel-banner-${slide.slideId}`} className="text-xs text-stone-600">横幅素材</Label><BannerSelector id={`carousel-banner-${slide.slideId}`} value={values.bannerAssetId} assets={activeAssets} onChange={(bannerAssetId) => setSlideDrafts((current) => ({ ...current, [slide.slideId]: { ...values, bannerAssetId } }))} onAssetSelected={cacheActiveAsset} disabled={pendingAction !== undefined} /></div>
                    <div><Label htmlFor={`carousel-rank-${slide.slideId}`} className="text-xs text-stone-600">排序</Label><Input id={`carousel-rank-${slide.slideId}`} aria-label={`${slide.book.title} 轮播排序`} type="number" min="1" value={values.rank} onChange={(event) => setSlideDrafts((current) => ({ ...current, [slide.slideId]: { ...values, rank: event.target.value } }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`carousel-headline-${slide.slideId}`} className="text-xs text-stone-600">标题覆盖</Label><Input id={`carousel-headline-${slide.slideId}`} aria-label={`${slide.book.title} 轮播标题`} value={values.headline} maxLength={255} onChange={(event) => setSlideDrafts((current) => ({ ...current, [slide.slideId]: { ...values, headline: event.target.value } }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder={slide.book.title} /></div><div><Label htmlFor={`carousel-copy-${slide.slideId}`} className="text-xs text-stone-600">短文案覆盖</Label><Textarea id={`carousel-copy-${slide.slideId}`} aria-label={`${slide.book.title} 轮播短文案`} value={values.copy} maxLength={1024} onChange={(event) => setSlideDrafts((current) => ({ ...current, [slide.slideId]: { ...values, copy: event.target.value } }))} disabled={pendingAction !== undefined} className="mt-1 min-h-9 rounded-none border-stone-300 bg-white px-2 py-1.5 text-sm" placeholder="默认使用作品简介" /></div></div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Switch checked={values.enabled} onCheckedChange={(enabled) => void saveSlide(slide, { ...values, enabled }, `slide-toggle-${slide.slideId}`, enabled ? `《${slide.book.title}》已启用。` : `《${slide.book.title}》已停用。`)} disabled={!published || pendingAction !== undefined} aria-label={`${slide.book.title} 首页轮播已启用`} className="data-[state=checked]:bg-emerald-700" /><span className="text-xs text-stone-600">{values.enabled ? '启用' : '停用'}</span></div><div className="flex gap-2"><Button type="button" variant="outline" size="icon" title="保存轮播配置" aria-label={`保存 ${slide.book.title} 轮播配置`} onClick={() => void saveSlide(slide, values, action, `《${slide.book.title}》的轮播配置已保存。`)} disabled={pendingAction !== undefined} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Save size={15} aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" title="移除轮播项" aria-label={`移除 ${slide.book.title} 首页轮播`} onClick={() => setDeleteTarget({ kind: 'slide', id: slide.slideId, version: slide.version, label: slide.book.title })} disabled={pendingAction !== undefined} className="h-9 w-9 rounded-none border-rose-200 bg-white text-rose-700 hover:border-rose-500 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" /></Button></div></div>
                </div>
              </article>
            );
          })}</div> : null}

          <form onSubmit={(event) => void createSlide(event)} className="border-t border-stone-100 px-5 py-5">
            <div className="flex items-center gap-2"><Plus size={17} className="text-emerald-700" aria-hidden="true" /><h4 className="font-medium text-stone-950">添加轮播作品</h4></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_6rem]">
              <div><Label htmlFor="new-carousel-book" className="text-xs text-stone-600">作品 ID</Label><Input id="new-carousel-book" aria-label="轮播作品 ID" type="number" min="1" required value={newSlide.bookId} onChange={(event) => setNewSlide((current) => ({ ...current, bookId: event.target.value }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div>
              <div><Label htmlFor="new-carousel-banner" className="text-xs text-stone-600">横幅素材</Label><BannerSelector id="new-carousel-banner" value={newSlide.bannerAssetId} assets={activeAssets} onChange={(bannerAssetId) => setNewSlide((current) => ({ ...current, bannerAssetId }))} onAssetSelected={cacheActiveAsset} disabled={pendingAction !== undefined} /></div>
              <div><Label htmlFor="new-carousel-rank" className="text-xs text-stone-600">排序</Label><Input id="new-carousel-rank" aria-label="轮播目标排序" type="number" min="1" value={newSlide.rank} onChange={(event) => setNewSlide((current) => ({ ...current, rank: event.target.value }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="末位" /></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="new-carousel-headline" className="text-xs text-stone-600">标题覆盖</Label><Input id="new-carousel-headline" aria-label="轮播标题" value={newSlide.headline} maxLength={255} onChange={(event) => setNewSlide((current) => ({ ...current, headline: event.target.value }))} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="默认使用作品名称" /></div><div><Label htmlFor="new-carousel-copy" className="text-xs text-stone-600">短文案覆盖</Label><Textarea id="new-carousel-copy" aria-label="轮播短文案" value={newSlide.copy} maxLength={1024} onChange={(event) => setNewSlide((current) => ({ ...current, copy: event.target.value }))} disabled={pendingAction !== undefined} className="mt-1 min-h-9 rounded-none border-stone-300 bg-white px-2 py-1.5 text-sm" placeholder="默认使用作品简介" /></div></div>
            <div className="mt-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Switch checked={newSlide.enabled} onCheckedChange={(enabled) => setNewSlide((current) => ({ ...current, enabled }))} aria-label="新首页轮播已启用" disabled={pendingAction !== undefined} className="data-[state=checked]:bg-emerald-700" /><span className="text-xs text-stone-600">{newSlide.enabled ? '启用' : '停用'}</span></div><Button type="submit" disabled={pendingAction === 'slide-create'} className="h-9 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />添加轮播</Button></div>
          </form>
        </section>

        <section className="border border-stone-200 bg-white" aria-labelledby="banner-library-heading">
          <div className="border-b border-stone-200 px-5 py-5"><p className="text-xs font-semibold text-emerald-700">媒体素材</p><h3 id="banner-library-heading" className="mt-1 text-lg font-semibold text-stone-950">平台横幅库</h3></div>
          <form onSubmit={(event) => void uploadBanner(event)} className="space-y-3 border-b border-stone-100 px-5 py-5"><div><Label htmlFor="banner-file" className="text-xs text-stone-600">横幅文件</Label><Input ref={uploadInputRef} id="banner-file" aria-label="上传轮播横幅" type="file" accept="image/png,image/jpeg" onChange={(event) => setUploadFile(event.target.files?.[0])} disabled={pendingAction !== undefined} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-sm" /></div><div><Label htmlFor="banner-label" className="text-xs text-stone-600">素材名称</Label><Input id="banner-label" aria-label="横幅素材名称" value={uploadLabel} maxLength={128} onChange={(event) => setUploadLabel(event.target.value)} disabled={pendingAction !== undefined} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div><Button type="submit" disabled={!uploadFile || pendingAction === 'banner-upload'} className="h-9 w-full rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Upload size={15} aria-hidden="true" />上传横幅</Button></form>
          <div className="grid gap-3 border-b border-stone-100 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0"><Label htmlFor="banner-search" className="sr-only">筛选横幅素材</Label><Input id="banner-search" aria-label="筛选横幅素材" value={assetSearch} maxLength={128} onChange={(event) => { setAssetSearch(event.target.value); setAssetPage(0); }} placeholder="按名称或素材 ID 筛选" className="h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><Label htmlFor="banner-state" className="text-xs text-stone-600">素材状态</Label><Select value={assetState} onValueChange={(value) => { setAssetState(value as AssetState); setAssetPage(0); }}><SelectTrigger id="banner-state" className="h-8 w-32 rounded-none border-stone-300 bg-white text-sm"><SelectValue /></SelectTrigger><SelectContent className="rounded-none border-stone-200 bg-white text-stone-900">{assetStates.map((state) => <SelectItem key={state} value={state}>{assetStateLabel(state)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {assetsLoading ? <div className="space-y-3 p-5"><Skeleton className="h-24 rounded-none bg-stone-100" /><Skeleton className="h-24 rounded-none bg-stone-100" /></div> : null}
          {!assetsLoading && listedAssets.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">当前状态下没有横幅素材。</p> : null}
          {!assetsLoading && listedAssets.length ? <div className="divide-y divide-stone-100">{listedAssets.map((asset) => {
            const label = asset.label?.trim() || asset.id.slice(0, 8);
            const restorable = asset.state === 'ARCHIVED' || asset.state === 'PENDING_DELETE';
            return <article key={asset.id} className="flex gap-3 px-5 py-4"><BookCover cover={asset.publicUrl} title={label} imageAlt="" showLabel={false} className="h-16 w-28 shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium text-stone-950">{label}</p><p className="mt-1 truncate font-mono text-[11px] text-stone-500">{asset.id}</p></div><Badge variant="outline" className={`shrink-0 rounded-none ${assetStateClass(asset.state)}`}>{assetStateLabel(asset.state)}</Badge></div><p className="mt-2 text-xs text-stone-500">{asset.width}×{asset.height} · {formatBytes(asset.byteSize)} · {formatTime(asset.createdAt)}</p><div className="mt-3 flex justify-end gap-2"><Button type="button" variant="outline" size="icon" title="查看素材记录" aria-label={`查看 ${label} 素材记录`} onClick={() => void openAssetAudits(asset)} disabled={pendingAction !== undefined} className="h-8 w-8 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={14} aria-hidden="true" /></Button>{restorable ? <Button type="button" variant="outline" size="icon" title="恢复横幅" aria-label={`恢复 ${label}`} onClick={() => void restoreAsset(asset)} disabled={pendingAction !== undefined} className="h-8 w-8 rounded-none border-emerald-200 bg-white text-emerald-700 hover:border-emerald-500 hover:text-emerald-800"><RotateCcw size={14} aria-hidden="true" /></Button> : null}{asset.state === 'ACTIVE' ? <Button type="button" variant="outline" size="icon" title="归档横幅" aria-label={`归档 ${label}`} onClick={() => void archiveAsset(asset)} disabled={pendingAction !== undefined} className="h-8 w-8 rounded-none border-amber-200 bg-white text-amber-700 hover:border-amber-500 hover:text-amber-800"><Archive size={14} aria-hidden="true" /></Button> : null}{asset.state === 'ACTIVE' || asset.state === 'ARCHIVED' ? <Button type="button" variant="outline" size="icon" title="删除横幅" aria-label={`删除 ${label}`} onClick={() => setDeleteTarget({ kind: 'asset', id: asset.id, label })} disabled={pendingAction !== undefined} className="h-8 w-8 rounded-none border-rose-200 bg-white text-rose-700 hover:border-rose-500 hover:text-rose-800"><Trash2 size={14} aria-hidden="true" /></Button> : null}</div></div></article>;
          })}</div> : null}
          {!assetsLoading && assetMeta ? <AssetPagination meta={assetMeta} loading={assetsLoading} onPageChange={setAssetPage} /> : null}
        </section>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}>
        <AlertDialogContent className="rounded-none border-stone-200 bg-white p-5"><AlertDialogHeader><AlertDialogTitle className="text-stone-950">确认删除</AlertDialogTitle><AlertDialogDescription className="text-stone-600">{deleteTarget?.kind === 'slide' ? `将《${deleteTarget.label}》从首页轮播中移除。` : `将横幅“${deleteTarget?.label ?? ''}”提交至清理队列。仍被轮播使用的横幅无法删除。`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-none border-stone-300 bg-white text-stone-700">取消</AlertDialogCancel><AlertDialogAction onClick={() => void executeDelete()} className="rounded-none bg-rose-700 text-white hover:bg-rose-800">确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(auditDialog)} onOpenChange={(open) => { if (!open) setAuditDialog(undefined); }}>
        <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-xl"><DialogHeader><DialogTitle className="text-stone-950">{auditDialog?.title}</DialogTitle><DialogDescription className="text-stone-600">{auditDialog?.description}</DialogDescription></DialogHeader>{auditDialog?.unavailable ? <InlineNotice tone="error">{auditDialog.unavailable}</InlineNotice> : null}{auditDialog?.bindings?.length ? <div className="border-y border-stone-100 py-3 text-xs text-stone-600">当前使用位置：{auditDialog.bindings.map((binding) => `${binding.bindingType} #${binding.targetId}`).join('、')}</div> : null}<div className="max-h-80 overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">{auditDialog && auditDialog.entries.length === 0 && !auditDialog.unavailable ? <p className="py-6 text-center text-sm text-stone-500">暂无操作记录。</p> : null}{auditDialog?.entries.map((entry) => <article key={entry.id} className="py-4"><div className="flex items-center justify-between gap-3"><span className="font-medium text-stone-900">{entry.action}</span><span className="whitespace-nowrap text-xs text-stone-500">{entry.operatorUserId == null ? '系统' : `操作人 #${entry.operatorUserId}`} · {formatTime(entry.createdAt)}</span></div><p className="mt-2 break-words text-xs leading-5 text-stone-600">{entry.details}</p></article>)}</div></DialogContent>
      </Dialog>
    </section>
  );
}
