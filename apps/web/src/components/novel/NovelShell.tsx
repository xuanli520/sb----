'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  LibraryBig,
  LogOut,
  Menu,
  PenSquare,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/app/components/ui/sheet';
import { Separator } from '@/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';
import { novelApi } from '@/features/novel/api';

type Workspace = 'reader' | 'author' | 'admin';
type AccountProfile = { name?: unknown; roles?: unknown };
type AuthenticatedAccount = { name: string; roles: unknown };
type SessionStatus = 'checking' | 'anonymous' | 'authenticated';

const navigation: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  workspace: Workspace;
  requiresAuthentication?: boolean;
}> = [
  { href: '/', label: '书城', icon: LibraryBig, workspace: 'reader' },
  { href: '/account', label: '个人中心', icon: UserRound, workspace: 'reader', requiresAuthentication: true },
  { href: '/author', label: '作家中心', icon: PenSquare, workspace: 'author' },
  { href: '/novel-admin', label: '站长中心', icon: ShieldCheck, workspace: 'admin' },
];

const workspaceDestinations: Record<Workspace, string> = {
  reader: '/',
  author: '/author',
  admin: '/novel-admin',
};

const workspaceLabels: Record<Workspace, string> = {
  reader: '读者',
  author: '作者',
  admin: '站长',
};

function workspacesForRoles(roles: unknown): Set<Workspace> {
  const permitted = new Set<Workspace>(['reader']);
  if (!Array.isArray(roles)) return permitted;
  if (roles.includes('AUTHOR')) permitted.add('author');
  if (roles.includes('ADMIN')) permitted.add('admin');
  return permitted;
}

function normalizeAccountProfile(profile: unknown): AuthenticatedAccount | undefined {
  if (!profile || typeof profile !== 'object') return undefined;
  const candidate = profile as AccountProfile;
  if (!Array.isArray(candidate.roles)) return undefined;
  const name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : '读者';
  return { name, roles: candidate.roles };
}

