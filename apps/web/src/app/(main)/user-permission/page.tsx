'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionStore } from '@/stores/permissionStore';

const USER_MANAGEMENT_PERMISSIONS = [
  'user:read',
  'user:create',
  'user:update',
  'user:manage_roles',
  'user:delete',
] as const;

export default function UserPermissionRedirectPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    isSuperuser,
    isLoading: permissionLoading,
    checkAnyPermission,
  } = usePermissionStore();

  useEffect(() => {
    if (authLoading || permissionLoading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const canManageUsers =
      isSuperuser || checkAnyPermission([...USER_MANAGEMENT_PERMISSIONS]);

    router.replace(canManageUsers ? ROUTES.ADMIN_USERS : ROUTES.PROFILE);
  }, [
    authLoading,
    permissionLoading,
    isAuthenticated,
    isSuperuser,
    checkAnyPermission,
    router,
  ]);

  return null;
}
