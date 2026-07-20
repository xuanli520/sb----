import { httpClient } from '@/lib/http/client';
import { ApiResponse, PaginatedData } from '@/lib/http/types';
import { API_ENDPOINTS } from '@/config/api';
import { LoginAuditLogFilter, RawLoginAuditLog, AuditExtra } from '@/types';

const appendIfPresent = (query: URLSearchParams, key: string, value: unknown) => {
  if (value === undefined || value === null || value === '') return;
  query.append(key, String(value));
};

const toLowerString = (value: unknown): string | null => {
  if (typeof value !== 'string') return value == null ? null : String(value);
  return value.toLowerCase();
};

export const auditLoginApi = {
  getAll: async (params?: LoginAuditLogFilter): Promise<PaginatedData<RawLoginAuditLog>> => {
    const query = new URLSearchParams();

    if (params) {
      appendIfPresent(query, 'page', params.page);
      appendIfPresent(query, 'size', params.size);
      appendIfPresent(query, 'action', params.action);
      appendIfPresent(query, 'actions', params.actions);
      appendIfPresent(query, 'result', params.result);
      appendIfPresent(query, 'actor_id', params.actor_id);
      appendIfPresent(query, 'resource_type', params.resource_type);
      appendIfPresent(query, 'resource_id', params.resource_id);
      appendIfPresent(query, 'ip', params.ip);
      appendIfPresent(query, 'request_id_filter', params.request_id_filter);
      appendIfPresent(query, 'account_type', params.account_type);
      appendIfPresent(query, 'occurred_from', params.occurred_from);
      appendIfPresent(query, 'occurred_to', params.occurred_to);
    }

    const queryString = query.toString();
    const url = queryString
      ? `${API_ENDPOINTS.AUDIT_LOGS}?${queryString}`
      : API_ENDPOINTS.AUDIT_LOGS;

    const response = await httpClient.get<ApiResponse<PaginatedData<RawLoginAuditLog>>>(url);
    return response.data;
  },
};

export function mapRawToLoginAuditLog(raw: RawLoginAuditLog) {
  const extra = raw.extra as AuditExtra | undefined;
  const rawRecord = raw as unknown as Record<string, unknown>;

  const normalizedAction = toLowerString(raw.action);
  const normalizedResult = toLowerString(raw.result);

  const rawAccountType = extra?.account_type ?? rawRecord.account_type ?? null;
  const normalizedAccountType = toLowerString(rawAccountType);

  const username = (extra?.username ?? rawRecord.username ?? null) as string | null;

  const occurredAt = raw.occurred_at as string | null | undefined;
  const requestId = raw.request_id as string | null | undefined;
  const actorId = raw.actor_id as number | null | undefined;
  const resourceType = raw.resource_type as string | null | undefined;
  const resourceId = raw.resource_id as string | null | undefined;
  const userAgent = raw.user_agent as string | null | undefined;
  const ip = raw.ip as string | null | undefined;

  const status =
    normalizedResult === 'success'
      ? 'Success'
      : normalizedResult === 'failure'
        ? 'Failure'
        : normalizedResult ?? null;

  return {
    id: raw.id as number,
    occurred_at: occurredAt,
    request_id: requestId,
    actor_id: actorId,
    action: normalizedAction,
    result: normalizedResult,
    resource_type: resourceType,
    resource_id: resourceId,
    user_agent: userAgent,
    ip,
    extra,

    timestamp: occurredAt,
    trace_id: requestId,
    user_id: extra?.user_id ?? String(actorId ?? ''),
    username,
    account_type: normalizedAccountType,
    source_ip: ip,
    geo_location: extra?.geo_location ?? null,
    device_info: extra?.device_info ?? null,
    event_type: normalizedAction,
    action_method: null,
    status,
    error_code: null,
    reason: null,
    session_id: extra?.session_id ?? resourceId ?? null,
  };
}
