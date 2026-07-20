'use client';

import React, { Suspense } from 'react';
import { RolesPageContent } from './RolesPageContent';

function RolesPageFallback() {
  return (
    <div className="p-6 space-y-6 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />
        </div>
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-12 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-96 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    </div>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<RolesPageFallback />}>
      <RolesPageContent />
    </Suspense>
  );
}
