'use client';

import { Badge } from './badge';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from './utils';
import { EndpointStatus } from '@/types/endpoint';

interface DevModeBadgeProps {
  status: EndpointStatus;
  expectedRelease?: string;
  alternative?: string;
  removalDate?: string;
  showTooltip?: boolean;
  className?: string;
}

const BADGE_VARIANTS: Record<EndpointStatus, 'default' | 'secondary' | 'outline'> = {
  development: 'default',
  planned: 'secondary',
  deprecated: 'outline',
};

const BADGE_COLORS: Record<EndpointStatus, string> = {
  development: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  planned: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
  deprecated: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
};

const BADGE_LABELS: Record<EndpointStatus, string> = {
  development: 'Dev',
  planned: 'Planned',
  deprecated: 'Deprecated',
};

export function DevModeBadge({
  status,
  expectedRelease,
  alternative,
  removalDate,
  showTooltip = true,
  className,
}: DevModeBadgeProps) {
  const label = BADGE_LABELS[status];
  const colorClass = BADGE_COLORS[status];

  const tooltipContent = (() => {
    switch (status) {
      case 'development':
        return expectedRelease ? `预计 ${expectedRelease} 发布` : '功能正在开发中';
      case 'planned':
        return expectedRelease ? `预计 ${expectedRelease} 推出` : '功能正在规划中';
      case 'deprecated': {
        let content = '该功能已弃用';
        if (alternative) {
          content += `，请使用: ${alternative}`;
        }
        if (removalDate) {
          content += `，将于 ${removalDate} 移除`;
        }
        return content;
      }
    }
  })();

  const badge = (
    <Badge
      variant={BADGE_VARIANTS[status]}
      className={cn('gap-1', colorClass, className)}
    >
      <span className="size-1.5 rounded-full bg-current animate-pulse" />
      {label}
    </Badge>
  );

  if (!showTooltip || !tooltipContent) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
