export enum ErrorCategory {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  BUSINESS = 'BUSINESS',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  originalError?: Error;
  status?: number;
}

export interface ErrorContext {
  component?: string;
  action?: string;
  form?: {
    setErrors: (errors: Record<string, unknown>) => void;
  };
  metadata?: Record<string, unknown>;
}

export interface ErrorReport {
  error: AppError;
  context?: ErrorContext;
  timestamp: string;
  userAgent: string;
  url: string;
}
