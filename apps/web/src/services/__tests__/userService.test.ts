import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from '@/config/api';

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

vi.mock('@/lib/http/client', () => ({
  httpClient: {
    post: mockPost,
  },
}));

describe('userService endpoint contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshToken 调用同源 refresh 端点', async () => {
    mockPost.mockResolvedValueOnce({});
    const { refreshToken } = await import('../userService');

    await refreshToken();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe(API_ENDPOINTS.JWT_REFRESH);
  });

  it('logout 调用同源 logout 端点', async () => {
    mockPost.mockResolvedValueOnce({});
    const { logout } = await import('../userService');

    await logout();

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe(API_ENDPOINTS.JWT_LOGOUT);
  });
});
