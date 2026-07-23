import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const fetchMock = vi.fn<typeof fetch>();
const validFile = '11111111-1111-1111-1111-111111111111.png';

function request() {
  return new NextRequest(`http://localhost:3000/media/covers/${validFile}`);
}

function context(kind: string, file: string) {
  return { params: Promise.resolve({ kind, file }) };
}

describe('development media proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('API_PROXY_TARGET', 'http://backend.example.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('proxies only a valid immutable cover path and preserves safe media headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('png-bytes', {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=2592000, immutable',
        'x-content-type-options': 'nosniff',
        'x-upstream-debug': 'must-not-reach-browser',
      },
    }));

    const response = await GET(request(), context('covers', validFile));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('png-bytes');
    expect(`${fetchMock.mock.calls[0][0]}`).toBe(
      `http://backend.example.test/api/v1/public/media/covers/${validFile}`,
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Accept: 'image/png,image/jpeg' },
      cache: 'no-store',
    });
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('public, max-age=2592000, immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-upstream-debug')).toBeNull();
  });

  it.each([
    ['other', validFile],
    ['covers', 'not-a-uuid.png'],
    ['covers', '11111111-1111-1111-1111-111111111111.webp'],
    ['covers', '11111111-1111-1111-1111-111111111111.png/extra'],
  ])('rejects an invalid media path without contacting upstream (%s/%s)', async (kind, file) => {
    const response = await GET(request(), context(kind, file));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves an upstream missing asset as a local 404', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const response = await GET(request(), context('banners', validFile));

    expect(response.status).toBe(404);
  });

  it('maps an upstream failure without an image body to 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const response = await GET(request(), context('banners', validFile));

    expect(response.status).toBe(502);
  });

  it('maps a network failure to 503', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'));

    const response = await GET(request(), context('banners', validFile));

    expect(response.status).toBe(503);
  });
});
