'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Moon,
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { InlineNotice, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import { Book, novelApi } from '@/features/novel/api';

type Chapter = { id: number; title: string; content: string; published: boolean; orderNo: number };
type Comment = { id: number; authorName: string; content: string; status: string };
type BookmarkItem = { id: number; chapterId: number; offset: number; note: string; createdAt: string };
type Detail = { book: Book; chapters: Chapter[]; comments: Comment[] };
type Preference = { theme: 'paper' | 'sepia' | 'night'; font: string; fontSize: number; lineHeight: number; brightness: number; pageMode: 'slide' | 'cover' | 'simulation' };
type Notice = { message: string; tone: 'success' | 'error' };

const defaultPreference: Preference = {
  theme: 'paper',
  font: 'serif',
  fontSize: 19,
  lineHeight: 190,
  brightness: 85,
  pageMode: 'slide',
};

const themeOptions: Array<{ value: Preference['theme']; label: string; className: string }> = [
  { value: 'paper', label: '纸白', className: 'bg-[#fffdf7] text-stone-900' },
  { value: 'sepia', label: '暖褐', className: 'bg-[#f1e4c8] text-stone-900' },
  { value: 'night', label: '夜读', className: 'bg-[#1e2825] text-stone-100' },
];

const readerTheme: Record<Preference['theme'], { page: string; text: string; muted: string; border: string }> = {
  paper: { page: '#fffdf7', text: '#292821', muted: '#716f63', border: '#e4dfd1' },
  sepia: { page: '#f1e4c8', text: '#453d30', muted: '#736957', border: '#d9c8a9' },
  night: { page: '#1e2825', text: '#e8ece6', muted: '#a9b4ad', border: '#3b4b45' },
};

function preferenceLabel(mode: Preference['pageMode']) {
  return { slide: '滑动翻页', cover: '覆盖翻页', simulation: '仿真翻页' }[mode];
}

export default function Reader({ params }: { params: Promise<{ id: string }> }) {
  const [detail, setDetail] = useState<Detail>();
  const [preference, setPreference] = useState<Preference>(defaultPreference);
  const [activeChapterId, setActiveChapterId] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(0);
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingAction, setPendingAction] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { id } = await params;
        const bookDetail = await novelApi<Detail>(`public/books/${id}`);
        if (cancelled) return;

        setDetail(bookDetail);
        setActiveChapterId(bookDetail.chapters[0]?.id);

        const firstChapter = bookDetail.chapters[0];
        if (!firstChapter) return;

        const [preferencesResult, shelfResult, bookmarksResult] = await Promise.allSettled([
          novelApi<Preference>('account/preferences/reading'),
          novelApi<Book[]>('account/bookshelf'),
          novelApi<BookmarkItem[]>(`account/books/${bookDetail.book.id}/bookmarks`),
        ]);
        if (cancelled) return;

        if (preferencesResult.status === 'fulfilled') setPreference(preferencesResult.value);
        if (shelfResult.status === 'fulfilled') setSaved(shelfResult.value.some((book) => book.id === bookDetail.book.id));
        if (bookmarksResult.status === 'fulfilled') setBookmarks(bookmarksResult.value);

        void novelApi('account/progress', 'reader', {
          method: 'PUT',
          body: JSON.stringify({ bookId: bookDetail.book.id, chapterId: firstChapter.id, offset: 0 }),
        });
      } catch (reason) {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : '章节暂时无法打开。');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [params]);

  const chapter = useMemo(
    () => detail?.chapters.find((item) => item.id === activeChapterId) ?? detail?.chapters[0],
    [activeChapterId, detail],
  );
  const activeChapterIndex = detail && chapter ? detail.chapters.findIndex((item) => item.id === chapter.id) : -1;
  const theme = readerTheme[preference.theme];

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const savePreference = async (next: Preference) => {
    setPreference(next);
    try {
      await novelApi<Preference>('account/preferences/reading', 'reader', { method: 'PUT', body: JSON.stringify(next) });
    } catch {
      announce('阅读设置仅保存在当前页面；登录后可跨设备同步。', 'error');
    }
  };

  const selectChapter = async (nextChapter: Chapter) => {
    if (!detail || nextChapter.id === chapter?.id) return;
    setActiveChapterId(nextChapter.id);
    try {
      await novelApi('account/progress', 'reader', {
        method: 'PUT',
        body: JSON.stringify({ bookId: detail.book.id, chapterId: nextChapter.id, offset: 0 }),
      });
    } catch {
      // Public reading remains available when the current visitor has no reader session.
    }
  };

  const toggleShelf = async () => {
    if (!detail) return;
    setPendingAction('shelf');
    try {
      const result = await novelApi<{ saved: boolean }>(`account/bookshelf/${detail.book.id}`, 'reader', { method: 'POST' });
      setSaved(result.saved);
      announce(result.saved ? '已加入书架，可以在登录后继续阅读。' : '已从书架移除。');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '加入书架失败，请先选择读者身份。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const addBookmark = async () => {
    if (!detail || !chapter) return;
    setPendingAction('bookmark');
    try {
      const result = await novelApi<BookmarkItem>(`account/books/${detail.book.id}/bookmarks`, 'reader', {
        method: 'POST',
        body: JSON.stringify({ chapterId: chapter.id, offset: 0, note: chapter.title }),
      });
      setBookmarks((items) => [result, ...items]);
      announce('已添加书签');
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '添加书签失败，请先选择读者身份。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const postComment = async () => {
    if (!detail || !chapter || !comment.trim()) return;
    setPendingAction('comment');
    try {
      const result = await novelApi<Comment>(`account/books/${detail.book.id}/comments`, 'reader', {
        method: 'POST',
        body: JSON.stringify({ chapterId: chapter.id, content: comment.trim() }),
      });
      setComment('');
      announce(result.status === 'VISIBLE' ? '评论已发布' : '评论已进入审核队列');
      if (result.status === 'VISIBLE') setDetail((current) => current ? { ...current, comments: [...current.comments, result] } : current);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '发表评论失败，请先选择读者身份。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const rateBook = async (value: number) => {
    if (!detail) return;
    setPendingAction('rating');
    try {
      await novelApi(`account/books/${detail.book.id}/rating`, 'reader', { method: 'POST', body: JSON.stringify({ rating: value }) });
      setRating(value);
      announce(`已为《${detail.book.title}》评分 ${value} 星。`);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '评分失败，请先选择读者身份。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const voteBook = async () => {
    if (!detail) return;
    setPendingAction('vote');
    try {
      const result = await novelApi<{ count: number }>(`account/books/${detail.book.id}/votes/recommendation`, 'reader', { method: 'POST' });
      announce(`推荐票已送出，作品当前获得 ${result.count} 票。`);
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '推荐失败，请先选择读者身份。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  if (loading) {
    return <NovelShell workspace="reader"><div className="grid min-h-[60vh] place-items-center text-sm text-stone-600">正在打开章节...</div></NovelShell>;
  }

  if (!detail || !chapter) {
    return (
      <NovelShell workspace="reader">
        <div className="mx-auto max-w-lg py-20">
          <InlineNotice tone="error">{loadError || '此作品暂时没有可阅读的章节。'}</InlineNotice>
          <Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-emerald-800 hover:text-emerald-950"><ArrowLeft size={16} aria-hidden="true" />返回书城</Link>
        </div>
      </NovelShell>
    );
  }

  return (
    <NovelShell workspace="reader">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-emerald-800"><ArrowLeft size={16} aria-hidden="true" />返回书城</Link>
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold text-stone-900">{detail.book.title}</p>
          <p className="text-xs text-stone-500">{detail.book.author} · {formatWordCount(detail.book.words)}</p>
        </div>
      </div>

      {notice ? <div className="mt-4"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <div className="mt-5 grid border border-stone-200 bg-white lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="border-b border-stone-200 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700">阅读目录</p>
              <p className="mt-1 font-semibold text-stone-950">{detail.book.title}</p>
            </div>
            <BookOpen className="shrink-0 text-emerald-700" size={19} aria-hidden="true" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <button type="button" onClick={() => void toggleShelf()} disabled={pendingAction === 'shelf'} className="inline-flex items-center justify-center gap-2 border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-60">
              {saved ? <Check size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
              {saved ? '已加入书架' : '加入书架'}
            </button>
            <button type="button" onClick={() => void addBookmark()} disabled={pendingAction === 'bookmark'} className="inline-flex items-center justify-center gap-2 border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-60">
              <Bookmark size={16} aria-hidden="true" />添加书签
            </button>
          </div>

          <ol className="mt-5 border-t border-stone-200 pt-3 text-sm">
            {detail.chapters.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void selectChapter(item)}
                  aria-current={item.id === chapter.id ? 'page' : undefined}
                  className={`flex w-full items-center gap-2 px-2 py-2.5 text-left transition-colors ${item.id === chapter.id ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-950'}`}
                >
                  <span className="w-5 shrink-0 text-xs text-stone-400">{item.orderNo}</span>
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {bookmarks.length > 0 ? (
            <div className="mt-5 border-t border-stone-200 pt-4">
              <p className="text-xs font-semibold text-stone-500">本书书签</p>
              <ul className="mt-2 space-y-2 text-sm text-stone-600">
                {bookmarks.slice(0, 3).map((item) => <li key={item.id} className="truncate">{item.note || '阅读书签'}</li>)}
              </ul>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0">
          <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3 sm:px-8">
            <span className="text-xs font-medium text-stone-500">{preferenceLabel(preference.pageMode)}</span>
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-emerald-800">
              <SlidersHorizontal size={17} aria-hidden="true" />阅读设置
            </button>
          </div>

          {settingsOpen ? (
            <div className="grid gap-5 border-b border-stone-200 bg-stone-50 px-5 py-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-4">
              <fieldset>
                <legend className="text-xs font-semibold text-stone-600">主题</legend>
                <div className="mt-2 flex gap-2">
                  {themeOptions.map((item) => (
                    <button key={item.value} type="button" onClick={() => void savePreference({ ...preference, theme: item.value })} aria-pressed={preference.theme === item.value} className={`border px-2.5 py-1.5 text-xs font-medium ${item.className} ${preference.theme === item.value ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-stone-300'}`}>
                      {item.value === 'night' ? <Moon className="mr-1 inline" size={13} aria-hidden="true" /> : <Sun className="mr-1 inline" size={13} aria-hidden="true" />}{item.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-xs font-semibold text-stone-600">字号 <span className="float-right text-stone-500">{preference.fontSize}px</span>
                <input aria-label="字号" className="mt-3 block w-full accent-emerald-700" type="range" min="16" max="26" value={preference.fontSize} onChange={(event) => setPreference({ ...preference, fontSize: Number(event.target.value) })} onBlur={() => void savePreference(preference)} />
              </label>
              <label className="block text-xs font-semibold text-stone-600">行距 <span className="float-right text-stone-500">{preference.lineHeight}%</span>
                <input aria-label="行距" className="mt-3 block w-full accent-emerald-700" type="range" min="140" max="230" step="10" value={preference.lineHeight} onChange={(event) => setPreference({ ...preference, lineHeight: Number(event.target.value) })} onBlur={() => void savePreference(preference)} />
              </label>
              <label className="block text-xs font-semibold text-stone-600">翻页模式
                <select aria-label="翻页模式" className="mt-2 block w-full border border-stone-300 bg-white px-2 py-1.5 text-sm font-normal text-stone-800" value={preference.pageMode} onChange={(event) => void savePreference({ ...preference, pageMode: event.target.value as Preference['pageMode'] })}>
                  <option value="slide">滑动</option>
                  <option value="cover">覆盖</option>
                  <option value="simulation">仿真</option>
                </select>
              </label>
            </div>
          ) : null}

          <article
            className="min-h-[620px] px-6 py-10 sm:px-12 sm:py-14 lg:px-16"
            style={{
              backgroundColor: theme.page,
              color: theme.text,
              borderColor: theme.border,
              fontSize: preference.fontSize,
              lineHeight: preference.lineHeight / 100,
              fontFamily: preference.font === 'serif' ? 'var(--font-sans-cn), serif' : 'var(--font-sans)',
              filter: `brightness(${preference.brightness}%)`,
            }}
          >
            <p className="text-xs font-semibold text-emerald-700">{detail.book.title} · 第 {chapter.orderNo} 章</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">{chapter.title}</h1>
            <div className="mt-10 space-y-7">
              {chapter.content.split('\n').filter(Boolean).map((paragraph, index) => <p key={`${paragraph}-${index}`} className="max-w-2xl">{paragraph}</p>)}
            </div>
            <p className="mt-16 border-t pt-5 text-sm" style={{ borderColor: theme.border, color: theme.muted }}>本章阅读完毕</p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => { const previous = detail.chapters[activeChapterIndex - 1]; if (previous) void selectChapter(previous); }} disabled={activeChapterIndex <= 0} className="inline-flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={17} aria-hidden="true" />上一章</button>
              <button type="button" onClick={() => { const next = detail.chapters[activeChapterIndex + 1]; if (next) void selectChapter(next); }} disabled={activeChapterIndex >= detail.chapters.length - 1} className="inline-flex items-center gap-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">下一章<ChevronRight size={17} aria-hidden="true" /></button>
            </div>
          </article>

          <section className="border-t border-stone-200 bg-white px-6 py-8 sm:px-12 lg:px-16" aria-labelledby="chapter-interaction-heading">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold text-emerald-700">本章互动</p>
                <h2 id="chapter-interaction-heading" className="mt-1 text-xl font-semibold text-stone-950">留下你的阅读感受</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center" aria-label="为作品评分">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button key={value} type="button" aria-label={`评分 ${value} 星`} onClick={() => void rateBook(value)} disabled={pendingAction === 'rating'} className="p-1 text-amber-500 disabled:opacity-50">
                      <Star size={18} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void voteBook()} disabled={pendingAction === 'vote'} className="inline-flex items-center gap-1 border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-50">
                  <Ticket size={16} aria-hidden="true" />投推荐票
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <MessageSquare className="mt-2.5 shrink-0 text-stone-500" size={17} aria-hidden="true" />
              <input aria-label="发表评论" value={comment} onChange={(event) => setComment(event.target.value)} className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700" placeholder="写下此刻的想法" />
              <button type="button" onClick={() => void postComment()} disabled={pendingAction === 'comment' || !comment.trim()} className="bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">发布</button>
            </div>

            <div className="mt-6 space-y-4">
              {detail.comments.length === 0 ? <p className="text-sm text-stone-500">还没有章评，成为第一个留下感受的读者。</p> : null}
              {detail.comments.map((item) => (
                <article key={item.id} className="border-l-2 border-emerald-600 pl-4 text-sm leading-6 text-stone-700">
                  <p className="font-semibold text-stone-900">{item.authorName}</p>
                  <p className="mt-1">{item.content}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 text-sm text-stone-500"><ArrowRight size={15} aria-hidden="true" />阅读进度会在登录读者身份后同步</div>
    </NovelShell>
  );
}
