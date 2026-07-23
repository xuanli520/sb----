'use client';

import { Crown, History, Save, Ticket, WalletCards } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Textarea } from '@/app/components/ui/textarea';
import { InlineNotice } from '@/components/novel/NovelShell';
import { type CommercialRuleAudit, type CommercialRuleAuditPage, type CommercialRules, novelApi } from '@/features/novel/api';

type RuleDraft = {
  membershipDaysMaximumPerCode: string;
  recommendationVotesPerDay: string;
  monthlyVotesPerMonth: string;
  rewardMinimumTokens: string;
  rewardMaximumTokensPerReward: string;
  rewardMaximumTokensPerDay: string;
  reason: string;
};

type Notice = { tone: 'success' | 'error'; message: string };
type PageMeta = { total: number; page: number; size: number };

const auditPageSize = 20;

const emptyDraft: RuleDraft = {
  membershipDaysMaximumPerCode: '',
  recommendationVotesPerDay: '',
  monthlyVotesPerMonth: '',
  rewardMinimumTokens: '',
  rewardMaximumTokensPerReward: '',
  rewardMaximumTokensPerDay: '',
  reason: '',
};

function draftFrom(rules: CommercialRules): RuleDraft {
  return {
    membershipDaysMaximumPerCode: String(rules.membershipDaysMaximumPerCode),
    recommendationVotesPerDay: String(rules.recommendationVotesPerDay),
    monthlyVotesPerMonth: String(rules.monthlyVotesPerMonth),
    rewardMinimumTokens: String(rules.rewardMinimumTokens),
    rewardMaximumTokensPerReward: String(rules.rewardMaximumTokensPerReward),
    rewardMaximumTokensPerDay: String(rules.rewardMaximumTokensPerDay),
    reason: '',
  };
}

function integer(value: string, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return parsed;
}

function displayTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
}

function ruleChanges(audit: CommercialRuleAudit) {
  const previous = audit.previousRules;
  const updated = audit.updatedRules;
  return [
    ['会员单码天数上限', previous.membershipDaysMaximumPerCode, updated.membershipDaysMaximumPerCode],
    ['推荐票/日', previous.recommendationVotesPerDay, updated.recommendationVotesPerDay],
    ['月票/月', previous.monthlyVotesPerMonth, updated.monthlyVotesPerMonth],
    ['打赏下限', previous.rewardMinimumTokens, updated.rewardMinimumTokens],
    ['单笔打赏上限', previous.rewardMaximumTokensPerReward, updated.rewardMaximumTokensPerReward],
    ['每日打赏上限', previous.rewardMaximumTokensPerDay, updated.rewardMaximumTokensPerDay],
  ].filter(([, before, after]) => before !== after);
}

function AuditPagination({ meta, loading, onPageChange }: { meta: PageMeta; loading: boolean; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.size));
  if (totalPages <= 1) return null;
  const previousDisabled = loading || meta.page <= 0;
  const nextDisabled = loading || meta.page >= totalPages - 1;
  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-stone-500">共 {meta.total.toLocaleString('zh-CN')} 条</p>
      <Pagination aria-label="商业规则审计分页" className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem><PaginationPrevious href="#commercial-rules-heading" onClick={(event) => { event.preventDefault(); if (!previousDisabled) onPageChange(meta.page - 1); }} aria-disabled={previousDisabled} tabIndex={previousDisabled ? -1 : undefined} className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50" /></PaginationItem>
          <PaginationItem><span className="inline-flex h-9 min-w-20 items-center justify-center px-2 text-stone-600" aria-live="polite">第 {meta.page + 1} / {totalPages} 页</span></PaginationItem>
          <PaginationItem><PaginationNext href="#commercial-rules-heading" onClick={(event) => { event.preventDefault(); if (!nextDisabled) onPageChange(meta.page + 1); }} aria-disabled={nextDisabled} tabIndex={nextDisabled ? -1 : undefined} className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50" /></PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

