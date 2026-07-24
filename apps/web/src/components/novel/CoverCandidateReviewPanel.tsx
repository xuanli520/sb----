'use client';

/* eslint-disable @next/next/no-img-element -- private candidate previews require same-origin BFF cookie access. */

import { BadgeCheck, Check, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Skeleton } from '@/app/components/ui/skeleton';
import { BookCover } from '@/components/novel/BookCover';
import { InlineNotice, formatWordCount } from '@/components/novel/NovelShell';
import {
  type BookCoverCandidateQueueItem,
  type CoverCandidatePage,
  type CoverCandidateReviewResult,
  novelApi,
} from '@/features/novel/api';

const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
const pageSize = 12;

type CandidateStatus = typeof statuses[number];
type Notice = { tone: 'success' | 'error'; message: string };

function statusLabel(status: CandidateStatus) {
  return { PENDING_REVIEW: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }[status];
}

function statusClass(status: CandidateStatus) {
  return {
    PENDING_REVIEW: 'border-amber-200 bg-amber-50 text-amber-800',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
  }[status];
}

function formatTime(value: string | null) {
  if (!value) return '尚未审核';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(time);
}

function candidatePath(status: CandidateStatus, page: number) {
  return `admin/media/cover-candidates?status=${status}&page=${page}&size=${pageSize}`;
}

export function CoverCandidateReviewPanel() {
  const [status, setStatus] = useState<CandidateStatus>('PENDING_REVIEW');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<BookCoverCandidateQueueItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 0, size: pageSize });
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<number>();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<Notice>();
  const request = useRef(0);

  const load = useCallback(async (nextStatus: CandidateStatus, nextPage: number) => {
    const sequence = ++request.current;
    setLoading(true);
    try {
      const response = await novelApi<CoverCandidatePage>(candidatePath(nextStatus, nextPage), 'admin');
      if (sequence !== request.current) return;
      setItems(response.items);
      setMeta(response.meta);
    } catch (reason) {
      if (sequence !== request.current) return;
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '封面候选暂时无法加载。' });
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(status, page); }, [load, page, status]);

  const review = async (item: BookCoverCandidateQueueItem, approve: boolean) => {
    const reason = reasons[item.candidate.id]?.trim();
    if (!reason) {
      setNotice({ tone: 'error', message: '请填写审核原因。' });
      return;
    }
    setPendingAction(item.candidate.id);
    try {
      const result = await novelApi<CoverCandidateReviewResult>(
        `admin/media/cover-candidates/${item.candidate.id}/review`,
        'admin',
        { method: 'POST', body: JSON.stringify({ approve, reason }) },
      );
      setNotice({ tone: 'success', message: approve ? `《${result.book.title}》的封面候选已通过。` : `《${result.book.title}》的封面候选已驳回。` });
      setReasons((current) => {
        const next = { ...current };
        delete next[item.candidate.id];
        return next;
      });
      await load(status, page);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '封面审核提交失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const totalPages = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.size)));

  return (
    <section className="mt-7" aria-labelledby="cover-review-heading">
      <div className="flex flex-col gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">内容审核</p>
          <h2 id="cover-review-heading" className="mt-1 text-xl font-semibold text-stone-950">作品封面审核</h2>
        </div>
        <div className="w-full sm:w-44">
          <Label htmlFor="cover-candidate-status" className="sr-only">筛选封面候选状态</Label>
          <Select value={status} onValueChange={(value: CandidateStatus) => { setStatus(value); setPage(0); }}>
            <SelectTrigger id="cover-candidate-status" aria-label="筛选封面候选状态" className="h-9 rounded-none border-stone-300 bg-white text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-none border-stone-200 bg-white">
              {statuses.map((entry) => <SelectItem key={entry} value={entry}>{statusLabel(entry)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200 bg-white">
        {loading ? <div className="space-y-4 p-5"><Skeleton className="h-48 rounded-none bg-stone-100" /><Skeleton className="h-48 rounded-none bg-stone-100" /></div> : null}
        {!loading && items.length === 0 ? <div className="px-5 py-12 text-center"><BadgeCheck className="mx-auto text-stone-400" size={28} aria-hidden="true" /><p className="mt-3 text-sm text-stone-500">当前没有{statusLabel(status)}的封面候选。</p></div> : null}
        {!loading && items.map((item) => {
          const candidate = item.candidate;
          const actionable = candidate.status === 'PENDING_REVIEW';
          const busy = pendingAction === candidate.id;
          const previewPath = `/api/novel/admin/media/cover-candidates/${candidate.id}/preview`;
          return (
            <article key={candidate.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-stone-950">{item.book.title}</h3><Badge variant="outline" className={`rounded-none ${statusClass(candidate.status)}`}>{statusLabel(candidate.status)}</Badge></div>
                  <p className="mt-1 text-sm text-stone-600">{item.book.author} · {item.book.category} · {formatWordCount(item.book.words)} · 作品 #{item.book.id}</p>
                  <p className="mt-1 text-xs text-stone-500">提交于 {formatTime(candidate.createdAt)}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><p className="mb-2 text-xs font-medium text-stone-600">当前公开封面</p><BookCover cover={item.book.cover} title={item.book.title} imageAlt={`${item.book.title} 当前公开封面`} showLabel={false} className="aspect-[3/4] max-w-44" /></div>
                <div><p className="mb-2 text-xs font-medium text-stone-600">候选封面</p><img src={previewPath} alt={`${item.book.title} 候选封面`} className="aspect-[3/4] max-w-44 border border-stone-200 object-cover" /></div>
              </div>
              {actionable ? <div className="mt-5 border-t border-stone-100 pt-4">
                <Label htmlFor={`cover-review-reason-${candidate.id}`} className="text-xs text-stone-600">审核原因</Label>
                <Input id={`cover-review-reason-${candidate.id}`} aria-label={`${item.book.title} 审核原因`} value={reasons[candidate.id] ?? ''} maxLength={900} onChange={(event) => setReasons((current) => ({ ...current, [candidate.id]: event.target.value }))} disabled={busy} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" />
                <div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => void review(item, true)} disabled={busy} className="h-9 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Check size={15} aria-hidden="true" />通过</Button><Button type="button" variant="outline" onClick={() => void review(item, false)} disabled={busy} className="h-9 rounded-none border-rose-200 bg-white px-3 text-rose-700 hover:border-rose-500 hover:text-rose-800"><X size={15} aria-hidden="true" />驳回</Button></div>
              </div> : <div className="mt-5 border-t border-stone-100 pt-4 text-sm text-stone-600"><p>审核原因：{candidate.reviewReason || '未记录'}</p><p className="mt-1 text-xs text-stone-500">审核于 {formatTime(candidate.reviewedAt)}</p></div>}
            </article>
          );
        })}
      </div>

      {!loading && totalPages > 1 ? <div className="flex items-center justify-between border-b border-stone-200 px-1 py-4"><p className="text-sm text-stone-500">第 {meta.page + 1} / {totalPages} 页，共 {meta.total} 项</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setPage((current) => current - 1)} disabled={meta.page === 0} className="h-9 rounded-none border-stone-300 bg-white px-3">上一页</Button><Button type="button" variant="outline" onClick={() => setPage((current) => current + 1)} disabled={meta.page >= totalPages - 1} className="h-9 rounded-none border-stone-300 bg-white px-3">下一页</Button></div></div> : null}
    </section>
  );
}
