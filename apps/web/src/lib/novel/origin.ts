import type { NextRequest } from 'next/server';

function loopback(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Production uses the externally configured origin when present. The loopback exception exists
 * only for local Next development, where Next can canonicalize 127.0.0.1 to localhost.
 */
export function hasTrustedSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let actual: URL;
  try {
    actual = new URL(origin);
  } catch {
    return false;
  }

  const configuredOrigin = process.env.NOVEL_PUBLIC_ORIGIN;
  if (configuredOrigin) {
    try {
      return actual.origin === new URL(configuredOrigin).origin;
    } catch {
      return false;
    }
  }
  if (actual.origin === request.nextUrl.origin) return true;
  if (process.env.NODE_ENV === 'production') return false;

  const host = request.headers.get('host');
  if (!host) return false;
  try {
    const requestUrl = new URL(`${request.nextUrl.protocol}//${host}`);
    return loopback(actual.hostname) && loopback(requestUrl.hostname)
      && actual.protocol === requestUrl.protocol && actual.port === requestUrl.port;
  } catch {
    return false;
  }
}
