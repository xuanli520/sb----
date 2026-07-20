import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, POST } from './route';
import { createDevelopmentSession, deleteDevelopmentSession, NOVEL_CSRF_COOKIE, NOVEL_SESSION_COOKIE, readDevelopmentSession } from '@/lib/novel/dev-session';

const fetchMock = vi.fn<typeof fetch>();
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(init: NextRequestInit = {}, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/novel/session', { ...init, headers });
}

function responseCookies(response: Response) {
  return response.headers.getSetCookie();
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('novel BFF session route', () => {
  const createdDevelopmentSessions: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NOVEL_DEV_LOGIN_ENABLED', 'true');
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', 'configured-internal-key');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', '');
  });

  afterEach(() => {
    createdDevelopmentSessions.splice(0).forEach(deleteDevelopmentSession);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects a cross-origin development-role login before it can issue a session', async () => {
    const response = await POST(request({
      method: 'POST',
      body: JSON.stringify({ role: 'admin' }),
    }, {
      origin: 'https://attacker.test',
      'content-type': 'application/json',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 403, msg: 'invalid request origin', data: null });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets an HttpOnly session cookie and readable CSRF cookie for same-origin development login', async () => {
    const response = await POST(request({
      method: 'POST',
      body: JSON.stringify({ role: 'reader' }),
    }, {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ code: 200, data: { role: 'reader', developmentMode: true } });
    const cookies = responseCookies(response);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${NOVEL_SESSION_COOKIE}=`));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith(`${NOVEL_CSRF_COOKIE}=`));
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('Max-Age=28800');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toMatch(/SameSite=lax/i);
    expect(sessionCookie).not.toContain('Secure');
    expect(csrfCookie).toContain('Path=/');
    expect(csrfCookie).toContain('Max-Age=28800');
    expect(csrfCookie).toMatch(/SameSite=lax/i);
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).not.toContain('Secure');
  });

  it('propagates backend login and registration failures without issuing session cookies', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 401, msg: 'invalid credentials' }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: 409, msg: 'username already exists' }, 409));

    const login = await POST(request({
      method: 'POST', body: JSON.stringify({ username: 'reader', password: 'bad-password' }),
    }, { origin: 'http://localhost:3000', 'content-type': 'application/json' }));
    expect(login.status).toBe(401);
    await expect(login.json()).resolves.toEqual({ code: 401, msg: 'invalid credentials', data: null });
    expect(responseCookies(login)).toEqual([]);

    const registration = await POST(request({
      method: 'POST', body: JSON.stringify({ action: 'register', username: 'reader', password: 'password', displayName: 'Reader' }),
    }, { origin: 'http://localhost:3000', 'content-type': 'application/json' }));
    expect(registration.status).toBe(409);
    await expect(registration.json()).resolves.toEqual({ code: 409, msg: 'username already exists', data: null });
    expect(responseCookies(registration)).toEqual([]);

    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/auth/login');
    expect(`${fetchMock.mock.calls[1][0]}`).toBe('http://backend.example.test/api/v1/auth/register');
  });

  it('uses production cookie flags and the configured internal key for a successful backend login', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    fetchMock.mockResolvedValueOnce(jsonResponse({
      code: 200,
      data: { sessionId: 'backend-session', user: { id: 7 }, expiresAt: '2027-01-01T00:00:00Z' },
    }));

    const response = await POST(new NextRequest('https://novel.example.test/api/novel/session', {
      method: 'POST',
      headers: { origin: 'https://novel.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: 'password' }),
    }));

    expect(response.status).toBe(200);
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('x-novel-internal-key')).toBe('configured-internal-key');
    expect(outbound.get('content-type')).toBe('application/json');
    const cookies = responseCookies(response);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${NOVEL_SESSION_COOKIE}=`));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith(`${NOVEL_CSRF_COOKIE}=`));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toMatch(/SameSite=lax/i);
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).toContain('Secure');
  });

  it('requires exact origin and CSRF proof before logout, then clears a development session', async () => {
    const developmentSession = createDevelopmentSession('author');
    createdDevelopmentSessions.push(developmentSession.id);
    const cookie = `${NOVEL_SESSION_COOKIE}=${developmentSession.id}; ${NOVEL_CSRF_COOKIE}=${developmentSession.csrfToken}`;

    const rejected = await DELETE(request({ method: 'DELETE' }, {
      origin: 'https://attacker.test',
      cookie,
      'x-novel-csrf': developmentSession.csrfToken,
    }));
    expect(rejected.status).toBe(403);
    expect(readDevelopmentSession(developmentSession.id)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    const loggedOut = await DELETE(request({ method: 'DELETE' }, {
      origin: 'http://localhost:3000',
      cookie,
      'x-novel-csrf': developmentSession.csrfToken,
    }));
    expect(loggedOut.status).toBe(200);
    expect(readDevelopmentSession(developmentSession.id)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    const cookies = responseCookies(loggedOut);
    expect(cookies.find((value) => value.startsWith(`${NOVEL_SESSION_COOKIE}=`))).toContain('Max-Age=0');
    expect(cookies.find((value) => value.startsWith(`${NOVEL_CSRF_COOKIE}=`))).toContain('Max-Age=0');
  });

  it('only calls backend logout after valid origin and CSRF checks, with the configured internal key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const response = await DELETE(request({ method: 'DELETE' }, {
      origin: 'http://localhost:3000',
      cookie: `${NOVEL_SESSION_COOKIE}=backend-session; ${NOVEL_CSRF_COOKIE}=csrf-token`,
      'x-novel-csrf': 'csrf-token',
    }));

    expect(response.status).toBe(200);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/auth/logout');
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('x-novel-internal-key')).toBe('configured-internal-key');
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
  });
});
