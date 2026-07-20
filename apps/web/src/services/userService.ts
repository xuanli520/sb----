import { httpClient } from '@/lib/http/client';
import { ApiResponse } from '@/lib/http/types';
import { clearSession } from '@/lib/auth';
import {
  UserRead,
  UserUpdate,
  LoginParams,
  RegisterParams,
  ForgotPasswordParams,
  ResetPasswordParams,
  RequestVerifyTokenParams,
  VerifyTokenParams,
} from '@/types';
import { API_ENDPOINTS } from '@/config/api';

let refreshTokenPromise: Promise<void> | null = null;

export async function refreshToken(): Promise<void> {
  if (refreshTokenPromise) {
    return refreshTokenPromise;
  }

  refreshTokenPromise = (async () => {
    await httpClient.post(API_ENDPOINTS.JWT_REFRESH);
  })().finally(() => {
    refreshTokenPromise = null;
  });

  return refreshTokenPromise;
}

export async function login(params: LoginParams): Promise<void> {
  const formData = new URLSearchParams();
  formData.append('username', params.username);
  formData.append('password', params.password);
  if (params.captchaVerifyParam) {
    formData.append('captchaVerifyParam', params.captchaVerifyParam);
  }

  await httpClient.post(
    API_ENDPOINTS.JWT_LOGIN,
    formData,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
}

export async function logout(): Promise<void> {
  try {
    await httpClient.post(API_ENDPOINTS.JWT_LOGOUT);
  } catch {
  } finally {
    clearSession();
  }
}

export async function register(params: RegisterParams): Promise<UserRead> {
  const response = await httpClient.post<ApiResponse<UserRead>>(
    API_ENDPOINTS.REGISTER,
    params
  );
  return response.data;
}

export async function getCurrentUser(): Promise<UserRead> {
  const response = await httpClient.get<ApiResponse<UserRead>>(API_ENDPOINTS.USERS_ME);
  return response.data;
}

export async function updateCurrentUser(data: UserUpdate): Promise<UserRead> {
  const response = await httpClient.patch<ApiResponse<UserRead>>(
    API_ENDPOINTS.USERS_ME,
    data
  );
  return response.data;
}

export async function getUserById(id: number): Promise<UserRead> {
  const response = await httpClient.get<ApiResponse<UserRead>>(
    API_ENDPOINTS.USERS_BY_ID(id)
  );
  return response.data;
}

export async function updateUser(id: number, data: UserUpdate): Promise<UserRead> {
  const response = await httpClient.patch<ApiResponse<UserRead>>(
    API_ENDPOINTS.USERS_BY_ID(id),
    data
  );
  return response.data;
}

export async function deleteUser(id: number): Promise<void> {
  await httpClient.delete<ApiResponse<void>>(
    API_ENDPOINTS.USERS_BY_ID(id)
  );
}

export async function checkIsSuperuser(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    return user.is_superuser ?? false;
  } catch {
    return false;
  }
}

export async function forgotPassword(params: ForgotPasswordParams): Promise<void> {
  await httpClient.post<ApiResponse<void>>(
    API_ENDPOINTS.FORGOT_PASSWORD,
    params
  );
}

export async function resetPassword(params: ResetPasswordParams): Promise<void> {
  await httpClient.post<ApiResponse<void>>(
    API_ENDPOINTS.RESET_PASSWORD,
    params
  );
}

export async function requestVerifyToken(params: RequestVerifyTokenParams): Promise<void> {
  await httpClient.post<ApiResponse<void>>(
    API_ENDPOINTS.REQUEST_VERIFY_TOKEN,
    params
  );
}

export async function verifyToken(params: VerifyTokenParams): Promise<UserRead> {
  const response = await httpClient.post<ApiResponse<UserRead>>(
    API_ENDPOINTS.VERIFY,
    params
  );
  return response.data;
}

export function checkPasswordStrength(password: string): {
  score: number;
  label: '弱' | '中等' | '强';
  color: string;
  requirements: {
    hasMinLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
} {
  if (!password || password.length === 0) {
    return {
      score: 0,
      label: '弱',
      color: 'bg-red-500',
      requirements: {
        hasMinLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecial: false,
      },
    };
  }

  const requirements = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const metCount = Object.values(requirements).filter(Boolean).length;
  let score: number;
  let label: '弱' | '中等' | '强';
  let color: string;

  if (metCount <= 2) {
    score = 0;
    label = '弱';
    color = 'bg-red-500';
  } else if (metCount <= 4) {
    score = 2;
    label = '中等';
    color = 'bg-yellow-500';
  } else {
    score = 4;
    label = '强';
    color = 'bg-green-500';
  }

  return { score, label, color, requirements };
}

export function handleAuthError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('未授权')) {
      return '登录凭证无效，请重新登录';
    }
    if (error.message.includes('NetworkError') || error.message.includes('网络')) {
      return '网络连接失败，请检查网络设置';
    }
    return error.message;
  }
  return '发生未知错误';
}
