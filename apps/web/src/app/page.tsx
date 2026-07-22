'use client';

import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, BookOpen, Flame, Search, SlidersHorizontal, X } from 'lucide-react';
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import { Skeleton } from '@/app/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { InlineNotice, NovelPageHeader, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import { BookCover } from '@/components/novel/BookCover';
import { DotGrid } from '@/components/novel/DotGrid';
import {
  type Book,
  type DiscoveryWordCountRange,
  type PublicCatalogPage,
  type PublicDiscoveryHome,
  type PublicTaxonomyItem,
  novelApi,
} from '@/features/novel/api';

const ALL = '全部';
const fallbackCategories = ['科幻', '悬疑', '古言'];
const fallbackSerialStatuses = ['连载中', '已完结'];
const fallbackWordRanges: DiscoveryWordCountRange[] = [
  { key: 'under-100k', label: '10 万字以下', minWords: null, maxWords: 99_999 },
  { key: '100k-300k', label: '10-30 万字', minWords: 100_000, maxWords: 299_999 },
  { key: '300k-500k', label: '30-50 万字', minWords: 300_000, maxWords: 499_999 },
  { key: 'over-500k', label: '50 万字以上', minWords: 500_000, maxWords: null },
];

const ColorBends = dynamic(
  () => import('@/components/novel/ColorBends').then((module) => module.ColorBends),
  { ssr: false },
);

const homeBackgroundColors = ['#0b4936', '#236b52', '#5f8972', '#bbcbbb'];

const heroArtworkByCategory: Record<string, { src: string; scene: string }> = {
  科幻: { src: '/images/bookstore-hero-sci-fi-gpt-image-2-v3.png', scene: '星图藏书阁场景' },
  悬疑: { src: '/images/bookstore-hero-mystery-gpt-image-2-v3.png', scene: '雨夜档案室场景' },
  古言: { src: '/images/bookstore-hero-classic-gpt-image-2-v3.png', scene: '竹影书斋场景' },
};

function heroArtwork(category: string) {
  return heroArtworkByCategory[category] ?? heroArtworkByCategory['科幻'];
}

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

function filterToggleItemClass(tone: 'emerald' | 'violet' | 'stone') {
  const selected = {
    emerald: 'data-[state=on]:border-emerald-700 data-[state=on]:bg-emerald-700 data-[state=on]:text-white data-[state=on]:hover:bg-emerald-800',
    violet: 'data-[state=on]:border-violet-700 data-[state=on]:bg-violet-700 data-[state=on]:text-white data-[state=on]:hover:bg-violet-800',
    stone: 'data-[state=on]:border-stone-900 data-[state=on]:bg-stone-900 data-[state=on]:text-white data-[state=on]:hover:bg-stone-800',
  }[tone];
  return `h-auto min-w-0 flex-none rounded-none border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-none transition-colors first:rounded-none last:rounded-none hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 ${selected}`;
}

