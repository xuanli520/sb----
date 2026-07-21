import { NextRequest, NextResponse } from 'next/server';
import {
  configuredSessionTtlSeconds,
  createCsrfToken,
  csrfTokensMatch,
  developmentLoginAllowed,
  getNovelSessionStore,
  NOVEL_CSRF_COOKIE,
  NOVEL_SESSION_COOKIE,
  SessionRole,
  sessionTtlFromBackendExpiry,
} from '@/lib/novel/bff-session';
import { consumeNovelAuthRateLimit } from '@/lib/novel/bff-auth-rate-limit';
import { hasTrustedSameOrigin } from '@/lib/novel/origin';

export const runtime = 'nodejs';

type BackendSession = { code: number; msg?: string; data?: { sessionId?: string; user?: unknown; expiresAt?: string } };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!hasTrustedSameOrigin(request)) return forbiddenOrigin();

  if (typeof body.role === 'string') return createDevelopmentLogin(body.role);

  const action = body.action === 'register' ? 'register' : 'login';
  if (typeof body.username !== 'string' || typeof body.password !== 'string' || (action === 'register' && typeof body.displayName !== 'string')) {
    return NextResponse.json({ code: 400, msg: 'username, password, and displayName for registration are required', data: null }, { status: 400 });
  }
  try {
    const rateLimit = await consumeNovelAuthRateLimit(action, body.username, request.headers);
    if (!rateLimit.allowed) return authenticationRateLimited(rateLimit.retryAfterSeconds);
  } catch {
    // Authentication mutations fail closed when a production limiter cannot reach Redis. This is
    // intentionally separate from the session store so existing browser-session semantics stay intact.
    return authenticationRateLimiterUnavailable();
  }
  return createAuthenticatedLogin(action, body);
}

