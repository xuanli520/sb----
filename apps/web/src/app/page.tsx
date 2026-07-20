'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Search, SlidersHorizontal, X } from 'lucide-react';
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { InlineNotice, NovelPageHeader, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import { Book, novelApi } from '@/features/novel/api';

const categories = ['全部', '科幻', '悬疑', '古言'];
const serialStatuses = ['全部', '连载中', '已完结'];

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

export default function BookstorePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [serialStatus, setSerialStatus] = useState('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBooks = useCallback(async (requestedQuery: string, requestedCategory: string, requestedStatus: string) => {
    const params = new URLSearchParams();
    if (requestedQuery.trim()) params.set('q', requestedQuery.trim());
    if (requestedCategory !== '全部') params.set('category', requestedCategory);
    if (requestedStatus !== '全部') params.set('status', requestedStatus);

    setLoading(true);
    setError('');
    try {
      const queryString = params.toString();
      const response = await novelApi<{ items: Book[] }>(`public/books${queryString ? `?${queryString}` : ''}`);
      setBooks(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '书城暂时无法加载，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBooks('', '全部', '全部');
  }, [loadBooks]);

  const featuredBook = useMemo(() => books[0], [books]);
  const recommendationBooks = useMemo(
    () => featuredBook ? books.filter((book) => book.id !== featuredBook.id) : books,
    [books, featuredBook],
  );
  const hasFilters = Boolean(submittedQuery || category !== '全部' || serialStatus !== '全部');

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(query);
    void loadBooks(query, category, serialStatus);
  };

  const chooseCategory = (value: string) => {
    setCategory(value);
    void loadBooks(submittedQuery, value, serialStatus);
  };

  const chooseStatus = (value: string) => {
    setSerialStatus(value);
    void loadBooks(submittedQuery, category, value);
  };

  const resetFilters = () => {
    setQuery('');
    setSubmittedQuery('');
    setCategory('全部');
    setSerialStatus('全部');
    void loadBooks('', '全部', '全部');
  };

  return (
    <NovelShell workspace="reader">
      <NovelPageHeader
        eyebrow="阅界书城"
        title="找到下一段值得读完的故事。"
        description="按题材、连载状态或关键词浏览已经上线的作品。"
      />

      {featuredBook ? (
        <section className="relative mt-7 min-h-[360px] overflow-hidden border border-slate-800 bg-slate-950 text-white sm:min-h-[400px]">
          <Image
            src="/images/novel-store-hero-gpt-image-2-v1.png"
            alt="星海拾光的深空探索场景"
            fill
            priority
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,14,.98)_0%,rgba(2,6,14,.93)_35%,rgba(2,6,14,.25)_68%,rgba(2,6,14,.08)_100%)]" />
          <div className="relative flex min-h-[360px] max-w-xl flex-col justify-end p-6 sm:min-h-[400px] sm:p-9">
            <p className="text-xs font-semibold tracking-[0.18em] text-cyan-200">本周选读 / EDITOR&apos;S PICK</p>
            <p className="mt-5 text-sm text-slate-300">{featuredBook.category} · {featuredBook.serialStatus} · {formatWordCount(featuredBook.words)}</p>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{featuredBook.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{featuredBook.author}</p>
            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-200">{featuredBook.synopsis}</p>
            <Link
              href={`/reader/${featuredBook.id}`}
              className="mt-6 inline-flex w-fit items-center gap-2 bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200"
            >
              开始阅读
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mt-9" aria-labelledby="recommendations-heading">
        <div className="flex flex-col gap-5 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">作品目录</p>
            <h2 id="recommendations-heading" className="mt-1 text-2xl font-semibold text-stone-950">编辑推荐</h2>
          </div>
          <form onSubmit={submitSearch} className="flex w-full max-w-md items-center border border-stone-300 bg-white focus-within:border-emerald-700 lg:w-[26rem]">
            <Search className="ml-3 shrink-0 text-stone-500" size={17} aria-hidden="true" />
            <input
              aria-label="搜索作品、作者或关键词"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-stone-400"
              value={query}
              placeholder="搜索书名、作者或关键词"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="border-l border-stone-300 px-3 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
              搜索
            </button>
          </form>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center">
          <span className="inline-flex items-center gap-2 font-medium text-stone-700"><SlidersHorizontal size={16} aria-hidden="true" />筛选</span>
          <div className="flex flex-wrap gap-2" aria-label="按分类筛选">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseCategory(item)}
                aria-pressed={category === item}
                className={`border px-3 py-1.5 text-sm transition-colors ${category === item ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-700'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="hidden h-5 border-l border-stone-300 sm:block" aria-hidden="true" />
          <div className="flex flex-wrap gap-2" aria-label="按连载状态筛选">
            {serialStatuses.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseStatus(item)}
                aria-pressed={serialStatus === item}
                className={`border px-3 py-1.5 text-sm transition-colors ${serialStatus === item ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'}`}
              >
                {item}
              </button>
            ))}
          </div>
          {hasFilters ? (
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 self-start text-sm text-stone-600 hover:text-rose-700" title="清除全部筛选">
              <X size={15} aria-hidden="true" />清除
            </button>
          ) : null}
        </div>

        {error ? <div className="mt-6"><InlineNotice tone="error">{error}</InlineNotice></div> : null}

        {loading ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="正在加载作品">
            {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse border border-stone-200 bg-white" />)}
          </div>
        ) : null}

        {!loading && !error && books.length === 0 ? (
          <div className="mt-7 border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
            <BookOpen className="mx-auto text-stone-400" size={28} aria-hidden="true" />
            <p className="mt-3 font-medium text-stone-800">没有找到匹配的作品</p>
            <button type="button" onClick={resetFilters} className="mt-3 text-sm font-medium text-emerald-800 hover:text-emerald-950">查看全部作品</button>
          </div>
        ) : null}

        {!loading && !error && recommendationBooks.length > 0 ? (
          <div id="books" className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recommendationBooks.map((book) => (
              <article key={book.id} className="group grid min-h-56 grid-cols-[88px_minmax(0,1fr)] gap-4 border border-stone-200 bg-white p-4 transition-colors hover:border-emerald-700">
                <div className="flex min-h-44 flex-col justify-between p-3 text-white" style={{ backgroundColor: book.cover }}>
                  <span className="text-xs font-semibold text-white/80">{book.category}</span>
                  <span className="text-sm font-semibold leading-5">{book.title.slice(0, 4)}</span>
                </div>
                <div className="flex min-w-0 flex-col">
                  <p className="text-xs font-medium text-emerald-700">{book.category} · {book.serialStatus}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-stone-950">{highlightText(book.title, submittedQuery)}</h3>
                  <p className="mt-1 text-sm text-stone-600">{highlightText(book.author, submittedQuery)}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-5 text-stone-600">{highlightText(book.synopsis, submittedQuery)}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <span className="text-xs text-stone-500">{formatWordCount(book.words)}</span>
                    <Link href={`/reader/${book.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:text-emerald-950">
                      开始阅读
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </NovelShell>
  );
}
