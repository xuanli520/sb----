import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authRateLimitScope,
  AuthRateLimitUnavailableError,
  configuredAuthRateLimitSettings,
  RedisNovelAuthRateLimiter,
} from './bff-auth-rate-limit';

type StoredCounter = { count: number; expiresAt: number };

class SharedRedisData {
  readonly values = new Map<string, StoredCounter>();
}

class FakeRedisClient {
  readonly scripts: string[] = [];

  constructor(private readonly data: SharedRedisData, private readonly now: () => number) {}

  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    this.scripts.push(script);
    const [key] = options.keys;
    const windowSeconds = Number(options.arguments[0]);
    if (!key || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) throw new Error('invalid test command');

    const existing = this.data.values.get(key);
    const record = existing && existing.expiresAt > this.now()
      ? existing
      : { count: 0, expiresAt: this.now() + windowSeconds * 1_000 };
    record.count += 1;
    this.data.values.set(key, record);
    return [record.count, Math.max(1, Math.ceil((record.expiresAt - this.now()) / 1_000))];
  }
}

function settings(overrides: Partial<ConstructorParameters<typeof RedisNovelAuthRateLimiter>[1]> = {}) {
  return {
    loginLimit: 2,
    registerLimit: 1,
    windowSeconds: 10,
    prefix: 'test:bff:auth-rate-limit:',
    ...overrides,
  };
}

describe('BFF authentication rate limiting', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows the exact action boundary, partitions registration, and uses one Redis Lua call per attempt', async () => {
    const shared = new SharedRedisData();
    const client = new FakeRedisClient(shared, () => 1_000);
    const limiter = new RedisNovelAuthRateLimiter(client, settings());

    await expect(limiter.consume('login', 'identifier:reader')).resolves.toEqual({ allowed: true, retryAfterSeconds: 10 });
    await expect(limiter.consume('login', 'identifier:reader')).resolves.toEqual({ allowed: true, retryAfterSeconds: 10 });
    await expect(limiter.consume('login', 'identifier:reader')).resolves.toEqual({ allowed: false, retryAfterSeconds: 10 });
    await expect(limiter.consume('register', 'identifier:reader')).resolves.toEqual({ allowed: true, retryAfterSeconds: 10 });

    expect(client.scripts).toHaveLength(4);
    expect(client.scripts.every(script => script.includes("redis.call('INCR'"))).toBe(true);
    expect([...shared.values.keys()]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^test:bff:auth-rate-limit:login:/),
      expect.stringMatching(/^test:bff:auth-rate-limit:register:/),
    ]));
    expect([...shared.values.keys()].join('|')).not.toContain('reader');
  });

  it('expires a fixed window instead of extending it when a denied caller retries', async () => {
    let now = 1_000;
    const shared = new SharedRedisData();
    const limiter = new RedisNovelAuthRateLimiter(new FakeRedisClient(shared, () => now), settings({ loginLimit: 1 }));

    await expect(limiter.consume('login', 'identifier:reader')).resolves.toMatchObject({ allowed: true });
    now += 5_000;
    await expect(limiter.consume('login', 'identifier:reader')).resolves.toMatchObject({ allowed: false, retryAfterSeconds: 5 });
    now += 5_000;
    await expect(limiter.consume('login', 'identifier:reader')).resolves.toEqual({ allowed: true, retryAfterSeconds: 10 });
  });

  it('shares a Redis bucket across independently constructed BFF limiter instances', async () => {
    const shared = new SharedRedisData();
    const firstWorker = new RedisNovelAuthRateLimiter(new FakeRedisClient(shared, () => 1_000), settings());
    const secondWorker = new RedisNovelAuthRateLimiter(new FakeRedisClient(shared, () => 1_000), settings());

    await expect(firstWorker.consume('login', 'identifier:reader')).resolves.toMatchObject({ allowed: true });
    await expect(secondWorker.consume('login', 'identifier:reader')).resolves.toMatchObject({ allowed: true });
    await expect(secondWorker.consume('login', 'identifier:reader')).resolves.toMatchObject({ allowed: false });
  });

  it('normalizes the submitted identifier and ignores spoofable forwarding headers by default', () => {
    const first = new Headers({ 'x-forwarded-for': '203.0.113.10' });
    const second = new Headers({ 'x-forwarded-for': '198.51.100.45' });

    expect(authRateLimitScope(first, ' Reader@Example.Test ', false)).toBe('identifier:reader@example.test');
    expect(authRateLimitScope(second, 'reader@example.test', false)).toBe('identifier:reader@example.test');
    expect(authRateLimitScope(first, 'reader@example.test', true)).toBe('identifier:reader@example.test;network:203.0.113.10');
    expect(authRateLimitScope(new Headers({ 'x-forwarded-for': 'not-an-ip' }), 'reader@example.test', true)).toBe('identifier:reader@example.test');
    expect(authRateLimitScope(first, 'not a valid login name', false)).toBe('identifier:invalid');
  });

  it('has explicit local behavior and rejects malformed or weakening production configuration', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_ENABLED', '');
    expect(configuredAuthRateLimitSettings()).toMatchObject({ enabled: false });
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_ENABLED', 'true');
    vi.stubEnv('NOVEL_SESSION_REDIS_URL', 'redis://redis.example.test:6379/0');
    expect(configuredAuthRateLimitSettings()).toMatchObject({ enabled: true });

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_ENABLED', '');
    expect(configuredAuthRateLimitSettings()).toMatchObject({
      enabled: true,
      loginLimit: 10,
      registerLimit: 5,
      windowSeconds: 900,
      prefix: 'novel:bff:auth-rate-limit:',
    });

    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_WINDOW_SECONDS', '0');
    expect(() => configuredAuthRateLimitSettings()).toThrow(AuthRateLimitUnavailableError);
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_WINDOW_SECONDS', '900');
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_REDIS_PREFIX', 'invalid prefix with spaces');
    expect(() => configuredAuthRateLimitSettings()).toThrow(AuthRateLimitUnavailableError);
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_REDIS_PREFIX', 'test:auth:');
    vi.stubEnv('NOVEL_AUTH_RATE_LIMIT_ENABLED', 'false');
    expect(() => configuredAuthRateLimitSettings()).toThrow(AuthRateLimitUnavailableError);
  });

  it('treats malformed Lua responses as a fail-closed Redis failure', async () => {
    const limiter = new RedisNovelAuthRateLimiter({ eval: vi.fn().mockResolvedValue(['not-a-count']) }, settings());

    await expect(limiter.consume('login', 'identifier:reader')).rejects.toThrow(AuthRateLimitUnavailableError);
  });
});
