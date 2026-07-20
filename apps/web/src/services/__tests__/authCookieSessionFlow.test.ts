import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from '@/config/api';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cookie auth flow', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('应走同源 /api/v1 登录链路且不发送 Authorization 与 refresh_token query', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: {} }))
      .mockResolvedValueOnce(jsonResponse({
        code: 200,
        data: {
          id: 1,
          email: 'tester@example.com',
          username: 'tester',
          is_active: true,
          is_superuser: false,
          is_verified: true,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: {} }));

    const service = await import('../userService');

    await service.login({ username: 'tester', password: 'password' });
    const user = await service.getCurrentUser();
    await service.refreshToken();
    await service.logout();

    expect(user.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls).toEqual([
      API_ENDPOINTS.JWT_LOGIN,
      API_ENDPOINTS.USERS_ME,
      API_ENDPOINTS.JWT_REFRESH,
      API_ENDPOINTS.JWT_LOGOUT,
    ]);
    expect(urls.every((url) => url.startsWith('/api/v1/'))).toBe(true);
    expect(urls.every((url) => !/^https?:\/\//.test(url))).toBe(true);
    expect(urls.every((url) => !url.includes('refresh_token='))).toBe(true);

    const requestOptions = fetchMock.mock.calls.map((call) => call[1] as RequestInit);
    requestOptions.forEach((options) => {
      expect(options.credentials).toBe('include');
      const headers = new Headers(options.headers as HeadersInit | undefined);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.has('authorization')).toBe(false);
    });
  });
});
