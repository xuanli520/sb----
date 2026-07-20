import { queryKeys } from '@/lib/query/keys';
import { queryClient } from '@/lib/query/client';
import {
  DataSourceCreate,
  DataSourceResponse,
  DataSourceStatus,
  DataSourceType,
  DataSourceUpdate,
  ScrapingRuleListItem,
} from '@/types';
import { dataSourceApi } from './dataSourceApi';
import { buildDataSourceConfigSubmitPlan } from './shopDashboardLoginState';

export interface DataSourceFilter {
  name?: string;
  status?: DataSourceStatus;
  source_type?: DataSourceType;
  page?: number;
  size?: number;
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }
  return new Error(fallbackMessage);
}

export function normalizeDataSourceFilter(filters?: DataSourceFilter): DataSourceFilter {
  return {
    name: filters?.name,
    status: filters?.status,
    source_type: filters?.source_type,
    page: filters?.page ?? 1,
    size: filters?.size ?? 10,
  };
}

export async function createDataSourceMutationFn(data: DataSourceCreate): Promise<DataSourceResponse> {
  const plan = buildDataSourceConfigSubmitPlan(data.config, data.name);
  const created = await dataSourceApi.create({
    ...data,
    config: plan.nextConfig,
  });

  if (!plan.upload) {
    return created;
  }

  try {
    return await dataSourceApi.uploadShopDashboardLoginState(created.id, plan.upload);
  } catch (uploadErr: unknown) {
    const uploadError = toError(uploadErr, '登录态上传失败');
    try {
      await dataSourceApi.delete(created.id);
    } catch (deleteErr: unknown) {
      const deleteError = toError(deleteErr, '回滚删除失败');
      throw new Error(`数据源创建成功但登录态上传失败，且回滚删除失败: ${uploadError.message}; ${deleteError.message}`);
    }
    throw new Error(`数据源创建成功但登录态上传失败，已回滚创建: ${uploadError.message}`);
  }
}

export async function updateDataSourceMutationFn(
  variables: { id: number; data: DataSourceUpdate }
): Promise<DataSourceResponse> {
  const { id, data } = variables;
  if (!data.config) {
    return dataSourceApi.update(id, data);
  }

  const plan = buildDataSourceConfigSubmitPlan(data.config, data.name);
  const updated = await dataSourceApi.update(id, {
    ...data,
    config: plan.nextConfig,
  });

  if (!plan.upload) {
    return updated;
  }

  try {
    return await dataSourceApi.uploadShopDashboardLoginState(id, plan.upload);
  } catch (uploadErr: unknown) {
    const uploadError = toError(uploadErr, '登录态上传失败');
    throw new Error(`配置更新成功但登录态上传失败: ${uploadError.message}`);
  }
}

export async function deleteDataSourceMutationFn(id: number): Promise<number> {
  await dataSourceApi.delete(id);
  return id;
}

export const dataSourceService = {
  getListQuery: (filters: DataSourceFilter) => {
    const normalized = normalizeDataSourceFilter(filters);
    return {
      queryKey: queryKeys.dataSources.list(normalized as Record<string, unknown>),
      queryFn: () => dataSourceApi.getAll(normalized),
    };
  },

  getDetailQuery: (id: number) => ({
    queryKey: queryKeys.dataSources.detail(id),
    queryFn: () => dataSourceApi.getById(id),
    enabled: !!id && id > 0,
  }),

  createMutation: {
    mutationFn: createDataSourceMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.all,
      });
    },
  },

  updateMutation: {
    mutationFn: updateDataSourceMutationFn,
    onSuccess: (_: unknown, variables: { id: number }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.all,
      });
    },
  },

  deleteMutation: {
    mutationFn: deleteDataSourceMutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.all,
      });
    },
  },

  activateMutation: {
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      if (active) {
        return dataSourceApi.activate(id);
      }
      return dataSourceApi.deactivate(id);
    },
    onSuccess: (_: unknown, variables: { id: number }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.detail(variables.id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataSources.all,
      });
    },
  },

  validateMutation: {
    mutationFn: async (id: number) => {
      const response = await dataSourceApi.validate(id);
      return {
        success: response.valid as boolean,
        message: response.message as string,
      };
    },
  },

  getRulesQuery: (id: number) => ({
    queryKey: queryKeys.dataSources.rules(id),
    queryFn: (): Promise<ScrapingRuleListItem[]> => dataSourceApi.getScrapingRules(id),
    enabled: !!id && id > 0,
  }),
};
