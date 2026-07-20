import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { API_ENDPOINTS } from '@/config/api';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '@/lib/auth/constants';
import { verifyAccessCookieToken } from '@/lib/auth/server';

const protectedRoutes = [
  '/compass',
  '/dashboard',
  '/data-center',
  '/metric-detail',
  '/data-source',
  '/scraping-rule',
  '/task-schedule',
  '/agent-workbench',
  '/user-permission',
  '/admin',
  '/profile',
  '/system-settings',
];

const publicRoutes = ['/login', '/register'];

function isRouteMatch(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function splitSetCookieHeader(value: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < value.length; index++) {
    if (!inExpires && value.slice(index, index + 8).toLowerCase() === 'expires=') {
      inExpires = true;
      index += 7;
      continue;
    }

    if (inExpires && value[index] === ';') {
      inExpires = false;
      continue;
    }

    if (value[index] !== ',') {
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < value.length && value[nextIndex] === ' ') {
      nextIndex++;
    }

    const equalsIndex = value.indexOf('=', nextIndex);
    const semicolonIndex = value.indexOf(';', nextIndex);
    if (equalsIndex === -1 || (semicolonIndex !== -1 && equalsIndex > semicolonIndex)) {
      continue;
    }

    const cookie = value.slice(start, index).trim();
    if (cookie) {
      cookies.push(cookie);
    }
    start = nextIndex;
  }

  const lastCookie = value.slice(start).trim();
  if (lastCookie) {
    cookies.push(lastCookie);
  }

  return cookies;
}

function applySetCookieHeaders(source: Headers, target: Headers): void {
  const sourceWithHelpers = source as Headers & { getSetCookie?: () => string[] };
  if (typeof sourceWithHelpers.getSetCookie === 'function') {
    const setCookies = sourceWithHelpers.getSetCookie();
    if (setCookies.length > 0) {
      setCookies.forEach((value) => target.append('set-cookie', value));
      return;
    }
  }

  let appended = false;
  source.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      return;
    }

    appended = true;
    splitSetCookieHeader(value).forEach((cookie) => {
      target.append('set-cookie', cookie);
    });
  });

  if (appended) {
    return;
  }

  const rawSetCookie = source.get('set-cookie');
  if (!rawSetCookie) {
    return;
  }

  splitSetCookieHeader(rawSetCookie).forEach((cookie) => {
    target.append('set-cookie', cookie);
  });
}

function buildLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function buildDashboardRedirect(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL('/compass', request.url));
}

async function recoverSession(request: NextRequest): Promise<{
  recovered: boolean;
  headers: Headers;
}> {
  const refreshUrl = new URL(API_ENDPOINTS.JWT_REFRESH, request.url);
  const refreshResponse = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
    cache: 'no-store',
  });

  return {
    recovered: refreshResponse.ok,
    headers: refreshResponse.headers,
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute = isRouteMatch(pathname, protectedRoutes);
  const isPublicRoute = isRouteMatch(pathname, publicRoutes);

  const accessToken = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const hasValidAccess = await verifyAccessCookieToken(accessToken);
  let recoveryHeaders: Headers | null = null;

  if (hasValidAccess) {
    if (isPublicRoute && pathname === '/login') {
      return buildDashboardRedirect(request);
    }
    return NextResponse.next();
  }

  if (refreshToken) {
    const recovery = await recoverSession(request);
    recoveryHeaders = recovery.headers;

    if (recovery.recovered) {
      const recoveredResponse = NextResponse.next();
      applySetCookieHeaders(recovery.headers, recoveredResponse.headers);
      if (isPublicRoute && pathname === '/login') {
        const redirectResponse = buildDashboardRedirect(request);
        applySetCookieHeaders(recoveredResponse.headers, redirectResponse.headers);
        return redirectResponse;
      }
      return recoveredResponse;
    }
  }

  if (isProtectedRoute) {
    const response = buildLoginRedirect(request);
    if (recoveryHeaders) {
      applySetCookieHeaders(recoveryHeaders, response.headers);
    }
    return response;
  }

  const response = NextResponse.next();
  if (recoveryHeaders) {
    applySetCookieHeaders(recoveryHeaders, response.headers);
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
