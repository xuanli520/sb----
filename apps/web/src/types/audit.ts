export type AuditAction = 
  | 'login' | 'logout' | 'refresh' | 'register' 
  | 'verify_email' | 'forgot_password' | 'reset_password'
  | 'permission_check' | 'role_check' | 'protected_resource_access'
  | 'create' | 'update' | 'delete'
  | 'data_source_bind' | 'data_source_unbind' | 'data_source_update' | 'data_source_sync'
  | 'task_create' | 'task_update' | 'task_enable' | 'task_disable' | 'task_run' | 'task_stop' | 'task_fail';

export type AuditResult = 'success' | 'failure' | 'granted' | 'denied';

export interface AuditExtra {
  username?: string;
  account_type?: string;
  geo_location?: string;
  device_info?: string;
  session_id?: string;
  user_id?: string;
}

export interface LoginAuditLog {
  id: number;
  occurred_at?: string | null;
  request_id?: string | null;
  actor_id?: number | null;
  action?: AuditAction | string | null;
  result?: AuditResult | string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  user_agent?: string | null;
  ip?: string | null;
  extra?: AuditExtra | null;
  
  timestamp?: string | null;
  trace_id?: string | null;
  user_id?: string | null;
  username?: string | null;
  account_type?: string | null;
  source_ip?: string | null;
  geo_location?: string | null;
  device_info?: string | null;
  event_type?: string | null;
  action_method?: string | null;
  status?: 'Success' | 'Failure' | string | null;
  error_code?: string | null;
  reason?: string | null;
  session_id?: string | null;
}

export interface LoginAuditLogFilter {
  page?: number;
  size?: number;
  action?: string;
  actions?: string;
  result?: string;
  actor_id?: number;
  resource_type?: string;
  resource_id?: string;
  ip?: string;
  request_id_filter?: string;
  account_type?: string;
  occurred_from?: string;
  occurred_to?: string;
}

export interface RawLoginAuditLog {
  id: number;
  occurred_at?: string | null;
  request_id?: string | null;
  actor_id?: number | null;
  action?: string | null;
  result?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  user_agent?: string | null;
  ip?: string | null;
  extra?: Record<string, unknown> | null;
}
