'use client';

import { Activity, History, Plus, Search, ShieldOff, Tags, UserCheck, UsersRound } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/app/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Switch } from '@/app/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { InlineNotice } from '@/components/novel/NovelShell';
import { novelApi } from '@/features/novel/api';

type Account = {
  id: number;
  loginName: string;
  displayName: string;
  roles: string[];
  enabled: boolean;
  createdAt: string;
};
type AccountPage = { items: Account[]; total: number; page: number; size: number };
type AccountStatusAudit = {
  id: number;
  accountId: number;
  previousEnabled: boolean;
  enabled: boolean;
  reason: string;
  operatorUserId: number;
  createdAt: string;
};
type AccountStatusAuditPage = { items: AccountStatusAudit[]; total: number; page: number; size: number };
type AccountStatusChange = { account: Account; changed: boolean; audit: AccountStatusAudit | null };
type AccountBehaviorSummary = {
  account: Account;
  readingProgressCount: number;
  bookshelfCount: number;
  checkinCount: number;
  bookmarkCount: number;
  bookPurchaseCount: number;
  redeemedCodeCount: number;
  rewardCount: number;
  commentCount: number;
  annotationCount: number;
  ratingCount: number;
  voteCount: number;
  readerActivityCount: number;
  lastReaderActivityAt: string | null;
};
type AccountBehaviorEvent = {
  eventType: string;
  occurredAt: string;
  bookId: number | null;
  bookTitle: string | null;
  chapterId: number | null;
  chapterTitle: string | null;
  status: string | null;
};
type AccountBehaviorEventPage = { items: AccountBehaviorEvent[]; total: number; page: number; size: number };
type TaxonomyItem = {
  id: number;
  type: 'CATEGORY' | 'TAG';
  name: string;
  enabled: boolean;
  sortOrder: number;
};
type AccountFilters = { query: string; status: 'ALL' | 'ENABLED' | 'SUSPENDED'; role: 'ALL' | 'READER' | 'AUTHOR' | 'ADMIN' };
type Notice = { tone: 'success' | 'error'; message: string };
type TaxonomyDraft = { name: string; sortOrder: string };

const initialFilters: AccountFilters = { query: '', status: 'ALL', role: 'ALL' };

function accountRoute(filters: AccountFilters, page: number) {
  const params = new URLSearchParams({ status: filters.status, role: filters.role, page: page.toString(), size: '20' });
  if (filters.query.trim()) params.set('query', filters.query.trim());
  return `admin/accounts?${params.toString()}`;
}

function PageControls({
  label,
  page,
  size,
  total,
  loading,
  onPageChange,
}: {
  label: string;
  page: number;
  size: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, size)));
  if (pageCount <= 1) return null;
  const previousDisabled = loading || page <= 0;
  const nextDisabled = loading || page >= pageCount - 1;

  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 px-5 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
      <span>第 {page + 1} / {pageCount} 页</span>
      <Pagination aria-label={`${label}分页`} className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={previousDisabled}
              tabIndex={previousDisabled ? -1 : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (!previousDisabled) onPageChange(page - 1);
              }}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={nextDisabled}
              tabIndex={nextDisabled ? -1 : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (!nextDisabled) onPageChange(page + 1);
              }}
              className="rounded-none border border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function displayTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function AccountState({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant="outline" className={enabled
      ? 'rounded-none border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'rounded-none border-rose-200 bg-rose-50 text-rose-800'}>
      {enabled ? '正常' : '已暂停'}
    </Badge>
  );
}

const behaviorEventLabels: Record<string, string> = {
  READING_PROGRESS: '阅读进度更新',
  BOOKSHELF_ADDED: '加入书架',
  CHECKIN: '每日签到',
  BOOKMARK_CREATED: '创建书签',
  BOOK_PURCHASE: '购买作品',
  REDEMPTION: '兑换权益',
  REWARD_SENT: '打赏作品',
  COMMENT_SUBMITTED: '提交评论',
  ANNOTATION_SUBMITTED: '提交段评/划线',
  RATING_RECORDED: '提交评分',
  VOTE_CAST: '投票',
  READING_ACTIVITY: '阅读活动',
};

