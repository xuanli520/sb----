import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import {
  createCsrfToken,
  InMemoryNovelSessionStore,
  NOVEL_CSRF_COOKIE,
  NOVEL_SESSION_COOKIE,
  setNovelSessionStoreForTests,
} from '@/lib/novel/bff-session';

const fetchMock = vi.fn<typeof fetch>();
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(url: string, init: NextRequestInit = {}) {
  return new NextRequest(url, init);
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function protectedCookies(sessionId: string, csrfToken: string) {
  return `${NOVEL_SESSION_COOKIE}=${sessionId}; ${NOVEL_CSRF_COOKIE}=${csrfToken}`;
}

describe('novel BFF route', () => {
  let store: InMemoryNovelSessionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', 'configured-internal-key');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', '');
    store = new InMemoryNovelSessionStore();
    setNovelSessionStoreForTests(store);
  });

  afterEach(() => {
    setNovelSessionStoreForTests(undefined);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function backendSession(backendSessionId = 'backend-session') {
    const csrfToken = createCsrfToken();
    const sessionId = await store.create({ kind: 'backend', backendSessionId, csrfToken, passwordChangeRequired: false }, 3_600);
    return { sessionId, csrfToken };
  }

  it.each([
    { path: [], label: 'empty path' },
    { path: ['private', 'books'], label: 'unapproved root' },
    { path: ['public', '..', 'account'], label: 'parent traversal' },
    { path: ['public', '.', 'books'], label: 'current-directory traversal' },
  ])('rejects $label before an upstream request', async ({ path }) => {
    const response = await GET(request('http://localhost:3000/api/novel/anything'), context(path));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: 404, msg: 'not found', data: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not proxy protected endpoints without a BFF session cookie', async () => {
    const response = await GET(request('http://localhost:3000/api/novel/account/profile'), context(['account', 'profile']));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 401, msg: 'login required', data: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a raw or unknown backend token cookie instead of treating it as a BFF session', async () => {
    const response = await GET(request('http://localhost:3000/api/novel/account/profile', {
      headers: { cookie: `${NOVEL_SESSION_COOKIE}=backend-session; ${NOVEL_CSRF_COOKIE}=${createCsrfToken()}` },
    }), context(['account', 'profile']));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires an exact configured origin and session-bound CSRF token for unsafe requests', async () => {
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'https://novel.example.test');
    const { sessionId, csrfToken } = await backendSession();
    const unsafeHeaders = {
      cookie: protectedCookies(sessionId, csrfToken),
      'x-novel-csrf': csrfToken,
      'content-type': 'application/json',
    };

    const hostileOrigin = await POST(request('https://internal.example.test/api/novel/account/profile', {
      method: 'POST',
      headers: { ...unsafeHeaders, origin: 'https://novel.example.test.attacker.test' },
      body: JSON.stringify({ nickname: 'reader' }),
    }), context(['account', 'profile']));
    expect(hostileOrigin.status).toBe(403);

    const missingCsrf = await POST(request('https://internal.example.test/api/novel/account/profile', {
      method: 'POST',
      headers: { cookie: protectedCookies(sessionId, csrfToken), origin: 'https://novel.example.test' },
    }), context(['account', 'profile']));
    expect(missingCsrf.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));
    const accepted = await POST(request('https://internal.example.test/api/novel/account/profile?tab=security', {
      method: 'POST',
      headers: { ...unsafeHeaders, origin: 'https://novel.example.test' },
      body: JSON.stringify({ nickname: 'reader' }),
    }), context(['account', 'profile']));

    expect(accepted.status).toBe(200);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/account/profile?tab=security');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-novel-bff-session')).toBe('backend-session');
  });

  it('accepts a same-origin Referer fallback with the same CSRF protection', async () => {
    const { sessionId, csrfToken } = await backendSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));

    const response = await POST(request('http://localhost:3000/api/novel/account/profile', {
      method: 'POST',
      headers: {
        referer: 'http://localhost:3000/account',
        cookie: protectedCookies(sessionId, csrfToken),
        'x-novel-csrf': csrfToken,
      },
    }), context(['account', 'profile']));

    expect(response.status).toBe(200);
  });

  it('proxies a reader reward request and forwards the idempotency key only on that route', async () => {
    const { sessionId, csrfToken } = await backendSession();
    const payload = { amount: 25 };
    const idempotencyKey = 'a7744c6f-e9ea-4d24-a57f-bb59c36f4201';
    const upstreamPayload = { code: 200, msg: 'ok', data: { bookId: 7, amount: 25, balance: 75 } };
    fetchMock.mockResolvedValueOnce(jsonResponse(upstreamPayload));

    const response = await POST(request('http://localhost:3000/api/novel/account/books/7/reward', {
      method: 'POST',
      headers: {
        host: 'localhost:3000', origin: 'http://localhost:3000',
        cookie: protectedCookies(sessionId, csrfToken), 'x-novel-csrf': csrfToken,
        'content-type': 'application/json', 'idempotency-key': idempotencyKey,
        'x-client-debug': 'must-not-reach-upstream',
      },
      body: JSON.stringify(payload),
    }), context(['account', 'books', '7', 'reward']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamPayload);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/account/books/7/reward');
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('content-type')).toBe('application/json');
    expect(outbound.get('idempotency-key')).toBe(idempotencyKey);
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
    expect(outbound.has('x-client-debug')).toBe(false);
    await expect(new Response(fetchMock.mock.calls[0][1]?.body).text()).resolves.toBe(JSON.stringify(payload));
  });

  it('proxies a whole-book entitlement request without accepting a browser-supplied price', async () => {
    const { sessionId, csrfToken } = await backendSession();
    const upstreamPayload = { code: 200, msg: 'ok', data: { bookId: 7, purchased: true, balance: 90 } };
    fetchMock.mockResolvedValueOnce(jsonResponse(upstreamPayload));

    const response = await POST(request('http://localhost:3000/api/novel/account/books/7/purchase', {
      method: 'POST',
      headers: {
        host: 'localhost:3000', origin: 'http://localhost:3000',
        cookie: protectedCookies(sessionId, csrfToken), 'x-novel-csrf': csrfToken,
        'content-type': 'application/json', 'x-client-price': '1',
      },
    }), context(['account', 'books', '7', 'purchase']));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamPayload);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/account/books/7/purchase');
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
    expect(outbound.has('x-client-price')).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined();
  });

  it('proxies an author cover multipart payload with its browser-generated boundary and CSRF gate intact', async () => {
    const { sessionId, csrfToken } = await backendSession();
    const form = new FormData();
    form.append('file', new Blob(['actual-png-bytes'], { type: 'image/png' }), 'untrusted-name.png');
    const browserRequest = request('http://localhost:3000/api/novel/author/books/7/cover', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        cookie: protectedCookies(sessionId, csrfToken),
        'x-novel-csrf': csrfToken,
      },
      body: form,
    });
    const originalContentType = browserRequest.headers.get('content-type');
    const originalBody = await browserRequest.clone().arrayBuffer();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { cover: '/media/covers/test.png' } }));

    const response = await POST(browserRequest, context(['author', 'books', '7', 'cover']));

    expect(response.status).toBe(200);
    expect(`${fetchMock.mock.calls[0][0]}`).toBe('http://backend.example.test/api/v1/author/books/7/cover');
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('content-type')).toBe(originalContentType);
    expect(outbound.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
    expect(await new Response(fetchMock.mock.calls[0][1]?.body).arrayBuffer()).toEqual(originalBody);
  });

  it('permits the localhost/127.0.0.1 development alias only on the same protocol and port', async () => {
    const { sessionId, csrfToken } = await backendSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));
    const accepted = await POST(request('http://localhost:3000/api/novel/account/profile', {
      method: 'POST',
      headers: {
        host: 'localhost:3000', origin: 'http://127.0.0.1:3000',
        cookie: protectedCookies(sessionId, csrfToken), 'x-novel-csrf': csrfToken,
      },
    }), context(['account', 'profile']));
    expect(accepted.status).toBe(200);

    const rejected = await POST(request('http://localhost:3000/api/novel/account/profile', {
      method: 'POST',
      headers: {
        host: 'localhost:3000', origin: 'http://127.0.0.1:3001',
        cookie: protectedCookies(sessionId, csrfToken), 'x-novel-csrf': csrfToken,
      },
    }), context(['account', 'profile']));
    expect(rejected.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards only allowlisted upstream headers and keeps upstream response headers private', async () => {
    const { sessionId, csrfToken } = await backendSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { title: 'book' } }, 200, {
      'set-cookie': 'upstream_session=must-not-reach-browser', 'x-upstream-debug': 'secret', location: 'https://attacker.test/redirect',
    }));

    const response = await GET(request('http://localhost:3000/api/novel/account/books?sort=recent', {
      headers: {
        cookie: `${protectedCookies(sessionId, csrfToken)}; another=browser-only`,
        authorization: 'Bearer browser-token', 'x-novel-internal-key': 'forged-key',
        'x-novel-bff-session': 'forged-session', 'x-novel-development-principal': 'admin',
        'x-forwarded-for': '203.0.113.10', 'x-client-debug': 'do-not-forward',
        'idempotency-key': 'must-not-leave-the-reward-route', 'content-type': 'application/problem+json',
      },
    }), context(['account', 'books']));

    expect(response.status).toBe(200);
    const outbound = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(outbound.get('content-type')).toBe('application/problem+json');
    expect(outbound.get('x-novel-internal-key')).toBe('configured-internal-key');
    expect(outbound.get('x-novel-bff-session')).toBe('backend-session');
    expect(outbound.has('authorization')).toBe(false);
    expect(outbound.has('cookie')).toBe(false);
    expect(outbound.has('x-forwarded-for')).toBe(false);
    expect(outbound.has('x-client-debug')).toBe(false);
    expect(outbound.has('idempotency-key')).toBe(false);
    expect(outbound.has('x-novel-development-principal')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-upstream-debug')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });

  it('uses the configured internal key and fails closed when production has no key', async () => {
    const { sessionId, csrfToken } = await backendSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));
    const configured = await GET(request('http://localhost:3000/api/novel/account/profile', {
      headers: { cookie: protectedCookies(sessionId, csrfToken) },
    }), context(['account', 'profile']));
    expect(configured.status).toBe(200);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-novel-internal-key')).toBe('configured-internal-key');

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', '');
    const unavailable = await GET(request('https://novel.example.test/api/novel/account/profile', {
      headers: { cookie: protectedCookies(sessionId, csrfToken) },
    }), context(['account', 'profile']));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ code: 503, msg: 'BFF internal key is not configured', data: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes the Redis mapping when the backend rejects a protected credential', async () => {
    const { sessionId, csrfToken } = await backendSession();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 401, msg: 'session expired', data: null }, 401));

    const response = await GET(request('http://localhost:3000/api/novel/account/profile', {
      headers: { cookie: protectedCookies(sessionId, csrfToken) },
    }), context(['account', 'profile']));

    expect(response.status).toBe(401);
    expect(await store.read(sessionId)).toBeUndefined();
  });
});
