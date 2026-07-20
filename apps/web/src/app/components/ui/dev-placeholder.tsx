'use client';

import { ReactNode } from 'react';
import { cn } from './utils';
import { EndpointStatus } from '@/types/endpoint';
import { DevModeBadge } from './dev-mode-badge';
import { Wrench, ClipboardList, AlertTriangle } from 'lucide-react';

interface DevPlaceholderProps {
  status: EndpointStatus;
  title?: string;
  description?: string;
  expectedRelease?: string;
  alternative?: string;
  removalDate?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const STATUS_CONFIG: Record<EndpointStatus, { icon: ReactNode; bgColor: string }> = {
  development: {
    icon: <Wrench size={40} className="text-blue-500" />,
    bgColor: 'bg-blue-50 dark:bg-blue-950',
  },
  planned: {
    icon: <ClipboardList size={40} className="text-yellow-500" />,
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
  },
  deprecated: {
    icon: <AlertTriangle size={40} className="text-red-500" />,
    bgColor: 'bg-red-50 dark:bg-red-950',
  },
};

const DEFAULT_TITLES: Record<EndpointStatus, string> = {
  development: '功能开发中',
  planned: '功能规划中',
  deprecated: '功能已弃用',
};

const DEFAULT_DESCRIPTIONS: Record<EndpointStatus, string> = {
  development: '该功能正在开发中，当前返回演示数据',
  planned: '该功能正在规划中，暂未实现',
  deprecated: '该功能已弃用，请使用替代方案',
};

export function DevPlaceholder({
  status,
  title,
  description,
  expectedRelease,
  alternative,
  removalDate,
  icon,
  action,
  className,
}: DevPlaceholderProps) {
  const config = STATUS_CONFIG[status];
  const displayIcon = icon ?? config.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[400px] p-8 rounded-lg',
        config.bgColor,
        className
      )}
    >
      <div className="text-center space-y-4 max-w-md">
        <div className="flex items-center justify-center gap-2">
          <div>{displayIcon}</div>
          <DevModeBadge
            status={status}
            expectedRelease={expectedRelease}
            alternative={alternative}
            removalDate={removalDate}
          />
        </div>

        <h3 className="text-xl font-semibold text-foreground">
          {title || DEFAULT_TITLES[status]}
        </h3>

        <p className="text-muted-foreground">
          {description || DEFAULT_DESCRIPTIONS[status]}
          {status === 'planned' && expectedRelease && (
            <span className="block mt-1 font-medium">
              预计 {expectedRelease} 推出
            </span>
          )}
          {status === 'deprecated' && alternative && (
            <span className="block mt-1">
              替代方案: <code className="px-1.5 py-0.5 rounded bg-muted text-sm">{alternative}</code>
            </span>
          )}
          {status === 'deprecated' && removalDate && (
            <span className="block mt-1">
              移除时间: {removalDate}
            </span>
          )}
        </p>

        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
