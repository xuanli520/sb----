import { Skeleton } from '@/app/components/ui/skeleton';

type PageLoadingVariant = 'workspace' | 'reader' | 'auth' | 'admin';

type PageLoadingSkeletonProps = {
  variant?: PageLoadingVariant;
  label?: string;
};

function LoadingBlock({ className }: { className: string }) {
  return <Skeleton aria-hidden="true" className={`rounded-none bg-stone-200 ${className}`} />;
}

function LoadingTopbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f3f5f1]/95 backdrop-blur" aria-hidden="true">
      <div className="mx-auto flex min-h-16 max-w-[1200px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <LoadingBlock className="size-8 bg-emerald-200" />
          <LoadingBlock className="h-5 w-14 bg-stone-300" />
        </div>
        <div className="hidden items-center gap-5 md:flex">
          <LoadingBlock className="h-4 w-12" />
          <LoadingBlock className="h-4 w-16" />
          <LoadingBlock className="h-4 w-16" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LoadingBlock className="size-9 md:hidden" />
          <LoadingBlock className="hidden h-9 w-14 md:block" />
          <LoadingBlock className="hidden h-9 w-14 bg-emerald-200 md:block" />
        </div>
      </div>
    </header>
  );
}

function WorkspaceContentSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9" aria-hidden="true">
      <div className="border-b border-stone-200 pb-7">
        <LoadingBlock className="h-3 w-20 bg-emerald-100" />
        <LoadingBlock className="mt-3 h-9 w-[min(26rem,82%)] bg-stone-300" />
        <LoadingBlock className="mt-4 h-4 w-full max-w-2xl" />
        <LoadingBlock className="mt-2 h-4 w-4/5 max-w-xl" />
      </div>

      <section className="mt-7 grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="bg-white px-5 py-5">
            <LoadingBlock className="size-5 bg-emerald-100" />
            <LoadingBlock className="mt-4 h-7 w-20 bg-stone-300" />
            <LoadingBlock className="mt-2 h-4 w-16" />
          </div>
        ))}
      </section>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
        <section className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-5">
            <LoadingBlock className="h-5 w-32 bg-stone-300" />
            <LoadingBlock className="mt-3 h-4 w-3/5" />
          </div>
          <div className="space-y-4 px-5 py-5">
            {[0, 1, 2, 3].map((item) => <LoadingBlock key={item} className="h-14 w-full" />)}
          </div>
        </section>
        <section className="border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-5 py-5">
            <LoadingBlock className="h-5 w-24 bg-stone-300" />
          </div>
          <div className="space-y-3 px-5 py-5">
            {[0, 1, 2].map((item) => <LoadingBlock key={item} className="h-20 w-full" />)}
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkspaceSkeleton() {
  return (
    <>
      <LoadingTopbar />
      <WorkspaceContentSkeleton />
    </>
  );
}

