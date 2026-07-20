import { toast } from 'sonner';
import { AppError, ErrorCategory, ErrorContext, ErrorReport } from './types';
import { ErrorCodes } from './codes';
import { HttpError } from '@/lib/http/types';

export function normalizeError(error: unknown): AppError {
  if (error instanceof Error) {
    // HTTP 错误
    const httpError = error as HttpError;
    if (httpError.status) {
      return normalizeHttpError(httpError);
    }
    
    // 网络错误
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return {
        category: ErrorCategory.NETWORK,
        code: ErrorCodes.NETWORK_ERROR,
        message: '网络连接失败，请检查网络设置',
        originalError: error,
      };
    }
    
    // 超时错误
    if (error.message.includes('timeout')) {
      return {
        category: ErrorCategory.NETWORK,
        code: ErrorCodes.TIMEOUT,
        message: '请求超时，请稍后重试',
        originalError: error,
      };
    }
    
    return {
      category: ErrorCategory.CLIENT,
      code: ErrorCodes.UNKNOWN_ERROR,
      message: error.message || '发生未知错误',
      originalError: error,
    };
  }
  
  return {
    category: ErrorCategory.UNKNOWN,
    code: ErrorCodes.UNKNOWN_ERROR,
    message: '发生未知错误',
    originalError: error instanceof Error ? error : undefined,
  };
}

function normalizeHttpError(error: HttpError): AppError {
  const status = error.status || 0;
  
  switch (status) {
    case 401:
      return {
        category: ErrorCategory.AUTH,
        code: error.code === 'TOKEN_EXPIRED' ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.UNAUTHORIZED,
        message: error.message || '未授权，请重新登录',
        status,
        originalError: error,
      };
    
    case 403:
      return {
        category: ErrorCategory.AUTH,
        code: ErrorCodes.NO_PERMISSION,
        message: error.message || '没有权限执行此操作',
        status,
        originalError: error,
      };
    
    case 404:
      return {
        category: ErrorCategory.BUSINESS,
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: error.message || '请求的资源不存在',
        status,
        originalError: error,
      };
    
    case 422:
      return {
        category: ErrorCategory.VALIDATION,
        code: ErrorCodes.VALIDATION_ERROR,
        message: error.message || '输入数据验证失败',
        details: error.data as Record<string, unknown>,
        status,
        originalError: error,
      };
    
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        category: ErrorCategory.SERVER,
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        message: error.message || '服务器错误，请稍后重试',
        status,
        originalError: error,
      };
    
    default:
      return {
        category: ErrorCategory.UNKNOWN,
        code: ErrorCodes.UNKNOWN_ERROR,
        message: error.message || '发生未知错误',
        status,
        originalError: error,
      };
  }
}

export class GlobalErrorHandler {
  static handle(error: unknown, context?: ErrorContext) {
    const appError = normalizeError(error);
    
    console.error('[GlobalError]', appError, context);
    
    // 上报错误（生产环境）
    if (process.env.NODE_ENV === 'production') {
      this.reportError(appError, context);
    }
    
    switch (appError.category) {
      case ErrorCategory.AUTH:
        this.handleAuthError(appError, context);
        break;
      case ErrorCategory.VALIDATION:
        this.handleValidationError(appError, context);
        break;
      case ErrorCategory.NETWORK:
        this.handleNetworkError(appError, context);
        break;
      case ErrorCategory.SERVER:
        this.handleServerError(appError, context);
        break;
      case ErrorCategory.BUSINESS:
        this.handleBusinessError(appError, context);
        break;
      default:
        this.handleGenericError(appError, context);
    }
  }
  
  private static handleAuthError(error: AppError, context?: ErrorContext) {
    if (error.code === ErrorCodes.TOKEN_EXPIRED) {
      toast.error('登录已过期，请重新登录', {
        duration: 5000,
      });
      // 由 tokenRefreshInterceptor 处理重定向
    } else if (error.code === ErrorCodes.NO_PERMISSION) {
      toast.error('没有权限执行此操作');
    } else {
      toast.error(error.message);
    }
  }
  
  private static handleValidationError(error: AppError, context?: ErrorContext) {
    if (context?.form && error.details) {
      // 表单错误由表单处理
      context.form.setErrors(error.details);
    } else {
      toast.error(error.message);
    }
  }
  
  private static handleNetworkError(error: AppError, context?: ErrorContext) {
    toast.error(error.message, {
      duration: 5000,
      description: '请检查网络连接后重试',
    });
  }
  
  private static handleServerError(error: AppError, context?: ErrorContext) {
    toast.error(error.message, {
      duration: 5000,
    });
  }
  
  private static handleBusinessError(error: AppError, context?: ErrorContext) {
    toast.error(error.message);
  }
  
  private static handleGenericError(error: AppError, context?: ErrorContext) {
    toast.error(error.message || '发生未知错误');
  }
  
  private static reportError(error: AppError, context?: ErrorContext) {
    const report: ErrorReport = {
      error,
      context,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    
    // TODO: 发送到错误监控服务（如 Sentry）
    console.log('[ErrorReport]', report);
  }
}

// QueryClient 错误处理器
export const queryErrorHandler = (error: unknown) => {
  GlobalErrorHandler.handle(error);
};

// 用于 TanStack Query 的 mutation 错误处理器
export const mutationErrorHandler = (error: unknown, variables: unknown, context: unknown) => {
  GlobalErrorHandler.handle(error);
};
