import { RequestInterceptor, ResponseInterceptor, HttpError, HttpResponse, RequestConfig } from './types';
import { clearSession } from '@/lib/auth';
import { API_ENDPOINTS } from '@/config/api';
import { ENDPOINT_CONFIG } from '@/config/endpoint-config';
import { ENDPOINT_STATUS_HTTP, EndpointStatus, getEndpointStatus } from '@/types/endpoint';
import { buildStatusDescription } from '@/lib/endpoint-status/formatters';

const AUTH_SKIP_ENDPOINTS = new Set<string>([
  API_ENDPOINTS.JWT_LOGIN,
  API_ENDPOINTS.JWT_REFRESH,
  API_ENDPOINTS.JWT_LOGOUT,
]);

let refreshPromise: Promise<void> | null = null;
const toastTimeline: number[] = [];
const AUTH_PAGE_PATHS = new Set(['/login', '/register']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isAuthSkipped(url?: string) {
  if (!url) {
    return false;
  }
  return Array.from(AUTH_SKIP_ENDPOINTS).some((path) => url.includes(path));
}

function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGE_PATHS.has(pathname);
}

function buildRequestUrl(config: RequestConfig): string {
  let url = config.url || '';
  if (!config.params) {
    return url;
  }

  const params = new URLSearchParams();
  Object.entries(config.params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });

  const queryString = params.toString();
  if (!queryString) {
    return url;
  }

  url += (url.includes('?') ? '&' : '?') + queryString;
  return url;
}

async function doRefreshToken(): Promise<void> {
  const response = await fetch(API_ENDPOINTS.JWT_REFRESH, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Refresh failed');
  }
}

async function retryRequest(originalConfig: RequestConfig): Promise<HttpResponse<unknown>> {
  const url = buildRequestUrl(originalConfig);
  if (!url) {
    throw new Error('Missing request url');
  }

  const res = await fetch(url, {
    ...originalConfig,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as HttpError;
    err.status = res.status;
    err.config = originalConfig;
    throw err;
  }

  const contentType = res.headers.get('content-type');
  let data: unknown = null;
  if (res.status !== 204 && res.status !== 205 && res.status !== 304) {
    if (contentType?.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
  }

  return {
    data,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  };
}

function canShowToast(): boolean {
  const now = Date.now();
  const from = now - 60_000;
  while (toastTimeline.length > 0 && toastTimeline[0] < from) {
    toastTimeline.shift();
  }
  if (toastTimeline.length >= ENDPOINT_CONFIG.maxToastsPerMinute) {
    return false;
  }
  toastTimeline.push(now);
  return true;
}

function scheduleEndpointToast(
  status: EndpointStatus,
  message: string,
  data?: Record<string, unknown>
) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!canShowToast()) {
    return;
  }

  const labels: Record<EndpointStatus, string> = {
    development: '开发中',
    planned: '计划中',
    deprecated: '已弃用',
  };

  const description = buildStatusDescription(status, message, data);

  setTimeout(() => {
    void import('sonner').then(({ toast }) => {
      toast(labels[status], {
        description,
        duration: ENDPOINT_CONFIG.toastDuration,
        style: { maxWidth: 400 },
      });
    });
  }, ENDPOINT_CONFIG.toastDelay);
}

function shouldToastByHttp(status: EndpointStatus, httpStatus: number): boolean {
  if (status === 'development') {
    return httpStatus === ENDPOINT_STATUS_HTTP.IN_DEVELOPMENT;
  }
  if (status === 'planned') {
    return httpStatus === ENDPOINT_STATUS_HTTP.PLANNED;
  }
  return httpStatus === ENDPOINT_STATUS_HTTP.DEPRECATED_STRICT || httpStatus === ENDPOINT_STATUS_HTTP.DEPRECATED_SOFT;
}

function handleDeprecatedSoftResponse(
  response: { headers: Headers; status: number; data: unknown }
): boolean {
  const deprecated = response.headers.get('X-Deprecated');
  if (deprecated !== 'true' || response.status !== ENDPOINT_STATUS_HTTP.DEPRECATED_SOFT) {
    return false;
  }

  const payload: Record<string, unknown> = {};
  const alternative = response.headers.get('X-Deprecated-Alternative');
  const removalDate = response.headers.get('X-Deprecated-Removal-Date');
  if (alternative) {
    payload.alternative = alternative;
  }
  if (removalDate) {
    payload.removal_date = removalDate;
  }

  const message = isRecord(response.data) && typeof response.data.msg === 'string'
    ? response.data.msg
    : '该接口已弃用';

  scheduleEndpointToast('deprecated', message, payload);
  return true;
}

export const requestTimingInterceptor: RequestInterceptor = {
  onRequest(config) {
    config.headers = {
      ...config.headers,
      'X-Request-Start': Date.now().toString(),
    };
    return config;
  },
};

export const tokenRefreshInterceptor: ResponseInterceptor = {
  async onResponseError(error) {
    const originalConfig = error.config;

    if (
      error.status === 401 &&
      originalConfig &&
      !originalConfig._retry &&
      !isAuthSkipped(originalConfig.url)
    ) {
      originalConfig._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = doRefreshToken().finally(() => {
            refreshPromise = null;
          });
        }

        await refreshPromise;
        return retryRequest(originalConfig);
      } catch {
        clearSession();
        if (typeof window !== 'undefined') {
          if (!isAuthPagePath(window.location.pathname)) {
            window.location.href = '/login?reason=session_expired';
          }
        }
        throw error;
      }
    }

    throw error;
  },
};

export const endpointStatusInterceptor: ResponseInterceptor = {
  async onResponse(response) {
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return response;
    }

    if (handleDeprecatedSoftResponse(response)) {
      return response;
    }

    if (!isRecord(response.data) || typeof response.data.code !== 'number') {
      return response;
    }

    const status = getEndpointStatus(response.data.code);
    if (!status || !shouldToastByHttp(status, response.status)) {
      return response;
    }

    const message = typeof response.data.msg === 'string' ? response.data.msg : '';
    const data = isRecord(response.data.data) ? response.data.data : undefined;

    scheduleEndpointToast(status, message, data);
    return response;
  },

  async onResponseError(error) {
    if (!isRecord(error.data) || typeof error.data.code !== 'number') {
      throw error;
    }

    const status = getEndpointStatus(error.data.code);
    if (!status || !shouldToastByHttp(status, error.status ?? 0)) {
      throw error;
    }

    const message = typeof error.data.msg === 'string' ? error.data.msg : '';
    const data = isRecord(error.data.data) ? error.data.data : undefined;

    scheduleEndpointToast(status, message, data);
    throw error;
  },
};
