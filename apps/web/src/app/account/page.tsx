'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  LibraryBig,
  LoaderCircle,
  Pencil,
  RefreshCw,
  TicketCheck,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/app/components/ui/alert';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { NovelPageHeader, NovelShell, formatWordCount } from '@/components/novel/NovelShell';
import {
  type AccountEntitlements,
  type AccountProfile,
  type AccountProfileUpdate,
  type Book,
  novelApi,
} from '@/features/novel/api';

type Wallet = {
  points: number;
  tokens: number;
};

type ReadingProgress = {
  bookId: number;
  chapterId: number;
  offset: number;
  updatedAt: string;
};

type CheckinResult = {
  points: number;
  awarded: number;
};

type RedeemResult = {
  code: string;
  tokens: number;
  balance: number;
};

type AuthorApplication = {
  id: number;
  penName: string;
  statement: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  createdAt: string;
  decidedAt?: string | null;
};

type Notice = {
  tone: 'success' | 'error';
  message: string;
};

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN');
}

function formatReadTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '最近更新';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
}

function formatEntitlementTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '时间未知';

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
}

function validateDisplayName(value: string) {
  const normalized = value.trim();
  if (!normalized) return '显示名称不能为空。';
  if ([...normalized].length > 128) return '显示名称最多 128 个字符。';
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(normalized)) {
    return '显示名称不能包含控制字符或换行。';
  }
  return '';
}

