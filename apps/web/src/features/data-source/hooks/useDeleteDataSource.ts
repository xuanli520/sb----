import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { deleteDataSourceMutationFn } from '../services/dataSourceService';

export function useDeleteDataSource() {
  const queryClient = useQueryClient();
  const mutation = useMutation<number, Error, number>({
    mutationFn: deleteDataSourceMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dataSources.all });
    },
  });

  const remove = async (id: number): Promise<void> => {
    await mutation.mutateAsync(id);
  };

  return {
    remove,
    loading: mutation.isPending,
    error: mutation.error,
  };
}
