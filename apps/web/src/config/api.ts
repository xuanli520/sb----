export const API_BASE_PATH = '/api/v1';

export const API_ENDPOINTS = {
  JWT_LOGIN: `${API_BASE_PATH}/auth/login`,
  JWT_REFRESH: `${API_BASE_PATH}/auth/refresh`,
  JWT_LOGOUT: `${API_BASE_PATH}/auth/logout`,
  REGISTER: `${API_BASE_PATH}/auth/register`,
  FORGOT_PASSWORD: `${API_BASE_PATH}/auth/forgot-password`,
  RESET_PASSWORD: `${API_BASE_PATH}/auth/reset-password`,
  REQUEST_VERIFY_TOKEN: `${API_BASE_PATH}/auth/request-verify-token`,
  VERIFY: `${API_BASE_PATH}/auth/verify`,

  USERS_ME: `${API_BASE_PATH}/auth/users/me`,
  USERS_BY_ID: (id: number) => `${API_BASE_PATH}/auth/users/${id}`,

  ADMIN_USERS: `${API_BASE_PATH}/admin/users`,
  ADMIN_USERS_STATS: `${API_BASE_PATH}/admin/users/stats`,
  ADMIN_USER_DETAIL: (user_id: number) => `${API_BASE_PATH}/admin/users/${user_id}`,
  ADMIN_USER_ROLES: (user_id: number) => `${API_BASE_PATH}/admin/users/${user_id}/roles`,

  ADMIN_ROLES: `${API_BASE_PATH}/admin/roles`,
  ADMIN_ROLE_DETAIL: (role_id: number) => `${API_BASE_PATH}/admin/roles/${role_id}`,
  ADMIN_ROLE_PERMISSIONS: (role_id: number) => `${API_BASE_PATH}/admin/roles/${role_id}/permissions`,

  ADMIN_PERMISSIONS: `${API_BASE_PATH}/admin/permissions`,

  PERMISSIONS_ME: `${API_BASE_PATH}/permissions/me`,

  SCHEDULES_LIST: `${API_BASE_PATH}/schedules`,
  SCHEDULE_DETAIL: (schedule_id: number) => `${API_BASE_PATH}/schedules/${schedule_id}`,
  SHOPS_LIST: `${API_BASE_PATH}/shops`,
  METRIC_DETAIL: (metric_type: string) => `${API_BASE_PATH}/metrics/${metric_type}`,
  TASKS_LIST: `${API_BASE_PATH}/tasks`,
  TASK_DETAIL: (task_id: number) => `${API_BASE_PATH}/tasks/${task_id}`,
  TASK_RUN: (task_id: number) => `${API_BASE_PATH}/tasks/${task_id}/run`,
  TASK_EXECUTIONS: (task_id: number) => `${API_BASE_PATH}/tasks/${task_id}/executions`,
  TASK_CANCEL: (task_id: number) => `${API_BASE_PATH}/tasks/${task_id}/cancel`,
  COLLECTION_JOBS: `${API_BASE_PATH}/collection-jobs`,
  COLLECTION_JOB_DETAIL: (job_id: number) => `${API_BASE_PATH}/collection-jobs/${job_id}`,
  AGENT_LOGIN_START: `${API_BASE_PATH}/agent-login/start`,
  AGENT_LOGIN_CODE: (session_id: string) => `${API_BASE_PATH}/agent-login/${session_id}/code`,
  AGENT_LOGIN_CANCEL: (session_id: string) => `${API_BASE_PATH}/agent-login/${session_id}/cancel`,
  AGENT_LOGIN_EVENTS: (session_id: string) => `${API_BASE_PATH}/agent-login/${session_id}/events`,
  AGENT_DISCOVERY: `${API_BASE_PATH}/agent-discovery`,
  AGENT_DISCOVERY_LOGIN_STATE: `${API_BASE_PATH}/agent-discovery/login-state`,
  AGENT_DISCOVERY_EVENTS: (run_id: string) => `${API_BASE_PATH}/agent-discovery/${run_id}/events`,
  AGENT_RECIPES: `${API_BASE_PATH}/agent-discovery/recipes`,
  AGENT_RECIPE_MARK_STABLE: (recipe_id: number) => `${API_BASE_PATH}/agent-discovery/recipes/${recipe_id}/mark-stable`,
  AGENT_RECIPE_EXPORT: (recipe_id: number) => `${API_BASE_PATH}/agent-discovery/recipes/${recipe_id}/export`,
  AGENT_RECIPE_IMPORT: `${API_BASE_PATH}/agent-discovery/recipes/import`,
  AGENT_RESULTS: `${API_BASE_PATH}/agent-results`,
  AGENT_RESULT_DETAIL: (result_id: number) => `${API_BASE_PATH}/agent-results/${result_id}`,
  AGENT_RESULTS_DOWNLOAD: `${API_BASE_PATH}/agent-results/download`,

  DATA_SOURCES: `${API_BASE_PATH}/data-sources`,
  DATA_SOURCE_DETAIL: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}`,
  DATA_SOURCE_ACTIVATE: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/activate`,
  DATA_SOURCE_DEACTIVATE: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/deactivate`,
  DATA_SOURCE_VALIDATE: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/validate`,
  DATA_SOURCE_SHOP_DASHBOARD_LOGIN_STATE: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/shop-dashboard/login-state`,
  DATA_SOURCE_SHOP_DASHBOARD_SHOP_CATALOG: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/shop-dashboard/shop-catalog`,
  DATA_SOURCE_SCRAPING_RULES: (ds_id: number) => `${API_BASE_PATH}/data-sources/${ds_id}/scraping-rules`,

  SCRAPING_RULES: `${API_BASE_PATH}/scraping-rules`,
  SCRAPING_RULE_DETAIL: (rule_id: number) => `${API_BASE_PATH}/scraping-rules/${rule_id}`,
  SHOP_DASHBOARD_QUERY: `${API_BASE_PATH}/shops`,
  AUDIT_LOGS: `${API_BASE_PATH}/audit/logs`,
} as const;

export const SUCCESS_CODES = [200, 201, 202, 203, 204, 205, 206, 207, 208, 209] as const;
export const DEFAULT_TIMEOUT = 30000;
