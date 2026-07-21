'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from '@/app/components/ui/sonner';
import { queryClient } from '@/lib/query/client';
import * as React from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const showQueryDevtools = process.env.NODE_ENV === 'development'
    && process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS === 'true';

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-center" richColors closeButton duration={4000} />
      {showQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
