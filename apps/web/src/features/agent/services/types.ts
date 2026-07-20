export type AgentRunStatus = 'queued' | 'running' | 'submitted' | 'succeeded' | 'failed' | 'cancelled' | string;

export interface AgentEvent {
  run_id: string;
  sequence: number;
  event_type: string;
  current_url: string;
  page_title: string;
  screenshot_artifact_id: string | null;
  status: AgentRunStatus;
  message: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface AgentLoginStartRequest {
  phone: string;
  account_id: string;
  data_source_id: number;
}

export interface AgentLoginStartResponse {
  session_id: string;
  status: AgentRunStatus;
  ws_endpoint: string;
}

export interface AgentLoginCodeRequest {
  code: string;
}

export interface AgentOkResponse {
  ok: boolean;
}

export interface AgentDiscoveryRequest {
  shop_id: string;
  account_id?: string | null;
  goal: string;
  entrypoint_url: string;
  namespace_hint?: string | null;
  key_hint?: string | null;
  max_steps?: number | null;
}

export interface AgentDiscoveryResponse {
  run_id: string;
  status: AgentRunStatus;
  event_sequence: number;
}

export interface AgentDiscoveryLoginStateResponse {
  account_id: string;
  shop_id: string | null;
  available: boolean;
  reason?: string;
}

export interface AgentRecipeRef {
  namespace: string;
  key: string;
  version?: number;
}

export interface AgentRecipeMarkStableRequest {
  expected_version: number;
}

export interface AgentRecipeMarkStableResponse {
  recipe_id: number;
  status: 'stable' | string;
}

export type AgentRecipeStatus = 'active' | 'degraded' | 'disabled';
export type AgentRecipeStability = 'candidate' | 'stable';

export interface AgentRecipePayload {
  entrypoint: Record<string, unknown>;
  steps: Record<string, unknown>[];
  observations: Record<string, unknown>;
  assertions: Record<string, unknown>[];
  recovery_policy: Record<string, unknown>;
  security_policy: Record<string, unknown>;
}

export interface AgentRecipeDocument extends AgentRecipePayload {
  namespace: string;
  key: string;
  version: number;
}

export interface AgentRecipeExportPayload {
  format_version: number;
  recipe: AgentRecipeDocument;
}

export interface AgentRecipeImportResponse {
  id: number;
  namespace: string;
  key: string;
  version: number;
  status: AgentRecipeStatus;
  stability: AgentRecipeStability;
  validation_error?: string | null;
}

export type AgentRecipeListItem = AgentRecipeImportResponse;

export interface AgentRecipeListResponse {
  items: AgentRecipeListItem[];
}

export interface AgentResultsParams {
  namespace?: string;
  resource_key?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  size?: number;
}

export interface AgentResultsDownloadParams {
  namespace: string;
  resource_key: string;
  date_from: string;
  date_to: string;
}

export interface AgentResultItem {
  id: number;
  namespace: string;
  resource_key: string;
  resource_date: string;
  recipe_id: number;
  output: Record<string, unknown>;
  status: AgentRunStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentResultListResponse {
  items: AgentResultItem[];
  total: number;
  page: number;
  size: number;
}