function ReaderSkeleton() {
  return (
    <>
      <LoadingTopbar />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9" aria-hidden="true">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="overflow-hidden border border-stone-200 bg-[#fffdf7]">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 sm:px-7">
              <LoadingBlock className="h-4 w-32" />
              <LoadingBlock className="h-8 w-24 bg-emerald-100" />
            </div>
            <div className="px-6 py-10 sm:px-12 sm:py-14 lg:px-16">
              <LoadingBlock className="h-8 w-[min(25rem,88%)] bg-stone-300" />
              <LoadingBlock className="mt-4 h-4 w-32" />
              <div className="mt-10 space-y-4">
                {[0, 1, 2, 3, 4, 5, 6].map((item) => (
                  <LoadingBlock key={item} className={item === 2 || item === 5 ? 'h-4 w-4/5' : 'h-4 w-full'} />
                ))}
              </div>
            </div>
            <div className="flex justify-between border-t border-stone-200 px-6 py-4 sm:px-12 lg:px-16">
              <LoadingBlock className="h-9 w-24" />
              <LoadingBlock className="h-9 w-24" />
            </div>
          </section>
          <aside className="hidden border border-stone-200 bg-white lg:block">
            <div className="border-b border-stone-200 px-5 py-5">
              <LoadingBlock className="h-5 w-20 bg-stone-300" />
            </div>
            <div className="space-y-3 px-5 py-5">
              {[0, 1, 2, 3, 4, 5].map((item) => <LoadingBlock key={item} className="h-9 w-full" />)}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function AuthSkeleton() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:py-12" aria-hidden="true">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden border border-stone-200 bg-white lg:grid-cols-[minmax(0,1fr)_minmax(340px,.82fr)]">
          <div className="hidden min-h-[520px] flex-col justify-between bg-emerald-800 p-10 lg:flex">
            <div className="flex items-center gap-2"><LoadingBlock className="size-9 bg-white/25" /><LoadingBlock className="h-5 w-14 bg-white/25" /></div>
            <div><LoadingBlock className="h-4 w-20 bg-emerald-600" /><LoadingBlock className="mt-4 h-10 w-4/5 bg-white/25" /><LoadingBlock className="mt-4 h-4 w-full bg-emerald-600" /><LoadingBlock className="mt-2 h-4 w-3/4 bg-emerald-600" /></div>
            <LoadingBlock className="h-3 w-20 bg-emerald-600" />
          </div>
          <div className="flex min-h-[520px] flex-col p-6 sm:p-10">
            <div className="flex items-center gap-2 lg:hidden"><LoadingBlock className="size-8 bg-emerald-200" /><LoadingBlock className="h-5 w-14 bg-stone-300" /></div>
            <div className="my-auto max-w-sm py-10 lg:py-0">
              <LoadingBlock className="h-3 w-20 bg-emerald-100" />
              <LoadingBlock className="mt-3 h-9 w-40 bg-stone-300" />
              <LoadingBlock className="mt-4 h-4 w-full" />
              <LoadingBlock className="mt-2 h-4 w-4/5" />
              <div className="mt-8 space-y-5">
                {[0, 1, 2].map((item) => <div key={item}><LoadingBlock className="h-3 w-16 bg-stone-300" /><LoadingBlock className="mt-2 h-11 w-full" /></div>)}
                <LoadingBlock className="h-11 w-full bg-emerald-200" />
              </div>
            </div>
            <LoadingBlock className="h-4 w-40" />
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminContentSkeleton() {
  return (
    <div className="min-w-0" aria-hidden="true">
      <div className="grid gap-px overflow-hidden border border-stone-200 bg-stone-200 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="bg-white px-5 py-5">
            <LoadingBlock className="h-4 w-20" />
            <LoadingBlock className="mt-4 h-8 w-24 bg-stone-300" />
          </div>
        ))}
      </div>
      <section className="mt-7 border border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-5">
          <div><LoadingBlock className="h-5 w-32 bg-stone-300" /><LoadingBlock className="mt-3 h-4 w-52" /></div>
          <LoadingBlock className="h-9 w-24 bg-emerald-100" />
        </div>
        <div className="space-y-0 px-5 py-2">
          {[0, 1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="my-3 h-11 w-full" />)}
        </div>
      </section>
    </div>
  );
}

export function PageLoadingSkeleton({ variant = 'workspace', label = '正在加载页面' }: PageLoadingSkeletonProps) {
  const content = variant === 'reader'
    ? <ReaderSkeleton />
    : variant === 'auth'
      ? <AuthSkeleton />
      : variant === 'admin'
        ? <AdminContentSkeleton />
        : <WorkspaceSkeleton />;

  return (
    <div className={variant === 'admin' ? undefined : 'min-h-screen bg-[#f3f5f1] text-stone-900'} aria-busy="true">
      <p className="sr-only" role="status" aria-live="polite">{label}</p>
      {content}
    </div>
  );
}
