'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { CyberButton } from '@/components/ui/cyber/CyberButton';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { AppError, ErrorCategory } from './types';

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
        <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
          {/* 背景装饰 - 微妙的网格 + 径向渐变 */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--destructive)/0.06)_0%,transparent_70%)]" />
          </div>

          <div className="relative max-w-md w-full text-center space-y-8 animate-[fadeSlideUp_0.5s_ease-out_both]">
            {/* 图标区域 - 脉冲光环 + 浮动动画 */}
            <div className="flex justify-center">
              <div className="relative animate-[float_3s_ease-in-out_infinite]">
                {/* 外层脉冲光环 */}
                <div className="absolute -inset-3 rounded-full bg-destructive/5 animate-[pulse_2.5s_ease-in-out_infinite]" />
                <div className="absolute -inset-1.5 rounded-full bg-destructive/8 animate-[pulse_2.5s_ease-in-out_0.3s_infinite]" />
                {/* 主图标容器 */}
                <div className="relative w-18 h-18 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center backdrop-blur-sm shadow-[0_0_24px_-4px_hsl(var(--destructive)/0.2)]">
                  <AlertTriangle className="w-8 h-8 text-destructive drop-shadow-[0_0_6px_hsl(var(--destructive)/0.4)]" />
                </div>
              </div>
            </div>

            {/* 文案区域 */}
            <div className="space-y-3 animate-[fadeSlideUp_0.5s_ease-out_0.1s_both]">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                页面出错了
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
                抱歉，页面遇到了意外错误。请尝试刷新页面或返回首页。
              </p>
            </div>

            {/* 开发环境错误详情 */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="text-left rounded-xl border border-destructive/15 bg-destructive/[0.03] backdrop-blur-sm overflow-hidden animate-[fadeSlideUp_0.5s_ease-out_0.2s_both]">
                <div className="px-4 py-2.5 border-b border-destructive/10 bg-destructive/[0.04] flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-destructive/60 animate-pulse" />
                  <span className="text-xs font-medium text-destructive/80 uppercase tracking-wider">
                    Error Details
                  </span>
                </div>
                <div className="p-4 overflow-auto max-h-48 scrollbar-thin">
                  <pre className="text-xs text-destructive/90 whitespace-pre-wrap font-mono leading-relaxed">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 justify-center animate-[fadeSlideUp_0.5s_ease-out_0.3s_both]">
              <CyberButton
                variant="outline"
                onClick={this.handleReset}
                className="gap-2 transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]"
              >
                <RefreshCw className="w-4 h-4" />
                重试
              </CyberButton>

              <Link href="/">
                <CyberButton className="gap-2 transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]">
                  <Home className="w-4 h-4" />
                  返回首页
                </CyberButton>
              </Link>
            </div>
          </div>

          {/* 关键帧定义 */}
          <style jsx global>{`
            @keyframes fadeSlideUp {
              from {
                opacity: 0;
                transform: translateY(12px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes float {
              0%,
              100% {
                transform: translateY(0);
              }
              50% {
                transform: translateY(-6px);
              }
            }
          `}</style>
        </div>
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