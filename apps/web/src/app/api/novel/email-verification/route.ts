import { NextRequest, NextResponse } from 'next/server';
import { consumeNovelAuthRateLimit } from '@/lib/novel/bff-auth-rate-limit';
import { hasTrustedSameOrigin } from '@/lib/novel/origin';

export const runtime = 'nodejs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type BackendVerificationResponse = { code?: number; msg?: string; data?: { expiresAt?: string } };

/** Browser-safe entry point for a real SMTP-backed email verification request. */
export async function POST(request: NextRequest) {
  if (!hasTrustedSameOrigin(request)) return response(403, 'invalid request origin');
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return response(400, 'a valid email address is required');

  try {
    const rateLimit = await consumeNovelAuthRateLimit('register', email, request.headers);
    if (!rateLimit.allowed) return response(429, 'too many authentication attempts', undefined, {
      'retry-after': String(Math.max(1, rateLimit.retryAfterSeconds)),
    });
  } catch {
    return response(503, 'BFF authentication rate limiter is unavailable');
  }

  const internalKey = internalApiKey();
  if (!internalKey) return response(503, 'BFF internal key is not configured');
  try {
    const upstream = await fetch(new URL('/api/v1/auth/email-verification', apiTarget()), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Novel-Internal-Key': internalKey },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });
    const payload = await upstream.json().catch(() => ({})) as BackendVerificationResponse;
    if (!upstream.ok) {
      // Never propagate provider diagnostics, transport details, or a verification secret.
      const message = payload.msg === 'email verification service is unavailable'
        ? payload.msg
        : 'email verification request failed';
      return response(payload.code || upstream.status, message);
    }
    const expiresAt = typeof payload.data?.expiresAt === 'string' ? payload.data.expiresAt : undefined;
    return response(200, 'verification email sent', expiresAt ? { expiresAt } : {});
  } catch {
    return response(502, 'email verification service is unavailable');
  }
}

function response(status: number, msg: string, data: Record<string, unknown> | undefined = undefined, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { code: status, msg, data: data ?? null },
    { status, headers: { 'cache-control': 'no-store', ...headers } },
  );
}

function isEmail(value: string) {
  return value.length <= 120 && EMAIL_PATTERN.test(value);
}

function apiTarget() {
  return process.env.API_PROXY_TARGET || 'http://localhost:8080';
}

function internalApiKey() {
  return process.env.NOVEL_INTERNAL_API_KEY || (process.env.NODE_ENV !== 'production' ? 'local-novel-internal-key' : '');
}