export async function DELETE(request: NextRequest) {
  const browserSessionId = request.cookies.get(NOVEL_SESSION_COOKIE)?.value;
  const csrfCookie = request.cookies.get(NOVEL_CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get('x-novel-csrf');
  if (!hasTrustedSameOrigin(request) || !csrfCookie || !csrfTokensMatch(csrfCookie, csrfHeader)) return forbiddenCsrf();
  if (!browserSessionId) return clearSessionResponse();

  let store;
  try {
    store = await getNovelSessionStore();
  } catch {
    return sessionStoreUnavailable();
  }

  let session;
  try {
    session = await store.read(browserSessionId);
  } catch {
    return sessionStoreUnavailable();
  }
  // Logout is idempotent. A stale browser cookie must not keep a user signed in locally.
  if (!session) return clearSessionResponse();
  if (!csrfTokensMatch(session.csrfToken, csrfHeader)) return forbiddenCsrf();

  if (session.kind === 'backend') {
    const internalKey = internalApiKey();
    if (!internalKey) return internalKeyUnavailable();
    try {
      const upstream = await fetch(new URL('/api/v1/auth/logout', apiTarget()), {
        method: 'POST',
        headers: { 'X-Novel-Internal-Key': internalKey, 'X-Novel-Bff-Session': session.backendSessionId },
        cache: 'no-store',
      });
      if (!upstream.ok) return NextResponse.json({ code: upstream.status, msg: 'logout failed', data: null }, { status: upstream.status });
    } catch {
      return NextResponse.json({ code: 502, msg: 'authentication service is unavailable', data: null }, { status: 502 });
    }
  }

  try {
    await store.delete(browserSessionId);
  } catch {
    // The upstream credential is already revoked. Clear the browser state even if Redis is
    // temporarily unavailable so this device cannot keep using its opaque identifier.
    return clearSessionResponse(503, 'BFF session cleanup failed');
  }
  return clearSessionResponse();
}

async function createDevelopmentLogin(role: string) {
  if (!developmentLoginAllowed()) return NextResponse.json({ code: 404, msg: 'not found', data: null }, { status: 404 });
  if (!isSessionRole(role)) return NextResponse.json({ code: 400, msg: 'unsupported development role', data: null }, { status: 400 });

  const csrfToken = createCsrfToken();
  try {
    const sessionId = await (await getNovelSessionStore()).create(
      { kind: 'development', role, csrfToken },
      configuredSessionTtlSeconds(),
    );
    const response = NextResponse.json({ code: 200, msg: 'ok', data: { role, developmentMode: true } });
    setSessionCookies(response, sessionId, csrfToken, configuredSessionTtlSeconds());
    return response;
  } catch {
    return sessionStoreUnavailable();
  }
}

async function createAuthenticatedLogin(action: 'login' | 'register', body: Record<string, unknown>) {
  const internalKey = internalApiKey();
  if (!internalKey) return internalKeyUnavailable();

  let store;
  try {
    store = await getNovelSessionStore();
  } catch {
    return sessionStoreUnavailable();
  }

  try {
    const upstream = await fetch(new URL(`/api/v1/auth/${action}`, apiTarget()), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Novel-Internal-Key': internalKey },
      body: JSON.stringify(action === 'register'
        ? {
          username: body.username,
          password: body.password,
          displayName: body.displayName,
          ...(typeof body.channel === 'string' ? { channel: body.channel } : {}),
        }
        : { username: body.username, password: body.password }),
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => ({})) as BackendSession;
    const backendSessionId = payload.data?.sessionId;
    if (!upstream.ok || !backendSessionId) {
      return NextResponse.json({ code: payload.code || upstream.status, msg: payload.msg || 'authentication failed', data: null }, { status: upstream.ok ? 502 : upstream.status });
    }

    let ttlSeconds: number | undefined;
    try {
      ttlSeconds = sessionTtlFromBackendExpiry(payload.data?.expiresAt);
    } catch {
      ttlSeconds = undefined;
    }
    if (!ttlSeconds) {
      await revokeBackendSession(backendSessionId, internalKey);
      return NextResponse.json({ code: 502, msg: 'authentication service returned an invalid session expiry', data: null }, { status: 502 });
    }

    const csrfToken = createCsrfToken();
    try {
      const browserSessionId = await store.create({ kind: 'backend', backendSessionId, csrfToken }, ttlSeconds);
      const response = NextResponse.json({ code: 200, msg: 'ok', data: { user: payload.data?.user, expiresAt: payload.data?.expiresAt, developmentMode: false } });
      setSessionCookies(response, browserSessionId, csrfToken, ttlSeconds);
      return response;
    } catch {
      // Do not leave an upstream credential active when the browser-facing session could not be
      // persisted. A retry can obtain a fresh backend session after Redis recovers.
      await revokeBackendSession(backendSessionId, internalKey);
      return sessionStoreUnavailable();
    }
  } catch {
    return NextResponse.json({ code: 502, msg: 'authentication service is unavailable', data: null }, { status: 502 });
  }
}

async function revokeBackendSession(backendSessionId: string, internalKey: string) {
  try {
    await fetch(new URL('/api/v1/auth/logout', apiTarget()), {
      method: 'POST',
      headers: { 'X-Novel-Internal-Key': internalKey, 'X-Novel-Bff-Session': backendSessionId },
      cache: 'no-store',
    });
  } catch {
    // The original login response is still rejected. The backend session has its own short TTL.
  }
}

function apiTarget() {
  return process.env.API_PROXY_TARGET || 'http://localhost:8080';
}

function internalApiKey() {
  return process.env.NOVEL_INTERNAL_API_KEY || (process.env.NODE_ENV !== 'production' ? 'local-novel-internal-key' : '');
}

function isSessionRole(role: string): role is SessionRole {
  return role === 'reader' || role === 'author' || role === 'admin';
}

function setSessionCookies(response: NextResponse, sessionId: string, csrfToken: string, ttlSeconds: number) {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(NOVEL_SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: ttlSeconds });
  response.cookies.set(NOVEL_CSRF_COOKIE, csrfToken, { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: ttlSeconds });
}

function clearSessionResponse(status = 200, msg = 'ok') {
  const response = NextResponse.json({ code: status, msg, data: null }, { status });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(NOVEL_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  response.cookies.set(NOVEL_CSRF_COOKIE, '', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  return response;
}

function forbiddenOrigin() {
  return NextResponse.json({ code: 403, msg: 'invalid request origin', data: null }, { status: 403 });
}

function forbiddenCsrf() {
  return NextResponse.json({ code: 403, msg: 'invalid request origin or csrf token', data: null }, { status: 403 });
}

function internalKeyUnavailable() {
  return NextResponse.json({ code: 503, msg: 'BFF internal key is not configured', data: null }, { status: 503 });
}

function sessionStoreUnavailable() {
  return NextResponse.json({ code: 503, msg: 'BFF session storage is unavailable', data: null }, { status: 503 });
}

function authenticationRateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { code: 429, msg: 'too many authentication attempts', data: null },
    { status: 429, headers: { 'retry-after': String(Math.max(1, retryAfterSeconds)), 'cache-control': 'no-store' } },
  );
}

function authenticationRateLimiterUnavailable() {
  return NextResponse.json({ code: 503, msg: 'BFF authentication rate limiter is unavailable', data: null }, { status: 503 });
}
