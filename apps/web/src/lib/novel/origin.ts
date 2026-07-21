import type { NextRequest } from 'next/server';

function loopback(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Production uses the externally configured origin when present. The loopback exception exists
 * only for local Next development, where Next can canonicalize 127.0.0.1 to localhost.
 */
export function hasTrustedSameOrigin(request: NextRequest) {
  // Browsers send Origin for fetch/XHR writes. Referer is a strict same-origin fallback for
  // compatible form navigations, never an unchecked URL prefix comparison.
  const source = request.headers.get('origin') || request.headers.get('referer');
  if (!source) return false;
  let actual: URL;
  try {
    actual = new URL(source);
  } catch {
    return false;
  }

  const configuredOrigin = process.env.NOVEL_PUBLIC_ORIGIN;
  if (configuredOrigin) {
    try {
      const configured = new URL(configuredOrigin);
      if (process.env.NODE_ENV === 'production' && configured.protocol !== 'https:') return false;
      return actual.origin === configured.origin;
    } catch {
      return false;
    }
  }
  // Production must name its public HTTPS origin explicitly. Trusting an arbitrary Host header
  // behind a reverse proxy weakens the CSRF boundary and is not a deployable D-12 configuration.
  if (process.env.NODE_ENV === 'production') return false;
  if (actual.origin === request.nextUrl.origin) return true;

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
