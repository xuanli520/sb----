import { NextRequest, NextResponse } from 'next/server';
import { NOVEL_CSRF_COOKIE, NOVEL_SESSION_COOKIE, readDevelopmentSession } from '@/lib/novel/dev-session';
import { hasTrustedSameOrigin } from '@/lib/novel/origin';

export const runtime = 'nodejs';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedRoots = new Set(['public', 'account', 'author', 'admin']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || !allowedRoots.has(path[0]) || path.some(part => part === '.' || part === '..')) return NextResponse.json({ code: 404, msg: 'not found', data: null }, { status: 404 });
  const sessionId = request.cookies.get(NOVEL_SESSION_COOKIE)?.value;
  const developmentSession = readDevelopmentSession(sessionId);
  const isPublic = path[0] === 'public';
  if (!isPublic && !sessionId) return NextResponse.json({ code: 401, msg: 'login required', data: null }, { status: 401 });
  if (unsafeMethods.has(request.method)) {
    const csrfHeader = request.headers.get('x-novel-csrf');
    const csrfCookie = request.cookies.get(NOVEL_CSRF_COOKIE)?.value;
    if (!hasTrustedSameOrigin(request) || !csrfCookie || csrfHeader !== csrfCookie || (developmentSession && csrfHeader !== developmentSession.csrfToken)) return NextResponse.json({ code: 403, msg: 'invalid request origin or csrf token', data: null }, { status: 403 });
  }
  const target = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, process.env.API_PROXY_TARGET || 'http://localhost:8080');
  target.search = request.nextUrl.search;
  const headers = new Headers();
  const contentType = request.headers.get('content-type'); if (contentType) headers.set('content-type', contentType);
  if (!isPublic && sessionId) {
    const internalKey = process.env.NOVEL_INTERNAL_API_KEY || (process.env.NODE_ENV !== 'production' ? 'local-novel-internal-key' : '');
    if (!internalKey) return NextResponse.json({ code: 503, msg: 'BFF internal key is not configured', data: null }, { status: 503 });
    headers.set('X-Novel-Internal-Key', internalKey);
    if (developmentSession) headers.set('X-Novel-Development-Principal', developmentSession.role);
    else headers.set('X-Novel-Bff-Session', sessionId);
  }
  const body = unsafeMethods.has(request.method) ? await request.arrayBuffer() : undefined;
  const upstream = await fetch(target, { method: request.method, headers, body: body?.byteLength ? body : undefined, cache: 'no-store' });
  return new NextResponse(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
}

export const GET = proxy; export const POST = proxy; export const PUT = proxy; export const PATCH = proxy; export const DELETE = proxy;
