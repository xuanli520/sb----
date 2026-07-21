import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from 'redis';

export const NOVEL_SESSION_COOKIE = 'novel_session';
export const NOVEL_CSRF_COOKIE = 'novel_csrf';
export const DEFAULT_NOVEL_SESSION_TTL_SECONDS = 8 * 60 * 60;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const REDIS_PREFIX_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

export type SessionRole = 'reader' | 'author' | 'admin';

export type NovelBffSession =
  | { kind: 'backend'; backendSessionId: string; csrfToken: string }
  | { kind: 'development'; role: SessionRole; csrfToken: string };

export interface NovelSessionStore {
  create(session: NovelBffSession, ttlSeconds: number): Promise<string>;
  read(sessionId: string | undefined): Promise<NovelBffSession | undefined>;
  delete(sessionId: string | undefined): Promise<void>;
}

/** The only route-visible error for an unavailable or invalid session backend. */
export class SessionStoreUnavailableError extends Error {
  constructor() {
    super('BFF session storage is unavailable');
    this.name = 'SessionStoreUnavailableError';
  }
}

type RedisSessionClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

type ConnectedRedisClient = RedisSessionClient & {
  isOpen: boolean;
  connect(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

type MemoryRecord = { session: NovelBffSession; expiresAt: number };

/**
 * This implementation is deliberately not selected by default. It is available only when a
 * local developer explicitly opts in with NOVEL_SESSION_STORE=memory, or through test injection.
 */
export class InMemoryNovelSessionStore implements NovelSessionStore {
  private readonly records = new Map<string, MemoryRecord>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly newSessionId: () => string = createSessionId,
  ) {}

  async create(session: NovelBffSession, ttlSeconds: number) {
    const normalized = normalizeSession(session);
    if (!normalized || !isValidTtl(ttlSeconds)) throw new SessionStoreUnavailableError();
    const sessionId = this.newSessionId();
    if (!isSessionId(sessionId)) throw new SessionStoreUnavailableError();
    this.records.set(sessionId, { session: normalized, expiresAt: this.now() + ttlSeconds * 1_000 });
    return sessionId;
  }

  async read(sessionId: string | undefined) {
    if (!isSessionId(sessionId)) return undefined;
    const record = this.records.get(sessionId);
    if (!record) return undefined;
    if (record.expiresAt <= this.now()) {
      this.records.delete(sessionId);
      return undefined;
    }
    return record.session;
  }

  async delete(sessionId: string | undefined) {
    if (isSessionId(sessionId)) this.records.delete(sessionId);
  }
}

/** A Redis-backed store can be instantiated independently by multiple Next.js workers. */
export class RedisNovelSessionStore implements NovelSessionStore {
  constructor(
    private readonly client: RedisSessionClient,
    private readonly prefix: string = defaultRedisPrefix(),
    private readonly newSessionId: () => string = createSessionId,
    private readonly onUnavailable?: () => void,
  ) {}

  async create(session: NovelBffSession, ttlSeconds: number) {
    const normalized = normalizeSession(session);
    if (!normalized || !isValidTtl(ttlSeconds)) throw new SessionStoreUnavailableError();
    const sessionId = this.newSessionId();
    if (!isSessionId(sessionId)) throw new SessionStoreUnavailableError();
    try {
      await this.client.set(this.key(sessionId), JSON.stringify(normalized), { EX: ttlSeconds });
      return sessionId;
    } catch {
      this.onUnavailable?.();
      throw new SessionStoreUnavailableError();
    }
  }

  async read(sessionId: string | undefined) {
    if (!isSessionId(sessionId)) return undefined;
    try {
      const value = await this.client.get(this.key(sessionId));
      if (!value) return undefined;
      const session = parseSession(value);
      if (!session) {
        await this.client.del(this.key(sessionId));
        return undefined;
      }
      return session;
    } catch {
      this.onUnavailable?.();
      throw new SessionStoreUnavailableError();
    }
  }

  async delete(sessionId: string | undefined) {
    if (!isSessionId(sessionId)) return;
    try {
      await this.client.del(this.key(sessionId));
    } catch {
      this.onUnavailable?.();
      throw new SessionStoreUnavailableError();
    }
  }

  private key(sessionId: string) {
    return `${this.prefix}${sessionId}`;
  }
}

type RedisConnection = { url: string; client: ConnectedRedisClient; connecting?: Promise<ConnectedRedisClient> };
type NovelSessionGlobals = typeof globalThis & {
  __novelMemorySessionStore?: InMemoryNovelSessionStore;
  __novelRedisSessionConnection?: RedisConnection;
};

const sessionGlobals = globalThis as NovelSessionGlobals;
let testSessionStore: NovelSessionStore | undefined;

/**
 * Redis is the default for every deployable runtime. A process-local store is intentionally
 * opt-in and accepted only by local development/test runtimes so a replica deployment cannot
 * silently lose sessions.
 */
export async function getNovelSessionStore(): Promise<NovelSessionStore> {
  if (testSessionStore) return testSessionStore;

  const mode = (process.env.NOVEL_SESSION_STORE || 'redis').trim().toLowerCase();
  if (mode === 'memory') {
    if (!isLocalDevelopmentRuntime()) throw new SessionStoreUnavailableError();
    return sessionGlobals.__novelMemorySessionStore ??= new InMemoryNovelSessionStore();
  }
  if (mode !== 'redis') throw new SessionStoreUnavailableError();

  const url = validatedRedisUrl(process.env.NOVEL_SESSION_REDIS_URL);
  const prefix = defaultRedisPrefix();
  const client = await connectedRedisClient(url);
  return new RedisNovelSessionStore(client, prefix, createSessionId, () => forgetRedisConnection(url, client));
}

/** Test-only dependency injection keeps route tests independent of a local Redis daemon. */
export function setNovelSessionStoreForTests(store: NovelSessionStore | undefined) {
  testSessionStore = store;
}

export function developmentLoginAllowed() {
  return isLocalDevelopmentRuntime() && process.env.NOVEL_DEV_LOGIN_ENABLED === 'true';
}

export function createCsrfToken() {
  return randomBytes(24).toString('base64url');
}

export function csrfTokensMatch(expected: string, actual: string | null | undefined) {
  if (!actual || expected.length !== actual.length || !CSRF_TOKEN_PATTERN.test(expected) || !CSRF_TOKEN_PATTERN.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function configuredSessionTtlSeconds() {
  const raw = process.env.NOVEL_SESSION_TTL_SECONDS;
  if (!raw) return DEFAULT_NOVEL_SESSION_TTL_SECONDS;
  const ttl = Number(raw);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > DEFAULT_NOVEL_SESSION_TTL_SECONDS) throw new SessionStoreUnavailableError();
  return ttl;
}

export function sessionTtlFromBackendExpiry(expiresAt: string | undefined) {
  if (!expiresAt) return undefined;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return undefined;
  const remainingSeconds = Math.floor((expiry - Date.now()) / 1_000);
  if (remainingSeconds < 1) return undefined;
  return Math.min(configuredSessionTtlSeconds(), remainingSeconds);
}

function createSessionId() {
  return randomBytes(32).toString('base64url');
}

function isSessionId(value: string | undefined): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

function isValidTtl(ttlSeconds: number) {
  return Number.isSafeInteger(ttlSeconds) && ttlSeconds > 0 && ttlSeconds <= DEFAULT_NOVEL_SESSION_TTL_SECONDS;
}

function normalizeSession(session: NovelBffSession): NovelBffSession | undefined {
  if (!CSRF_TOKEN_PATTERN.test(session.csrfToken)) return undefined;
  if (session.kind === 'backend' && typeof session.backendSessionId === 'string' && session.backendSessionId.length > 0 && session.backendSessionId.length <= 4_096) {
    return { kind: 'backend', backendSessionId: session.backendSessionId, csrfToken: session.csrfToken };
  }
  if (session.kind === 'development' && isSessionRole(session.role)) {
    return { kind: 'development', role: session.role, csrfToken: session.csrfToken };
  }
  return undefined;
}

function parseSession(value: string): NovelBffSession | undefined {
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== 'object') return undefined;
    return normalizeSession(candidate as NovelBffSession);
  } catch {
    return undefined;
  }
}

