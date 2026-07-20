import { API_ENDPOINTS } from '@/config/api';
import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import {
  CollectionJobCreate,
  CollectionJobResponse,
  CollectionJobSchedule,
  CollectionJobTaskType,
  CollectionJobUpdate,
} from '@/types';

export interface CollectionJobListParams {
  task_type?: CollectionJobTaskType;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeSchedule(schedule: unknown): CollectionJobSchedule {
  const record = asRecord(schedule);
  const cron = typeof record.cron === 'string' ? record.cron.trim() : '';
  const timezone = typeof record.timezone === 'string' && record.timezone.trim()
    ? record.timezone.trim()
    : 'Asia/Shanghai';
  const kwargs = asRecord(record.kwargs);

  return {
    cron,
    timezone,
    kwargs,
  };
}

function normalizeCollectionJob(job: CollectionJobResponse): CollectionJobResponse {
  return {
    ...job,
    schedule: normalizeSchedule(job.schedule),
  };
}

function normalizeCreatePayload(payload: CollectionJobCreate): CollectionJobCreate {
  return {
    ...payload,
    name: payload.name.trim(),
    schedule: normalizeSchedule(payload.schedule),
  };
}

function normalizeUpdatePayload(payload: CollectionJobUpdate): CollectionJobUpdate {
  const nextPayload: CollectionJobUpdate = {};

  if (typeof payload.name === 'string') {
    nextPayload.name = payload.name.trim();
  }
  if (payload.status) {
    nextPayload.status = payload.status;
  }
  if (payload.schedule) {
    nextPayload.schedule = normalizeSchedule(payload.schedule);
  }

  return nextPayload;
}

function toCollectionJobId(jobId: string | number): number {
  const normalized = Number(jobId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('定时任务 ID 无效');
  }
  return normalized;
}

export const collectionJobApi = {
  async list(params: CollectionJobListParams = {}): Promise<CollectionJobResponse[]> {
    const query = new URLSearchParams();

    if (params.task_type) {
      query.append('task_type', params.task_type);
    }

    const queryString = query.toString();
    const url = queryString
      ? `${API_ENDPOINTS.COLLECTION_JOBS}?${queryString}`
      : API_ENDPOINTS.COLLECTION_JOBS;

    const response = await httpClient.get<ApiResponse<CollectionJobResponse[]>>(url);
    return response.data.map(item => normalizeCollectionJob(item));
  },

  async create(payload: CollectionJobCreate): Promise<CollectionJobResponse> {
    const response = await httpClient.post<ApiResponse<CollectionJobResponse>>(
      API_ENDPOINTS.COLLECTION_JOBS,
      normalizeCreatePayload(payload)
    );
    return normalizeCollectionJob(response.data);
  },

  async update(jobId: string | number, payload: CollectionJobUpdate): Promise<CollectionJobResponse> {
    const normalizedId = toCollectionJobId(jobId);
    const response = await httpClient.put<ApiResponse<CollectionJobResponse>>(
      API_ENDPOINTS.COLLECTION_JOB_DETAIL(normalizedId),
      normalizeUpdatePayload(payload)
    );
    return normalizeCollectionJob(response.data);
  },

  async remove(jobId: string | number): Promise<void> {
    const normalizedId = toCollectionJobId(jobId);
    await httpClient.delete<ApiResponse<null>>(API_ENDPOINTS.COLLECTION_JOB_DETAIL(normalizedId));
  },
};
