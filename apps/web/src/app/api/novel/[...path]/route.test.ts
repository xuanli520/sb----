import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const fetchMock = vi.fn<typeof fetch>();
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function request(url: string, init: NextRequestInit = {}) {
  return new NextRequest(url, init);
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function protectedCookies(csrf = 'csrf-token') {
  return `novel_session=backend-session; novel_csrf=${csrf}`;
}

describe('novel BFF route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', 'configured-internal-key');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

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

  it('requires an exact configured origin and matching double-submit CSRF token for unsafe requests', async () => {
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'https://novel.example.test');
    const unsafeHeaders = {
      cookie: protectedCookies(),
      'x-novel-csrf': 'csrf-token',
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
      headers: { cookie: protectedCookies(), origin: 'https://novel.example.test' },
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
  });

  it('permits the localhost/127.0.0.1 development alias only on the same protocol and port', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));
    const accepted = await POST(request('http://localhost:3000/api/novel/account/profile', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://127.0.0.1:3000',
        cookie: protectedCookies('local-csrf'),
        'x-novel-csrf': 'local-csrf',
      },
    }), context(['account', 'profile']));
    expect(accepted.status).toBe(200);

    const rejected = await POST(request('http://localhost:3000/api/novel/account/profile', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://127.0.0.1:3001',
        cookie: protectedCookies('local-csrf'),
        'x-novel-csrf': 'local-csrf',
      },
    }), context(['account', 'profile']));
    expect(rejected.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards only allowlisted upstream headers and keeps upstream response headers private', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { title: 'book' } }, 200, {
      'set-cookie': 'upstream_session=must-not-reach-browser',
      'x-upstream-debug': 'secret',
      location: 'https://attacker.test/redirect',
    }));

    const response = await GET(request('http://localhost:3000/api/novel/account/books?sort=recent', {
      headers: {
        cookie: `${protectedCookies()}; another=browser-only`,
        authorization: 'Bearer browser-token',
        'x-novel-internal-key': 'forged-key',
        'x-novel-bff-session': 'forged-session',
        'x-novel-development-principal': 'admin',
        'x-forwarded-for': '203.0.113.10',
        'x-client-debug': 'do-not-forward',
        'content-type': 'application/problem+json',
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
    expect(outbound.has('x-novel-development-principal')).toBe(false);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('x-upstream-debug')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });

  it('uses the configured internal key, and fails closed when production has no key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { ok: true } }));
    const configured = await GET(request('http://localhost:3000/api/novel/account/profile', {
      headers: { cookie: protectedCookies() },
    }), context(['account', 'profile']));
    expect(configured.status).toBe(200);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-novel-internal-key')).toBe('configured-internal-key');

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', '');
    const unavailable = await GET(request('https://novel.example.test/api/novel/account/profile', {
      headers: { cookie: protectedCookies() },
    }), context(['account', 'profile']));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ code: 503, msg: 'BFF internal key is not configured', data: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
