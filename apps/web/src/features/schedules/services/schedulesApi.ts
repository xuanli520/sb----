import { API_ENDPOINTS } from '@/config/api';
import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import { CollectionJobResponse, CollectionJobUpdate } from '@/types';

function toScheduleId(scheduleId: string | number): number {
  const normalized = Number(scheduleId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('定时任务 ID 无效');
  }
  return normalized;
}

export const schedulesApi = {
  getList: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    return httpClient.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.SCHEDULES_LIST);
  },

  updateById: async (
    scheduleId: string | number,
    payload: CollectionJobUpdate
  ): Promise<CollectionJobResponse> => {
    const normalizedScheduleId = toScheduleId(scheduleId);
    const response = await httpClient.put<ApiResponse<CollectionJobResponse>>(
      API_ENDPOINTS.SCHEDULE_DETAIL(normalizedScheduleId),
      payload
    );
    return response.data;
  },

  deleteById: async (scheduleId: string | number): Promise<void> => {
    const normalizedScheduleId = toScheduleId(scheduleId);
    await httpClient.delete<ApiResponse<null>>(API_ENDPOINTS.SCHEDULE_DETAIL(normalizedScheduleId));
  },
};