export function CommercialRulesPanel() {
  const [rules, setRules] = useState<CommercialRules>();
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [auditOpen, setAuditOpen] = useState(false);
  const [audits, setAudits] = useState<CommercialRuleAudit[]>([]);
  const [auditMeta, setAuditMeta] = useState<PageMeta>();
  const [auditPage, setAuditPage] = useState(0);
  const [auditsLoading, setAuditsLoading] = useState(false);
  const [auditsError, setAuditsError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await novelApi<CommercialRules>('admin/commercial-rules', 'admin');
      setRules(next);
      setDraft(draftFrom(next));
      setNotice(undefined);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '商业规则暂时无法加载。' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateDraft = (field: keyof RuleDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let body: Record<string, number | string>;
    try {
      const membershipDaysMaximumPerCode = integer(draft.membershipDaysMaximumPerCode, '会员单码天数上限', 1, 36_500);
      const recommendationVotesPerDay = integer(draft.recommendationVotesPerDay, '每日推荐票', 0, 100);
      const monthlyVotesPerMonth = integer(draft.monthlyVotesPerMonth, '每月月票', 0, 100);
      const rewardMinimumTokens = integer(draft.rewardMinimumTokens, '打赏下限', 1, 1_000_000);
      const rewardMaximumTokensPerReward = integer(draft.rewardMaximumTokensPerReward, '单笔打赏上限', 1, 1_000_000);
      const rewardMaximumTokensPerDay = integer(draft.rewardMaximumTokensPerDay, '每日打赏上限', 1, 5_000_000);
      if (rewardMaximumTokensPerReward < rewardMinimumTokens) throw new Error('单笔打赏上限不能小于打赏下限。');
      if (rewardMaximumTokensPerDay < rewardMaximumTokensPerReward) throw new Error('每日打赏上限不能小于单笔打赏上限。');
      if (!draft.reason.trim()) throw new Error('请填写规则变更说明。');
      body = {
        membershipDaysMaximumPerCode,
        recommendationVotesPerDay,
        monthlyVotesPerMonth,
        rewardMinimumTokens,
        rewardMaximumTokensPerReward,
        rewardMaximumTokensPerDay,
        reason: draft.reason.trim(),
      };
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '商业规则无效。' });
      return;
    }

    setPending(true);
    try {
      const updated = await novelApi<CommercialRules>('admin/commercial-rules', 'admin', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setRules(updated);
      setDraft(draftFrom(updated));
      setNotice({ tone: 'success', message: '商业规则已更新，变更已写入审计记录。' });
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '商业规则更新失败。' });
    } finally {
      setPending(false);
    }
  };

  const loadAudits = async (page: number) => {
    setAuditsLoading(true);
    setAuditsError('');
    try {
      const response = await novelApi<CommercialRuleAuditPage>(`admin/commercial-rules/audits?page=${page}&size=${auditPageSize}`, 'admin');
      setAudits(response.items);
      setAuditMeta(response.meta);
      setAuditPage(response.meta.page);
    } catch (reason) {
      setAuditsError(reason instanceof Error ? reason.message : '商业规则审计暂时无法加载。');
    } finally {
      setAuditsLoading(false);
    }
  };

  const openAudits = () => {
    setAuditOpen(true);
    void loadAudits(0);
  };

  return (
    <section className="border border-stone-200 bg-white" aria-labelledby="commercial-rules-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">商业配置</p>
          <h2 id="commercial-rules-heading" className="mt-1 text-xl font-semibold text-stone-950">会员、票与打赏规则</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">新发放的会员兑换码、读者投票和打赏请求都按当前额度校验。</p>
        </div>
        <Button type="button" variant="outline" size="icon" title="查看商业规则审计" aria-label="查看商业规则审计" onClick={openAudits} disabled={auditsLoading} className="h-9 w-9 shrink-0 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={16} aria-hidden="true" /></Button>
      </div>

      {notice ? <div className="px-5 pt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      {loading ? <div className="grid gap-4 px-5 py-6 md:grid-cols-3"><Skeleton className="h-16 rounded-none bg-stone-100" /><Skeleton className="h-16 rounded-none bg-stone-100" /><Skeleton className="h-16 rounded-none bg-stone-100" /></div> : null}
      {!loading && !rules ? <div className="flex items-center justify-between gap-3 px-5 py-7"><p className="text-sm text-stone-600">尚未取得商业规则。</p><Button type="button" variant="outline" size="sm" onClick={() => void load()} className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800">重试</Button></div> : null}
      {!loading && rules ? (
        <form onSubmit={(event) => void save(event)} className="px-5 py-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <fieldset className="border border-stone-200 p-4">
              <legend className="px-1 text-sm font-semibold text-stone-900"><Crown className="mr-1 inline-block text-emerald-700" size={15} aria-hidden="true" />会员兑换码</legend>
              <Label htmlFor="commercial-membership-days" className="mt-2 block text-xs text-stone-600">单张会员天数上限</Label>
              <Input id="commercial-membership-days" aria-label="单张会员天数上限" type="number" min="1" max="36500" step="1" inputMode="numeric" value={draft.membershipDaysMaximumPerCode} onChange={(event) => updateDraft('membershipDaysMaximumPerCode', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" />
              <p className="mt-2 text-xs leading-5 text-stone-500">已发放兑换码的会员天数不会被回写。</p>
            </fieldset>

            <fieldset className="border border-stone-200 p-4">
              <legend className="px-1 text-sm font-semibold text-stone-900"><Ticket className="mr-1 inline-block text-emerald-700" size={15} aria-hidden="true" />读者票额</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div><Label htmlFor="commercial-recommendation-votes" className="text-xs text-stone-600">每位读者每日推荐票</Label><Input id="commercial-recommendation-votes" aria-label="每位读者每日推荐票" type="number" min="0" max="100" step="1" inputMode="numeric" value={draft.recommendationVotesPerDay} onChange={(event) => updateDraft('recommendationVotesPerDay', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
                <div><Label htmlFor="commercial-monthly-votes" className="text-xs text-stone-600">每位读者每月月票</Label><Input id="commercial-monthly-votes" aria-label="每位读者每月月票" type="number" min="0" max="100" step="1" inputMode="numeric" value={draft.monthlyVotesPerMonth} onChange={(event) => updateDraft('monthlyVotesPerMonth', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
              </div>
            </fieldset>

            <fieldset className="border border-stone-200 p-4">
              <legend className="px-1 text-sm font-semibold text-stone-900"><WalletCards className="mr-1 inline-block text-emerald-700" size={15} aria-hidden="true" />代币打赏</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div><Label htmlFor="commercial-reward-minimum" className="text-xs text-stone-600">打赏下限</Label><Input id="commercial-reward-minimum" aria-label="打赏下限" type="number" min="1" max="1000000" step="1" inputMode="numeric" value={draft.rewardMinimumTokens} onChange={(event) => updateDraft('rewardMinimumTokens', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
                <div><Label htmlFor="commercial-reward-per" className="text-xs text-stone-600">单笔打赏上限</Label><Input id="commercial-reward-per" aria-label="单笔打赏上限" type="number" min="1" max="1000000" step="1" inputMode="numeric" value={draft.rewardMaximumTokensPerReward} onChange={(event) => updateDraft('rewardMaximumTokensPerReward', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
                <div><Label htmlFor="commercial-reward-daily" className="text-xs text-stone-600">每日打赏上限</Label><Input id="commercial-reward-daily" aria-label="每日打赏上限" type="number" min="1" max="5000000" step="1" inputMode="numeric" value={draft.rewardMaximumTokensPerDay} onChange={(event) => updateDraft('rewardMaximumTokensPerDay', event.target.value)} disabled={pending} className="mt-1 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
              </div>
            </fieldset>
          </div>

          <div className="mt-5 grid gap-3 border-t border-stone-100 pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div><Label htmlFor="commercial-rule-reason" className="text-stone-700">变更说明</Label><Textarea id="commercial-rule-reason" aria-label="商业规则变更说明" required maxLength={512} value={draft.reason} onChange={(event) => updateDraft('reason', event.target.value)} disabled={pending} className="mt-2 min-h-20 resize-y rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="说明本次额度调整的依据" /></div>
            <Button type="submit" disabled={pending} className="h-10 rounded-none bg-emerald-700 px-4 hover:bg-emerald-800"><Save size={16} aria-hidden="true" />{pending ? '保存中…' : '保存规则'}</Button>
          </div>
        </form>
      ) : null}

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-2xl">
          <DialogHeader><DialogTitle className="text-stone-950">商业规则审计</DialogTitle><DialogDescription className="text-stone-600">已保存的前后规则快照</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">
            {auditsLoading ? <div className="space-y-3 py-5"><Skeleton className="h-14 rounded-none bg-stone-100" /><Skeleton className="h-14 rounded-none bg-stone-100" /></div> : null}
            {!auditsLoading && auditsError ? <div className="py-5"><InlineNotice tone="error">{auditsError}</InlineNotice></div> : null}
            {!auditsLoading && !auditsError && audits.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">暂无商业规则变更记录。</p> : null}
            {!auditsLoading && !auditsError && audits.map((audit) => {
              const changes = ruleChanges(audit);
              return <article key={audit.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-stone-900">操作人 #{audit.operatorUserId}</p><time className="text-xs text-stone-500" dateTime={audit.createdAt}>{displayTime(audit.createdAt)}</time></div><p className="mt-2 text-sm leading-6 text-stone-700">{audit.reason}</p>{changes.length ? <ul className="mt-3 space-y-1 text-xs text-stone-600">{changes.map(([label, before, after]) => <li key={String(label)}>{label}：{String(before)} → {String(after)}</li>)}</ul> : <p className="mt-3 text-xs text-stone-500">未产生额度变化。</p>}</article>;
            })}
          </div>
          {!auditsLoading && !auditsError && auditMeta ? <AuditPagination meta={auditMeta} loading={auditsLoading} onPageChange={(page) => void loadAudits(page)} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
