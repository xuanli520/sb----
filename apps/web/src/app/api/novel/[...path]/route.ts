import { NextRequest, NextResponse } from 'next/server';
import {
  csrfTokensMatch,
  getNovelSessionStore,
  NOVEL_CSRF_COOKIE,
  NOVEL_SESSION_COOKIE,
  NovelBffSession,
} from '@/lib/novel/bff-session';
import { hasTrustedSameOrigin } from '@/lib/novel/origin';

export const runtime = 'nodejs';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedRoots = new Set(['public', 'account', 'author', 'admin']);

function isReaderRewardRequest(path: string[], method: string) {
  return method === 'POST'
    && path.length === 4
    && path[0] === 'account'
    && path[1] === 'books'
    && /^\d+$/.test(path[2])
    && path[3] === 'reward';
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || !allowedRoots.has(path[0]) || path.some(part => part === '.' || part === '..')) return notFound();

  const isPublic = path[0] === 'public';
  const browserSessionId = request.cookies.get(NOVEL_SESSION_COOKIE)?.value;
  let session: NovelBffSession | undefined;
  let store: Awaited<ReturnType<typeof getNovelSessionStore>> | undefined;
  if (!isPublic) {
    if (!browserSessionId) return loginRequired();
    try {
      store = await getNovelSessionStore();
      session = await store.read(browserSessionId);
    } catch {
      return sessionStoreUnavailable();
    }
    // A structurally valid-looking cookie is not authentication. The opaque browser id must map
    // to a live Redis record before the BFF can ever forward the backend session credential.
    if (!session) return loginRequired();
  }

  if (unsafeMethods.has(request.method)) {
    const csrfHeader = request.headers.get('x-novel-csrf');
    const csrfCookie = request.cookies.get(NOVEL_CSRF_COOKIE)?.value;
    if (!hasTrustedSameOrigin(request) || !csrfCookie || !csrfTokensMatch(csrfCookie, csrfHeader) || (session && !csrfTokensMatch(session.csrfToken, csrfHeader))) {
      return csrfRejected();
    }
  }

  const target = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, process.env.API_PROXY_TARGET || 'http://localhost:8080');
  target.search = request.nextUrl.search;
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  // Beyond the existing safe Content-Type, this is the sole client-controlled header allowed
  // through the BFF and is scoped to its consuming endpoint.
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey && isReaderRewardRequest(path, request.method)) headers.set('Idempotency-Key', idempotencyKey);
  if (session) {
    const internalKey = internalApiKey();
    if (!internalKey) return internalKeyUnavailable();
    headers.set('X-Novel-Internal-Key', internalKey);
    if (session.kind === 'development') headers.set('X-Novel-Development-Principal', session.role);
    else headers.set('X-Novel-Bff-Session', session.backendSessionId);
  }

  const body = unsafeMethods.has(request.method) ? await request.arrayBuffer() : undefined;
  try {
    const upstream = await fetch(target, { method: request.method, headers, body: body?.byteLength ? body : undefined, cache: 'no-store' });
    if (upstream.status === 401 && session && browserSessionId && store) {
      // A backend-revoked credential must not leave a reusable BFF mapping behind. The response
      // still reflects the upstream authorization result; deletion is best-effort on this path.
      await store.delete(browserSessionId).catch(() => undefined);
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ code: 502, msg: 'backend service is unavailable', data: null }, { status: 502 });
  }
}

function notFound() {
  return NextResponse.json({ code: 404, msg: 'not found', data: null }, { status: 404 });
}

function loginRequired() {
  return NextResponse.json({ code: 401, msg: 'login required', data: null }, { status: 401 });
}

function csrfRejected() {
  return NextResponse.json({ code: 403, msg: 'invalid request origin or csrf token', data: null }, { status: 403 });
}

function internalKeyUnavailable() {
  return NextResponse.json({ code: 503, msg: 'BFF internal key is not configured', data: null }, { status: 503 });
}

function sessionStoreUnavailable() {
  return NextResponse.json({ code: 503, msg: 'BFF session storage is unavailable', data: null }, { status: 503 });
}

function internalApiKey() {
  return process.env.NOVEL_INTERNAL_API_KEY || (process.env.NODE_ENV !== 'production' ? 'local-novel-internal-key' : '');
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
