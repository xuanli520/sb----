'use client';

import { usePermissionStore } from '@/stores/permissionStore';
import { useAuthStore } from '@/stores/authStore';
import { PermissionCode } from '@/types';
import { Button } from '@/app/components/ui/button';

interface PermissionButtonProps {
  permission: PermissionCode;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: 'hide' | 'disable' | 'visible-disabled';
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: () => void;
}

export function PermissionButton({
  permission,
  children,
  fallback = null,
  mode = 'hide',
  disabled,
  className,
  variant,
  size,
  onClick,
}: PermissionButtonProps) {
  const { isSuperuser, checkPermission, isLoading: permissionLoading } = usePermissionStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const hasAccess = isAuthenticated && (isSuperuser || checkPermission(permission));
  const isHydrating = authLoading || permissionLoading;

  if (isHydrating) {
    return (
      <Button
        disabled={disabled}
        className={className}
        variant={variant}
        size={size}
        onClick={onClick}
      >
        {children}
      </Button>
    );
  }

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  if (!hasAccess) {
    if (mode === 'hide') {
      return <>{fallback}</>;
    }
    if (mode === 'disable') {
      return (
        <Button
          disabled={true}
          className={className}
          variant={variant}
          size={size}
          onClick={onClick}
        >
          {children}
        </Button>
      );
    }
    if (mode === 'visible-disabled') {
      return (
        <Button
          disabled={true}
          className={className}
          variant={variant}
          size={size}
          onClick={onClick}
        >
          {children}
        </Button>
      );
    }
  }

  return (
    <Button
      disabled={disabled}
      className={className}
      variant={variant}
      size={size}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
