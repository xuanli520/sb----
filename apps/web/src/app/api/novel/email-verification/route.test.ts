import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { NovelAuthRateLimiter, setNovelAuthRateLimiterForTests } from '@/lib/novel/bff-auth-rate-limit';

const fetchMock = vi.fn<typeof fetch>();

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/novel/email-verification', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('email verification BFF route', () => {
  let limiter: NovelAuthRateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
    vi.stubEnv('NOVEL_INTERNAL_API_KEY', 'configured-internal-key');
    limiter = { consume: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };
    setNovelAuthRateLimiterForTests(limiter);
  });

  afterEach(() => {
    setNovelAuthRateLimiterForTests(undefined);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('enforces same-origin and email validation before it reaches SMTP-facing backend code', async () => {
    const crossOrigin = await POST(request({ email: 'reader@example.test' }, { origin: 'https://attacker.test' }));
    expect(crossOrigin.status).toBe(403);

    const invalid = await POST(request({ email: 'not-an-email' }));
    expect(invalid.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('forwards only the email under BFF authentication and never exposes a verification secret', async () => {
    const expiresAt = '2026-07-22T08:10:00Z';
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, msg: 'ok', data: { expiresAt, verificationCode: 'do-not-expose' } }));

    const response = await POST(request({ email: 'Reader@Example.test ' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ code: 200, msg: 'verification email sent', data: { expiresAt } });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(limiter.consume).toHaveBeenCalledWith('register', 'identifier:reader@example.test');
    expect(`${fetchMock.mock.calls[0]?.[0]}`).toBe('http://backend.example.test/api/v1/auth/email-verification');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ email: 'reader@example.test' });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-novel-internal-key')).toBe('configured-internal-key');
  });

  it('fails closed without provider diagnostics when the upstream email service declines a request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 503, msg: 'SMTP password authentication failed' }, 503));

    const response = await POST(request({ email: 'reader@example.test' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 503, msg: 'email verification request failed', data: null });
  });
});
