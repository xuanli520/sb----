// 用户相关类型定义

export interface User {
  id: number;
  username: string;
  email: string;
  phone?: string;
  gender?: string;
  department?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
  /** 用户角色列表 */
  roles?: Array<{
    id: number;
    name: string;
    description?: string | null;
    is_system: boolean;
  }>;
  /** 角色ID列表（用于快速判断） */
  role_ids?: number[];
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  phone?: string;
  gender?: string;
  department?: string;
}

export interface UserUpdate {
  username?: string;
  email?: string;
  password?: string;
  phone?: string;
  gender?: string;
  department?: string;
  is_active?: boolean;
  is_superuser?: boolean;
  is_verified?: boolean;
}

export interface UserUpdateMe {
  username?: string;
  email?: string;
  password?: string;
  phone?: string;
  gender?: string;
  department?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginParams {
  username: string;
  password: string;
  captchaVerifyParam?: string;
}

export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  password_confirm: string;
}

// 错误码常量
export const AUTH_ERROR_CODES = {
  10001: '无效凭证',
  10002: '无效密码',
  10004: 'Token无效',
  10005: '账户已锁定',
  20001: '用户不存在',
  20003: '用户未激活',
  30001: '权限不足',
  30002: '角色不足',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES;

// 密码强度类型
export interface PasswordStrength {
  score: number; // 0-4
  label: '弱' | '中等' | '强';
  color: string;
  requirements: {
    hasMinLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  page_size: number;
}
