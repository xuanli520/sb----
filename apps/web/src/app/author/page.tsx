'use client';

import Link from 'next/link';
import { BookCopy, FileText, PenLine, Plus, Save, Send, SquarePen } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { InlineNotice, NovelPageHeader, NovelShell, NovelStatusBadge, formatWordCount } from '@/components/novel/NovelShell';
import { Book, novelApi } from '@/features/novel/api';

type ChapterResult = { id: number; published: boolean };
type Notice = { message: string; tone: 'success' | 'error' };

const bookCategories = ['科幻', '悬疑', '古言'];

export default function AuthorPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number>();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(bookCategories[0]);
  const [synopsis, setSynopsis] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const items = await novelApi<Book[]>('author/books', 'author');
      setBooks(items);
      setSelectedBookId((current) => current ?? items[0]?.id);
    } catch (reason) {
      setNotice({ message: reason instanceof Error ? reason.message : '作品库暂时无法加载。', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBooks(); }, [loadBooks]);

  const selectedBook = useMemo(() => books.find((book) => book.id === selectedBookId), [books, selectedBookId]);
  const totalWords = useMemo(() => books.reduce((sum, book) => sum + book.words, 0), [books]);
  const pendingBooks = useMemo(() => books.filter((book) => ['PENDING_REVIEW', 'NEEDS_REVIEW'].includes(book.status)).length, [books]);

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const createBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction('book');
    try {
      const book = await novelApi<Book>('author/books', 'author', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), category, synopsis: synopsis.trim() }),
      });
      setTitle('');
      setSynopsis('');
      setSelectedBookId(book.id);
      announce(`《${book.title}》已保存为草稿`);
      await loadBooks();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '新建作品失败，请检查必填内容。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const saveChapter = async (submit: boolean) => {
    if (!selectedBookId || !chapterTitle.trim() || !chapterContent.trim()) {
      announce('请先选择作品，并补全章节标题和正文。', 'error');
      return;
    }
    setPendingAction(submit ? 'submit-chapter' : 'draft-chapter');
    try {
      const result = await novelApi<ChapterResult>(`author/books/${selectedBookId}/chapters`, 'author', {
        method: 'POST',
        body: JSON.stringify({ title: chapterTitle.trim(), content: chapterContent.trim(), submit }),
      });
      setChapterTitle('');
      setChapterContent('');
      announce(submit ? (result.published ? '章节已通过自动筛查并发布' : '章节已拦截，作品进入人工复核') : '章节草稿已保存');
      await loadBooks();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '章节保存失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const submitBook = async () => {
    if (!selectedBookId) {
      announce('请先在作品库中选择一部作品。', 'error');
      return;
    }
    setPendingAction('submit-book');
    try {
      await novelApi(`author/books/${selectedBookId}/submit`, 'author', { method: 'POST' });
      announce('已提交完整作品审核');
      await loadBooks();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '提交审核失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <NovelShell workspace="author">
      <NovelPageHeader
        eyebrow="作家中心"
        title="今天，写下新的章节。"
        description="从草稿、章节存稿到完整作品审核，所有内容都只在你的作品范围内管理。"
        actions={<Link href="/" className="inline-flex items-center gap-2 border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><BookCopy size={16} aria-hidden="true" />返回书城</Link>}
      />

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <section className="mt-7 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-3" aria-label="作者概览">
        {[
          { label: '我的作品', value: books.length.toLocaleString('zh-CN'), icon: BookCopy },
          { label: '累计字数', value: formatWordCount(totalWords), icon: FileText },
          { label: '待审核作品', value: pendingBooks.toLocaleString('zh-CN'), icon: Send },
        ].map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className="bg-white px-5 py-5"><Icon size={18} className="text-emerald-700" aria-hidden="true" /><strong className="mt-3 block text-2xl font-semibold text-stone-950">{metric.value}</strong><span className="mt-1 block text-sm text-stone-600">{metric.label}</span></div>;
        })}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <div className="border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">作品库</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">正在创作的故事</h2>
            </div>
            <span className="text-sm text-stone-500">选择作品后即可继续编辑章节</span>
          </div>

          {loading ? <div className="p-5"><div className="h-24 animate-pulse bg-stone-100" /></div> : null}
          {!loading && books.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <PenLine className="mx-auto text-stone-400" size={27} aria-hidden="true" />
              <p className="mt-3 font-medium text-stone-800">你的作品库还是空的</p>
              <p className="mt-1 text-sm text-stone-500">在右侧建立第一部作品，然后开始存稿。</p>
            </div>
          ) : null}
          {!loading && books.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {books.map((book) => {
                const active = book.id === selectedBookId;
                return (
                  <button key={book.id} type="button" onClick={() => setSelectedBookId(book.id)} aria-pressed={active} className={`grid w-full gap-3 px-5 py-4 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_100px_110px_96px] sm:items-center ${active ? 'bg-emerald-50' : 'hover:bg-stone-50'}`}>
                    <span className="min-w-0"><span className="block truncate font-semibold text-stone-950">{book.title}</span><span className="mt-1 block text-xs text-stone-500">{book.category} · {book.serialStatus}</span></span>
                    <span className="hidden text-sm text-stone-600 sm:block">{formatWordCount(book.words)}</span>
                    <span><NovelStatusBadge status={book.status} /></span>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800">{active ? '正在编辑' : '继续编辑'}<SquarePen size={15} aria-hidden="true" /></span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <form onSubmit={createBook} className="border border-stone-200 bg-white p-5">
          <p className="text-xs font-semibold text-emerald-700">新建作品</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-950">先留下故事的名字</h2>
          <label className="mt-5 block text-sm font-medium text-stone-700">作品名称
            <input aria-label="作品名称" required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-emerald-700" placeholder="例如：逆光航线" />
          </label>
          <label className="mt-4 block text-sm font-medium text-stone-700">作品分类
            <select aria-label="作品分类" value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-emerald-700">
              {bookCategories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium text-stone-700">作品简介
            <textarea aria-label="作品简介" required value={synopsis} onChange={(event) => setSynopsis(event.target.value)} className="mt-2 h-28 w-full resize-y border border-stone-300 bg-white px-3 py-2.5 text-sm leading-6 text-stone-900 outline-none focus:border-emerald-700" placeholder="用几句话介绍这个故事。" />
          </label>
          <button type="submit" disabled={pendingAction === 'book'} className="mt-5 inline-flex items-center gap-2 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"><Plus size={16} aria-hidden="true" />{pendingAction === 'book' ? '保存中' : '保存草稿'}</button>
        </form>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <form onSubmit={(event) => { event.preventDefault(); void saveChapter(true); }} className="border border-stone-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold text-emerald-700">章节编辑器</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">存稿后，决定何时提交筛查</h2>
            </div>
            <FileText className="text-emerald-700" size={20} aria-hidden="true" />
          </div>
          <label className="mt-5 block text-sm font-medium text-stone-700">选择作品
            <select aria-label="选择作品" required value={selectedBookId ?? ''} onChange={(event) => setSelectedBookId(Number(event.target.value))} className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-emerald-700">
              <option value="" disabled>请选择作品</option>
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium text-stone-700">章节标题
            <input aria-label="章节标题" required value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-emerald-700" placeholder="例如：第一章 雨落旧港" />
          </label>
          <label className="mt-4 block text-sm font-medium text-stone-700">正文
            <textarea aria-label="章节正文" required value={chapterContent} onChange={(event) => setChapterContent(event.target.value)} className="mt-2 h-56 w-full resize-y border border-stone-300 bg-white px-3 py-2.5 text-sm leading-7 text-stone-900 outline-none focus:border-emerald-700" placeholder="开始写作..." />
          </label>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void saveChapter(false)} disabled={pendingAction !== undefined} className="inline-flex items-center gap-2 border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-wait disabled:opacity-60"><Save size={16} aria-hidden="true" />保存章节草稿</button>
            <button type="submit" disabled={pendingAction !== undefined} className="inline-flex items-center gap-2 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"><Send size={16} aria-hidden="true" />{pendingAction === 'submit-chapter' ? '筛查中' : '提交并自动筛查'}</button>
          </div>
        </form>

        <aside className="border border-stone-200 bg-[#eef4ef] p-5 sm:p-6">
          <p className="text-xs font-semibold text-emerald-700">当前作品</p>
          {selectedBook ? (
            <>
              <div className="mt-3 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-stone-950">{selectedBook.title}</h2><p className="mt-1 text-sm text-stone-600">{selectedBook.category} · {formatWordCount(selectedBook.words)}</p></div><NovelStatusBadge status={selectedBook.status} /></div>
              <p className="mt-5 text-sm leading-6 text-stone-600">章节提交后会先经过自动筛查；完整作品仍需站长人工审核才会在线上书城显示。</p>
              <button type="button" onClick={() => void submitBook()} disabled={pendingAction !== undefined} className="mt-6 inline-flex items-center gap-2 border border-stone-800 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:text-emerald-800 disabled:cursor-wait disabled:opacity-60"><Send size={16} aria-hidden="true" />{pendingAction === 'submit-book' ? '提交中' : '提交完整作品'}</button>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-stone-600">创建或选择一部作品后，可以继续写作并提交完整作品审核。</p>
          )}
        </aside>
      </section>
    </NovelShell>
  );
}
