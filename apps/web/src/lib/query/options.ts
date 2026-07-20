import { QueryOptions, MutationOptions } from '@tanstack/react-query';

export const defaultQueryOptions = {
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
} as const;

export const defaultMutationOptions = {
  retry: false,
} as const;
