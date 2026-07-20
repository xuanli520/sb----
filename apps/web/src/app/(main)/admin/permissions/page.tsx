'use client';

import React, { Suspense } from 'react';
import { PermissionsPageContent } from './PermissionsPageContent';

function PermissionsPageFallback() {
  return (
    <div className="p-6 space-y-6 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="md:col-span-2 h-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>

      <div className="h-96 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <Suspense fallback={<PermissionsPageFallback />}>
      <PermissionsPageContent />
    </Suspense>
  );
}
