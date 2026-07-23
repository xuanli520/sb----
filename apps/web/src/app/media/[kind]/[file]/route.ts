import { NextRequest } from 'next/server';

const MEDIA_KIND = /^(covers|banners)$/;
const MEDIA_FILE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(png|jpg)$/;

/**
 * Development fallback for the immutable media URLs served directly by Nginx in Compose.
 * It deliberately accepts the same small URL grammar so a local Next server never turns into
 * a general-purpose object-store proxy.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ kind: string; file: string }> },
) {
  const { kind, file } = await context.params;
  if (!MEDIA_KIND.test(kind) || !MEDIA_FILE.test(file)) {
    return new Response(null, { status: 404 });
  }

  const target = new URL(
    `/api/v1/public/media/${kind}/${encodeURIComponent(file)}`,
    process.env.API_PROXY_TARGET || 'http://localhost:8080',
  );
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: 'image/png,image/jpeg' },
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'x-content-type-options']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}