function isSessionRole(role: unknown): role is SessionRole {
  return role === 'reader' || role === 'author' || role === 'admin';
}

function isLocalDevelopmentRuntime() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

function validatedRedisUrl(value: string | undefined) {
  if (!value) throw new SessionStoreUnavailableError();
  try {
    const url = new URL(value);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') throw new Error('unsupported protocol');
    return value;
  } catch {
    throw new SessionStoreUnavailableError();
  }
}

function defaultRedisPrefix() {
  const prefix = process.env.NOVEL_SESSION_REDIS_PREFIX || 'novel:bff:session:';
  if (!REDIS_PREFIX_PATTERN.test(prefix)) throw new SessionStoreUnavailableError();
  return prefix;
}

async function connectedRedisClient(url: string): Promise<ConnectedRedisClient> {
  const current = sessionGlobals.__novelRedisSessionConnection;
  if (current?.url === url) {
    if (current.client.isOpen) return current.client;
    if (current.connecting) return current.connecting;
  }

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 5_000, reconnectStrategy: false },
  }) as unknown as ConnectedRedisClient;
  client.on('error', () => undefined);
  const connection: RedisConnection = { url, client };
  connection.connecting = client.connect().then(
    () => {
      connection.connecting = undefined;
      return client;
    },
    () => {
      if (sessionGlobals.__novelRedisSessionConnection === connection) delete sessionGlobals.__novelRedisSessionConnection;
      throw new SessionStoreUnavailableError();
    },
  );
  sessionGlobals.__novelRedisSessionConnection = connection;
  return connection.connecting;
}

function forgetRedisConnection(url: string, client: ConnectedRedisClient) {
  const current = sessionGlobals.__novelRedisSessionConnection;
  if (current?.url === url && current.client === client) delete sessionGlobals.__novelRedisSessionConnection;
}
