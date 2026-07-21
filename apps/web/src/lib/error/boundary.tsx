'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/app/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    this.props.onError?.(error, info);

    // 上报错误
    if (process.env.NODE_ENV === 'production') {
      // TODO: 发送到错误监控服务
      console.log('Reporting error to monitoring service:', {
        error,
        componentStack: info.componentStack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main className="grid min-h-screen place-items-center bg-[#f3f5f1] p-6 text-stone-900">
          <div className="w-full max-w-md border border-stone-200 bg-white p-7 text-center shadow-sm">
            <AlertTriangle className="mx-auto text-rose-700" size={32} aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold">页面暂时无法加载</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">请重试当前操作，或返回书城继续浏览。</p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-5 max-h-40 overflow-auto border border-rose-200 bg-rose-50 p-3 text-left">
                <pre className="whitespace-pre-wrap text-xs leading-5 text-rose-800">{this.state.error.message}</pre>
              </div>
            )}
            <div className="mt-6 flex justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={this.handleReset}
                className="rounded-none"
              >
                <RefreshCw size={16} aria-hidden="true" />
                重试
              </Button>
              <Button asChild type="button" className="rounded-none bg-emerald-700 hover:bg-emerald-800">
                <Link href="/">
                  <Home size={16} aria-hidden="true" />
                  返回首页
                </Link>
              </Button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

// HOC 包装器
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Omit<Props, 'children'>
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...boundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