export default function BookstorePage() {
  const [books, setBooks] = useState<Book[]>([]);
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
  const editorialHeroRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(
    () => [
      ALL,
      ...(taxonomyCategories ?? (home?.facets?.categories?.length ? home.facets.categories : fallbackCategories)),
    ],
    [home, taxonomyCategories],
  );
  const serialStatuses = useMemo(
    () => [ALL, ...(home?.facets?.serialStatuses?.length ? home.facets.serialStatuses : fallbackSerialStatuses)],
    [home],
  );
  const wordRanges = home?.facets?.wordCountRanges?.length ? home.facets.wordCountRanges : fallbackWordRanges;
  const selectedWordRange = wordRanges.find((range) => range.key === filters.wordRangeKey);

  useEffect(() => {
    let cancelled = false;
    setHomeLoading(true);
    setHomeError('');

    void novelApi<PublicDiscoveryHome>('public/home')
      .then((response) => {
        if (!cancelled) setHome(response);
      })
      .catch((reason) => {
        if (!cancelled) setHomeError(reason instanceof Error ? reason.message : '编辑推荐暂时无法加载。');
      })
      .finally(() => {
        if (!cancelled) setHomeLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

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
        // The discovery home contract remains usable while an operations taxonomy deployment is
        // unavailable, so retain the catalog/default facet fallback rather than failing the page.
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

    setLoading(true);
    setError('');
    const queryString = params.toString();
    void novelApi<PublicCatalogPage>(`public/books${queryString ? `?${queryString}` : ''}`)
      .then((response) => {
        if (!cancelled) setBooks(response.items);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '书城暂时无法加载，请稍后重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filters.category, filters.query, filters.serialStatus, selectedWordRange?.maxWords, selectedWordRange?.minWords]);

  const hasFilters = Boolean(
    filters.query
    || filters.category !== ALL
    || filters.serialStatus !== ALL
    || filters.wordRangeKey !== ALL,
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, query: query.trim() }));
  };

  const resetFilters = () => {
    setQuery('');
    setFilters({ query: '', category: ALL, serialStatus: ALL, wordRangeKey: ALL });
  };

  const applyHotSearch = (term: string) => {
    const normalized = term.trim();
    if (!normalized) return;
    setQuery(normalized);
    setFilters((current) => ({ ...current, query: normalized }));
  };

  const hotSearchTerms = home?.hotSearchTerms?.filter((term) => term.enabled && term.term.trim()) ?? [];

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
        <div className="flex items-end justify-between gap-4 border-b border-emerald-950/40 pb-3">
          <div>
            <p className="text-xs font-semibold text-emerald-700">本周选读</p>
            <h2 id="editorial-heading" className="mt-1 text-2xl font-semibold text-stone-950">编辑推荐</h2>
          </div>
          <span className="text-xs text-stone-700">按编辑排序</span>
        </div>

        {homeLoading ? <Skeleton className="mt-4 h-[360px] rounded-none border border-stone-200 bg-white sm:h-[400px]" role="status" aria-live="polite" aria-label="正在加载编辑推荐" /> : null}
        {homeError ? <div className="mt-4"><InlineNotice tone="error">{homeError}</InlineNotice></div> : null}
        {!homeLoading && !homeError && home?.carousel.length ? (
          <div ref={editorialHeroRef} className="relative mt-4">
            <Carousel
              className="overflow-hidden border border-emerald-950/80 bg-[#071d13] text-white"
              opts={{ align: 'start', loop: home.carousel.length > 1 }}
              aria-label="书城精选"
            >
              <CarouselContent className="ml-0">
                {home.carousel.map((book, index) => {
                  const artwork = heroArtwork(book.category);
                  return (
                    <CarouselItem
                      key={book.id}
                      className="relative min-h-[360px] pl-0 sm:min-h-[400px]"
                      aria-label={`第 ${index + 1} 张，${book.title}`}
                    >
                      <Image
                        src={artwork.src}
                        alt={`${book.title}的${artwork.scene}`}
                        fill
                        priority={index === 0}
                        sizes="(max-width: 1200px) 100vw, 1200px"
                        className="object-cover object-center"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,20,13,.98)_0%,rgba(5,29,19,.92)_38%,rgba(6,27,19,.35)_72%,rgba(6,27,19,.08)_100%)]" />
                      <div className="relative z-20 flex min-h-[360px] max-w-xl flex-col justify-end p-6 sm:min-h-[400px] sm:p-9">
                        <p className="text-xs font-semibold tracking-[0.18em] text-emerald-200">EDITOR&apos;S PICK</p>
                        <p className="mt-5 text-sm text-emerald-50/75">{book.category} · {book.serialStatus} · {formatWordCount(book.words)}</p>
                        <h3 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{book.title}</h3>
                        <p className="mt-2 text-sm text-emerald-50/75">{book.author}</p>
                        <p className="mt-5 max-w-lg text-sm leading-7 text-emerald-50/90">{book.synopsis}</p>
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
              {home.carousel.length > 1 ? (
                <div className="absolute bottom-5 right-5 z-20 flex gap-2 sm:bottom-7 sm:right-7">
                  <CarouselPrevious className="static size-9 translate-x-0 translate-y-0 border-emerald-100/50 bg-emerald-950/70 text-white hover:bg-emerald-900 hover:text-white" />
                  <CarouselNext className="static size-9 translate-x-0 translate-y-0 border-emerald-100/50 bg-emerald-950/70 text-white hover:bg-emerald-900 hover:text-white" />
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-rose-700" aria-hidden="true" />
              <h2 id="hot-heading" className="text-xl font-semibold text-stone-950">热读榜</h2>
            </div>
            <span className="text-xs text-stone-700">按热度排序</span>
          </div>
          <ol className="mt-4 grid divide-y divide-emerald-950/25 border-y border-emerald-950/40 md:grid-cols-2 md:gap-x-6 md:divide-y-0">
            {home.hot.map((book, index) => (
              <li key={book.id} className="flex min-w-0 items-center gap-3 px-3 py-3 first:pl-0 last:pr-0">
                <span className="w-6 shrink-0 text-sm font-semibold text-rose-700">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/reader/${book.id}`} className="block truncate text-sm font-semibold text-stone-900 hover:text-emerald-800">{book.title}</Link>
                  <p className="mt-0.5 truncate text-xs text-stone-500">{book.author} · {book.category}</p>
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
          <form onSubmit={submitSearch} className="flex w-full max-w-md items-center border border-emerald-950/45 bg-white/90 focus-within:border-emerald-700 lg:w-[26rem]">
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
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="热搜词">
            <span className="mr-1 text-xs font-medium text-stone-500">热搜</span>
            {hotSearchTerms.map((term) => (
              <Button
                key={term.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyHotSearch(term.term)}
                className="h-auto rounded-none border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900 hover:border-amber-500 hover:bg-amber-100 hover:text-amber-950"
              >
                {term.term}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-stone-700"><SlidersHorizontal size={16} aria-hidden="true" />筛选</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-stone-500">题材</span>
            <ToggleGroup
              type="single"
              value={filters.category}
              onValueChange={(category) => { if (category) setFilters((current) => ({ ...current, category })); }}
              aria-label="按分类筛选"
              className="w-auto flex-wrap gap-2 rounded-none"
            >
              {categories.map((item) => <ToggleGroupItem key={item} value={item} className={filterToggleItemClass('emerald')}>{item}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-stone-500">字数</span>
            <ToggleGroup
              type="single"
              value={filters.wordRangeKey}
              onValueChange={(wordRangeKey) => { if (wordRangeKey) setFilters((current) => ({ ...current, wordRangeKey })); }}
              aria-label="按字数筛选"
              className="w-auto flex-wrap gap-2 rounded-none"
            >
              <ToggleGroupItem value={ALL} className={filterToggleItemClass('violet')}>全部</ToggleGroupItem>
              {wordRanges.map((range) => <ToggleGroupItem key={range.key} value={range.key} className={filterToggleItemClass('violet')}>{range.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-stone-500">状态</span>
            <ToggleGroup
              type="single"
              value={filters.serialStatus}
              onValueChange={(serialStatus) => { if (serialStatus) setFilters((current) => ({ ...current, serialStatus })); }}
              aria-label="按连载状态筛选"
              className="w-auto flex-wrap gap-2 rounded-none"
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
                  <p className="text-xs font-medium text-emerald-700">{book.category} · {book.serialStatus}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-stone-950">{highlightText(book.title, filters.query)}</h3>
                  <p className="mt-1 text-sm text-stone-600">{highlightText(book.author, filters.query)}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-5 text-stone-600">{highlightText(book.synopsis, filters.query)}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <span className="text-xs text-stone-500">{formatWordCount(book.words)}</span>
                    <Link href={`/reader/${book.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">
                      开始阅读
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </section>
        </div>
      </div>
    </NovelShell>
  );
}
