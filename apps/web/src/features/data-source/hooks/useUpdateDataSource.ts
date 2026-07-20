import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataSourceUpdate, DataSourceResponse } from '@/types';
import { queryKeys } from '@/lib/query/keys';
import { updateDataSourceMutationFn } from '../services/dataSourceService';

export function useUpdateDataSource() {
  const queryClient = useQueryClient();
  const mutation = useMutation<DataSourceResponse, Error, { id: number; data: DataSourceUpdate }>({
    mutationFn: updateDataSourceMutationFn,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dataSources.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dataSources.all });
    },
  });

  const update = (id: number, data: DataSourceUpdate) => {
    return mutation.mutateAsync({ id, data });
  };

  return {
    update,
    loading: mutation.isPending,
    error: mutation.error,
  };
}
