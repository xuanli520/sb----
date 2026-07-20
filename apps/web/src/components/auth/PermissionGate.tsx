'use client';

import { usePermissionStore } from '@/stores/permissionStore';
import { useAuthStore } from '@/stores/authStore';
import { PermissionCode } from '@/types';
import { ReactNode } from 'react';

type PermissionGateMode = 'hide' | 'disable' | 'visible-disabled';

interface PermissionGateProps {
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
  mode?: PermissionGateMode;
}

interface PermissionGatesProps {
  permissions: PermissionCode[];
  children: ReactNode;
  fallback?: ReactNode;
  operator?: 'and' | 'or';
  mode?: PermissionGateMode;
}

function renderDisabledContent(children: ReactNode) {
  return (
    <span aria-disabled="true" className="pointer-events-none opacity-50">
      {children}
    </span>
  );
}

function renderDisabledPlaceholder() {
  return (
    <span
      aria-label="权限加载中"
      aria-disabled="true"
      className="inline-flex h-9 w-24 pointer-events-none items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80"
    />
  );
}

function renderLoadingState(mode: PermissionGateMode, fallback: ReactNode) {
  if (mode === 'hide') {
    return <>{fallback}</>;
  }
  return <>{renderDisabledPlaceholder()}</>;
}

export function PermissionGate({
  permission,
  children,
  fallback = null,
  mode = 'hide',
}: PermissionGateProps) {
  const { isSuperuser, checkPermission, isLoading: permissionLoading } = usePermissionStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  
  const hasAccess = isAuthenticated && (isSuperuser || checkPermission(permission));
  const isHydrating = authLoading || permissionLoading;

  if (isHydrating) {
    return renderLoadingState(mode, fallback);
  }

  if (!isAuthenticated || !hasAccess) {
    if (mode === 'visible-disabled') {
      return <>{renderDisabledContent(children)}</>;
    }
    if (mode === 'disable') {
      return <>{renderDisabledContent(children)}</>;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function PermissionGates({
  permissions,
  children,
  fallback = null,
  operator = 'and',
  mode = 'hide',
}: PermissionGatesProps) {
  const { isSuperuser, checkAllPermissions, checkAnyPermission, isLoading: permissionLoading } = usePermissionStore();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const isHydrating = authLoading || permissionLoading;

  if (isHydrating) {
    return renderLoadingState(mode, fallback);
  }
  
  if (!isAuthenticated) {
    if (mode === 'disable' || mode === 'visible-disabled') {
      return <>{renderDisabledContent(children)}</>;
    }
    return <>{fallback}</>;
  }

  if (isSuperuser) {
    return <>{children}</>;
  }

  const hasAccess = operator === 'and'
    ? checkAllPermissions(permissions)
    : checkAnyPermission(permissions);

  if (!hasAccess) {
    if (mode === 'disable' || mode === 'visible-disabled') {
      return <>{renderDisabledContent(children)}</>;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