function behaviorResource(event: AccountBehaviorEvent) {
  const book = event.bookTitle ?? (event.bookId ? `作品 #${event.bookId}` : '平台行为');
  const chapter = event.chapterTitle ?? (event.chapterId ? `章节 #${event.chapterId}` : '');
  return chapter ? `${book} · ${chapter}` : book;
}

function TaxonomyCard({
  type,
  items,
  loading,
  hasLoaded,
  busyAction,
  onCreate,
  onUpdate,
}: {
  type: 'CATEGORY' | 'TAG';
  items: TaxonomyItem[];
  loading: boolean;
  hasLoaded: boolean;
  busyAction?: string;
  onCreate: (type: 'CATEGORY' | 'TAG', name: string, sortOrder: number) => Promise<void>;
  onUpdate: (item: TaxonomyItem, values: TaxonomyDraft & { enabled: boolean }) => Promise<void>;
}) {
  const label = type === 'CATEGORY' ? '分类' : '标签';
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('');
  const [drafts, setDrafts] = useState<Record<number, TaxonomyDraft>>({});

  const draftFor = (item: TaxonomyItem): TaxonomyDraft => drafts[item.id] ?? {
    name: item.name,
    sortOrder: String(item.sortOrder),
  };
  const updateDraft = (item: TaxonomyItem, patch: Partial<TaxonomyDraft>) => {
    setDrafts((current) => ({ ...current, [item.id]: { ...draftFor(item), ...patch } }));
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sortOrder = newSortOrder.trim() ? Number(newSortOrder) : 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return;
    try {
      await onCreate(type, newName, sortOrder);
      setNewName('');
      setNewSortOrder('');
    } catch {
      // The parent has already rendered the request error as an inline notice.
    }
  };
  const save = async (item: TaxonomyItem) => {
    const draft = draftFor(item);
    const sortOrder = Number(draft.sortOrder);
    if (!draft.name.trim() || !Number.isInteger(sortOrder) || sortOrder < 0) return;
    await onUpdate(item, { ...draft, name: draft.name.trim(), sortOrder: String(sortOrder), enabled: item.enabled });
  };
  const toggle = async (item: TaxonomyItem, enabled: boolean) => {
    const draft = draftFor(item);
    await onUpdate(item, { ...draft, enabled });
  };

  return (
    <section className="border border-stone-200 bg-white" aria-labelledby={`${type.toLowerCase()}-configuration-heading`} aria-busy={loading || undefined}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-5">
        <div>
          <p className="text-xs font-semibold text-emerald-700">目录配置</p>
          <h3 id={`${type.toLowerCase()}-configuration-heading`} className="mt-1 text-lg font-semibold text-stone-950">{label}管理</h3>
        </div>
        <Tags className="text-emerald-700" size={20} aria-hidden="true" />
      </div>
      <div className="divide-y divide-stone-100">
        {loading && !hasLoaded ? <div className="space-y-4 px-5 py-4">{[0, 1].map((item) => <div key={item} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_86px_auto_auto] sm:items-end"><div><Skeleton className="h-3 w-16 rounded-none bg-stone-100" /><Skeleton className="mt-1 h-9 w-full rounded-none bg-stone-100" /></div><div><Skeleton className="h-3 w-10 rounded-none bg-stone-100" /><Skeleton className="mt-1 h-9 w-full rounded-none bg-stone-100" /></div><Skeleton className="h-9 w-20 rounded-none bg-stone-100" /><Skeleton className="h-9 w-14 rounded-none bg-stone-100" /></div>)}</div> : null}
        {!loading && hasLoaded && items.length === 0 ? <p className="px-5 py-7 text-sm text-stone-500">暂未配置{label}。</p> : null}
        {items.map((item) => {
          const draft = draftFor(item);
          const action = `taxonomy-${type}-${item.id}`;
          return (
            <div key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_86px_auto_auto] sm:items-end">
              <div>
                <Label htmlFor={`${type.toLowerCase()}-name-${item.id}`} className="text-xs text-stone-600">{label}名称</Label>
                <Input id={`${type.toLowerCase()}-name-${item.id}`} aria-label={`${label}名称 ${item.id}`} value={draft.name} onChange={(event) => updateDraft(item, { name: event.target.value })} disabled={busyAction === action} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" />
              </div>
              <div>
                <Label htmlFor={`${type.toLowerCase()}-sort-${item.id}`} className="text-xs text-stone-600">排序</Label>
                <Input id={`${type.toLowerCase()}-sort-${item.id}`} aria-label={`${label}排序 ${item.id}`} type="number" min="0" value={draft.sortOrder} onChange={(event) => updateDraft(item, { sortOrder: event.target.value })} disabled={busyAction === action} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" />
              </div>
              <div className="flex min-h-9 items-center gap-2 sm:pb-0.5">
                <Switch checked={item.enabled} onCheckedChange={(enabled) => void toggle(item, enabled)} disabled={busyAction === action} aria-label={`${item.name} ${label}已启用`} className="data-[state=checked]:bg-emerald-700" />
                <span className="text-xs text-stone-600">{item.enabled ? '启用' : '停用'}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void save(item)} disabled={busyAction === action} className="h-9 rounded-none border-stone-300 bg-white px-2.5 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">保存</Button>
            </div>
          );
        })}
      </div>
      <form onSubmit={(event) => void create(event)} className="grid gap-3 border-t border-stone-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_86px_auto] sm:items-end">
        <div>
          <Label htmlFor={`new-${type.toLowerCase()}-name`} className="text-xs text-stone-600">新{label}</Label>
          <Input id={`new-${type.toLowerCase()}-name`} aria-label={`新${label}`} required maxLength={128} value={newName} onChange={(event) => setNewName(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder={`输入${label}名称`} />
        </div>
        <div>
          <Label htmlFor={`new-${type.toLowerCase()}-sort`} className="text-xs text-stone-600">排序</Label>
          <Input id={`new-${type.toLowerCase()}-sort`} aria-label={`新${label}排序`} type="number" min="0" value={newSortOrder} onChange={(event) => setNewSortOrder(event.target.value)} className="mt-1 h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="0" />
        </div>
        <Button type="submit" aria-label={`添加${label}`} disabled={busyAction === `taxonomy-create-${type}`} className="h-9 rounded-none bg-emerald-700 px-3 hover:bg-emerald-800"><Plus size={15} aria-hidden="true" />添加</Button>
      </form>
    </section>
  );
}

export function AdminOperationsPanels({ mode = 'all' }: { mode?: 'all' | 'accounts' | 'catalog' }) {
  const [filters, setFilters] = useState<AccountFilters>(initialFilters);
  const [accounts, setAccounts] = useState<AccountPage>();
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [statusReasons, setStatusReasons] = useState<Record<number, string>>({});
  const [auditAccount, setAuditAccount] = useState<Account>();
  const [accountAuditPage, setAccountAuditPage] = useState<AccountStatusAuditPage>();
  const [accountAuditsLoading, setAccountAuditsLoading] = useState(false);
  const [behaviorAccount, setBehaviorAccount] = useState<Account>();
  const [behaviorSummary, setBehaviorSummary] = useState<AccountBehaviorSummary>();
  const [behaviorEvents, setBehaviorEvents] = useState<AccountBehaviorEventPage>();
  const [accountsLoading, setAccountsLoading] = useState(mode === 'all' || mode === 'accounts');
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [taxonomyLoading, setTaxonomyLoading] = useState(mode === 'all' || mode === 'catalog');
  const [taxonomyLoaded, setTaxonomyLoaded] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const includesAccounts = mode === 'all' || mode === 'accounts';
  const includesCatalog = mode === 'all' || mode === 'catalog';

  const loadAccounts = useCallback(async (activeFilters: AccountFilters, page = 0, showLoading = true) => {
    if (showLoading) setAccountsLoading(true);
    try {
      const next = await novelApi<AccountPage>(accountRoute(activeFilters, page), 'admin');
      setAccounts(next);
      setAccountsLoaded(true);
    } finally {
      if (showLoading) setAccountsLoading(false);
    }
  }, []);
  const loadTaxonomy = useCallback(async (showLoading = true) => {
    if (showLoading) setTaxonomyLoading(true);
    try {
      const [nextCategories, nextTags] = await Promise.all([
        novelApi<TaxonomyItem[]>('admin/taxonomy/CATEGORY', 'admin'),
        novelApi<TaxonomyItem[]>('admin/taxonomy/TAG', 'admin'),
      ]);
      setCategories(nextCategories);
      setTags(nextTags);
      setTaxonomyLoaded(true);
    } finally {
      if (showLoading) setTaxonomyLoading(false);
    }
  }, []);
  const load = useCallback(async () => {
    try {
      await Promise.all([
        ...(includesAccounts ? [loadAccounts(initialFilters, 0)] : []),
        ...(includesCatalog ? [loadTaxonomy()] : []),
      ]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '运营账户与目录配置暂时无法加载。' });
    }
  }, [includesAccounts, includesCatalog, loadAccounts, loadTaxonomy]);

  useEffect(() => { void load(); }, [load]);

  const changeAccountStatus = async (account: Account, enabled: boolean) => {
    const reason = statusReasons[account.id]?.trim();
    if (!reason) {
      setNotice({ tone: 'error', message: '请填写账号状态说明，系统会将其保留在审计记录中。' });
      return;
    }
    const action = `account-${account.id}`;
    setPendingAction(action);
    try {
      const change = await novelApi<AccountStatusChange>(`admin/accounts/${account.id}/status`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ enabled, reason }),
      });
      setStatusReasons((current) => ({ ...current, [account.id]: '' }));
      setNotice({ tone: 'success', message: change.changed
        ? `${account.displayName}已${enabled ? '恢复' : '暂停'}，会话状态已同步更新。`
        : `${account.displayName}已经处于该状态。` });
      await loadAccounts(filters, accounts?.page ?? 0);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '更新账号状态失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const loadAccountAudits = async (account: Account, page: number, openDialog = false) => {
    setAccountAuditsLoading(true);
    try {
      const next = await novelApi<AccountStatusAuditPage>(`admin/accounts/${account.id}/status-audits?page=${page}&size=20`, 'admin');
      setAccountAuditPage(next);
      if (openDialog) setAuditAccount(account);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '账号审计记录暂时无法加载。' });
    } finally {
      setAccountAuditsLoading(false);
    }
  };

  const openAccountAudit = async (account: Account) => {
    setPendingAction(`account-audit-${account.id}`);
    try {
      await loadAccountAudits(account, 0, true);
    } finally {
      setPendingAction(undefined);
    }
  };

  const openAccountBehavior = async (account: Account) => {
    const action = `account-behavior-${account.id}`;
    setPendingAction(action);
    try {
      const [summary, events] = await Promise.all([
        novelApi<AccountBehaviorSummary>(`admin/accounts/${account.id}/behavior-summary`, 'admin'),
        novelApi<AccountBehaviorEventPage>(`admin/accounts/${account.id}/behavior-events?page=0&size=20`, 'admin'),
      ]);
      setBehaviorSummary(summary);
      setBehaviorEvents(events);
      setBehaviorAccount(account);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '用户行为记录暂时无法加载。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const loadBehaviorPage = async (page: number) => {
    if (!behaviorAccount || !behaviorEvents || page < 0) return;
    const action = `account-behavior-page-${behaviorAccount.id}-${page}`;
    setPendingAction(action);
    try {
      const events = await novelApi<AccountBehaviorEventPage>(
        `admin/accounts/${behaviorAccount.id}/behavior-events?page=${page}&size=${behaviorEvents.size}`,
        'admin',
      );
      setBehaviorEvents(events);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '用户行为记录暂时无法加载。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const createTaxonomy = async (type: 'CATEGORY' | 'TAG', name: string, sortOrder: number) => {
    if (!name.trim()) return;
    setPendingAction(`taxonomy-create-${type}`);
    try {
      await novelApi<TaxonomyItem>(`admin/taxonomy/${type}`, 'admin', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), enabled: true, sortOrder }),
      });
      setNotice({ tone: 'success', message: `${type === 'CATEGORY' ? '分类' : '标签'}已加入运营目录。` });
      await loadTaxonomy();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '保存目录配置失败。' });
      throw reason;
    } finally {
      setPendingAction(undefined);
    }
  };

  const updateTaxonomy = async (item: TaxonomyItem, values: TaxonomyDraft & { enabled: boolean }) => {
    const type = item.type;
    const action = `taxonomy-${type}-${item.id}`;
    const sortOrder = Number(values.sortOrder);
    if (!values.name.trim() || !Number.isInteger(sortOrder) || sortOrder < 0) {
      setNotice({ tone: 'error', message: '目录名称不能为空，排序必须是非负整数。' });
      return;
    }
    setPendingAction(action);
    try {
      await novelApi<TaxonomyItem>(`admin/taxonomy/${type}/${item.id}`, 'admin', {
        method: 'PUT',
        body: JSON.stringify({ name: values.name.trim(), enabled: values.enabled, sortOrder }),
      });
      setNotice({ tone: 'success', message: `${item.name}配置已更新。` });
      await loadTaxonomy();
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '更新目录配置失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const submitAccountSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadAccounts(filters, 0).catch((reason) => {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '账号检索失败。' });
    });
  };

  const behaviorMetrics = behaviorSummary ? [
    ['阅读进度', behaviorSummary.readingProgressCount],
    ['书架', behaviorSummary.bookshelfCount],
    ['签到', behaviorSummary.checkinCount],
    ['书签', behaviorSummary.bookmarkCount],
    ['单本购买', behaviorSummary.bookPurchaseCount],
    ['兑换', behaviorSummary.redeemedCodeCount],
    ['打赏', behaviorSummary.rewardCount],
    ['评论', behaviorSummary.commentCount],
    ['段评/划线', behaviorSummary.annotationCount],
    ['评分', behaviorSummary.ratingCount],
    ['投票', behaviorSummary.voteCount],
    ['阅读活动', behaviorSummary.readerActivityCount],
  ] as const : [];
  const behaviorPageCount = behaviorEvents ? Math.max(1, Math.ceil(behaviorEvents.total / behaviorEvents.size)) : 1;

  return (
    <section className="mt-7" aria-labelledby="account-governance-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">{includesAccounts ? '账号治理' : '内容目录'}</p>
          <h2 id="account-governance-heading" className="mt-1 text-xl font-semibold text-stone-950">{includesAccounts && includesCatalog ? '用户状态与内容目录' : includesAccounts ? '用户状态与行为查询' : '分类与标签'}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{includesAccounts ? '暂停会立即撤销登录会话；恢复后仍需重新登录。' : '分类与标签的每次变更都会保留运营审计。'}</p>
        </div>
        <UsersRound className="shrink-0 text-emerald-700" size={22} aria-hidden="true" />
      </div>

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      {includesAccounts ? <section className="mt-5 border border-stone-200 bg-white" aria-labelledby="managed-account-heading" aria-busy={accountsLoading || undefined}>
        <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700">访问控制</p>
            <h3 id="managed-account-heading" className="mt-1 text-lg font-semibold text-stone-950">账号状态管理</h3>
          </div>
          <form onSubmit={submitAccountSearch} className="grid gap-2 sm:grid-cols-[minmax(170px,1fr)_120px_120px_auto] sm:items-end">
            <div>
              <Label htmlFor="managed-account-query" className="sr-only">检索账号</Label>
              <Input id="managed-account-query" aria-label="账号关键词" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="h-9 rounded-none border-stone-300 bg-white px-2 text-sm" placeholder="姓名或登录账号" />
            </div>
            <div>
              <Label htmlFor="managed-account-status" className="text-xs text-stone-600">状态</Label>
              <Select value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status: status as AccountFilters['status'] }))}>
                <SelectTrigger id="managed-account-status" aria-label="账号状态筛选" className="mt-1 h-9 w-full rounded-none border-stone-300 bg-white px-2 text-sm text-stone-800">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-stone-300 bg-white text-stone-800">
                  <SelectItem value="ALL">全部状态</SelectItem>
                  <SelectItem value="ENABLED">正常</SelectItem>
                  <SelectItem value="SUSPENDED">已暂停</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="managed-account-role" className="text-xs text-stone-600">角色</Label>
              <Select value={filters.role} onValueChange={(role) => setFilters((current) => ({ ...current, role: role as AccountFilters['role'] }))}>
                <SelectTrigger id="managed-account-role" aria-label="账号角色筛选" className="mt-1 h-9 w-full rounded-none border-stone-300 bg-white px-2 text-sm text-stone-800">
                  <SelectValue placeholder="全部角色" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-stone-300 bg-white text-stone-800">
                  <SelectItem value="ALL">全部角色</SelectItem>
                  <SelectItem value="READER">读者</SelectItem>
                  <SelectItem value="AUTHOR">作者</SelectItem>
                  <SelectItem value="ADMIN">站长</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="outline" size="icon" title="检索账号" aria-label="检索账号" className="h-9 w-9 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Search size={16} aria-hidden="true" /></Button>
          </form>
        </div>
        {accountsLoading && !accountsLoaded ? <div className="overflow-x-auto"><div className="min-w-[960px] divide-y divide-stone-100"><div className="grid grid-cols-[minmax(170px,1.1fr)_100px_80px_130px_minmax(250px,1fr)] gap-4 bg-stone-50 px-4 py-3">{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-3 w-full rounded-none bg-stone-100" />)}</div>{[0, 1, 2].map((row) => <div key={row} className="grid grid-cols-[minmax(170px,1.1fr)_100px_80px_130px_minmax(250px,1fr)] items-center gap-4 px-4 py-4"><div><Skeleton className="h-4 w-28 rounded-none bg-stone-100" /><Skeleton className="mt-2 h-3 w-20 rounded-none bg-stone-100" /></div><Skeleton className="h-5 w-16 rounded-none bg-stone-100" /><Skeleton className="h-5 w-14 rounded-none bg-stone-100" /><Skeleton className="h-3 w-24 rounded-none bg-stone-100" /><div className="flex gap-2"><Skeleton className="h-9 flex-1 rounded-none bg-stone-100" /><Skeleton className="h-9 w-16 rounded-none bg-stone-100" /><Skeleton className="h-9 w-9 rounded-none bg-stone-100" /></div></div>)}</div></div> : null}
        {!accountsLoading && accountsLoaded && !accounts?.items.length ? <p className="px-5 py-10 text-center text-sm text-stone-500">没有符合筛选条件的账号。</p> : null}
        {accounts?.items.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[960px] text-stone-700">
              <TableHeader className="border-stone-100 bg-stone-50 text-stone-600"><TableRow className="border-0 hover:bg-transparent"><TableHead className="px-4 py-3 font-medium">账号</TableHead><TableHead className="px-4 py-3 font-medium">角色</TableHead><TableHead className="px-4 py-3 font-medium">状态</TableHead><TableHead className="px-4 py-3 font-medium">注册时间</TableHead><TableHead className="min-w-[250px] px-4 py-3 font-medium">状态说明与操作</TableHead></TableRow></TableHeader>
              <TableBody>{accounts.items.map((account) => {
                const action = `account-${account.id}`;
                return <TableRow key={account.id} className="border-stone-100 hover:bg-stone-50"><TableCell className="px-4 py-4"><p className="font-medium text-stone-950">{account.displayName}</p><p className="mt-1 text-xs text-stone-500">{account.loginName}</p></TableCell><TableCell className="px-4 py-4"><div className="flex flex-wrap gap-1">{account.roles.map((role) => <Badge key={role} variant="outline" className="rounded-none border-stone-200 bg-stone-50 text-xs text-stone-700">{role}</Badge>)}</div></TableCell><TableCell className="px-4 py-4"><AccountState enabled={account.enabled} /></TableCell><TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-600">{displayTime(account.createdAt)}</TableCell><TableCell className="px-4 py-4"><div className="flex gap-2"><Input aria-label={`账号状态说明 ${account.id}`} value={statusReasons[account.id] ?? ''} onChange={(event) => setStatusReasons((current) => ({ ...current, [account.id]: event.target.value }))} disabled={pendingAction === action} className="h-9 min-w-0 rounded-none border-stone-300 bg-white px-2 text-xs" placeholder={account.enabled ? '暂停原因（必填）' : '恢复说明（必填）'} /><Button type="button" variant="outline" size="sm" onClick={() => void changeAccountStatus(account, !account.enabled)} disabled={pendingAction === action} className={account.enabled ? 'h-9 shrink-0 rounded-none border-rose-200 bg-white px-2.5 text-rose-700 hover:border-rose-500 hover:text-rose-800' : 'h-9 shrink-0 rounded-none border-emerald-200 bg-white px-2.5 text-emerald-800 hover:border-emerald-700'}>{account.enabled ? <ShieldOff size={15} aria-hidden="true" /> : <UserCheck size={15} aria-hidden="true" />}{account.enabled ? '暂停' : '恢复'}</Button><Button type="button" variant="outline" size="icon" aria-label={`查看账号审计 ${account.id}`} title="查看账号审计" onClick={() => void openAccountAudit(account)} disabled={pendingAction === `account-audit-${account.id}`} className="h-9 w-9 shrink-0 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={15} aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" aria-label={`查看用户行为 ${account.id}`} title="查看用户行为" onClick={() => void openAccountBehavior(account)} disabled={pendingAction === `account-behavior-${account.id}`} className="h-9 w-9 shrink-0 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><Activity size={15} aria-hidden="true" /></Button></div></TableCell></TableRow>;
              })}</TableBody>
            </Table>
          </div>
        ) : null}
        {accountsLoaded && accounts ? <>
          <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">共 {accounts.total.toLocaleString('zh-CN')} 个账号，当前显示 {accounts.items.length} 个。</p>
          <PageControls
            label="账号列表"
            page={accounts.page}
            size={accounts.size}
            total={accounts.total}
            loading={accountsLoading}
            onPageChange={(page) => void loadAccounts(filters, page)}
          />
        </> : null}
      </section> : null}

      {includesCatalog ? <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <TaxonomyCard type="CATEGORY" items={categories} loading={taxonomyLoading} hasLoaded={taxonomyLoaded} busyAction={pendingAction} onCreate={createTaxonomy} onUpdate={updateTaxonomy} />
        <TaxonomyCard type="TAG" items={tags} loading={taxonomyLoading} hasLoaded={taxonomyLoaded} busyAction={pendingAction} onCreate={createTaxonomy} onUpdate={updateTaxonomy} />
      </div> : null}

      <Dialog open={Boolean(auditAccount)} onOpenChange={(open) => {
        if (!open) {
          setAuditAccount(undefined);
          setAccountAuditPage(undefined);
        }
      }}>
        <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-stone-950">账号状态审计</DialogTitle><DialogDescription className="text-stone-600">{auditAccount ? `${auditAccount.displayName} 的状态决定记录` : ''}</DialogDescription></DialogHeader>
          <div className="max-h-80 overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">
            {accountAuditsLoading ? <div className="space-y-3 py-5"><Skeleton className="h-14 rounded-none bg-stone-100" /><Skeleton className="h-14 rounded-none bg-stone-100" /></div> : null}
            {!accountAuditsLoading && !accountAuditPage?.items.length ? <p className="py-6 text-center text-sm text-stone-500">暂未记录状态变更。</p> : null}
            {!accountAuditsLoading && accountAuditPage?.items.map((audit) => <article key={audit.id} className="py-4"><div className="flex items-center gap-2"><AccountState enabled={audit.enabled} /><span className="text-xs text-stone-500">操作人 #{audit.operatorUserId} · {displayTime(audit.createdAt)}</span></div><p className="mt-2 text-sm leading-6 text-stone-700">{audit.reason}</p></article>)}
          </div>
          {auditAccount && accountAuditPage ? <PageControls label="账号状态审计" page={accountAuditPage.page} size={accountAuditPage.size} total={accountAuditPage.total} loading={accountAuditsLoading} onPageChange={(page) => void loadAccountAudits(auditAccount, page)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(behaviorAccount)} onOpenChange={(open) => {
        if (!open) {
          setBehaviorAccount(undefined);
          setBehaviorSummary(undefined);
          setBehaviorEvents(undefined);
        }
      }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none border-stone-200 bg-white p-5 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-stone-950">用户行为</DialogTitle>
            <DialogDescription className="text-stone-600">{behaviorAccount ? `${behaviorAccount.displayName} 的行为摘要与最近记录` : ''}</DialogDescription>
          </DialogHeader>
          {behaviorSummary ? <>
            <div className="grid grid-cols-3 border-l border-t border-stone-100 sm:grid-cols-4" aria-label="用户行为摘要">
              {behaviorMetrics.map(([label, value]) => <div key={label} className="border-b border-r border-stone-100 px-3 py-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-1 text-base font-semibold text-stone-900">{value.toLocaleString('zh-CN')}</p></div>)}
            </div>
            <p className="mt-3 text-xs text-stone-500">最近阅读活动：{behaviorSummary.lastReaderActivityAt ? displayTime(behaviorSummary.lastReaderActivityAt) : '暂无'}。私密正文与凭据不在此处显示。</p>
          </> : <Skeleton className="h-28 rounded-none bg-stone-100" />}
          <section className="mt-5 border-y border-stone-100" aria-labelledby="account-behavior-timeline-heading">
            <div className="flex items-center justify-between gap-3 px-1 py-3">
              <h3 id="account-behavior-timeline-heading" className="text-sm font-semibold text-stone-950">行为时间线</h3>
              {behaviorEvents ? <span className="text-xs text-stone-500">共 {behaviorEvents.total.toLocaleString('zh-CN')} 条</span> : null}
            </div>
            <div className="divide-y divide-stone-100">
              {!behaviorEvents ? <div className="py-6"><Skeleton className="h-12 rounded-none bg-stone-100" /></div> : null}
              {behaviorEvents?.items.length === 0 ? <p className="py-7 text-center text-sm text-stone-500">暂无可查询的行为记录。</p> : null}
              {behaviorEvents?.items.map((event, index) => <article key={`${event.eventType}-${event.occurredAt}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-stone-900">{behaviorEventLabels[event.eventType] ?? event.eventType}</span>{event.status ? <Badge variant="outline" className="rounded-none border-stone-200 bg-stone-50 text-xs text-stone-700">{event.status}</Badge> : null}</div><p className="mt-1 truncate text-xs text-stone-600" title={behaviorResource(event)}>{behaviorResource(event)}</p></div><time className="whitespace-nowrap text-xs text-stone-500">{displayTime(event.occurredAt)}</time></article>)}
            </div>
            {behaviorEvents && behaviorPageCount > 1 ? <PageControls
              label="用户行为"
              page={behaviorEvents.page}
              size={behaviorEvents.size}
              total={behaviorEvents.total}
              loading={Boolean(pendingAction?.startsWith(`account-behavior-page-${behaviorAccount?.id}-`))}
              onPageChange={(page) => void loadBehaviorPage(page)}
            /> : null}
          </section>
        </DialogContent>
      </Dialog>
    </section>
  );
}
