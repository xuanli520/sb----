import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from '@/config/api';

vi.mock('@/lib/auth', () => ({
  clearSession: vi.fn(),
}));

import { HttpClient } from '../client';
import { clearSession } from '@/lib/auth';
import { tokenRefreshInterceptor } from '../interceptors';

describe('tokenRefreshInterceptor', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(window.location, {
      href: '',
      pathname: '/',
    });
  });

  it('401 时应触发同源 refresh 并重试原请求', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'token expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200,
        data: { id: 1, username: 'tester' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const client = new HttpClient({ baseURL: '' });
    client.addResponseInterceptor(tokenRefreshInterceptor);

    const result = await client.get(API_ENDPOINTS.USERS_ME);

    expect(result).toEqual({
      code: 200,
      data: { id: 1, username: 'tester' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      API_ENDPOINTS.JWT_REFRESH,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[0]).toBe(API_ENDPOINTS.USERS_ME);
    const retryOptions = retryCall[1] as RequestInit;
    expect(retryOptions.method).toBe('GET');
    expect(retryOptions.credentials).toBe('include');
    const headers = retryOptions.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBeUndefined();
  });

  it('refresh 失败时应清理会话', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'token expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'invalid refresh' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }));

    const client = new HttpClient({ baseURL: '' });
    client.addResponseInterceptor(tokenRefreshInterceptor);

    await expect(client.get(API_ENDPOINTS.USERS_ME)).rejects.toBeDefined();
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('登录页 refresh 失败时不应再次整页跳回登录页', async () => {
    Object.assign(window.location, {
      href: '/login',
      pathname: '/login',
    });

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'token expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: 'invalid refresh' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }));

    const client = new HttpClient({ baseURL: '' });
    client.addResponseInterceptor(tokenRefreshInterceptor);

    await expect(client.get(API_ENDPOINTS.USERS_ME)).rejects.toMatchObject({
      status: 401,
      message: 'token expired',
    });
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/login');
  });
});
