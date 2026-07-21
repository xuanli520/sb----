'use client';

import { Flame, History, ListOrdered, Plus, Save, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
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
import { Skeleton } from '@/app/components/ui/skeleton';
import { Switch } from '@/app/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { InlineNotice, formatWordCount } from '@/components/novel/NovelShell';
import {
  type EditorialRecommendation,
  type EditorialRecommendationAudit,
  type HotSearchTerm,
  type HotSearchTermAudit,
  novelApi,
} from '@/features/novel/api';

type Notice = { tone: 'success' | 'error'; message: string };
type HotSearchDraft = { term: string; rank: string; enabled: boolean };
type DeleteTarget = { type: 'recommendation' | 'hot-search'; id: number; label: string };
type AuditKind = 'recommendation' | 'hot-search';
type AuditItem = Pick<EditorialRecommendationAudit, 'id' | 'action' | 'details' | 'operatorUserId' | 'createdAt'>;

function optionalRank(value: string) {
  if (!value.trim()) return undefined;
  const rank = Number(value);
  if (!Number.isInteger(rank) || rank < 1 || rank > 100_000) {
    throw new Error('排序必须是 1 到 100000 之间的整数。');
  }
  return rank;
}

function displayTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function statusBadge(status: string) {
  return status === 'PUBLISHED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-rose-200 bg-rose-50 text-rose-800';
}

export function EditorialOperationsPanel() {
  const [recommendations, setRecommendations] = useState<EditorialRecommendation[]>([]);
  const [hotSearchTerms, setHotSearchTerms] = useState<HotSearchTerm[]>([]);
  const [recommendationRanks, setRecommendationRanks] = useState<Record<number, string>>({});
  const [termDrafts, setTermDrafts] = useState<Record<number, HotSearchDraft>>({});
  const [bookId, setBookId] = useState('');
  const [recommendationRank, setRecommendationRank] = useState('');
  const [newTerm, setNewTerm] = useState('');
  const [newTermRank, setNewTermRank] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();
  const [auditKind, setAuditKind] = useState<AuditKind>();
  const [audits, setAudits] = useState<AuditItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRecommendations, nextHotSearchTerms] = await Promise.all([
        novelApi<EditorialRecommendation[]>('admin/editorial/recommendations', 'admin'),
        novelApi<HotSearchTerm[]>('admin/hot-searches', 'admin'),
      ]);
      setRecommendations(nextRecommendations);
      setHotSearchTerms(nextHotSearchTerms);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '推荐位与热搜配置暂时无法加载。' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const draftFor = (term: HotSearchTerm): HotSearchDraft => termDrafts[term.id] ?? {
    term: term.term,
    rank: String(term.rank),
    enabled: term.enabled,
  };

  const assignRecommendation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedBookId = Number(bookId);
    if (!Number.isInteger(parsedBookId) || parsedBookId < 1) {
      setNotice({ tone: 'error', message: '请输入有效的已发布作品 ID。' });
      return;
    }
    let rank: number | undefined;
    try {
      rank = optionalRank(recommendationRank);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '排序无效。' });
      return;
    }
    setPendingAction('recommendation-create');
    try {
      const created = await novelApi<EditorialRecommendation>('admin/editorial/recommendations', 'admin', {
        method: 'POST',
        body: JSON.stringify({ bookId: parsedBookId, rank }),
      });
      setBookId('');
      setRecommendationRank('');
      setNotice({ tone: 'success', message: `《${created.book.title}》已加入推荐位第 ${created.rank} 位。` });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '添加推荐位失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const saveRecommendationRank = async (item: EditorialRecommendation) => {
    let rank: number | undefined;
    try {
      rank = optionalRank(recommendationRanks[item.book.id] ?? String(item.rank));
      if (!rank) throw new Error('请输入排序。');
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '排序无效。' });
      return;
    }
    const action = `recommendation-rank-${item.book.id}`;
    setPendingAction(action);
    try {
      const saved = await novelApi<EditorialRecommendation>(`admin/editorial/recommendations/${item.book.id}`, 'admin', {
        method: 'PUT',
        body: JSON.stringify({ rank }),
      });
      setNotice({ tone: 'success', message: `《${saved.book.title}》已调整至第 ${saved.rank} 位。` });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '调整推荐排序失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const createHotSearchTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTerm.trim()) {
      setNotice({ tone: 'error', message: '请输入热搜词。' });
      return;
    }
    let rank: number | undefined;
    try {
      rank = optionalRank(newTermRank);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '排序无效。' });
      return;
    }
    setPendingAction('hot-search-create');
    try {
      const created = await novelApi<HotSearchTerm>('admin/hot-searches', 'admin', {
        method: 'POST',
        body: JSON.stringify({ term: newTerm.trim(), enabled: true, rank }),
      });
      setNewTerm('');
      setNewTermRank('');
      setNotice({ tone: 'success', message: `热搜词“${created.term}”已排在第 ${created.rank} 位。` });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '新增热搜词失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const saveHotSearchTerm = async (term: HotSearchTerm, values: HotSearchDraft) => {
    let rank: number | undefined;
    try {
      rank = optionalRank(values.rank);
      if (!values.term.trim() || !rank) throw new Error('热搜词和排序不能为空。');
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '热搜词配置无效。' });
      return;
    }
    const action = `hot-search-save-${term.id}`;
    setPendingAction(action);
    try {
      const saved = await novelApi<HotSearchTerm>(`admin/hot-searches/${term.id}`, 'admin', {
        method: 'PUT',
        body: JSON.stringify({ term: values.term.trim(), enabled: values.enabled, rank }),
      });
      setTermDrafts((current) => ({ ...current, [term.id]: { term: saved.term, enabled: saved.enabled, rank: String(saved.rank) } }));
      setNotice({ tone: 'success', message: `热搜词“${saved.term}”配置已更新。` });
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '更新热搜词失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const openAudits = async (kind: AuditKind) => {
    const action = `audits-${kind}`;
    setPendingAction(action);
    try {
      const path = kind === 'recommendation'
        ? 'admin/editorial/recommendations/audits?limit=20'
        : 'admin/hot-searches/audits?limit=20';
      const items = kind === 'recommendation'
        ? await novelApi<EditorialRecommendationAudit[]>(path, 'admin')
        : await novelApi<HotSearchTermAudit[]>(path, 'admin');
      setAudits(items);
      setAuditKind(kind);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '运营审计记录暂时无法加载。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { type, id, label } = deleteTarget;
    const action = `delete-${type}-${id}`;
    setPendingAction(action);
    try {
      const path = type === 'recommendation'
        ? `admin/editorial/recommendations/${id}`
        : `admin/hot-searches/${id}`;
      await novelApi<void>(path, 'admin', { method: 'DELETE' });
      setNotice({ tone: 'success', message: type === 'recommendation' ? `《${label}》已从推荐位移除。` : `热搜词“${label}”已删除。` });
      setDeleteTarget(undefined);
      await load();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '删除运营配置失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <section className="mt-7" aria-labelledby="editorial-operations-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">发现运营</p>
          <h2 id="editorial-operations-heading" className="mt-1 text-xl font-semibold text-stone-950">推荐位与热搜</h2>
        </div>
        <ListOrdered className="shrink-0 text-emerald-700" size={22} aria-hidden="true" />
      </div>

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <div className="mt-5 grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,.9fr)]">
        <section className="border border-stone-200 bg-white" aria-labelledby="recommendation-configuration-heading">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">首页精选</p>
              <h3 id="recommendation-configuration-heading" className="mt-1 text-lg font-semibold text-stone-950">编辑推荐位</h3>
            </div>
            <Button type="button" variant="outline" size="icon" title="查看推荐位审计" aria-label="查看推荐位审计" onClick={() => void openAudits('recommendation')} disabled={pendingAction === 'audits-recommendation'} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={16} aria-hidden="true" /></Button>
          </div>

          {loading ? <div className="p-5"><Skeleton className="h-44 rounded-none bg-stone-100" /></div> : null}
          {!loading && recommendations.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">尚未配置编辑推荐。</p> : null}
          {!loading && recommendations.length ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[700px] text-stone-700">
                <TableHeader className="border-stone-100 bg-stone-50 text-stone-600"><TableRow className="border-0 hover:bg-transparent"><TableHead className="w-20 px-4 py-3 font-medium">排序</TableHead><TableHead className="px-4 py-3 font-medium">作品</TableHead><TableHead className="w-28 px-4 py-3 font-medium">状态</TableHead><TableHead className="w-40 px-4 py-3 text-right font-medium">操作</TableHead></TableRow></TableHeader>
                <TableBody>{recommendations.map((item) => {
                  const action = `recommendation-rank-${item.book.id}`;
                  const published = item.book.status === 'PUBLISHED';
                  return <TableRow key={item.book.id} className="border-stone-100 hover:bg-stone-50"><TableCell className="px-4 py-4"><Input aria-label={`${item.book.title} 推荐排序`} type="number" min="1" value={recommendationRanks[item.book.id] ?? String(item.rank)} onChange={(event) => setRecommendationRanks((current) => ({ ...current, [item.book.id]: event.target.value }))} disabled={!published || pendingAction === action} className="h-9 w-16 rounded-none border-stone-300 bg-white px-2 text-sm" /></TableCell><TableCell className="px-4 py-4"><p className="font-medium text-stone-950">{item.book.title}</p><p className="mt-1 text-xs text-stone-500">#{item.book.id} · {item.book.author} · {formatWordCount(item.book.words)}</p></TableCell><TableCell className="px-4 py-4"><Badge variant="outline" className={`rounded-none ${statusBadge(item.book.status)}`}>{published ? '已发布' : '已下架'}</Badge></TableCell><TableCell className="px-4 py-4"><div className="flex justify-end gap-2"><Button type="button" variant="outline" size="icon" title="保存推荐排序" aria-label={`保存 ${item.book.title} 推荐排序`} onClick={() => void saveRecommendationRank(item)} disabled={!published || pendingAction === action} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Save size={15} aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" title="移除推荐" aria-label={`移除 ${item.book.title} 推荐`} onClick={() => setDeleteTarget({ type: 'recommendation', id: item.book.id, label: item.book.title })} disabled={pendingAction === `delete-recommendation-${item.book.id}`} className="h-9 w-9 rounded-none border-rose-200 bg-white text-rose-700 hover:border-rose-500 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" /></Button></div></TableCell></TableRow>;
                })}</TableBody>
              </Table>
            </div>
          ) : null}
          <form onSubmit={(event) => void assignRecommendation(event)} className="grid gap-3 border-t border-stone-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
            <div><Label htmlFor="recommendation-book-id" className="text-xs text-stone-600">已发布作品 ID</Label><Input id="recommendation-book-id" aria-label="已发布作品 ID" type="number" min="1" required value={bookId} onChange={(event) => setBookId(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="例如 101" /></div>
            <div><Label htmlFor="recommendation-rank" className="text-xs text-stone-600">目标排序</Label><Input id="recommendation-rank" aria-label="推荐目标排序" type="number" min="1" value={recommendationRank} onChange={(event) => setRecommendationRank(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="末位" /></div>
            <Button type="submit" disabled={pendingAction === 'recommendation-create'} className="h-9 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />添加推荐</Button>
          </form>
        </section>

        <section className="border border-stone-200 bg-white" aria-labelledby="hot-search-configuration-heading">
          <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold text-emerald-700">搜索发现</p><h3 id="hot-search-configuration-heading" className="mt-1 text-lg font-semibold text-stone-950">热搜词</h3></div>
            <div className="flex items-center gap-3"><Flame className="text-rose-700" size={19} aria-hidden="true" /><Button type="button" variant="outline" size="icon" title="查看热搜审计" aria-label="查看热搜审计" onClick={() => void openAudits('hot-search')} disabled={pendingAction === 'audits-hot-search'} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={16} aria-hidden="true" /></Button></div>
          </div>

          {loading ? <div className="p-5"><Skeleton className="h-44 rounded-none bg-stone-100" /></div> : null}
          {!loading && hotSearchTerms.length === 0 ? <p className="px-5 py-10 text-sm text-stone-500">尚未配置热搜词。</p> : null}
          {!loading && hotSearchTerms.length ? <div className="divide-y divide-stone-100">{hotSearchTerms.map((term) => {
            const draft = draftFor(term);
            const action = `hot-search-save-${term.id}`;
            return <div key={term.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_72px_auto_auto] sm:items-end"><div><Label htmlFor={`hot-search-term-${term.id}`} className="text-xs text-stone-600">词条</Label><Input id={`hot-search-term-${term.id}`} aria-label={`热搜词 ${term.id}`} value={draft.term} maxLength={100} onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: { ...draft, term: event.target.value } }))} disabled={pendingAction === action} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div><div><Label htmlFor={`hot-search-rank-${term.id}`} className="text-xs text-stone-600">排序</Label><Input id={`hot-search-rank-${term.id}`} aria-label={`热搜排序 ${term.id}`} type="number" min="1" value={draft.rank} onChange={(event) => setTermDrafts((current) => ({ ...current, [term.id]: { ...draft, rank: event.target.value } }))} disabled={pendingAction === action} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" /></div><div className="flex h-9 items-center gap-2"><Switch checked={draft.enabled} onCheckedChange={(enabled) => void saveHotSearchTerm(term, { ...draft, enabled })} disabled={pendingAction === action} aria-label={`${term.term} 热搜已启用`} className="data-[state=checked]:bg-emerald-700" /><span className="text-xs text-stone-600">{draft.enabled ? '启用' : '停用'}</span></div><div className="flex gap-2"><Button type="button" variant="outline" size="icon" title="保存热搜词" aria-label={`保存 ${term.term} 热搜词`} onClick={() => void saveHotSearchTerm(term, draft)} disabled={pendingAction === action} className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Save size={15} aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" title="删除热搜词" aria-label={`删除 ${term.term} 热搜词`} onClick={() => setDeleteTarget({ type: 'hot-search', id: term.id, label: term.term })} disabled={pendingAction === `delete-hot-search-${term.id}`} className="h-9 w-9 rounded-none border-rose-200 bg-white text-rose-700 hover:border-rose-500 hover:text-rose-800"><Trash2 size={15} aria-hidden="true" /></Button></div></div>;
          })}</div> : null}
          <form onSubmit={(event) => void createHotSearchTerm(event)} className="grid gap-3 border-t border-stone-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_72px_auto] sm:items-end"><div><Label htmlFor="new-hot-search-term" className="text-xs text-stone-600">新热搜词</Label><Input id="new-hot-search-term" aria-label="新热搜词" required maxLength={100} value={newTerm} onChange={(event) => setNewTerm(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="输入搜索词" /></div><div><Label htmlFor="new-hot-search-rank" className="text-xs text-stone-600">排序</Label><Input id="new-hot-search-rank" aria-label="新热搜排序" type="number" min="1" value={newTermRank} onChange={(event) => setNewTermRank(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="末位" /></div><Button type="submit" disabled={pendingAction === 'hot-search-create'} className="h-9 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />添加</Button></form>
        </section>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}>
        <AlertDialogContent className="rounded-none border-stone-200 bg-white p-5">
          <AlertDialogHeader><AlertDialogTitle className="text-stone-950">确认移除</AlertDialogTitle><AlertDialogDescription className="text-stone-600">{deleteTarget?.type === 'recommendation' ? `将《${deleteTarget.label}》从编辑推荐位移除。` : `将热搜词“${deleteTarget?.label ?? ''}”从公共搜索入口移除。`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-none border-stone-300 bg-white text-stone-700">取消</AlertDialogCancel><AlertDialogAction onClick={() => void executeDelete()} className="rounded-none bg-rose-700 text-white hover:bg-rose-800">确认移除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(auditKind)} onOpenChange={(open) => { if (!open) setAuditKind(undefined); }}>
        <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-xl"><DialogHeader><DialogTitle className="text-stone-950">{auditKind === 'recommendation' ? '推荐位审计' : '热搜词审计'}</DialogTitle><DialogDescription className="text-stone-600">最近 20 条运营配置变更</DialogDescription></DialogHeader><div className="max-h-80 overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">{audits.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">暂无操作记录。</p> : audits.map((audit) => <article key={audit.id} className="py-4"><div className="flex items-center justify-between gap-3"><span className="font-medium text-stone-900">{audit.action}</span><span className="whitespace-nowrap text-xs text-stone-500">操作人 #{audit.operatorUserId} · {displayTime(audit.createdAt)}</span></div><p className="mt-2 break-words text-xs leading-5 text-stone-600">{audit.details}</p></article>)}</div></DialogContent>
      </Dialog>
    </section>
  );
}
