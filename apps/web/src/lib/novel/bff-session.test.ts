import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCsrfToken,
  getNovelSessionStore,
  InMemoryNovelSessionStore,
  RedisNovelSessionStore,
  setNovelSessionStoreForTests,
} from './bff-session';

type StoredValue = { value: string; expiresAt: number };

class SharedRedisData {
  readonly values = new Map<string, StoredValue>();
}

class FakeRedisClient {
  constructor(private readonly data: SharedRedisData, private readonly now: () => number) {}

  async set(key: string, value: string, options: { EX: number }) {
    this.data.values.set(key, { value, expiresAt: this.now() + options.EX * 1_000 });
    return 'OK';
  }

  async get(key: string) {
    const record = this.data.values.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.now()) {
      this.data.values.delete(key);
      return null;
    }
    return record.value;
  }

  async del(key: string) {
    return this.data.values.delete(key) ? 1 : 0;
  }
}

const sessionIdA = 'a'.repeat(43);
const sessionIdB = 'b'.repeat(43);

describe('BFF session storage', () => {
  afterEach(() => {
    setNovelSessionStoreForTests(undefined);
    vi.unstubAllEnvs();
  });

  it('expires an explicit backend-memory session by its configured TTL', async () => {
    let now = 1_000;
    const store = new InMemoryNovelSessionStore(() => now, () => sessionIdA);
    const csrfToken = createCsrfToken();
    const id = await store.create({ kind: 'backend', backendSessionId: 'backend-session', csrfToken, passwordChangeRequired: false }, 30);

    expect(await store.read(id)).toEqual({ kind: 'backend', backendSessionId: 'backend-session', csrfToken, passwordChangeRequired: false });
    now += 29_999;
    expect(await store.read(id)).toBeDefined();
    now += 1;
    expect(await store.read(id)).toBeUndefined();
  });

  it('uses Redis TTL and shares browser sessions between independent BFF store instances', async () => {
    const now = 10_000;
    const shared = new SharedRedisData();
    const firstWorker = new RedisNovelSessionStore(new FakeRedisClient(shared, () => now), 'test:bff:', () => sessionIdA);
    const secondWorker = new RedisNovelSessionStore(new FakeRedisClient(shared, () => now), 'test:bff:', () => sessionIdB);
    const csrfToken = createCsrfToken();

    const id = await firstWorker.create({ kind: 'backend', backendSessionId: 'backend-only-token', csrfToken, passwordChangeRequired: false }, 45);
    expect(shared.values.get(`test:bff:${id}`)?.expiresAt).toBe(now + 45_000);
    expect(await secondWorker.read(id)).toEqual({ kind: 'backend', backendSessionId: 'backend-only-token', csrfToken, passwordChangeRequired: false });

    await secondWorker.delete(id);
    expect(await firstWorker.read(id)).toBeUndefined();
  });

  it('treats malformed Redis records as missing and removes them before proxying', async () => {
    const now = 10_000;
    const shared = new SharedRedisData();
    const client = new FakeRedisClient(shared, () => now);
    const store = new RedisNovelSessionStore(client, 'test:bff:', () => sessionIdA);
    shared.values.set(`test:bff:${sessionIdA}`, { value: '{"kind":"backend","backendSessionId":42}', expiresAt: now + 60_000 });

    expect(await store.read(sessionIdA)).toBeUndefined();
    expect(shared.values.has(`test:bff:${sessionIdA}`)).toBe(false);
  });

  it.each(['production', 'staging'])('rejects the process-local fallback outside local development (%s)', async (runtime) => {
    vi.stubEnv('NODE_ENV', runtime);
    vi.stubEnv('NOVEL_SESSION_STORE', 'memory');

    await expect(getNovelSessionStore()).rejects.toThrow('BFF session storage is unavailable');
  });
});
