import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataSourceCreate, DataSourceResponse } from '@/types';
import { queryKeys } from '@/lib/query/keys';
import { createDataSourceMutationFn } from '../services/dataSourceService';

export function useCreateDataSource() {
  const queryClient = useQueryClient();
  const mutation = useMutation<DataSourceResponse, Error, DataSourceCreate>({
    mutationFn: createDataSourceMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dataSources.all });
    },
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  };
}
