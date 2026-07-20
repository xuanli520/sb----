import { 
  HttpClientConfig, 
  RequestConfig, 
  HttpResponse, 
  HttpError,
  RequestInterceptor,
  ResponseInterceptor 
} from './types';

class InterceptorManager<T> {
  private interceptors: T[] = [];
  
  use(interceptor: T) {
    this.interceptors.push(interceptor);
  }
  
  getAll(): T[] {
    return this.interceptors;
  }
}

export class HttpClient {
  private config: HttpClientConfig;
  private requestInterceptors = new InterceptorManager<RequestInterceptor>();
  private responseInterceptors = new InterceptorManager<ResponseInterceptor>();
  
  constructor(config: Partial<HttpClientConfig> = {}) {
    this.config = {
      baseURL: '',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      ...config,
    };
  }
  
  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.use(interceptor);
  }
  
  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.use(interceptor);
  }
  
  private async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let result = config;
    for (const interceptor of this.requestInterceptors.getAll()) {
      if (interceptor.onRequest) {
        result = await interceptor.onRequest(result);
      }
    }
    return result;
  }
  
  private async applyResponseInterceptors<T>(
    response: HttpResponse<T>
  ): Promise<HttpResponse<T>> {
    let result = response;
    for (const interceptor of this.responseInterceptors.getAll()) {
      if (interceptor.onResponse) {
        result = await interceptor.onResponse(result);
      }
    }
    return result;
  }

  private isHttpError(value: HttpResponse<unknown> | HttpError): value is HttpError {
    return value instanceof Error;
  }
  
  private async applyResponseErrorInterceptors(
    error: HttpError
  ): Promise<HttpResponse<unknown> | HttpError> {
    let result: HttpResponse<unknown> | HttpError = error;
    for (const interceptor of this.responseInterceptors.getAll()) {
      if (!this.isHttpError(result)) {
        return result;
      }
      if (interceptor.onResponseError) {
        result = await interceptor.onResponseError(result);
      }
    }
    return result;
  }
  
  private async executeRequest<T>(config: RequestConfig): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      let url = config.url || '';
      if (config.params) {
        const params = new URLSearchParams();
        Object.entries(config.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
        const queryString = params.toString();
        if (queryString) {
          url += (url.includes('?') ? '&' : '?') + queryString;
        }
      }
      
      const fullUrl = url.startsWith('http') ? url : `${this.config.baseURL}${url}`;
      
      const response = await fetch(fullUrl, {
        ...config,
        signal: controller.signal,
        credentials: 'include',
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as HttpError;
        error.status = response.status;
        error.config = config;

        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const jsonData = await response.json();
            error.data = jsonData;
            const detail = (jsonData as Record<string, unknown>).detail;
            const msg = (jsonData as Record<string, unknown>).msg
              || (jsonData as Record<string, unknown>).message
              || (typeof detail === 'string' ? detail : undefined);
            if (msg && typeof msg === 'string') {
              error.message = msg;
            }
            const code = (jsonData as Record<string, unknown>).code;
            if (code && typeof code === 'string') {
              error.code = code;
            }
          } else {
            const textData = await response.text();
            error.data = textData;
          }
        } catch {
          // 非 JSON 响应
        }

        throw error;
      }

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      
      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout') as HttpError;
        timeoutError.code = 'TIMEOUT';
        timeoutError.config = config;
        throw timeoutError;
      }
      
      throw error;
    }
  }
  
  private async requestWithRetry<T>(
    config: RequestConfig,
    retryCount = 0
  ): Promise<HttpResponse<T>> {
    try {
      const response = await this.executeRequest<T>(config);
      return await this.applyResponseInterceptors(response);
    } catch (error) {
      const httpError = error as HttpError;
      
      // 只重试网络错误
      if (
        httpError.code === 'NETWORK_ERROR' ||
        httpError.code === 'TIMEOUT'
      ) {
        if (retryCount < this.config.retries) {
          await this.delay(this.config.retryDelay * Math.pow(2, retryCount));
          return this.requestWithRetry(config, retryCount + 1);
        }
      }

      const interceptorResult = await this.applyResponseErrorInterceptors(httpError);
      if (!this.isHttpError(interceptorResult)) {
        return await this.applyResponseInterceptors(interceptorResult as HttpResponse<T>);
      }

      throw interceptorResult;
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  async request<T = unknown>(config: RequestConfig): Promise<T> {
    const processedConfig = await this.applyRequestInterceptors(config);
    const response = await this.requestWithRetry<T>(processedConfig);
    return response.data;
  }
  
  async get<T = unknown>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }
  
  async post<T = unknown>(url: string, data?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    const isFormData = data instanceof FormData || data instanceof URLSearchParams;
    const body = isFormData ? (data as BodyInit) : JSON.stringify(data);
    const headers = isFormData 
      ? config.headers 
      : { 'Content-Type': 'application/json', ...config.headers };
    return this.request<T>({ ...config, url, method: 'POST', body, headers });
  }
  
  async put<T = unknown>(url: string, data?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    const isFormData = data instanceof FormData || data instanceof URLSearchParams;
    const body = isFormData ? (data as BodyInit) : JSON.stringify(data);
    const headers = isFormData 
      ? config.headers 
      : { 'Content-Type': 'application/json', ...config.headers };
    return this.request<T>({ ...config, url, method: 'PUT', body, headers });
  }
  
  async patch<T = unknown>(url: string, data?: unknown, config: Omit<RequestConfig, 'url' | 'method' | 'body'> = {}): Promise<T> {
    const body = JSON.stringify(data);
    return this.request<T>({ 
      ...config, 
      url, 
      method: 'PATCH', 
      body, 
      headers: { 'Content-Type': 'application/json', ...config.headers } 
    });
  }
  
  async delete<T = unknown>(url: string, config: Omit<RequestConfig, 'url' | 'method'> = {}): Promise<T> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }
}

// 创建默认实例
export const httpClient = new HttpClient();

// 添加默认拦截器
import { endpointStatusInterceptor, tokenRefreshInterceptor } from './interceptors';
httpClient.addResponseInterceptor(tokenRefreshInterceptor);
httpClient.addResponseInterceptor(endpointStatusInterceptor);
