import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">403</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">无权访问</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          当前账号没有访问该页面所需的权限。
        </p>
        <Link
          href="/compass"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[#0284c7] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0369a1]"
        >
          返回罗盘
        </Link>
      </div>
    </main>
  );
}
