import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hasTrustedSameOrigin } from './origin';

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers });
}

describe('novel BFF trusted origin policy', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts only the exact request origin when no explicit public origin is configured', () => {
    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session', {
      origin: 'https://reader.example.test',
    }))).toBe(true);

    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session', {
      origin: 'https://reader.example.test.evil.test',
    }))).toBe(false);
    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session', {
      origin: 'http://reader.example.test',
    }))).toBe(false);
    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session'))).toBe(false);
  });

  it('uses the explicitly configured public origin and rejects lookalikes', () => {
    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'https://novel.example.test');

    expect(hasTrustedSameOrigin(request('https://internal.example.test/api/novel/session', {
      origin: 'https://novel.example.test',
    }))).toBe(true);
    expect(hasTrustedSameOrigin(request('https://internal.example.test/api/novel/session', {
      origin: 'https://novel.example.test.attacker.test',
    }))).toBe(false);
  });

  it('accepts an exact Referer origin when Origin is absent', () => {
    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session', {
      referer: 'https://reader.example.test/account?tab=settings',
    }))).toBe(true);
    expect(hasTrustedSameOrigin(request('https://reader.example.test/api/novel/session', {
      referer: 'https://reader.example.test.attacker.test/account',
    }))).toBe(false);
  });

  it('allows same-port loopback aliases only outside production', () => {
    const aliasRequest = request('http://localhost:3000/api/novel/session', {
      origin: 'http://127.0.0.1:3000',
      host: 'localhost:3000',
    });
    expect(hasTrustedSameOrigin(aliasRequest)).toBe(true);

    expect(hasTrustedSameOrigin(request('http://localhost:3000/api/novel/session', {
      origin: 'http://127.0.0.1:3001',
      host: 'localhost:3000',
    }))).toBe(false);

    vi.stubEnv('NODE_ENV', 'production');
    expect(hasTrustedSameOrigin(aliasRequest)).toBe(false);
  });

  it('requires an explicit HTTPS public origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const requestWithOrigin = request('https://reader.example.test/api/novel/session', {
      origin: 'https://reader.example.test',
    });
    expect(hasTrustedSameOrigin(requestWithOrigin)).toBe(false);

    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'http://reader.example.test');
    expect(hasTrustedSameOrigin(requestWithOrigin)).toBe(false);

    vi.stubEnv('NOVEL_PUBLIC_ORIGIN', 'https://reader.example.test');
    expect(hasTrustedSameOrigin(requestWithOrigin)).toBe(true);
  });
});
