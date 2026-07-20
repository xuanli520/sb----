'use client';

import Link from 'next/link';
import { BookOpen, Check, ClipboardCheck, Clock3, Plus, ShieldAlert, ShieldCheck, Users, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { InlineNotice, NovelPageHeader, NovelShell, NovelStatusBadge, formatWordCount } from '@/components/novel/NovelShell';
import { Book, novelApi } from '@/features/novel/api';

type Dashboard = { activeReaders: number; todayReads: number; publishedBooks: number; pendingReviews: number; auditLog: string[] };
type Application = { id: number; penName: string; statement: string; status: string };
type Notice = { message: string; tone: 'success' | 'error' };

export default function NovelAdminPage() {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [reviews, setReviews] = useState<Book[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextDashboard, nextReviews, nextApplications, nextWords] = await Promise.all([
        novelApi<Dashboard>('admin/dashboard', 'admin'),
        novelApi<Book[]>('admin/reviews', 'admin'),
        novelApi<Application[]>('admin/author-applications', 'admin'),
        novelApi<string[]>('admin/sensitive-words', 'admin'),
      ]);
      setDashboard(nextDashboard);
      setReviews(nextReviews);
      setApplications(nextApplications);
      setWords(nextWords);
    } catch (reason) {
      setNotice({ message: reason instanceof Error ? reason.message : '运营数据暂时无法加载。', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const decideBook = async (book: Book, approve: boolean) => {
    setPendingAction(`book-${book.id}`);
    try {
      await novelApi(`admin/reviews/${book.id}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason: approve ? '内容符合发布规则' : '请修改后重新提交' }),
      });
      announce(approve ? '作品已发布' : '作品已驳回');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '审核操作失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const decideApplication = async (application: Application, approve: boolean) => {
    setPendingAction(`application-${application.id}`);
    try {
      await novelApi(`admin/author-applications/${application.id}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ approve, reason: approve ? '通过作者申请' : '申请材料需补充' }),
      });
      announce(approve ? '作者申请已通过' : '作者申请已驳回');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '作者申请处理失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const addWord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedWord = word.trim();
    if (!normalizedWord) return;
    setPendingAction('word');
    try {
      await novelApi('admin/sensitive-words', 'admin', { method: 'POST', body: JSON.stringify({ word: normalizedWord }) });
      setWord('');
      announce('敏感词已加入审核规则');
      await load();
    } catch (reason) {
      announce(reason instanceof Error ? reason.message : '添加敏感词失败，请稍后重试。', 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const metrics = dashboard ? [
    { name: '活跃读者', value: dashboard.activeReaders, icon: Users, note: '当前活跃账户' },
    { name: '今日阅读', value: dashboard.todayReads, icon: BookOpen, note: '今日章节阅读次数' },
    { name: '已发布作品', value: dashboard.publishedBooks, icon: ShieldCheck, note: '书城当前可见' },
    { name: '待复核', value: dashboard.pendingReviews, icon: Clock3, note: '需要站长决定' },
  ] : [];

  return (
    <NovelShell workspace="admin">
      <NovelPageHeader
        eyebrow="运营中心"
        title="内容与运营，清晰可追溯。"
        description="集中处理作品上线、作者准入与内容规则；关键操作会记录到审计链。"
        actions={<Link href="/" className="inline-flex items-center gap-2 border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><BookOpen size={16} aria-hidden="true" />查看书城</Link>}
      />

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <section className="mt-7 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-4" aria-label="运营概览">
        {loading && metrics.length === 0 ? [0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse bg-white" />) : null}
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.name} className="bg-white px-5 py-5"><Icon size={18} className="text-emerald-700" aria-hidden="true" /><strong className="mt-3 block text-2xl font-semibold text-stone-950">{metric.value.toLocaleString('zh-CN')}</strong><span className="mt-1 block text-sm text-stone-700">{metric.name}</span><span className="mt-1 block text-xs text-stone-500">{metric.note}</span></div>;
        })}
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
        <div className="border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">审核队列</p>
              <h2 className="mt-1 text-xl font-semibold text-stone-950">待处理作品</h2>
            </div>
            <span className="text-sm text-stone-500">完整作品上线前必须由站长决定</span>
          </div>
          {loading ? <div className="p-5"><div className="h-24 animate-pulse bg-stone-100" /></div> : null}
          {!loading && reviews.length === 0 ? <div className="px-5 py-12 text-center"><ClipboardCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 font-medium text-stone-800">当前没有待审核作品</p><p className="mt-1 text-sm text-stone-500">新提交的完整作品会在这里出现。</p></div> : null}
          {!loading && reviews.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {reviews.map((book) => (
                <article key={book.id} className="px-5 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-stone-950">{book.title}</h3><NovelStatusBadge status={book.status} /></div>
                      <p className="mt-1 text-sm text-stone-500">{book.author} · {book.category} · {formatWordCount(book.words)}</p>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">{book.synopsis}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => void decideBook(book, false)} disabled={pendingAction === `book-${book.id}`} className="inline-flex items-center gap-1 border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:border-rose-500 disabled:opacity-50"><X size={15} aria-hidden="true" />驳回</button>
                      <button type="button" onClick={() => void decideBook(book, true)} disabled={pendingAction === `book-${book.id}`} className="inline-flex items-center gap-1 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Check size={15} aria-hidden="true" />批准上线</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="border border-stone-200 bg-[#eef4ef] p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">审计记录</p><h2 className="mt-1 text-xl font-semibold text-stone-950">最近变更</h2></div><ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" /></div>
          <div className="mt-5 space-y-3 border-l border-emerald-300 pl-4 text-sm leading-6 text-stone-600">
            {dashboard?.auditLog.length ? dashboard.auditLog.slice(0, 8).map((entry, index) => <p key={`${entry}-${index}`}>{entry}</p>) : <p>审核、兑换和内容规则的变更会记录在这里。</p>}
          </div>
        </aside>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-2">
        <div className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-5"><p className="text-xs font-semibold text-emerald-700">作者申请</p><h2 className="mt-1 text-xl font-semibold text-stone-950">创作者准入</h2></div>
          {loading ? <div className="p-5"><div className="h-20 animate-pulse bg-stone-100" /></div> : null}
          {!loading && applications.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">当前没有待处理申请。</p> : null}
          {!loading && applications.length > 0 ? <div className="divide-y divide-stone-100">{applications.map((application) => <article key={application.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-stone-950">{application.penName}</h3><NovelStatusBadge status={application.status} /></div><p className="mt-2 text-sm leading-6 text-stone-600">{application.statement}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void decideApplication(application, false)} disabled={pendingAction === `application-${application.id}`} className="border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:border-rose-500 disabled:opacity-50">驳回</button><button type="button" onClick={() => void decideApplication(application, true)} disabled={pendingAction === `application-${application.id}`} className="bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">通过</button></div></article>)}</div> : null}
        </div>

        <form onSubmit={addWord} className="border border-stone-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">内容规则</p><h2 className="mt-1 text-xl font-semibold text-stone-950">敏感词库</h2></div><ShieldAlert className="text-emerald-700" size={20} aria-hidden="true" /></div>
          <p className="mt-3 text-sm leading-6 text-stone-600">词条命中时，章节会进入人工复核，而不会自动上线。</p>
          <label className="mt-5 block text-sm font-medium text-stone-700">敏感词
            <span className="mt-2 flex">
              <input aria-label="敏感词" required value={word} onChange={(event) => setWord(event.target.value)} className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700" placeholder="输入需要拦截的词条" />
              <button type="submit" disabled={pendingAction === 'word'} className="inline-flex shrink-0 items-center gap-1 bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus size={15} aria-hidden="true" />添加</button>
            </span>
          </label>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="当前敏感词">
            {words.length ? words.map((item) => <span key={item} className="border border-amber-200 bg-amber-50 px-2.5 py-1 text-sm text-amber-900">{item}</span>) : <p className="text-sm text-stone-500">暂未配置词条</p>}
          </div>
        </form>
      </section>
    </NovelShell>
  );
}
