import { PermissionCode } from '@/types';

export type { PermissionCode } from '@/types';

export interface UserWithPermissions {
  is_superuser: boolean;
  permissions?: PermissionCode[];
  roles?: { name: string; permissions: PermissionCode[] }[];
}

export function can(user: UserWithPermissions | null | undefined, perm: PermissionCode): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  
  if (user.permissions?.includes(perm)) return true;
  
  if (user.roles) {
    return user.roles.some(role => 
      role.permissions.includes(perm)
    );
  }
  
  return false;
}

export function canAny(user: UserWithPermissions | null | undefined, perms: PermissionCode[]): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  
  if (perms.some(p => user.permissions?.includes(p))) return true;
  
  if (user.roles) {
    return user.roles.some(role =>
      perms.some(p => role.permissions.includes(p))
    );
  }
  
  return false;
}

export function canAll(user: UserWithPermissions | null | undefined, perms: PermissionCode[]): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  
  const allPermissions = new Set(user.permissions || []);
  
  if (user.roles) {
    user.roles.forEach(role => {
      role.permissions.forEach(p => allPermissions.add(p));
    });
  }
  
  return perms.every(p => allPermissions.has(p));
}

export function hasRole(user: UserWithPermissions | null | undefined, roleName: string): boolean {
  if (!user) return false;
  
  if (user.roles?.some(r => r.name === roleName)) return true;
  
  return false;
}

export function isSuperuser(user: UserWithPermissions | null | undefined): boolean {
  return user?.is_superuser ?? false;
}

import { usePermissionStore } from '@/stores/permissionStore';
import { useAuthStore } from '@/stores/authStore';

export function usePermissionCheck() {
  const store = usePermissionStore();
  const authStore = useAuthStore();
  
  return {
    can: store.checkPermission,
    canAny: store.checkAnyPermission,
    canAll: store.checkAllPermissions,
    hasRole: store.checkRole,
    isSuperuser: store.isSuperuser,
    isLoading: store.isLoading,
    permissions: store.userPermissions,
    userRoles: store.userRoles,
    isAuthenticated: authStore.isAuthenticated,
  };
}

export function usePermission(permission: PermissionCode): boolean {
  const checkPermission = usePermissionStore((state) => state.checkPermission);
  const isSuperuser = usePermissionStore((state) => state.isSuperuser);
  return isSuperuser || checkPermission(permission);
}

export function usePermissions(permissions: PermissionCode[], operator: 'and' | 'or' = 'and'): boolean {
  const { checkAllPermissions, checkAnyPermission, isSuperuser } = usePermissionStore();
  
  if (isSuperuser) return true;
  
  if (operator === 'and') {
    return checkAllPermissions(permissions);
  }
  return checkAnyPermission(permissions);
}

export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.isAuthenticated);
}

export function useAuthCheck() {
  const { isAuthenticated, isLoading } = useAuthStore();
  return { isAuthenticated, isLoading };
}
