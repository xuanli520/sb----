import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from '@/config/api';

const { mockGet, mockPost, mockPatch, mockDelete, mockStoreTokens, mockClearSession } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockStoreTokens: vi.fn(),
  mockClearSession: vi.fn(),
}));

vi.mock('@/lib/http/client', () => ({
  httpClient: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

vi.mock('@/lib/auth', () => ({
  storeTokens: mockStoreTokens,
  clearSession: mockClearSession,
}));

describe('userService cookie session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('认证端点应收敛到非 jwt 路径', () => {
    expect(API_ENDPOINTS.JWT_LOGIN).toBe('/api/v1/auth/login');
    expect(API_ENDPOINTS.JWT_REFRESH).toBe('/api/v1/auth/refresh');
    expect(API_ENDPOINTS.JWT_LOGOUT).toBe('/api/v1/auth/logout');
  });

  it('refreshToken 不应拼接 refresh_token query', async () => {
    mockPost.mockResolvedValueOnce({});
    const { refreshToken } = await import('./userService');

    await refreshToken();

    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.JWT_REFRESH);
    const refreshUrl = mockPost.mock.calls[0][0] as string;
    expect(refreshUrl.includes('refresh_token=')).toBe(false);
  });

  it('logout 不应拼接 refresh_token query 且应清理会话', async () => {
    mockPost.mockResolvedValueOnce({});
    const { logout } = await import('./userService');

    await logout();

    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.JWT_LOGOUT);
    const logoutUrl = mockPost.mock.calls[0][0] as string;
    expect(logoutUrl.includes('refresh_token=')).toBe(false);
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });

  it('login 不应再持久化 token 到本地存储', async () => {
    mockPost.mockResolvedValueOnce({});
    const { login } = await import('./userService');

    await login({ username: 'u', password: 'p' });

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.JWT_LOGIN,
      expect.any(URLSearchParams),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    expect(mockStoreTokens).not.toHaveBeenCalled();
  });
});
