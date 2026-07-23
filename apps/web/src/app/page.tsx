'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, BookOpen, Flame, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/components/ui/carousel';
import { Input } from '@/app/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { InlineNotice, NovelPageHeader, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import { BookCover } from '@/components/novel/BookCover';
import { DotGrid } from '@/components/novel/DotGrid';
import {
  type BookPresentation,
  type PublicCatalogPage,
  type PublicDiscoveryHome,
  type PublicTaxonomyItem,
  novelApi,
} from '@/features/novel/api';

const ALL = '全部';
const catalogPageSize = 12;

const ColorBends = dynamic(
  () => import('@/components/novel/ColorBends').then((module) => module.ColorBends),
  { ssr: false },
);

const homeBackgroundColors = ['#0b4936', '#236b52', '#5f8972', '#bbcbbb'];

type CatalogFilters = {
  query: string;
  category: string;
  serialStatus: string;
  wordRangeKey: string;
};

function highlightText(value: string, query: string) {
  const keyword = query.trim();
  if (!keyword) return value;

  const lowerValue = value.toLocaleLowerCase('zh-CN');
  const lowerKeyword = keyword.toLocaleLowerCase('zh-CN');
  const pieces: Array<{ value: string; match: boolean }> = [];
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerKeyword, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) pieces.push({ value: value.slice(cursor, matchIndex), match: false });
    pieces.push({ value: value.slice(matchIndex, matchIndex + keyword.length), match: true });
    cursor = matchIndex + keyword.length;
    matchIndex = lowerValue.indexOf(lowerKeyword, cursor);
  }
  if (cursor < value.length) pieces.push({ value: value.slice(cursor), match: false });

  return pieces.map((piece, index) => (
    <Fragment key={`${piece.value}-${index}`}>
      {piece.match ? <mark className="bg-amber-200 px-0.5 text-inherit">{piece.value}</mark> : piece.value}
    </Fragment>
 ));
}

function formatHeat(heat?: number) {
  if (!heat) return '热度待更新';
  if (heat >= 10_000) return `${(heat / 10_000).toFixed(heat % 10_000 === 0 ? 0 : 1)} 万热度`;
  return `${heat.toLocaleString('zh-CN')} 热度`;
}

function formatRating(book: Pick<BookPresentation, 'metrics'>) {
  const metrics = book.metrics;
  if (!metrics || !Number.isFinite(metrics.averageRating) || metrics.ratingCount <= 0) return '暂无评分';
  return `${metrics.averageRating.toFixed(1)} 分 · ${metrics.ratingCount.toLocaleString('zh-CN')} 人评分`;
}

