'use client';

import { History, Plus, Search, ShieldOff, Tags, UserCheck, UsersRound } from 'lucide-react';
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
type AccountStatusChange = { account: Account; changed: boolean; audit: AccountStatusAudit | null };
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

function accountRoute(filters: AccountFilters) {
  const params = new URLSearchParams({ status: filters.status, role: filters.role, page: '0', size: '20' });
  if (filters.query.trim()) params.set('query', filters.query.trim());
  return `admin/accounts?${params.toString()}`;
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

function TaxonomyCard({
  type,
  items,
  busyAction,
  onCreate,
  onUpdate,
}: {
  type: 'CATEGORY' | 'TAG';
  items: TaxonomyItem[];
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
    <section className="border border-stone-200 bg-white" aria-labelledby={`${type.toLowerCase()}-configuration-heading`}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-5">
        <div>
          <p className="text-xs font-semibold text-emerald-700">目录配置</p>
          <h3 id={`${type.toLowerCase()}-configuration-heading`} className="mt-1 text-lg font-semibold text-stone-950">{label}管理</h3>
        </div>
        <Tags className="text-emerald-700" size={20} aria-hidden="true" />
      </div>
      <div className="divide-y divide-stone-100">
        {items.length === 0 ? <p className="px-5 py-7 text-sm text-stone-500">暂未配置{label}。</p> : null}
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

export function AdminOperationsPanels() {
  const [filters, setFilters] = useState<AccountFilters>(initialFilters);
  const [accounts, setAccounts] = useState<AccountPage>();
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [statusReasons, setStatusReasons] = useState<Record<number, string>>({});
  const [auditAccount, setAuditAccount] = useState<Account>();
  const [accountAudits, setAccountAudits] = useState<AccountStatusAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string>();
  const [notice, setNotice] = useState<Notice>();

  const loadAccounts = useCallback(async (activeFilters: AccountFilters) => {
    const next = await novelApi<AccountPage>(accountRoute(activeFilters), 'admin');
    setAccounts(next);
  }, []);
  const loadTaxonomy = useCallback(async () => {
    const [nextCategories, nextTags] = await Promise.all([
      novelApi<TaxonomyItem[]>('admin/taxonomy/CATEGORY', 'admin'),
      novelApi<TaxonomyItem[]>('admin/taxonomy/TAG', 'admin'),
    ]);
    setCategories(nextCategories);
    setTags(nextTags);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadAccounts(initialFilters), loadTaxonomy()]);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '运营账户与目录配置暂时无法加载。' });
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadTaxonomy]);

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
      await loadAccounts(filters);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '更新账号状态失败。' });
    } finally {
      setPendingAction(undefined);
    }
  };

  const openAccountAudit = async (account: Account) => {
    setPendingAction(`account-audit-${account.id}`);
    try {
      const audits = await novelApi<AccountStatusAudit[]>(`admin/accounts/${account.id}/status-audits?limit=20`, 'admin');
      setAccountAudits(audits);
      setAuditAccount(account);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '账号审计记录暂时无法加载。' });
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
    void loadAccounts(filters).catch((reason) => {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '账号检索失败。' });
    });
  };

  return (
    <section className="mt-7" aria-labelledby="account-governance-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">账号治理</p>
          <h2 id="account-governance-heading" className="mt-1 text-xl font-semibold text-stone-950">用户状态与内容目录</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">暂停会立即撤销登录会话；恢复后仍需重新登录。分类与标签的每次变更同样保留运营审计。</p>
        </div>
        <UsersRound className="shrink-0 text-emerald-700" size={22} aria-hidden="true" />
      </div>

      {notice ? <div className="mt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}

      <section className="mt-5 border border-stone-200 bg-white" aria-labelledby="managed-account-heading">
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
        {loading ? <div className="p-5"><Skeleton className="h-40 rounded-none bg-stone-100" /></div> : null}
        {!loading && !accounts?.items.length ? <p className="px-5 py-10 text-center text-sm text-stone-500">没有符合筛选条件的账号。</p> : null}
        {accounts?.items.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[960px] text-stone-700">
              <TableHeader className="border-stone-100 bg-stone-50 text-stone-600"><TableRow className="border-0 hover:bg-transparent"><TableHead className="px-4 py-3 font-medium">账号</TableHead><TableHead className="px-4 py-3 font-medium">角色</TableHead><TableHead className="px-4 py-3 font-medium">状态</TableHead><TableHead className="px-4 py-3 font-medium">注册时间</TableHead><TableHead className="min-w-[250px] px-4 py-3 font-medium">状态说明与操作</TableHead></TableRow></TableHeader>
              <TableBody>{accounts.items.map((account) => {
                const action = `account-${account.id}`;
                return <TableRow key={account.id} className="border-stone-100 hover:bg-stone-50"><TableCell className="px-4 py-4"><p className="font-medium text-stone-950">{account.displayName}</p><p className="mt-1 text-xs text-stone-500">{account.loginName}</p></TableCell><TableCell className="px-4 py-4"><div className="flex flex-wrap gap-1">{account.roles.map((role) => <Badge key={role} variant="outline" className="rounded-none border-stone-200 bg-stone-50 text-xs text-stone-700">{role}</Badge>)}</div></TableCell><TableCell className="px-4 py-4"><AccountState enabled={account.enabled} /></TableCell><TableCell className="whitespace-nowrap px-4 py-4 text-xs text-stone-600">{displayTime(account.createdAt)}</TableCell><TableCell className="px-4 py-4"><div className="flex gap-2"><Input aria-label={`账号状态说明 ${account.id}`} value={statusReasons[account.id] ?? ''} onChange={(event) => setStatusReasons((current) => ({ ...current, [account.id]: event.target.value }))} disabled={pendingAction === action} className="h-9 min-w-0 rounded-none border-stone-300 bg-white px-2 text-xs" placeholder={account.enabled ? '暂停原因（必填）' : '恢复说明（必填）'} /><Button type="button" variant="outline" size="sm" onClick={() => void changeAccountStatus(account, !account.enabled)} disabled={pendingAction === action} className={account.enabled ? 'h-9 shrink-0 rounded-none border-rose-200 bg-white px-2.5 text-rose-700 hover:border-rose-500 hover:text-rose-800' : 'h-9 shrink-0 rounded-none border-emerald-200 bg-white px-2.5 text-emerald-800 hover:border-emerald-700'}>{account.enabled ? <ShieldOff size={15} aria-hidden="true" /> : <UserCheck size={15} aria-hidden="true" />}{account.enabled ? '暂停' : '恢复'}</Button><Button type="button" variant="outline" size="icon" aria-label={`查看账号审计 ${account.id}`} title="查看账号审计" onClick={() => void openAccountAudit(account)} disabled={pendingAction === `account-audit-${account.id}`} className="h-9 w-9 shrink-0 rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800"><History size={15} aria-hidden="true" /></Button></div></TableCell></TableRow>;
              })}</TableBody>
            </Table>
          </div>
        ) : null}
        {accounts ? <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">共 {accounts.total.toLocaleString('zh-CN')} 个账号，当前显示 {accounts.items.length} 个。</p> : null}
      </section>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <TaxonomyCard type="CATEGORY" items={categories} busyAction={pendingAction} onCreate={createTaxonomy} onUpdate={updateTaxonomy} />
        <TaxonomyCard type="TAG" items={tags} busyAction={pendingAction} onCreate={createTaxonomy} onUpdate={updateTaxonomy} />
      </div>

      <Dialog open={Boolean(auditAccount)} onOpenChange={(open) => { if (!open) setAuditAccount(undefined); }}>
        <DialogContent className="rounded-none border-stone-200 bg-white p-5 sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-stone-950">账号状态审计</DialogTitle><DialogDescription className="text-stone-600">{auditAccount ? `${auditAccount.displayName} 的最近状态决定` : ''}</DialogDescription></DialogHeader>
          <div className="max-h-80 overflow-y-auto divide-y divide-stone-100 border-y border-stone-100">
            {accountAudits.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">暂未记录状态变更。</p> : accountAudits.map((audit) => <article key={audit.id} className="py-4"><div className="flex items-center gap-2"><AccountState enabled={audit.enabled} /><span className="text-xs text-stone-500">操作人 #{audit.operatorUserId} · {displayTime(audit.createdAt)}</span></div><p className="mt-2 text-sm leading-6 text-stone-700">{audit.reason}</p></article>)}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
