import { httpClient } from '@/lib/http/client';
import { ApiResponse, PaginatedData } from '@/lib/http/types';
import { API_ENDPOINTS } from '@/config/api';
import { RBAC_CONFIG } from '@/config/rbac';
import { ErrorCodes } from '@/lib/error/codes';
import { AppError, ErrorCategory } from '@/lib/error/types';
import { Permission, Role, PermissionCode } from '@/types';

const DEFAULT_PAGE_SIZE = RBAC_CONFIG.PERMISSION.DEFAULT_PAGE_SIZE;

// 用于 AbortController 的存储
const pendingRequests = new Map<string, AbortController>();

/**
 * 创建业务错误
 */
function createBusinessError(code: string, message: string, details?: Record<string, unknown>): AppError {
  return {
    category: ErrorCategory.BUSINESS,
    code,
    message,
    details,
  };
}

/**
 * 取消请求的业务错误码
 */
const REQUEST_CANCELLED_CODE = 'REQUEST_CANCELLED';

/**
 * 取消请求的业务错误
 */
function createCancelledError(): AppError {
  return {
    category: ErrorCategory.BUSINESS,
    code: REQUEST_CANCELLED_CODE,
    message: '请求已取消',
  };
}

/**
 * 获取并管理请求的 AbortController
 * 如果同 key 已存在请求，先取消旧请求
 */
function getOrCreateController(requestKey: string): AbortController {
  const existing = pendingRequests.get(requestKey);
  if (existing) {
    existing.abort();
    pendingRequests.delete(requestKey);
  }
  const controller = new AbortController();
  pendingRequests.set(requestKey, controller);
  return controller;
}

/**
 * 移除已完成的请求记录
 */
function removeRequest(requestKey: string): void {
  pendingRequests.delete(requestKey);
}

/**
 * 统一处理带取消能力的请求
 */
async function requestWithAbort<T>(
  requestKey: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = getOrCreateController(requestKey);
  try {
    return await run(controller.signal);
  } catch (error) {
    const httpError = error as { code?: string };
    if (httpError.code === 'TIMEOUT') {
      throw createCancelledError();
    }
    throw error;
  } finally {
    removeRequest(requestKey);
  }
}

/**
 * 获取权限列表
 */
export async function getPermissions(
  page = 1,
  size = DEFAULT_PAGE_SIZE
): Promise<PaginatedData<Permission>> {
  const requestKey = `permissions-${page}-${size}`;
  const searchParams = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });

  const response = await requestWithAbort(
    requestKey,
    (signal) =>
      httpClient.get<ApiResponse<PaginatedData<Permission>>>(
        `${API_ENDPOINTS.ADMIN_PERMISSIONS}?${searchParams.toString()}`,
        { signal }
      )
  );

  return response.data;
}

/**
 * 根据 ID 获取权限详情
 */
export async function getPermissionById(id: number): Promise<Permission> {
  const response = await httpClient.get<ApiResponse<Permission>>(
    `${API_ENDPOINTS.ADMIN_PERMISSIONS}/${id}`
  );
  return response.data;
}

/**
 * 获取角色列表
 */
export async function getRoles(
  page = 1,
  size = DEFAULT_PAGE_SIZE
): Promise<PaginatedData<Role>> {
  const requestKey = `roles-${page}-${size}`;
  const searchParams = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });

  const response = await requestWithAbort(
    requestKey,
    (signal) =>
      httpClient.get<ApiResponse<PaginatedData<Role>>>(
        `${API_ENDPOINTS.ADMIN_ROLES}?${searchParams.toString()}`,
        { signal }
      )
  );

  return response.data;
}

/**
 * 获取用户角色
 */
export async function getUserRoles(userId: number): Promise<Role[]> {
  const response = await httpClient.get<ApiResponse<Role[]>>(
    API_ENDPOINTS.ADMIN_USER_ROLES(userId)
  );
  return response.data;
}

/**
 * 获取当前用户的权限信息
 */
export async function getMyPermissions(): Promise<{
  permissions: PermissionCode[];
  is_superuser: boolean;
  roles: Role[];
}> {
  const requestKey = 'my-permissions';

  const response = await requestWithAbort(
    requestKey,
    (signal) =>
      httpClient.get<ApiResponse<{
        permissions?: PermissionCode[];
        is_superuser?: boolean;
        roles?: Role[] | string[];
      }>>(API_ENDPOINTS.PERMISSIONS_ME, { signal })
  );

  if (!response.data) {
    throw createBusinessError(
      ErrorCodes.INVALID_FORMAT,
      '权限响应格式异常',
      { response }
    );
  }

  // 区分字段缺失和空数组
  const hasPermissionsField = 'permissions' in response.data;
  const hasIsSuperuserField = 'is_superuser' in response.data;
  const hasRolesField = 'roles' in response.data;

  let roles: Role[] = [];
  if (hasRolesField && Array.isArray(response.data.roles)) {
    if (response.data.roles.length > 0) {
      if (typeof response.data.roles[0] === 'string') {
        roles = (response.data.roles as string[]).map((name) => ({
          id: 0,
          name,
          is_system: name === 'admin',
          permissions: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      } else {
        roles = response.data.roles as Role[];
      }
    }
  } else if (!hasRolesField) {
    console.warn('[getMyPermissions] 后端响应缺少 roles 字段');
  }

  if (!hasPermissionsField) {
    console.warn('[getMyPermissions] 后端响应缺少 permissions 字段');
  }

  let isSuperuser = response.data.is_superuser;
  if (!hasIsSuperuserField) {
    console.warn('[getMyPermissions] 后端响应缺少 is_superuser 字段，尝试从 /users/me 获取');
    try {
      const userResponse = await httpClient.get<ApiResponse<{ is_superuser?: boolean }>>(
        API_ENDPOINTS.USERS_ME
      );
      isSuperuser = userResponse.data.is_superuser || false;
    } catch {
      console.warn('[getMyPermissions] 从 /users/me 获取 is_superuser 失败');
      isSuperuser = false;
    }
  }

  return {
    permissions: response.data.permissions || [],
    is_superuser: isSuperuser || false,
    roles,
  };
}

/**
 * 取消所有挂起的请求
 */
export function cancelAllPendingRequests(): void {
  pendingRequests.forEach((controller) => {
    controller.abort();
  });
  pendingRequests.clear();
}

/**
 * 为用户分配角色
 */
export async function assignRolesToUser(
  userId: number,
  roleIds: number[]
): Promise<void> {
  await httpClient.post<void>(
    API_ENDPOINTS.ADMIN_USER_ROLES(userId),
    { role_ids: roleIds }
  );
}
