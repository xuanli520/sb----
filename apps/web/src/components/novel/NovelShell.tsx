'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  LibraryBig,
  PenSquare,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

type DemoRole = 'reader' | 'author' | 'admin';
type Workspace = DemoRole;

const navigation: Array<{ href: string; label: string; icon: LucideIcon; workspace: Workspace }> = [
  { href: '/', label: '书城', icon: LibraryBig, workspace: 'reader' },
  { href: '/author', label: '作家中心', icon: PenSquare, workspace: 'author' },
  { href: '/novel-admin', label: '运营中心', icon: ShieldCheck, workspace: 'admin' },
];

const demoDestinations: Record<DemoRole, string> = {
  reader: '/',
  author: '/author',
  admin: '/novel-admin',
};

const demoLabels: Record<DemoRole, string> = {
  reader: '读者',
  author: '作者',
  admin: '站长',
};

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
    <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function InlineNotice({ tone = 'success', children }: { tone?: 'success' | 'error'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : CheckCircle2;
  const colors = tone === 'error'
    ? 'border-rose-500 bg-rose-50 text-rose-800'
    : 'border-emerald-600 bg-emerald-50 text-emerald-800';

  return (
    <p role="status" className={`flex items-start gap-2 border-l-4 px-3 py-2 text-sm ${colors}`}>
      <Icon className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
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
  const [switchingRole, setSwitchingRole] = useState<DemoRole | null>(null);
  const [error, setError] = useState('');
  const showDevelopmentControls = process.env.NODE_ENV !== 'production';

  const switchRole = async (role: DemoRole) => {
    setError('');
    setSwitchingRole(role);
    try {
      const response = await fetch('/api/novel/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        throw new Error('无法切换演示身份');
      }
      router.push(demoDestinations[role]);
      router.refresh();
    } catch {
      setError('演示身份切换失败，请稍后重试。');
    } finally {
      setSwitchingRole(null);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f3f5f1]/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-stone-950" aria-label="阅界书城">
          <span className="grid size-8 place-items-center bg-emerald-700 text-white">
            <BookOpenText size={18} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">阅界</span>
        </Link>

        <nav aria-label="小说平台导航" className="order-3 flex w-full items-center gap-1 overflow-x-auto border-t border-stone-200 pt-2 text-sm sm:order-2 sm:w-auto sm:border-0 sm:pt-0">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.workspace === workspace || (item.href !== '/' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-2.5 py-2 font-medium transition-colors ${
                  active
                    ? 'border-emerald-700 text-emerald-800'
                    : 'border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-950'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {showDevelopmentControls ? (
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="hidden text-stone-500 lg:inline">开发身份</span>
            {(Object.keys(demoLabels) as DemoRole[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => void switchRole(role)}
                disabled={switchingRole !== null}
                aria-pressed={workspace === role}
                className={`border px-2 py-1.5 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
                  workspace === role
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800'
                }`}
              >
                {switchingRole === role ? '切换中' : demoLabels[role]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {error ? <p className="mx-auto max-w-[1200px] px-4 pb-3 text-xs text-rose-700 sm:px-6 lg:px-8">{error}</p> : null}
    </header>
  );
}

export function BackToBookstore() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-emerald-800">
      书城
      <ChevronRight size={15} aria-hidden="true" />
    </Link>
  );
}
