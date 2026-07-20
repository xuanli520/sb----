export type PermissionCode = string;

export interface ResourcePermission {
  resource: string;
  scope?: string;
  action?: string;
}

export interface Permission {
  id: number;
  code: PermissionCode;
  name: string;
  description?: string;
  module: string;
  resource?: string;
  action?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_system: boolean;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}

export interface UserPermissions {
  userId: number;
  userRoles: Role[];
  allRoles: Role[];
  permissions: PermissionCode[];
  isSuperuser: boolean;
}

export interface RoutePermissionConfig {
  route: string | RegExp;
  requiredPermissions?: PermissionCode[];
  requiredRoles?: string[];
  requiredResources?: ResourcePermission[];
  unauthRedirect?: string;
  forbiddenRedirect?: string;
  fallback?: React.ReactNode;
}

export interface ComponentPermissionConfig {
  permission: PermissionCode;
  mode?: 'hide' | 'disable' | 'visible-disabled';
  fallback?: React.ReactNode;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: number | null;
  username: string | null;
}
