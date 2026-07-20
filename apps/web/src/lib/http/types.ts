export interface RequestConfig extends RequestInit {
  url?: string;
  params?: Record<string, string | number | boolean | undefined>;
  _retry?: boolean;
  _retryCount?: number;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export interface HttpError extends Error {
  status?: number;
  code?: string;
  data?: unknown;
  config?: RequestConfig;
}

export interface RequestInterceptor {
  onRequest?: (config: RequestConfig) => Promise<RequestConfig> | RequestConfig;
  onRequestError?: (error: HttpError) => Promise<HttpError> | HttpError;
}

export interface ResponseInterceptor {
  onResponse?: <T>(response: HttpResponse<T>) => Promise<HttpResponse<T>> | HttpResponse<T>;
  onResponseError?: (error: HttpError) => Promise<HttpResponse<unknown> | HttpError> | HttpResponse<unknown> | HttpError;
}

export interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export interface PageMeta {
  page: number;
  size: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  meta: PageMeta;
}