const statusStyles: Record<string, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'border-stone-300 bg-stone-100 text-stone-700' },
  PENDING_REVIEW: { label: '待审核', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  NEEDS_REVIEW: { label: '需复核', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  PUBLISHED: { label: '已上线', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  REJECTED: { label: '已驳回', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  VISIBLE: { label: '已发布', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PENDING: { label: '待处理', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  APPROVED: { label: '已通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
};

export function formatWordCount(words: number): string {
  if (words >= 10_000) {
    return `${(words / 10_000).toFixed(words % 10_000 === 0 ? 0 : 1)} 万字`;
  }
  return `${words.toLocaleString('zh-CN')} 字`;
}

export function statusLabel(status: string): string {
  return statusStyles[status]?.label ?? status;
}

export function NovelStatusBadge({ status }: { status: string }) {
  const meta = statusStyles[status] ?? {
    label: status,
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <Badge variant="outline" className={`rounded-none ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

export function InlineNotice({ tone = 'success', children }: { tone?: 'success' | 'error'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : CheckCircle2;
  const colors = tone === 'error'
    ? 'border-rose-500 bg-rose-50 text-rose-800'
    : 'border-emerald-600 bg-emerald-50 text-emerald-800';

  return (
    <Alert role="status" className={`rounded-none border-l-4 px-3 py-2 ${colors}`}>
      <Icon className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <AlertDescription className="text-inherit">{children}</AlertDescription>
    </Alert>
  );
}

export function NovelPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-stone-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold text-emerald-700">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-stone-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 sm:text-base">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function NovelShell({ children, workspace }: { children: ReactNode; workspace: Workspace }) {
  return (
    <div className="min-h-screen bg-[#f3f5f1] text-stone-900">
      <NovelTopbar workspace={workspace} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
    </div>
  );
}

function NovelTopbar({ workspace }: { workspace: Workspace }) {
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [account, setAccount] = useState<AuthenticatedAccount>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [permittedWorkspaces, setPermittedWorkspaces] = useState<Set<Workspace>>(() => new Set(['reader']));

  useEffect(() => {
    let cancelled = false;

    void novelApi<unknown>('account/profile')
      .then((profile) => {
        const normalizedProfile = normalizeAccountProfile(profile);
        if (cancelled) return;
        if (normalizedProfile) {
          setAccount(normalizedProfile);
          setPermittedWorkspaces(workspacesForRoles(normalizedProfile.roles));
          setSessionStatus('authenticated');
          return;
        }
        setAccount(undefined);
        setPermittedWorkspaces(new Set(['reader']));
        setSessionStatus('anonymous');
      })
      .catch(() => {
        if (cancelled) return;
        setAccount(undefined);
        setPermittedWorkspaces(new Set(['reader']));
        setSessionStatus('anonymous');
      });

    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    setError('');
    setLoggingOut(true);
    try {
      await novelApi<null>('session', 'reader', { method: 'DELETE' });
      setAccount(undefined);
      setPermittedWorkspaces(new Set(['reader']));
      setSessionStatus('anonymous');
      router.push('/');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : '退出登录失败，请稍后重试。');
    } finally {
      setLoggingOut(false);
    }
  };

  const authenticated = sessionStatus === 'authenticated' && account !== undefined;

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f3f5f1]/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1200px] items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-stone-950" aria-label="阅界书城">
          <span className="grid size-8 place-items-center bg-emerald-700 text-white">
            <BookOpenText size={18} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">阅界</span>
        </Link>

        <nav aria-label="小说平台导航" className="hidden items-center gap-1 text-sm md:flex">
          <NovelNavigationLinks pathname={pathname} workspace={workspace} permittedWorkspaces={permittedWorkspaces} authenticated={authenticated} />
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <MobileNavigation pathname={pathname} workspace={workspace} permittedWorkspaces={permittedWorkspaces} authenticated={authenticated} accountName={account?.name} />
          {sessionStatus !== 'checking' ? <Separator orientation="vertical" className="hidden h-7 bg-stone-200 md:block" /> : null}
          {sessionStatus === 'anonymous' ? <AuthenticationActions /> : null}
          {authenticated && account ? <AccountMenu workspace={workspace} permittedWorkspaces={permittedWorkspaces} account={account} loggingOut={loggingOut} onLogout={logout} /> : null}
        </div>
      </div>
      {loggingOut ? <p className="sr-only" role="status">正在退出登录</p> : null}
      {error ? <p className="mx-auto max-w-[1200px] px-4 pb-3 text-xs text-rose-700 sm:px-6 lg:px-8" role="status">{error}</p> : null}
    </header>
  );
}

function isNavigationActive(item: (typeof navigation)[number], pathname: string | null, workspace: Workspace) {
  return item.href === '/'
    ? workspace === 'reader' && !pathname?.startsWith('/account')
    : pathname === item.href || pathname?.startsWith(`${item.href}/`);
}

function NovelNavigationLinks({
  pathname,
  workspace,
  permittedWorkspaces,
  authenticated,
  closeOnNavigate = false,
  mobile = false,
}: {
  pathname: string | null;
  workspace: Workspace;
  permittedWorkspaces: Set<Workspace>;
  authenticated: boolean;
  closeOnNavigate?: boolean;
  mobile?: boolean;
}) {
  return navigation.filter((item) => permittedWorkspaces.has(item.workspace) && (!item.requiresAuthentication || authenticated)).map((item) => {
    const Icon = item.icon;
    const active = isNavigationActive(item, pathname, workspace);
    const link = (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={mobile
          ? `inline-flex min-h-10 items-center gap-2 border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
            active
              ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
              : 'border-transparent text-stone-600 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950'
          }`
          : `inline-flex shrink-0 items-center gap-2 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors ${
            active
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-950'
          }`}
      >
        <Icon size={16} aria-hidden="true" />
        {item.label}
      </Link>
    );

    if (closeOnNavigate) {
      return <SheetClose key={item.href} asChild>{link}</SheetClose>;
    }

    return link;
  });
}

function MobileNavigation({
  pathname,
  workspace,
  permittedWorkspaces,
  authenticated,
  accountName,
}: {
  pathname: string | null;
  workspace: Workspace;
  permittedWorkspaces: Set<Workspace>;
  authenticated: boolean;
  accountName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-none text-stone-700 hover:bg-stone-100 hover:text-stone-950 md:hidden"
            aria-label="打开导航菜单"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu size={19} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">导航</TooltipContent>
      </Tooltip>
      <SheetContent side="left" className="w-[min(20rem,calc(100vw-3rem))] gap-0 border-stone-200 bg-[#f3f5f1] p-0">
        <SheetHeader className="border-b border-stone-200 px-5 py-5 pr-12 text-left">
          <SheetTitle className="text-stone-950">阅界导航</SheetTitle>
          <SheetDescription className="text-stone-600">选择要进入的工作区</SheetDescription>
        </SheetHeader>
        <nav aria-label="移动端小说平台导航" className="flex flex-col gap-1 px-3 py-4">
          <NovelNavigationLinks pathname={pathname} workspace={workspace} permittedWorkspaces={permittedWorkspaces} authenticated={authenticated} closeOnNavigate mobile />
        </nav>
        <Separator className="mx-5 w-auto bg-stone-200" />
        <p className="px-5 py-4 text-xs leading-5 text-stone-500">
          {authenticated ? `当前账户：${accountName ?? '读者'} · ${workspaceLabels[workspace]}工作区` : '登录后可同步书架与阅读进度'}
        </p>
      </SheetContent>
    </Sheet>
  );
}

function AuthenticationActions() {
  return (
    <div className="flex items-center gap-1.5" aria-label="账户入口">
      <Button asChild variant="ghost" size="sm" className="h-9 rounded-none px-2.5 text-stone-700 hover:bg-stone-100 hover:text-stone-950">
        <Link href="/login">登录</Link>
      </Button>
      <Button asChild size="sm" className="h-9 rounded-none bg-emerald-700 px-2.5 text-white hover:bg-emerald-800">
        <Link href="/register">注册</Link>
      </Button>
    </div>
  );
}

function AccountMenu({
  workspace,
  permittedWorkspaces,
  account,
  loggingOut,
  onLogout,
}: {
  workspace: Workspace;
  permittedWorkspaces: Set<Workspace>;
  account: AuthenticatedAccount;
  loggingOut: boolean;
  onLogout: () => Promise<void>;
}) {
  const currentWorkspace = permittedWorkspaces.has(workspace) ? workspace : 'reader';
  const workspaceLabel = `${workspaceLabels[currentWorkspace]}工作区`;
  const avatarInitial = account.name.slice(0, 1);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-none border-stone-300 bg-white px-1.5 text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-900"
          aria-label={`当前账户：${account.name}，打开账户菜单`}
          aria-busy={loggingOut || undefined}
        >
          <Avatar className="size-6 border border-emerald-100 bg-emerald-50 text-xs font-semibold text-emerald-800" aria-hidden="true">
            <AvatarFallback className="bg-transparent text-inherit">{avatarInitial}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate sm:inline">{account.name}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 border-stone-200 bg-white text-stone-900">
        <DropdownMenuLabel className="flex flex-col gap-0.5 text-stone-500">
          <span className="text-xs font-medium">当前账户</span>
          <span className="truncate text-sm font-semibold text-stone-950">{account.name}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound size={16} aria-hidden="true" />
            个人中心
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={workspaceDestinations[currentWorkspace]}>
            <BookOpenText size={16} aria-hidden="true" />
            打开{workspaceLabel}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-stone-200" />
        <DropdownMenuItem
          disabled={loggingOut}
          onSelect={(event) => {
            event.preventDefault();
            void onLogout();
          }}
          className="text-rose-700 focus:bg-rose-50 focus:text-rose-800"
        >
          <LogOut size={16} aria-hidden="true" />
          <span>{loggingOut ? '正在退出...' : '退出登录'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BackToBookstore() {
  return (
    <Button asChild variant="link" size="sm" className="h-auto rounded-none px-0 text-stone-600 hover:text-emerald-800">
      <Link href="/">
        书城
        <ChevronRight size={15} aria-hidden="true" />
      </Link>
    </Button>
  );
}
