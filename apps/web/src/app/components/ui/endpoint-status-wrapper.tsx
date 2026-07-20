'use client';

import { ReactNode } from 'react';
import { DevModeBadge } from './dev-mode-badge';
import { DevPlaceholder } from './dev-placeholder';
import { useEndpointStatus } from '@/hooks/useEndpointStatus';

interface EndpointStatusWrapperProps {
  path: string;
  responseData?: {
    code?: number;
    data?: Record<string, unknown>;
  } | null;
  children: ReactNode;
  showBadge?: boolean;
  badgePosition?: 'header' | 'inline';
  placeholderProps?: {
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
  };
}

export function EndpointStatusWrapper({
  path,
  responseData,
  children,
  showBadge = true,
  badgePosition = 'header',
  placeholderProps,
}: EndpointStatusWrapperProps) {
  const endpointStatus = useEndpointStatus({ path, responseData });

  if (!endpointStatus.status) {
    return <>{children}</>;
  }

  if ((endpointStatus.isDevelopment && !endpointStatus.isMock) || endpointStatus.isPlanned) {
    return (
      <DevPlaceholder
        status={endpointStatus.status}
        expectedRelease={endpointStatus.expectedRelease}
        icon={placeholderProps?.icon}
        action={placeholderProps?.action}
        className={placeholderProps?.className}
      />
    );
  }

  if (endpointStatus.isDeprecated) {
    return (
      <DevPlaceholder
        status="deprecated"
        alternative={endpointStatus.alternative}
        removalDate={endpointStatus.removalDate}
        icon={placeholderProps?.icon}
        action={placeholderProps?.action}
        className={placeholderProps?.className}
      />
    );
  }

  if (!showBadge) {
    return <>{children}</>;
  }

  if (badgePosition === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <DevModeBadge
          status={endpointStatus.status}
          expectedRelease={endpointStatus.expectedRelease}
          alternative={endpointStatus.alternative}
          removalDate={endpointStatus.removalDate}
        />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        <DevModeBadge
          status={endpointStatus.status}
          expectedRelease={endpointStatus.expectedRelease}
          alternative={endpointStatus.alternative}
          removalDate={endpointStatus.removalDate}
        />
      </div>
      {children}
    </div>
  );
}
