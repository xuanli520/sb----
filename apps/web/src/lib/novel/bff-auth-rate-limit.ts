import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from 'redis';

export type AuthRateLimitAction = 'login' | 'register';

export type AuthRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface NovelAuthRateLimiter {
  consume(action: AuthRateLimitAction, scope: string): Promise<AuthRateLimitResult>;
}

export type AuthRateLimitSettings = {
  enabled: boolean;
  loginLimit: number;
  registerLimit: number;
  windowSeconds: number;
  prefix: string;
  redisUrl: string;
  trustProxyHeaders: boolean;
};

/** The only route-visible error for invalid or unavailable authentication rate limiting. */
export class AuthRateLimitUnavailableError extends Error {
  constructor() {
    super('BFF authentication rate limiter is unavailable');
    this.name = 'AuthRateLimitUnavailableError';
  }
}

const REDIS_PREFIX_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const DEFAULT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LOGIN_LIMIT = 10;
const DEFAULT_REGISTER_LIMIT = 5;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const MAX_LIMIT = 10_000;

// The increment, initial expiry, and TTL read must be one Redis operation. Keeping the expiry
// fixed on the first hit prevents an attacker from extending a denied window by retrying.
const CONSUME_AUTH_ATTEMPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = ARGV[1]
end
return { count, ttl }
`;

type RedisRateLimitClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

type ConnectedRedisClient = RedisRateLimitClient & {
  isOpen: boolean;
  connect(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

type RedisConnection = { url: string; client: ConnectedRedisClient; connecting?: Promise<ConnectedRedisClient> };
type RateLimitGlobals = typeof globalThis & {
  __novelAuthRateLimitRedisConnection?: RedisConnection;
};

const rateLimitGlobals = globalThis as RateLimitGlobals;
let testRateLimiter: NovelAuthRateLimiter | undefined;

/**
 * Redis-backed fixed-window rate limiting. Its keys never contain a raw address, username, or
 * credential. Instances are intentionally independent so separate BFF workers share Redis state.
 */
export class RedisNovelAuthRateLimiter implements NovelAuthRateLimiter {
  constructor(
    private readonly client: RedisRateLimitClient,
    private readonly settings: Pick<AuthRateLimitSettings, 'loginLimit' | 'registerLimit' | 'windowSeconds' | 'prefix'>,
    private readonly onUnavailable?: () => void,
  ) {}

  async consume(action: AuthRateLimitAction, scope: string): Promise<AuthRateLimitResult> {
    const limit = action === 'login' ? this.settings.loginLimit : this.settings.registerLimit;
    const key = rateLimitKey(this.settings.prefix, action, scope);
    try {
      const reply = await this.client.eval(CONSUME_AUTH_ATTEMPT, {
        keys: [key],
        arguments: [String(this.settings.windowSeconds)],
      });
      const [count, ttl] = parseConsumeReply(reply);
      return { allowed: count <= limit, retryAfterSeconds: ttl };
    } catch {
      this.onUnavailable?.();
      throw new AuthRateLimitUnavailableError();
    }
  }
}

/**
 * Local development and test runs default to no limiter so they do not need Redis. A deployable
 * runtime defaults to enabled and rejects an explicit false value rather than silently weakening
 * the login boundary. When enabled, Redis errors are fail-closed at the route with a 503.
 */
export function configuredAuthRateLimitSettings(): AuthRateLimitSettings {
  const enabled = configuredEnabled();
  if (!enabled) {
    return {
      enabled: false,
      loginLimit: DEFAULT_LOGIN_LIMIT,
      registerLimit: DEFAULT_REGISTER_LIMIT,
      windowSeconds: DEFAULT_WINDOW_SECONDS,
      prefix: 'novel:bff:auth-rate-limit:',
      redisUrl: '',
      trustProxyHeaders: false,
    };
  }

  const prefix = process.env.NOVEL_AUTH_RATE_LIMIT_REDIS_PREFIX || 'novel:bff:auth-rate-limit:';
  if (!REDIS_PREFIX_PATTERN.test(prefix)) throw new AuthRateLimitUnavailableError();

  return {
    enabled: true,
    loginLimit: configuredPositiveInteger('NOVEL_AUTH_RATE_LIMIT_LOGIN_LIMIT', DEFAULT_LOGIN_LIMIT, MAX_LIMIT),
    registerLimit: configuredPositiveInteger('NOVEL_AUTH_RATE_LIMIT_REGISTER_LIMIT', DEFAULT_REGISTER_LIMIT, MAX_LIMIT),
    windowSeconds: configuredPositiveInteger('NOVEL_AUTH_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_WINDOW_SECONDS, MAX_WINDOW_SECONDS),
    prefix,
    redisUrl: validatedRedisUrl(process.env.NOVEL_AUTH_RATE_LIMIT_REDIS_URL || process.env.NOVEL_SESSION_REDIS_URL),
    trustProxyHeaders: configuredBoolean('NOVEL_AUTH_RATE_LIMIT_TRUSTED_PROXY_HEADERS', false),
  };
}

/** Returns an allow decision when local development/test has not explicitly enabled Redis limiting. */
export async function consumeNovelAuthRateLimit(
  action: AuthRateLimitAction,
  username: string,
  headers: Pick<Headers, 'get'>,
): Promise<AuthRateLimitResult> {
  if (testRateLimiter) return testRateLimiter.consume(action, authRateLimitScope(headers, username, false));

  const settings = configuredAuthRateLimitSettings();
  if (!settings.enabled) return { allowed: true, retryAfterSeconds: 0 };

  const client = await connectedRedisClient(settings.redisUrl);
  const limiter = new RedisNovelAuthRateLimiter(client, settings, () => forgetRedisConnection(settings.redisUrl, client));
  return limiter.consume(action, authRateLimitScope(headers, username, settings.trustProxyHeaders));
}

/** Test-only injection keeps route tests independent of a local Redis daemon. */
export function setNovelAuthRateLimiterForTests(limiter: NovelAuthRateLimiter | undefined) {
  testRateLimiter = limiter;
}

/**
 * Every action is scoped to the normalized submitted login name. This avoids one client exhausting
 * the entire login surface, while keeping the limiter independent from account state: it never
 * reads, changes, or reports whether that name exists. Next's standard Node request API has no
 * verified peer address, so X-Forwarded-For is ignored unless an operator explicitly enables
 * trusted proxy headers and configures the ingress to overwrite client-supplied values.
 */
export function authRateLimitScope(headers: Pick<Headers, 'get'>, username: string, trustProxyHeaders: boolean) {
  const identity = `identifier:${normalizedSubmittedLoginName(username)}`;
  if (!trustProxyHeaders) return identity;
  const candidate = headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  return candidate && candidate.length <= 64 && isIP(candidate) !== 0
    ? `${identity};network:${candidate}`
    : identity;
}

function configuredEnabled() {
  const raw = process.env.NOVEL_AUTH_RATE_LIMIT_ENABLED;
  if (raw === undefined || raw.trim() === '') return !isLocalDevelopmentRuntime();
  const enabled = parseBoolean(raw);
  if (!enabled && !isLocalDevelopmentRuntime()) throw new AuthRateLimitUnavailableError();
  return enabled;
}

function configuredBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return parseBoolean(raw);
}

function parseBoolean(raw: string) {
  if (raw.trim().toLowerCase() === 'true') return true;
  if (raw.trim().toLowerCase() === 'false') return false;
  throw new AuthRateLimitUnavailableError();
}

function configuredPositiveInteger(name: string, fallback: number, max: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^[1-9]\d*$/.test(raw.trim())) throw new AuthRateLimitUnavailableError();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) throw new AuthRateLimitUnavailableError();
  return value;
}

function validatedRedisUrl(value: string | undefined) {
  if (!value) throw new AuthRateLimitUnavailableError();
  try {
    const url = new URL(value);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') throw new Error('unsupported protocol');
    return value;
  } catch {
    throw new AuthRateLimitUnavailableError();
  }
}

function rateLimitKey(prefix: string, action: AuthRateLimitAction, scope: string) {
  // A keyed digest prevents Redis readers from dictionary-reversing low-entropy login names. The
  // action participates in the digest too, so login and registration cannot be correlated by it.
  const digest = createHmac('sha256', rateLimitHashKey()).update(`${action}\u0000${scope}`).digest('base64url');
  return `${prefix}${action}:${digest}`;
}

function normalizedSubmittedLoginName(username: string) {
  const normalized = username.trim().toLowerCase();
  // This is deliberately aligned with the backend request contract. Invalid values share a
  // bounded bucket rather than creating unbounded attacker-controlled Redis key space.
  return /^[A-Za-z0-9._@+-]{3,120}$/.test(normalized) ? normalized : 'invalid';
}

function rateLimitHashKey() {
  const key = process.env.NOVEL_INTERNAL_API_KEY;
  if (key) return key;
  if (isLocalDevelopmentRuntime()) return 'local-novel-auth-rate-limit-key';
  throw new AuthRateLimitUnavailableError();
}

function parseConsumeReply(reply: unknown): [number, number] {
  if (!Array.isArray(reply) || reply.length !== 2) throw new AuthRateLimitUnavailableError();
  const count = integerReply(reply[0]);
  const ttl = integerReply(reply[1]);
  if (!count || !ttl) throw new AuthRateLimitUnavailableError();
  return [count, ttl];
}

function integerReply(value: unknown) {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function isLocalDevelopmentRuntime() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

async function connectedRedisClient(url: string): Promise<ConnectedRedisClient> {
  const current = rateLimitGlobals.__novelAuthRateLimitRedisConnection;
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
      if (rateLimitGlobals.__novelAuthRateLimitRedisConnection === connection) delete rateLimitGlobals.__novelAuthRateLimitRedisConnection;
      throw new AuthRateLimitUnavailableError();
    },
  );
  rateLimitGlobals.__novelAuthRateLimitRedisConnection = connection;
  return connection.connecting;
}

function forgetRedisConnection(url: string, client: ConnectedRedisClient) {
  const current = rateLimitGlobals.__novelAuthRateLimitRedisConnection;
  if (current?.url === url && current.client === client) delete rateLimitGlobals.__novelAuthRateLimitRedisConnection;
}
