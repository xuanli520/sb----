import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { API_ENDPOINTS } from '@/config/api';

const { verifyAccessCookieTokenMock } = vi.hoisted(() => ({
  verifyAccessCookieTokenMock: vi.fn<(token: string | null | undefined) => Promise<boolean>>(),
}));

vi.mock('@/lib/auth/server', () => ({
  verifyAccessCookieToken: verifyAccessCookieTokenMock,
}));

describe('proxy auth recovery', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('access 失效且存在 refresh cookie 时应走同源 refresh 恢复，并逐条转发 set-cookie', async () => {
    verifyAccessCookieTokenMock.mockResolvedValue(false);

    const refreshHeaders = new Headers();
    refreshHeaders.set(
      'set-cookie',
      [
        'access_token=recovered; Path=/; HttpOnly; SameSite=Lax',
        'refresh_token=refresh123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly; SameSite=Lax',
      ].join(', ')
    );
    Object.defineProperty(refreshHeaders, 'getSetCookie', {
      value: undefined,
    });

    fetchMock.mockResolvedValueOnce(
      {
        ok: true,
        headers: refreshHeaders,
      } as Response
    );

    const { proxy } = await import('./proxy');

    const request = new NextRequest('http://localhost/dashboard', {
      headers: {
        cookie: 'refresh_token=refresh123',
      },
    });

    const response = await proxy(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const refreshUrl = `${fetchMock.mock.calls[0][0]}`;
    expect(refreshUrl).toBe(`http://localhost${API_ENDPOINTS.JWT_REFRESH}`);

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(options.cache).toBe('no-store');
    const headers = new Headers(options.headers as HeadersInit | undefined);
    expect(headers.get('cookie')).toContain('refresh_token=refresh123');
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(`${fetchMock.mock.calls[0][0]}`.includes('refresh_token=')).toBe(false);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([
      'access_token=recovered; Path=/; HttpOnly; SameSite=Lax',
      'refresh_token=refresh123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });

  it.each([
    '/compass',
    '/dashboard',
    '/data-center',
    '/metric-detail',
    '/data-source',
    '/scraping-rule',
    '/task-schedule',
    '/agent-workbench',
    '/user-permission',
    '/admin/users',
    '/profile',
    '/system-settings',
  ])('未认证访问 %s 应跳转登录', async (path) => {
    verifyAccessCookieTokenMock.mockResolvedValue(false);

    const { proxy } = await import('./proxy');
    const request = new NextRequest(`http://localhost${path}`);

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`http://localhost/login?redirect=${encodeURIComponent(path)}`);
  });
});
