import { NextRequest, NextResponse } from 'next/server';
import { createCsrfToken, createDevelopmentSession, deleteDevelopmentSession, developmentLoginAllowed, NOVEL_CSRF_COOKIE, NOVEL_SESSION_COOKIE, readDevelopmentSession, SessionRole } from '@/lib/novel/dev-session';
import { hasTrustedSameOrigin } from '@/lib/novel/origin';

export const runtime = 'nodejs';

type BackendSession = { code: number; msg?: string; data?: { sessionId?: string; user?: unknown; expiresAt?: string } };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  // Development-role sessions still mutate browser authentication state. Keep the
  // same origin gate in front of this development-only shortcut as well.
  if (typeof body.role === 'string') {
    if (!hasTrustedSameOrigin(request)) return NextResponse.json({ code: 403, msg: 'invalid request origin', data: null }, { status: 403 });
    return createDevelopmentLogin(body.role);
  }

  if (!hasTrustedSameOrigin(request)) return NextResponse.json({ code: 403, msg: 'invalid request origin', data: null }, { status: 403 });
  const action = body.action === 'register' ? 'register' : 'login';
  if (typeof body.username !== 'string' || typeof body.password !== 'string' || (action === 'register' && typeof body.displayName !== 'string')) {
    return NextResponse.json({ code: 400, msg: 'username, password, and displayName for registration are required', data: null }, { status: 400 });
  }
  return createAuthenticatedLogin(action, body);
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.cookies.get(NOVEL_SESSION_COOKIE)?.value;
  const csrfCookie = request.cookies.get(NOVEL_CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get('x-novel-csrf');
  if (!hasTrustedSameOrigin(request) || !csrfCookie || csrfHeader !== csrfCookie) {
    return NextResponse.json({ code: 403, msg: 'invalid request origin or csrf token', data: null }, { status: 403 });
  }

  const developmentSession = readDevelopmentSession(sessionId);
  if (developmentSession) deleteDevelopmentSession(sessionId);
  else if (sessionId) {
    const internalKey = internalApiKey();
    if (!internalKey) return NextResponse.json({ code: 503, msg: 'BFF internal key is not configured', data: null }, { status: 503 });
    try {
      const upstream = await fetch(new URL('/api/v1/auth/logout', apiTarget()), {
        method: 'POST', headers: { 'X-Novel-Internal-Key': internalKey, 'X-Novel-Bff-Session': sessionId }, cache: 'no-store',
      });
      if (!upstream.ok) return NextResponse.json({ code: upstream.status, msg: 'logout failed', data: null }, { status: upstream.status });
    } catch {
      return NextResponse.json({ code: 502, msg: 'authentication service is unavailable', data: null }, { status: 502 });
    }
  }
  return clearSessionResponse();
}

function createDevelopmentLogin(role: string) {
  if (!developmentLoginAllowed()) return NextResponse.json({ code: 404, msg: 'not found', data: null }, { status: 404 });
  if (!['reader','author','admin'].includes(role)) return NextResponse.json({ code:400,msg:'unsupported development role',data:null},{status:400});
  const session=createDevelopmentSession(role as SessionRole);
  const response=NextResponse.json({code:200,msg:'ok',data:{role,developmentMode:true}});
  setSessionCookies(response,session.id,session.csrfToken);
  return response;
}

async function createAuthenticatedLogin(action: 'login' | 'register', body: Record<string, unknown>) {
  const internalKey = internalApiKey();
  if (!internalKey) return NextResponse.json({ code: 503, msg: 'BFF internal key is not configured', data: null }, { status: 503 });
  try {
    const upstream = await fetch(new URL(`/api/v1/auth/${action}`, apiTarget()), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Novel-Internal-Key': internalKey },
      body: JSON.stringify(action === 'register'
        ? { username: body.username, password: body.password, displayName: body.displayName }
        : { username: body.username, password: body.password }),
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => ({})) as BackendSession;
    const sessionId = payload.data?.sessionId;
    if (!upstream.ok || !sessionId) {
      return NextResponse.json({ code: payload.code || upstream.status, msg: payload.msg || 'authentication failed', data: null }, { status: upstream.ok ? 502 : upstream.status });
    }
    const response = NextResponse.json({ code: 200, msg: 'ok', data: { user: payload.data?.user, expiresAt: payload.data?.expiresAt, developmentMode: false } });
    setSessionCookies(response, sessionId, createCsrfToken());
    return response;
  } catch {
    return NextResponse.json({ code: 502, msg: 'authentication service is unavailable', data: null }, { status: 502 });
  }
}

function apiTarget() { return process.env.API_PROXY_TARGET || 'http://localhost:8080'; }
function internalApiKey() { return process.env.NOVEL_INTERNAL_API_KEY || (process.env.NODE_ENV !== 'production' ? 'local-novel-internal-key' : ''); }
function setSessionCookies(response: NextResponse, sessionId: string, csrfToken: string) {
  const secure=process.env.NODE_ENV==='production';
  response.cookies.set(NOVEL_SESSION_COOKIE,sessionId,{httpOnly:true,sameSite:'lax',secure,path:'/',maxAge:8*60*60});
  response.cookies.set(NOVEL_CSRF_COOKIE,csrfToken,{httpOnly:false,sameSite:'lax',secure,path:'/',maxAge:8*60*60});
}
function clearSessionResponse() {
  const response=NextResponse.json({code:200,msg:'ok',data:null});
  response.cookies.set(NOVEL_SESSION_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});
  response.cookies.set(NOVEL_CSRF_COOKIE,'',{httpOnly:false,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});
  return response;
}
