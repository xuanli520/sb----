import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, POST } from './route';
import {
  createCsrfToken,
  InMemoryNovelSessionStore,
  NOVEL_CSRF_COOKIE,
  NOVEL_SESSION_COOKIE,
  NovelSessionStore,
  setNovelSessionStoreForTests,
} from '@/lib/novel/bff-session';
import {
  NovelAuthRateLimiter,
  setNovelAuthRateLimiterForTests,
} from '@/lib/novel/bff-auth-rate-limit';

const fetchMock = vi.fn<typeof fetch>();
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(init: NextRequestInit = {}, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/novel/session', { ...init, headers });
}

function responseCookies(response: Response) {
  return response.headers.getSetCookie();
}

function cookieValue(response: Response, name: string) {
  const cookie = responseCookies(response).find(value => value.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1).split(';', 1)[0];
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function cookies(sessionId: string, csrfToken: string) {
  return `${NOVEL_SESSION_COOKIE}=${sessionId}; ${NOVEL_CSRF_COOKIE}=${csrfToken}`;
}

describe('novel BFF session route', () => {
  let store: InMemoryNovelSessionStore;
  let rateLimiter: NovelAuthRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NOVEL_DEV_LOGIN_ENABLED', 'true');
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', 'configured-internal-key');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', '');
    vi.stubEnv('NOVEL_SESSION_TTL_SECONDS', '');
    store = new InMemoryNovelSessionStore();
    setNovelSessionStoreForTests(store);
    rateLimiter = { consume: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };
    setNovelAuthRateLimiterForTests(rateLimiter);
  });

  afterEach(() => {
    setNovelSessionStoreForTests(undefined);
    setNovelAuthRateLimiterForTests(undefined);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects a cross-origin development-role login before it can issue a session', async () => {
    const response = await POST(request({ method: 'POST', body: JSON.stringify({ role: 'admin' }) }, {
      origin: 'https://attacker.test',
      'content-type': 'application/json',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 403, msg: 'invalid request origin', data: null });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores development identity server-side and sends only an opaque HttpOnly cookie', async () => {
    const response = await POST(request({ method: 'POST', body: JSON.stringify({ role: 'reader' }) }, {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ code: 200, data: { role: 'reader', developmentMode: true } });
    const sessionId = cookieValue(response, NOVEL_SESSION_COOKIE);
    const csrfToken = cookieValue(response, NOVEL_CSRF_COOKIE);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await store.read(sessionId)).toEqual({ kind: 'development', role: 'reader', csrfToken });

    const sessionCookie = responseCookies(response).find(cookie => cookie.startsWith(`${NOVEL_SESSION_COOKIE}=`));
    const csrfCookie = responseCookies(response).find(cookie => cookie.startsWith(`${NOVEL_CSRF_COOKIE}=`));
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

    const login = await POST(request({ method: 'POST', body: JSON.stringify({ username: 'reader', password: 'bad-password' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json',
    }));
    expect(login.status).toBe(401);
    await expect(login.json()).resolves.toEqual({ code: 401, msg: 'invalid credentials', data: null });
    expect(responseCookies(login)).toEqual([]);

    const registration = await POST(request({ method: 'POST', body: JSON.stringify({ action: 'register', username: 'reader', password: 'password', displayName: 'Reader' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json',
    }));
    expect(registration.status).toBe(409);
    await expect(registration.json()).resolves.toEqual({ code: 409, msg: 'username already exists', data: null });
    expect(responseCookies(registration)).toEqual([]);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/auth/login');
    expect(`${fetchMock.mock.calls[1][0]}`).toBe('http://backend.example.test/api/v1/auth/register');
  });

  it('forwards a controlled registration channel only with the registration payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      code: 200,
      data: { sessionId: 'backend-session', user: { id: 7 }, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString() },
    }));

    const response = await POST(request({
      method: 'POST',
      body: JSON.stringify({ action: 'register', username: 'reader', password: 'secure-password', displayName: 'Reader', channel: 'WECHAT' }),
    }, { origin: 'http://localhost:3000', 'content-type': 'application/json' }));

    expect(response.status).toBe(200);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/auth/register');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      username: 'reader', password: 'secure-password', displayName: 'Reader', channel: 'WECHAT',
    });
  });

  it('returns the same no-store 429 envelope for known and unknown submitted names before contacting the backend', async () => {
    const deniedLimiter: NovelAuthRateLimiter = {
      consume: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 42 }),
    };
    setNovelAuthRateLimiterForTests(deniedLimiter);

    const knownName = await POST(request({ method: 'POST', body: JSON.stringify({ username: 'known-reader', password: 'password' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.99',
    }));
    const unknownName = await POST(request({ method: 'POST', body: JSON.stringify({ username: 'unknown-reader', password: 'password' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.45',
    }));

    expect(knownName.status).toBe(429);
    expect(unknownName.status).toBe(429);
    await expect(knownName.json()).resolves.toEqual({ code: 429, msg: 'too many authentication attempts', data: null });
    await expect(unknownName.json()).resolves.toEqual({ code: 429, msg: 'too many authentication attempts', data: null });
    expect(knownName.headers.get('retry-after')).toBe('42');
    expect(unknownName.headers.get('cache-control')).toBe('no-store');
    expect(responseCookies(knownName)).toEqual([]);
    expect(responseCookies(unknownName)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deniedLimiter.consume).toHaveBeenCalledWith('login', 'identifier:known-reader');
    expect(deniedLimiter.consume).toHaveBeenCalledWith('login', 'identifier:unknown-reader');
  });

  it('fails closed before contacting the backend when the enabled rate limiter is unavailable', async () => {
    setNovelAuthRateLimiterForTests({ consume: vi.fn().mockRejectedValue(new Error('redis unavailable')) });

    const response = await POST(request({ method: 'POST', body: JSON.stringify({ username: 'reader', password: 'password' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 503, msg: 'BFF authentication rate limiter is unavailable', data: null });
    expect(responseCookies(response)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the backend session to a distinct browser id and uses production cookie flags', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'https://novel.example.test');
    const backendSessionId = 'backend-session-that-must-not-reach-the-browser';
    fetchMock.mockResolvedValueOnce(jsonResponse({
      code: 200,
      data: { sessionId: backendSessionId, user: { id: 7 }, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString() },
    }));

    const response = await POST(new NextRequest('https://novel.example.test/api/novel/session', {
      method: 'POST',
      headers: { origin: 'https://novel.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: 'password' }),
    }));

    expect(response.status).toBe(200);
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('x-novel-internal-key')).toBe('configured-internal-key');
    const sessionId = cookieValue(response, NOVEL_SESSION_COOKIE);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessionId).not.toBe(backendSessionId);
    expect(responseCookies(response).join(';')).not.toContain(backendSessionId);
    expect(await store.read(sessionId)).toEqual(expect.objectContaining({ kind: 'backend', backendSessionId }));
    const payload = await response.json() as { data?: Record<string, unknown> };
    expect(JSON.stringify(payload)).not.toContain(backendSessionId);

    const sessionCookie = responseCookies(response).find(cookie => cookie.startsWith(`${NOVEL_SESSION_COOKIE}=`));
    const csrfCookie = responseCookies(response).find(cookie => cookie.startsWith(`${NOVEL_CSRF_COOKIE}=`));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toMatch(/SameSite=lax/i);
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).toContain('Secure');
  });

  it('bounds the browser and Redis session TTL to the backend expiry', async () => {
    vi.stubEnv('NOVEL_SESSION_TTL_SECONDS', '3600');
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { sessionId: 'backend-session', user: { id: 7 }, expiresAt } }));

    const response = await POST(request({ method: 'POST', body: JSON.stringify({ username: 'reader', password: 'password' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json',
    }));

    expect(response.status).toBe(200);
    expect(responseCookies(response).find(cookie => cookie.startsWith(`${NOVEL_SESSION_COOKIE}=`))).toContain('Max-Age=90');
  });

  it('requires exact origin and session-bound CSRF proof before deleting a development session', async () => {
    const csrfToken = createCsrfToken();
    const sessionId = await store.create({ kind: 'development', role: 'author', csrfToken }, 600);
    const cookie = cookies(sessionId, csrfToken);

    const rejected = await DELETE(request({ method: 'DELETE' }, {
      origin: 'https://attacker.test', cookie, 'x-novel-csrf': csrfToken,
    }));
    expect(rejected.status).toBe(403);
    expect(await store.read(sessionId)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    const loggedOut = await DELETE(request({ method: 'DELETE' }, {
      origin: 'http://localhost:3000', cookie, 'x-novel-csrf': csrfToken,
    }));
    expect(loggedOut.status).toBe(200);
    expect(await store.read(sessionId)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(responseCookies(loggedOut).find(value => value.startsWith(`${NOVEL_SESSION_COOKIE}=`))).toContain('Max-Age=0');
    expect(responseCookies(loggedOut).find(value => value.startsWith(`${NOVEL_CSRF_COOKIE}=`))).toContain('Max-Age=0');
  });

  it('forwards only the server-side backend credential during logout and deletes its mapping', async () => {
    const csrfToken = createCsrfToken();
    const sessionId = await store.create({ kind: 'backend', backendSessionId: 'backend-session', csrfToken }, 600);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await DELETE(request({ method: 'DELETE' }, {
      origin: 'http://localhost:3000', cookie: cookies(sessionId, csrfToken), 'x-novel-csrf': csrfToken,
    }));

    expect(response.status).toBe(200);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/auth/logout');
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('x-novel-internal-key')).toBe('configured-internal-key');
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
    expect(await store.read(sessionId)).toBeUndefined();
  });

  it('fails closed when the configured store cannot persist a development login', async () => {
    const unavailableStore: NovelSessionStore = {
      create: vi.fn().mockRejectedValue(new Error('redis unavailable')),
      read: vi.fn(),
      delete: vi.fn(),
    };
    setNovelSessionStoreForTests(unavailableStore);

    const response = await POST(request({ method: 'POST', body: JSON.stringify({ role: 'reader' }) }, {
      origin: 'http://localhost:3000', 'content-type': 'application/json',
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 503, msg: 'BFF session storage is unavailable', data: null });
    expect(responseCookies(response)).toEqual([]);
  });
});