function messageFrom(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export default function AccountPage() {
  const [profile, setProfile] = useState<AccountProfile>();
  const [bookshelf, setBookshelf] = useState<Book[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [wallet, setWallet] = useState<Wallet>();
  const [entitlements, setEntitlements] = useState<AccountEntitlements>();
  const [authorApplication, setAuthorApplication] = useState<AuthorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameError, setDisplayNameError] = useState('');
  const [penName, setPenName] = useState('');
  const [authorStatement, setAuthorStatement] = useState('');
  const [checkedIn, setCheckedIn] = useState(false);
  const [pendingAction, setPendingAction] = useState<'checkin' | 'redeem' | 'profile-update' | 'author-application' | 'author-status-refresh'>();
  const [notice, setNotice] = useState<Notice>();

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [nextProfile, nextBookshelf, nextProgress, nextWallet, nextEntitlements, nextAuthorApplication] = await Promise.all([
        novelApi<AccountProfile>('account/profile'),
        novelApi<Book[]>('account/bookshelf'),
        novelApi<ReadingProgress[]>('account/progress'),
        novelApi<Wallet>('account/wallet'),
        novelApi<AccountEntitlements>('account/entitlements'),
        novelApi<AuthorApplication | null>('account/author-applications'),
      ]);
      setProfile(nextProfile);
      setDisplayName(nextProfile.name);
      setBookshelf(nextBookshelf);
      setProgress(nextProgress);
      setWallet(nextWallet);
      setEntitlements(nextEntitlements);
      setAuthorApplication(nextAuthorApplication);
      if (nextAuthorApplication?.status === 'REJECTED') {
        setPenName(nextAuthorApplication.penName);
      }
    } catch (reason) {
      setLoadError(messageFrom(reason, '个人中心暂时无法加载，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const bookById = useMemo(() => new Map(bookshelf.map((book) => [book.id, book])), [bookshelf]);
  const progressByBook = useMemo(() => new Map(progress.map((item) => [item.bookId, item])), [progress]);
  const recentReads = useMemo(
    () => [...progress]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 5),
    [progress],
  );

  const announce = (message: string, tone: Notice['tone'] = 'success') => setNotice({ message, tone });

  const handleCheckin = async () => {
    if (checkedIn || pendingAction === 'checkin') return;

    setPendingAction('checkin');
    try {
      const result = await novelApi<CheckinResult>('account/checkin', 'reader', { method: 'POST' });
      setWallet((current) => current ? { ...current, points: result.points } : { points: result.points, tokens: 0 });
      setCheckedIn(true);
      announce(`签到成功，获得 ${formatAmount(result.awarded)} 积分。`);
    } catch (reason) {
      const message = messageFrom(reason, '签到失败，请稍后重试。');
      if (/already checked in|已经签到|今日已签到/i.test(message)) {
        setCheckedIn(true);
        announce('今天已经签到，积分余额已同步。');
      } else {
        announce(message, 'error');
      }
    } finally {
      setPendingAction(undefined);
    }
  };

  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = redeemCode.trim();
    if (!code) {
      announce('请输入兑换码。', 'error');
      return;
    }

    setPendingAction('redeem');
    try {
      const result = await novelApi<RedeemResult>('account/redeem', 'reader', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setWallet((current) => current
        ? { ...current, tokens: result.balance }
        : { points: 0, tokens: result.balance });
      try {
        setEntitlements(await novelApi<AccountEntitlements>('account/entitlements'));
      } catch {
        // A successful redemption remains authoritative even if the follow-up read is delayed.
      }
      setRedeemCode('');
      announce(result.tokens > 0
        ? `兑换成功，已到账 ${formatAmount(result.tokens)} 代币。`
        : `兑换码 ${result.code} 已使用，账户权益已更新。`);
    } catch (reason) {
      announce(messageFrom(reason, '兑换失败，请检查兑换码后重试。'), 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const beginDisplayNameEdit = () => {
    if (!profile) return;
    setDisplayName(profile.name);
    setDisplayNameError('');
    setEditingDisplayName(true);
  };

  const cancelDisplayNameEdit = () => {
    if (pendingAction === 'profile-update') return;
    setDisplayName(profile?.name ?? '');
    setDisplayNameError('');
    setEditingDisplayName(false);
  };

  const handleDisplayNameUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDisplayName = displayName.trim();
    const validationMessage = validateDisplayName(displayName);
    if (validationMessage) {
      setDisplayNameError(validationMessage);
      return;
    }

    setDisplayNameError('');
    setPendingAction('profile-update');
    try {
      const nextProfile = await novelApi<AccountProfile>('account/profile', 'reader', {
        method: 'PUT',
        body: JSON.stringify({ displayName: normalizedDisplayName } satisfies AccountProfileUpdate),
      });
      setProfile(nextProfile);
      setDisplayName(nextProfile.name);
      setEditingDisplayName(false);
      announce('显示名称已更新。');
    } catch (reason) {
      setDisplayNameError(messageFrom(reason, '显示名称暂时无法更新，请稍后重试。'));
    } finally {
      setPendingAction(undefined);
    }
  };

  const handleAuthorApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPenName = penName.trim();
    const normalizedStatement = authorStatement.trim();
    if (!normalizedPenName || !normalizedStatement) {
      announce('请填写笔名和创作说明。', 'error');
      return;
    }

    setPendingAction('author-application');
    try {
      const application = await novelApi<AuthorApplication>('account/author-applications', 'reader', {
        method: 'POST',
        body: JSON.stringify({ penName: normalizedPenName, statement: normalizedStatement }),
      });
      setAuthorApplication(application);
      setPenName(application.penName);
      setAuthorStatement('');
      announce('作者申请已提交，审核结果会同步显示在这里。');
    } catch (reason) {
      announce(messageFrom(reason, '作者申请提交失败，请稍后重试。'), 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  const refreshAuthorApplicationStatus = async () => {
    if (pendingAction === 'author-status-refresh') return;

    setPendingAction('author-status-refresh');
    try {
      const [nextProfile, nextAuthorApplication] = await Promise.all([
        novelApi<AccountProfile>('account/profile'),
        novelApi<AuthorApplication | null>('account/author-applications'),
      ]);
      setProfile(nextProfile);
      setAuthorApplication(nextAuthorApplication);
      announce(
        nextProfile.roles.includes('AUTHOR') || nextAuthorApplication?.status === 'APPROVED'
          ? '审核已通过，作者身份已生效。'
          : '审核状态已更新，当前仍在审核中。',
      );
    } catch (reason) {
      announce(messageFrom(reason, '审核状态暂时无法刷新，请稍后重试。'), 'error');
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <NovelShell workspace="reader">
      <NovelPageHeader
        eyebrow="读者中心"
        title="我的阅读账户"
        description="查看账户权益、管理书架，并从上次离开的章节继续阅读。"
        actions={(
          <Button asChild variant="outline" className="rounded-none border-stone-300 bg-white text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
            <Link href="/">
              <LibraryBig size={16} aria-hidden="true" />
              去书城
            </Link>
          </Button>
        )}
      />

      {notice ? (
        <Alert
          role="status"
          className={`mt-6 rounded-none border-l-4 ${notice.tone === 'error'
            ? 'border-rose-500 bg-rose-50 text-rose-900'
            : 'border-emerald-600 bg-emerald-50 text-emerald-900'}`}
        >
          {notice.tone === 'error'
            ? <CircleAlert aria-hidden="true" />
            : <Check aria-hidden="true" />}
          <AlertTitle>{notice.tone === 'error' ? '操作未完成' : '操作成功'}</AlertTitle>
          <AlertDescription className="text-inherit">{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !profile ? (
        <section aria-live="polite" className="mt-7 border-y border-stone-200 bg-white px-5 py-8 text-sm text-stone-600">
          正在加载账户信息...
        </section>
      ) : null}

      {loadError ? (
        <Alert className="mt-7 rounded-none border-rose-200 bg-rose-50 text-rose-900">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>个人中心无法加载</AlertTitle>
          <AlertDescription className="mt-2 flex flex-wrap items-center gap-3 text-inherit">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadAccount()} className="rounded-none border-rose-300 bg-white text-rose-900 hover:bg-rose-100">
              <RefreshCw size={15} aria-hidden="true" />
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {profile && wallet && entitlements ? (
        <div className="mt-7 space-y-9">
          <section aria-labelledby="account-overview-title" className="border-y border-stone-200 bg-white">
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center bg-emerald-700 text-white">
                  <UserRound size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700">账户</p>
                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    <h2 id="account-overview-title" className="min-w-0 truncate text-2xl font-semibold text-stone-950">{profile.name}</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="编辑显示名称"
                      aria-label="编辑显示名称"
                      onClick={beginDisplayNameEdit}
                      className="size-8 shrink-0 rounded-none text-stone-600 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">账号 #{profile.id}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end" aria-label="账户角色">
                {profile.roles.length > 0 ? profile.roles.map((role) => (
                  <Badge key={role} variant="outline" className="rounded-none border-emerald-200 bg-emerald-50 text-emerald-800">{role}</Badge>
                )) : <Badge variant="outline" className="rounded-none border-stone-300 bg-stone-50 text-stone-700">读者</Badge>}
              </div>
            </div>
            {editingDisplayName ? (
              <form onSubmit={handleDisplayNameUpdate} className="border-t border-stone-200 px-5 py-5 sm:px-7">
                <div className="flex flex-col gap-3 sm:max-w-xl sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="display-name" className="text-stone-800">显示名称</Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(event) => {
                        setDisplayName(event.target.value);
                        if (displayNameError) setDisplayNameError('');
                      }}
                      maxLength={512}
                      required
                      autoFocus
                      aria-invalid={displayNameError ? true : undefined}
                      aria-describedby={displayNameError ? 'display-name-error' : undefined}
                      className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                    />
                    {displayNameError ? <p id="display-name-error" role="status" className="mt-2 text-sm text-rose-700">{displayNameError}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="submit"
                      size="icon"
                      title="保存显示名称"
                      aria-label="保存显示名称"
                      disabled={pendingAction === 'profile-update'}
                      className="rounded-none bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      {pendingAction === 'profile-update'
                        ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
                        : <Check size={17} aria-hidden="true" />}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="取消编辑显示名称"
                      aria-label="取消编辑显示名称"
                      disabled={pendingAction === 'profile-update'}
                      onClick={cancelDisplayNameEdit}
                      className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:text-stone-950"
                    >
                      <X size={17} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </form>
            ) : null}
          </section>

          <section aria-labelledby="author-application-title" className="border-y border-stone-200 bg-white px-5 py-6 sm:px-7">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
              <div>
                <h2 id="author-application-title" className="text-lg font-semibold text-stone-950">作者申请</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">提交创作资料后，审核状态会在此同步更新。</p>
              </div>
            </div>

            {profile.roles.includes('AUTHOR') || authorApplication?.status === 'APPROVED' ? (
              <div className="mt-5 flex flex-col gap-4 border-l-4 border-emerald-600 bg-emerald-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Badge variant="outline" className="rounded-none border-emerald-300 bg-white text-emerald-800">申请已通过</Badge>
                  <p className="mt-2 text-sm leading-6 text-emerald-950">作者身份已生效，可进入创作台管理作品。</p>
                </div>
                <Button asChild size="sm" className="shrink-0 rounded-none bg-emerald-700 text-white hover:bg-emerald-800">
                  <Link href="/author">
                    进入创作台
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : authorApplication?.status === 'PENDING' ? (
              <div className="mt-5 flex flex-col gap-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Badge variant="outline" className="rounded-none border-amber-300 bg-white text-amber-900">申请审核中</Badge>
                  <p className="mt-2 text-sm leading-6 text-amber-950">笔名「{authorApplication.penName}」的申请已提交，管理员审核完成后会在此显示结果。</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshAuthorApplicationStatus()}
                  disabled={pendingAction === 'author-status-refresh'}
                  className="shrink-0 rounded-none border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                >
                  <RefreshCw className={pendingAction === 'author-status-refresh' ? 'animate-spin' : undefined} size={15} aria-hidden="true" />
                  {pendingAction === 'author-status-refresh' ? '刷新中...' : '刷新审核状态'}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAuthorApplication} className="mt-5 grid gap-4">
                {authorApplication?.status === 'REJECTED' ? (
                  <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-950">
                    <span className="font-semibold">申请被驳回。</span>
                    {authorApplication.reason ? ` ${authorApplication.reason}` : ' 请补充创作资料后重新提交。'}
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="author-pen-name" className="text-stone-800">创作笔名</Label>
                  <Input
                    id="author-pen-name"
                    value={penName}
                    onChange={(event) => setPenName(event.target.value)}
                    placeholder="填写用于作品署名的笔名"
                    maxLength={128}
                    required
                    className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                  />
                </div>
                <div>
                  <Label htmlFor="author-statement" className="text-stone-800">创作说明</Label>
                  <Textarea
                    id="author-statement"
                    value={authorStatement}
                    onChange={(event) => setAuthorStatement(event.target.value)}
                    placeholder="简要介绍你的创作方向与计划"
                    maxLength={4000}
                    required
                    className="mt-2 min-h-28 resize-y rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                  />
                </div>
                <Button type="submit" disabled={pendingAction === 'author-application'} className="w-full rounded-none bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto">
                  {pendingAction === 'author-application' ? '提交中...' : authorApplication?.status === 'REJECTED' ? '重新提交申请' : '提交作者申请'}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </form>
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <section aria-labelledby="wallet-title" className="border-t-2 border-emerald-700 pt-5">
              <div className="flex items-start gap-3">
                <WalletCards className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
                <div>
                  <h2 id="wallet-title" className="text-lg font-semibold text-stone-950">账户余额</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">积分和代币会在签到、兑换及阅读互动后同步到这里。</p>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 border border-stone-200 bg-white">
                <div className="px-4 py-4 sm:px-5">
                  <dt className="flex items-center gap-2 text-sm text-stone-600"><CalendarCheck2 size={16} aria-hidden="true" />积分</dt>
                  <dd className="mt-2 text-2xl font-semibold text-stone-950">{formatAmount(wallet.points)}</dd>
                </div>
                <div className="border-l border-stone-200 px-4 py-4 sm:px-5">
                  <dt className="flex items-center gap-2 text-sm text-stone-600"><Coins size={16} aria-hidden="true" />代币</dt>
                  <dd className="mt-2 text-2xl font-semibold text-stone-950">{formatAmount(wallet.tokens)}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="checkin-title" className="border-t-2 border-amber-500 pt-5">
              <div className="flex items-start gap-3">
                <CalendarCheck2 className="mt-0.5 text-amber-700" size={20} aria-hidden="true" />
                <div>
                  <h2 id="checkin-title" className="text-lg font-semibold text-stone-950">每日签到</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">每天首次签到可获得 10 积分。</p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => void handleCheckin()}
                disabled={checkedIn || pendingAction === 'checkin'}
                className="mt-5 w-full rounded-none bg-emerald-700 text-white hover:bg-emerald-800 sm:w-auto"
              >
                {checkedIn ? <Check size={16} aria-hidden="true" /> : <CalendarCheck2 size={16} aria-hidden="true" />}
                {pendingAction === 'checkin' ? '签到中...' : checkedIn ? '今日已签到' : '今日签到'}
              </Button>
            </section>
          </div>

          <section aria-labelledby="entitlements-title" className="border-y border-stone-200 bg-white px-5 py-6 sm:px-7">
            <div className="flex items-start gap-3">
              <TicketCheck className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
              <div>
                <h2 id="entitlements-title" className="text-lg font-semibold text-stone-950">已获权益</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">这里仅展示当前账户已经获得的会员和整本阅读权益。</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)]">
              <div className="border-l-4 border-emerald-600 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-semibold text-emerald-950">会员权益</p>
                {entitlements.membership ? (
                  <>
                    <Badge variant="outline" className={`mt-3 rounded-none bg-white ${entitlements.membership.active
                      ? 'border-emerald-300 text-emerald-800'
                      : 'border-stone-300 text-stone-700'}`}
                    >
                      {entitlements.membership.active ? '当前有效' : '已到期'}
                    </Badge>
                    <p className="mt-3 text-sm leading-6 text-emerald-950">
                      {entitlements.membership.active ? '有效至 ' : '到期时间 '}
                      {formatEntitlementTime(entitlements.membership.expiresAt)}
                    </p>
                  </>
                ) : <p className="mt-3 text-sm leading-6 text-emerald-950">当前没有会员权益。</p>}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-stone-900">整本阅读权益</h3>
                {entitlements.books.length > 0 ? (
                  <ul className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
                    {entitlements.books.map((book) => (
                      <li key={book.bookId} className="grid gap-2 px-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-950">{book.bookTitle}</p>
                          <p className="mt-1 break-all text-xs leading-5 text-stone-600">来源：{book.sourceType} · {book.sourceReference}</p>
                          <p className="mt-1 text-xs leading-5 text-stone-500">获得时间：{formatEntitlementTime(book.acquiredAt)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          <p className="text-sm font-medium text-stone-800">代币记录：{formatAmount(book.purchaseAmount)} {book.amountUnit}</p>
                          <Button asChild variant="outline" size="sm" className="h-auto rounded-none border-stone-300 bg-white px-3 py-1.5 text-stone-700 hover:border-emerald-700 hover:text-emerald-800">
                            <Link href={`/reader/${book.bookId}`} aria-label={`阅读《${book.bookTitle}》`}>
                              <BookOpen size={15} aria-hidden="true" />
                              阅读
                            </Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 border-y border-stone-200 px-3 py-4 text-sm leading-6 text-stone-600">当前没有整本阅读权益。</p>}
              </div>
            </div>
          </section>

          <section aria-labelledby="redeem-title" className="border-y border-stone-200 bg-white px-5 py-6 sm:px-7">
            <div className="flex items-start gap-3">
              <TicketCheck className="mt-0.5 text-emerald-700" size={20} aria-hidden="true" />
              <div>
                <h2 id="redeem-title" className="text-lg font-semibold text-stone-950">兑换权益</h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">输入有效兑换码后，账户的代币或其他权益将立即更新。</p>
              </div>
            </div>
            <form onSubmit={handleRedeem} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <Label htmlFor="redeem-code" className="text-stone-800">兑换码</Label>
                <Input
                  id="redeem-code"
                  value={redeemCode}
                  onChange={(event) => setRedeemCode(event.target.value)}
                  placeholder="输入兑换码"
                  autoComplete="off"
                  required
                  className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20"
                />
              </div>
              <Button type="submit" disabled={pendingAction === 'redeem'} className="rounded-none bg-emerald-700 text-white hover:bg-emerald-800">
                <TicketCheck size={16} aria-hidden="true" />
                {pendingAction === 'redeem' ? '兑换中...' : '确认兑换'}
              </Button>
            </form>
          </section>

          <div className="grid gap-9 lg:grid-cols-[1.05fr_0.95fr]">
            <section aria-labelledby="recent-title" className="border-t-2 border-stone-800 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 text-stone-700" size={20} aria-hidden="true" />
                  <div>
                    <h2 id="recent-title" className="text-lg font-semibold text-stone-950">最近阅读</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-600">从最近保存的章节继续。</p>
                  </div>
                </div>
              </div>

              {recentReads.length > 0 ? (
                <ol className="mt-5 divide-y divide-stone-200 border-y border-stone-200 bg-white">
                  {recentReads.map((item) => {
                    const book = bookById.get(item.bookId);
                    const title = book?.title ?? `作品 #${item.bookId}`;
                    return (
                      <li key={`${item.bookId}-${item.chapterId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium text-stone-950">{title}</h3>
                          <p className="mt-1 text-sm text-stone-600">第 {item.chapterId} 章 · {formatReadTime(item.updatedAt)}</p>
                        </div>
                        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-none border-stone-300 bg-white text-stone-800 hover:border-emerald-700 hover:text-emerald-800">
                          <Link href={`/reader/${item.bookId}`} aria-label={`继续阅读《${title}》`}>
                            继续阅读
                            <ArrowRight size={15} aria-hidden="true" />
                          </Link>
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="mt-5 border-y border-stone-200 bg-white px-4 py-6 text-sm leading-6 text-stone-600">
                  还没有阅读进度。去书城挑选一本作品，阅读记录会自动保存在这里。
                </div>
              )}
            </section>

            <section aria-labelledby="bookshelf-title" className="border-t-2 border-stone-800 pt-5">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 text-stone-700" size={20} aria-hidden="true" />
                <div>
                  <h2 id="bookshelf-title" className="text-lg font-semibold text-stone-950">我的书架</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600">已收藏 {formatAmount(bookshelf.length)} 本作品。</p>
                </div>
              </div>

              {bookshelf.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {bookshelf.map((book) => {
                    const bookProgress = progressByBook.get(book.id);
                    const actionLabel = bookProgress ? '继续阅读' : '开始阅读';
                    return (
                      <Card key={book.id} className="gap-0 rounded-none border-stone-200 bg-white p-4">
                        <CardContent className="p-0 [&:last-child]:pb-0">
                          <div className="flex gap-3">
                            <span className="grid size-10 shrink-0 place-items-center bg-stone-100 text-emerald-800">
                              <BookOpen size={19} aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="min-w-0 truncate font-medium text-stone-950">{book.title}</h3>
                                <Badge variant="outline" className="rounded-none border-stone-300 bg-stone-50 text-stone-700">{book.category}</Badge>
                              </div>
                              <p className="mt-1 text-sm text-stone-600">{book.author} · {formatWordCount(book.words)}</p>
                              <p className="mt-2 text-xs text-stone-500">{bookProgress ? `已读至第 ${bookProgress.chapterId} 章` : '尚未开始阅读'}</p>
                            </div>
                          </div>
                          <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-none border-stone-300 bg-white text-stone-800 hover:border-emerald-700 hover:text-emerald-800 sm:w-auto">
                            <Link href={`/reader/${book.id}`} aria-label={`${actionLabel}《${book.title}》`}>
                              {actionLabel}
                              <ArrowRight size={15} aria-hidden="true" />
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 border-y border-stone-200 bg-white px-4 py-6 text-sm leading-6 text-stone-600">
                  书架还是空的。收藏作品后，可以在这里快速回到阅读进度。
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </NovelShell>
  );
}
