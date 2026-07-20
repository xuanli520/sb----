import { QueryClient } from '@tanstack/react-query';
import { queryErrorHandler } from '@/lib/error/handler';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error: any) => {
        if (error?.code === 'NETWORK_ERROR') {
          return failureCount < 3;
        }
        return false;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      throwOnError: false,
    },
    mutations: {
      retry: false,
      onError: queryErrorHandler,
    },
  },
});

export default queryClient;
