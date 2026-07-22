'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  BookCheck,
  BookOpenText,
  ClipboardCheck,
  Gauge,
  KeyRound,
  LibraryBig,
  Mail,
  Menu,
  SearchCheck,
  Settings2,
  ShieldAlert,
  Tags,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/app/components/ui/breadcrumb';
import { Button } from '@/app/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/app/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

export const adminNavigation: NavGroup[] = [
  { label: '概览', items: [{ href: '/novel-admin', label: '工作台', icon: Gauge }] },
  {
    label: '内容审核',
    items: [
      { href: '/novel-admin/review/books', label: '作品审核', icon: BookCheck },
      { href: '/novel-admin/review/comments', label: '评论审核', icon: ClipboardCheck },
      { href: '/novel-admin/review/annotations', label: '段评与划线', icon: SearchCheck },
    ],
  },
  {
    label: '内容治理',
    items: [
      { href: '/novel-admin/content/books', label: '作品处置', icon: ShieldAlert },
      { href: '/novel-admin/content/words', label: '敏感词库', icon: BookOpenText },
      { href: '/novel-admin/content/catalog', label: '分类与标签', icon: Tags },
    ],
  },
  {
    label: '运营管理',
    items: [
      { href: '/novel-admin/operations/redemption-codes', label: '兑换码', icon: KeyRound },
      { href: '/novel-admin/operations/discovery', label: '推荐与热搜', icon: LibraryBig },
      { href: '/novel-admin/analytics/retention', label: '渠道留存', icon: BarChart3 },
    ],
  },
  {
    label: '账户管理',
    items: [
      { href: '/novel-admin/accounts/applications', label: '作者准入', icon: UserRoundCheck },
      { href: '/novel-admin/accounts/users', label: '账号治理', icon: UsersRound },
    ],
  },
  {
    label: '系统设置',
    items: [
      { href: '/novel-admin/settings/commercial', label: '商业规则', icon: Settings2 },
      { href: '/novel-admin/settings/email', label: '邮件服务', icon: Mail },
    ],
  },
];

function currentItem(pathname: string | null) {
  return adminNavigation.flatMap((group) => group.items).find((item) => item.href === pathname)
    ?? adminNavigation[0].items[0];
}

function AdminNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={mobile ? '站长中心移动导航' : '站长中心导航'} className="space-y-5">
      {adminNavigation.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <p className="px-3 text-xs font-semibold text-stone-500">{group.label}</p>
          <div className="mt-1 space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-2 border-l-2 px-3 py-2 text-sm font-medium transition-colors ${active
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-transparent text-stone-600 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950'}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
              return mobile ? <SheetClose key={item.href} asChild onClick={onNavigate}>{link}</SheetClose> : <span key={item.href}>{link}</span>;
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function AdminWorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const item = currentItem(pathname);

  return (
    <div className="grid gap-7 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-9">
      <aside className="hidden lg:block">
        <div className="sticky top-24 border-r border-stone-200 pr-4"><AdminNav /></div>
      </aside>
      <section className="min-w-0">
        <div className="mb-6 flex items-center gap-3 border-b border-stone-200 pb-5">
          <Sheet open={open} onOpenChange={setOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="打开站长导航" className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800 lg:hidden">
                    <Menu size={18} aria-hidden="true" />
                  </Button>
                </SheetTrigger>
              </TooltipTrigger>
              <TooltipContent>站长导航</TooltipContent>
            </Tooltip>
            <SheetContent side="left" className="w-[min(20rem,calc(100vw-3rem))] gap-0 border-stone-200 bg-[#f3f5f1] p-0">
              <SheetHeader className="border-b border-stone-200 px-5 py-5 pr-12 text-left"><SheetTitle className="text-stone-950">站长中心</SheetTitle></SheetHeader>
              <div className="overflow-y-auto px-3 py-5"><AdminNav mobile onNavigate={() => setOpen(false)} /></div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink asChild><Link href="/novel-admin">站长中心</Link></BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>{item.label}</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className="mt-2 text-2xl font-semibold text-stone-950">{item.label}</h1>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}
