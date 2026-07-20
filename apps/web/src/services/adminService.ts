import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import { API_ENDPOINTS } from '@/config/api';
import {
  UserListItem,
  UserCreateByAdmin,
  UserUpdateByAdmin,
  UserStatsResponse,
  RoleRead,
  RoleWithPermissions,
  RoleCreate,
  RoleUpdate,
  PermissionRead,
  PaginatedUserListItem,
  PaginatedRoleRead,
  PaginatedPermissionRead,
} from '@/types';

export interface UserListParams {
  username?: string;
  email?: string;
  is_active?: boolean;
  is_superuser?: boolean;
  role_id?: number;
  page?: number;
  size?: number;
}

export interface RoleListParams {
  name?: string;
  page?: number;
  size?: number;
}

export interface PermissionListParams {
  module?: string;
  name?: string;
  page?: number;
  size?: number;
}

export async function getUsers(params: UserListParams): Promise<PaginatedUserListItem> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, value.toString());
    }
  });

  const response = await httpClient.get<ApiResponse<PaginatedUserListItem>>(
    `${API_ENDPOINTS.ADMIN_USERS}?${searchParams.toString()}`
  );
  return response.data;
}

export async function getUserStats(): Promise<UserStatsResponse> {
  const response = await httpClient.get<ApiResponse<UserStatsResponse>>(
    API_ENDPOINTS.ADMIN_USERS_STATS
  );
  return response.data;
}

export async function createUser(data: UserCreateByAdmin): Promise<UserListItem> {
  const response = await httpClient.post<ApiResponse<UserListItem>>(
    API_ENDPOINTS.ADMIN_USERS,
    data
  );
  return response.data;
}

export async function updateUser(user_id: number, data: UserUpdateByAdmin): Promise<UserListItem> {
  const response = await httpClient.patch<ApiResponse<UserListItem>>(
    API_ENDPOINTS.ADMIN_USER_DETAIL(user_id),
    data
  );
  return response.data;
}

export async function deleteUser(user_id: number): Promise<void> {
  await httpClient.delete<ApiResponse<void>>(
    API_ENDPOINTS.ADMIN_USER_DETAIL(user_id)
  );
}

export async function assignUserRoles(user_id: number, roleIds: number[]): Promise<void> {
  await httpClient.post<ApiResponse<void>>(
    API_ENDPOINTS.ADMIN_USER_ROLES(user_id),
    { role_ids: roleIds }
  );
}

export async function getRolesList(params?: RoleListParams): Promise<PaginatedRoleRead> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
  }

  const url = searchParams.toString()
    ? `${API_ENDPOINTS.ADMIN_ROLES}?${searchParams.toString()}`
    : API_ENDPOINTS.ADMIN_ROLES;

  const response = await httpClient.get<ApiResponse<PaginatedRoleRead>>(url);
  return response.data;
}

export async function getRole(role_id: number): Promise<RoleWithPermissions> {
  const response = await httpClient.get<ApiResponse<RoleWithPermissions>>(
    API_ENDPOINTS.ADMIN_ROLE_DETAIL(role_id)
  );
  return response.data;
}

export async function createRole(data: RoleCreate): Promise<RoleRead> {
  const response = await httpClient.post<ApiResponse<RoleRead>>(
    API_ENDPOINTS.ADMIN_ROLES,
    data
  );
  return response.data;
}

export async function updateRole(role_id: number, data: RoleUpdate): Promise<RoleRead> {
  const response = await httpClient.patch<ApiResponse<RoleRead>>(
    API_ENDPOINTS.ADMIN_ROLE_DETAIL(role_id),
    data
  );
  return response.data;
}

export async function deleteRole(role_id: number): Promise<void> {
  await httpClient.delete<ApiResponse<void>>(
    API_ENDPOINTS.ADMIN_ROLE_DETAIL(role_id)
  );
}

export async function assignRolePermissions(role_id: number, permissionIds: number[]): Promise<void> {
  await httpClient.post<ApiResponse<void>>(
    API_ENDPOINTS.ADMIN_ROLE_PERMISSIONS(role_id),
    { permission_ids: permissionIds }
  );
}

export async function getPermissions(params?: PermissionListParams): Promise<PaginatedPermissionRead> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
  }

  const url = searchParams.toString()
    ? `${API_ENDPOINTS.ADMIN_PERMISSIONS}?${searchParams.toString()}`
    : API_ENDPOINTS.ADMIN_PERMISSIONS;

  const response = await httpClient.get<ApiResponse<PaginatedPermissionRead>>(url);
  return response.data;
}