function CatalogPagination({
  total,
  page,
  size,
  loading,
  onPageChange,
}: {
  total: number;
  page: number;
  size: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (totalPages <= 1) return null;
  const previousDisabled = loading || page <= 0;
  const nextDisabled = loading || page >= totalPages - 1;

  return (
    <div className="mt-7 flex flex-col gap-3 border-t border-emerald-950/25 pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-stone-500">共 {total.toLocaleString('zh-CN')} 部作品</p>
      <Pagination aria-label="作品目录分页" className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#books"
              onClick={(event) => {
                event.preventDefault();
                if (!previousDisabled) onPageChange(page - 1);
              }}
              aria-disabled={previousDisabled}
              tabIndex={previousDisabled ? -1 : undefined}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
          <PaginationItem>
            <span className="inline-flex h-9 min-w-20 items-center justify-center px-2 text-stone-600" aria-live="polite">第 {page + 1} / {totalPages} 页</span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#books"
              onClick={(event) => {
                event.preventDefault();
                if (!nextDisabled) onPageChange(page + 1);
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

function filterToggleItemClass(tone: 'emerald' | 'violet' | 'stone') {
  const selected = {
    emerald: 'data-[state=on]:border-emerald-700 data-[state=on]:bg-emerald-700 data-[state=on]:text-white data-[state=on]:hover:bg-emerald-800',
    violet: 'data-[state=on]:border-violet-700 data-[state=on]:bg-violet-700 data-[state=on]:text-white data-[state=on]:hover:bg-violet-800',
    stone: 'data-[state=on]:border-stone-900 data-[state=on]:bg-stone-900 data-[state=on]:text-white data-[state=on]:hover:bg-stone-800',
  }[tone];
  return `h-auto min-w-0 max-w-full flex-none whitespace-normal break-words rounded-none border border-stone-300 bg-white px-3 py-1.5 text-center text-sm text-stone-700 shadow-none transition-colors first:rounded-none last:rounded-none hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 ${selected}`;
}

export default function BookstorePage() {
  const [books, setBooks] = useState<BookPresentation[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<PublicCatalogPage['meta']>();
  const [catalogPage, setCatalogPage] = useState(0);
  const [home, setHome] = useState<PublicDiscoveryHome>();
  const [taxonomyCategories, setTaxonomyCategories] = useState<string[]>();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>({
    query: '',
    category: ALL,
    serialStatus: ALL,
    wordRangeKey: ALL,
  });
  const [loading, setLoading] = useState(true);
  const [homeLoading, setHomeLoading] = useState(true);
  const [error, setError] = useState('');
  const [homeError, setHomeError] = useState('');
  const [homeRequestVersion, setHomeRequestVersion] = useState(0);
  const editorialHeroRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(
    () => [
      ALL,
      ...(taxonomyCategories ?? home?.facets.categories ?? []),
    ],
    [home, taxonomyCategories],
  );
  const serialStatuses = useMemo(
    () => [ALL, ...(home?.facets.serialStatuses ?? [])],
    [home],
  );
  const wordRanges = home?.facets.wordCountRanges ?? [];
  const selectedWordRange = wordRanges.find((range) => range.key === filters.wordRangeKey);
  const carouselSlides = home?.carousel ?? [];
  const catalogPagination = useMemo(() => {
    const total = Math.max(0, catalogMeta?.total ?? 0);
    const size = catalogMeta?.size ?? catalogPageSize;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(catalogMeta?.page ?? catalogPage, totalPages - 1);
    return { total, page, size };
  }, [catalogMeta, catalogPage]);

  const retryHome = useCallback(() => {
    setHomeRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHomeLoading(true);
    setHomeError('');

    void novelApi<PublicDiscoveryHome>('public/home')
      .then((response) => {
        if (!cancelled) setHome(response);
      })
      .catch(() => {
        if (!cancelled) setHomeError('首页精选暂时无法加载，请刷新后重试。');
      })
      .finally(() => {
        if (!cancelled) setHomeLoading(false);
      });

    return () => { cancelled = true; };
  }, [homeRequestVersion]);

  useEffect(() => {
    let cancelled = false;

    void novelApi<PublicTaxonomyItem[]>('public/taxonomy/categories')
      .then((items) => {
        if (cancelled) return;
        // Preserve the administrator's sort order. An empty enabled taxonomy is intentional and
        // must not be silently repopulated from the catalog's historical categories.
        const names = items
          .filter((item) => item.enabled && item.type === 'CATEGORY')
          .map((item) => item.name.trim())
          .filter(Boolean);
        setTaxonomyCategories([...new Set(names)]);
      })
      .catch(() => {
        // The discovery response owns the fallback taxonomy when the operations endpoint is unavailable.
        if (!cancelled) setTaxonomyCategories(undefined);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filters.query) params.set('q', filters.query);
    if (filters.category !== ALL) params.set('category', filters.category);
    if (filters.serialStatus !== ALL) params.set('status', filters.serialStatus);
    if (selectedWordRange?.minWords != null) params.set('minWords', String(selectedWordRange.minWords));
    if (selectedWordRange?.maxWords != null) params.set('maxWords', String(selectedWordRange.maxWords));
    params.set('page', String(catalogPage));
    params.set('size', String(catalogPageSize));

    setLoading(true);
    setError('');
    const queryString = params.toString();
    void novelApi<PublicCatalogPage>(`public/books${queryString ? `?${queryString}` : ''}`)
      .then((response) => {
        if (!cancelled) {
          setBooks(response.items);
          setCatalogMeta(response.meta);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '书城暂时无法加载，请稍后重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [catalogPage, filters.category, filters.query, filters.serialStatus, selectedWordRange?.maxWords, selectedWordRange?.minWords]);

  const hasFilters = Boolean(
    filters.query
    || filters.category !== ALL
    || filters.serialStatus !== ALL
    || filters.wordRangeKey !== ALL,
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCatalogPage(0);
    setFilters((current) => ({ ...current, query: query.trim() }));
  };

  const resetFilters = () => {
    setQuery('');
    setCatalogPage(0);
    setFilters({ query: '', category: ALL, serialStatus: ALL, wordRangeKey: ALL });
  };

  const applyHotSearch = (term: string) => {
    const normalized = term.trim();
    if (!normalized) return;
    setQuery(normalized);
    setCatalogPage(0);
    setFilters((current) => ({ ...current, query: normalized }));
  };

  const hotSearchTerms = home?.hotSearchTerms.filter((term) => term.enabled && term.term.trim()) ?? [];

  return (
    <NovelShell workspace="reader">
      <div className="relative isolate">
        <ColorBends
          colors={homeBackgroundColors}
          rotation={118}
          autoRotate={1.2}
          speed={0.12}
          scale={1.15}
          frequency={0.92}
          warpStrength={1}
          mouseInfluence={0}
          parallax={0}
          noise={0.02}
          iterations={1}
          intensity={1.05}
          bandWidth={4.8}
          transparent
          className="pointer-events-none fixed inset-0 z-0 opacity-[0.58]"
        />
        <div className="relative z-10">
      <NovelPageHeader
        eyebrow="阅界书城"
        title="找到下一段值得读完的故事。"
        description="按题材、字数、连载状态或关键词浏览已经上线的作品。"
      />

      <section className="mt-7" aria-labelledby="editorial-heading">
        <div className="flex min-w-0 items-end justify-between gap-4 border-b border-emerald-950/40 pb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-700">本周选读</p>
            <h2 id="editorial-heading" className="mt-1 text-2xl font-semibold text-stone-950">首页精选</h2>
          </div>
        </div>

        {homeLoading ? <Skeleton className="mt-4 h-[420px] rounded-none border border-stone-200 bg-white sm:h-[400px]" role="status" aria-live="polite" aria-label="正在加载首页精选" /> : null}
        {homeError ? <div className="mt-4"><InlineNotice tone="error">{homeError}</InlineNotice><Button type="button" variant="outline" size="sm" onClick={retryHome} className="mt-3 rounded-none border-rose-300 bg-white text-rose-800 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-900">重试</Button></div> : null}
        {!homeLoading && !homeError && carouselSlides.length ? (
          <div ref={editorialHeroRef} className="relative mt-4">
            <Carousel
              className="overflow-hidden border border-emerald-950/80 bg-[#071d13] text-white"
              opts={{ align: 'start', loop: carouselSlides.length > 1 }}
              aria-label="书城精选"
            >
              <CarouselContent className="ml-0">
                {carouselSlides.map((slide, index) => {
                  const book = slide.book;
                  const headline = slide.headline?.trim() || book.title;
                  const copy = slide.copy?.trim() || book.synopsis;
                  return (
                    <CarouselItem
                      key={slide.slideId}
                      className="relative min-h-[420px] pl-0 sm:min-h-[400px]"
                      aria-label={`第 ${index + 1} 张，${headline}`}
                    >
                      <BookCover
                        cover={slide.bannerUrl}
                        fallbackCover={book.cover}
                        title={book.title}
                        category={book.category}
                        showLabel={false}
                        imageAlt=""
                        className="absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,20,13,.98)_0%,rgba(5,29,19,.92)_38%,rgba(6,27,19,.35)_72%,rgba(6,27,19,.08)_100%)]" />
                      <div className={`relative z-20 flex min-h-[420px] max-w-xl flex-col justify-end p-5 ${carouselSlides.length > 1 ? 'pb-20' : ''} sm:min-h-[400px] sm:p-9 ${carouselSlides.length > 1 ? 'sm:pb-20' : ''}`}>
                        <p className="text-xs font-semibold text-emerald-200">首页精选</p>
                        <p className="mt-4 break-words text-sm text-emerald-50/75">{book.category} · {book.serialStatus} · {formatWordCount(book.words)}</p>
                        <h3 className="mt-2 line-clamp-2 break-words text-3xl font-semibold text-white sm:text-4xl">{headline}</h3>
                        <p className="mt-2 break-words text-sm text-emerald-50/75">{book.author}</p>
                        <p className="mt-3 inline-flex min-w-0 items-center gap-1.5 break-words text-xs text-amber-100/90" aria-label={`作品评分：${formatRating(book)}`}>
                          <Star size={14} fill="currentColor" aria-hidden="true" />
                          {formatRating(book)}
                        </p>
                        <p className="mt-4 line-clamp-3 max-w-lg break-words text-sm leading-7 text-emerald-50/90">{copy}</p>
                        <Button asChild className="mt-6 h-auto w-fit rounded-none bg-emerald-300 px-4 py-2.5 text-emerald-950 hover:bg-emerald-200">
                          <Link href={`/reader/${book.id}`} aria-label={`开始阅读《${book.title}》`}>
                            开始阅读
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              {carouselSlides.length > 1 ? (
                <div className="absolute bottom-4 right-4 z-20 flex gap-2 sm:bottom-7 sm:right-7">
                  <CarouselPrevious className="static size-10 translate-x-0 translate-y-0 border-emerald-100/50 bg-emerald-950/70 text-white hover:bg-emerald-900 hover:text-white" />
                  <CarouselNext className="static size-10 translate-x-0 translate-y-0 border-emerald-100/50 bg-emerald-950/70 text-white hover:bg-emerald-900 hover:text-white" />
                </div>
              ) : null}
            </Carousel>
            <DotGrid
              interactionTargetRef={editorialHeroRef}
              dotSize={3}
              gap={24}
              baseColor="#6b8978"
              activeColor="#a7f3d0"
              proximity={96}
              speedTrigger={900}
              maxSpeed={1800}
              resistance={1600}
              returnDuration={0.55}
              shockRadius={165}
              shockStrength={1.25}
              className="pointer-events-none absolute inset-0 z-10 opacity-45"
            />
          </div>
        ) : null}
      </section>

      {home?.hot.length ? (
        <section className="mt-9 border-y border-emerald-950/40 py-5" aria-labelledby="hot-heading">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Flame size={18} className="text-rose-700" aria-hidden="true" />
              <h2 id="hot-heading" className="text-xl font-semibold text-stone-950">热读榜</h2>
            </div>
            <span className="shrink-0 text-xs text-stone-700">按热度排序</span>
          </div>
          <ol className="mt-4 grid divide-y divide-emerald-950/25 border-y border-emerald-950/40 md:grid-cols-2 md:gap-x-6 md:divide-y-0">
            {home.hot.map((book, index) => (
              <li key={book.id} className="flex min-w-0 items-center gap-3 px-3 py-3 first:pl-0 last:pr-0">
                <span className="w-6 shrink-0 text-sm font-semibold text-rose-700">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/reader/${book.id}`} className="block truncate text-sm font-semibold text-stone-900 hover:text-emerald-800">{book.title}</Link>
                  <p className="mt-0.5 truncate text-xs text-stone-500">{book.author} · {book.category} · {formatRating(book)}</p>
                </div>
                <span className="shrink-0 text-xs text-stone-500">{formatHeat(book.heat)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-9" aria-labelledby="discovery-heading">
        <div className="flex flex-col gap-5 border-b border-emerald-950/40 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">作品目录</p>
            <h2 id="discovery-heading" className="mt-1 text-2xl font-semibold text-stone-950">发现作品</h2>
          </div>
          <form onSubmit={submitSearch} className="flex min-w-0 w-full max-w-md items-center border border-emerald-950/45 bg-white/90 focus-within:border-emerald-700 lg:w-[26rem]">
            <Search className="ml-3 shrink-0 text-stone-500" size={17} aria-hidden="true" />
            <Input
              aria-label="搜索作品、作者或关键词"
              className="h-11 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0"
              value={query}
              maxLength={100}
              placeholder="搜索书名、作者或关键词"
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" variant="ghost" className="h-11 rounded-none border-l border-stone-300 px-3 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-950">
              搜索
            </Button>
          </form>
        </div>

        {hotSearchTerms.length ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2" aria-label="热搜词">
            <span className="mr-1 text-xs font-medium text-stone-500">热搜</span>
            {hotSearchTerms.map((term) => (
              <Button
                key={term.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyHotSearch(term.term)}
                className="h-auto max-w-full whitespace-normal break-words rounded-none border-amber-200 bg-amber-50 px-2.5 py-1.5 text-left text-amber-900 hover:border-amber-500 hover:bg-amber-100 hover:text-amber-950"
              >
                {term.term}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-stone-700"><SlidersHorizontal size={16} aria-hidden="true" />筛选</span>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-stone-500">题材</span>
            <ToggleGroup
              type="single"
              value={filters.category}
              onValueChange={(category) => {
                if (!category) return;
                setCatalogPage(0);
                setFilters((current) => ({ ...current, category }));
              }}
              aria-label="按分类筛选"
              className="w-full min-w-0 max-w-full flex-wrap justify-start gap-2 rounded-none"
            >
              {categories.map((item) => <ToggleGroupItem key={item} value={item} className={filterToggleItemClass('emerald')}>{item}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-stone-500">字数</span>
            <ToggleGroup
              type="single"
              value={filters.wordRangeKey}
              onValueChange={(wordRangeKey) => {
                if (!wordRangeKey) return;
                setCatalogPage(0);
                setFilters((current) => ({ ...current, wordRangeKey }));
              }}
              aria-label="按字数筛选"
              className="w-full min-w-0 max-w-full flex-wrap justify-start gap-2 rounded-none"
            >
              <ToggleGroupItem value={ALL} className={filterToggleItemClass('violet')}>全部</ToggleGroupItem>
              {wordRanges.map((range) => <ToggleGroupItem key={range.key} value={range.key} className={filterToggleItemClass('violet')}>{range.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <span className="text-xs text-stone-500">状态</span>
            <ToggleGroup
              type="single"
              value={filters.serialStatus}
              onValueChange={(serialStatus) => {
                if (!serialStatus) return;
                setCatalogPage(0);
                setFilters((current) => ({ ...current, serialStatus }));
              }}
              aria-label="按连载状态筛选"
              className="w-full min-w-0 max-w-full flex-wrap justify-start gap-2 rounded-none"
            >
              {serialStatuses.map((item) => <ToggleGroupItem key={item} value={item} className={filterToggleItemClass('stone')}>{item}</ToggleGroupItem>)}
            </ToggleGroup>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="h-auto rounded-none px-1 text-stone-600 hover:bg-transparent hover:text-rose-700" title="清除全部筛选">
                <X size={15} aria-hidden="true" />清除
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <div className="mt-6"><InlineNotice tone="error">{error}</InlineNotice></div> : null}

        {loading ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite" aria-label="正在加载作品">
            {[0, 1, 2].map((item) => <Skeleton key={item} className="h-52 rounded-none border border-emerald-950/35 bg-white/90" />)}
          </div>
        ) : null}

        {!loading && !error && books.length === 0 ? (
          <div className="mt-7 border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
            <BookOpen className="mx-auto text-stone-400" size={28} aria-hidden="true" />
            <p className="mt-3 font-medium text-stone-800">没有找到匹配的作品</p>
            <Button type="button" variant="link" size="sm" onClick={resetFilters} className="mt-3 h-auto rounded-none px-0 text-emerald-800 hover:text-emerald-950">查看全部作品</Button>
          </div>
        ) : null}

        {!loading && !error && books.length > 0 ? (
          <div id="books" className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {books.map((book) => (
              <Card key={book.id} className="group grid min-h-56 grid-cols-[88px_minmax(0,1fr)] gap-4 rounded-none border-emerald-950/35 bg-white/90 p-4 transition-colors hover:border-emerald-700">
                <BookCover cover={book.cover} title={book.title} category={book.category} className="min-h-44" />
                <CardContent className="flex min-w-0 flex-col p-0 [&:last-child]:pb-0">
                  <p className="truncate text-xs font-medium text-emerald-700">{book.category} · {book.serialStatus}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-stone-950">{highlightText(book.title, filters.query)}</h3>
                  <p className="mt-1 truncate text-sm text-stone-600">{highlightText(book.author, filters.query)}</p>
                  <p className="mt-3 line-clamp-2 break-words text-sm leading-5 text-stone-600">{highlightText(book.synopsis, filters.query)}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div className="min-w-0 space-y-1 text-xs text-stone-500">
                      <span className="block">{formatWordCount(book.words)}</span>
                      <span className="inline-flex min-w-0 items-center gap-1 break-words text-amber-700" aria-label={`作品评分：${formatRating(book)}`}>
                        <Star size={13} fill="currentColor" aria-hidden="true" />
                        {formatRating(book)}
                      </span>
                    </div>
                    <Link href={`/reader/${book.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">
                      开始阅读
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        {!error && catalogPagination.total > 0 ? (
          <CatalogPagination
            total={catalogPagination.total}
            page={catalogPagination.page}
            size={catalogPagination.size}
            loading={loading}
            onPageChange={setCatalogPage}
          />
        ) : null}
      </section>
        </div>
      </div>
    </NovelShell>
  );
}
