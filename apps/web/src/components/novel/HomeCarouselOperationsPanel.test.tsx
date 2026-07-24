import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformBannerAsset } from '@/features/novel/api';
import { HomeCarouselOperationsPanel } from './HomeCarouselOperationsPanel';

const book = {
  id: 7,
  title: '星海拾光',
  author: '林墨',
  category: '科幻',
  words: 286_000,
  synopsis: '在旧港口收到一封来自星海的来信。',
  cover: '#1f6d7a',
  status: 'PUBLISHED',
  serialStatus: '连载中',
  heat: 9_820,
  purchasePrice: 30,
};

const slide = {
  slideId: 41,
  book,
  bannerAssetId: '11111111-1111-1111-1111-111111111111',
  bannerUrl: '/media/banners/11111111-1111-1111-1111-111111111111.png',
  headline: '向星海出发',
  copy: '运营短文案',
  enabled: true,
  rank: 1,
  version: 3,
  createdAt: '2026-07-23T08:00:00Z',
  updatedAt: '2026-07-23T08:00:00Z',
};

const banner = {
  id: '11111111-1111-1111-1111-111111111111',
  ownerScope: 'PLATFORM' as const,
  ownerUserId: null,
  purpose: 'HOME_CAROUSEL_BANNER' as const,
  objectKey: 'banners/11111111-1111-1111-1111-111111111111.png',
  publicUrl: '/media/banners/11111111-1111-1111-1111-111111111111.png',
  sha256: 'a'.repeat(64),
  contentType: 'image/png',
  width: 1600,
  height: 600,
  byteSize: 1024,
  label: '星海横幅',
  state: 'ACTIVE' as const,
  createdAt: '2026-07-23T08:00:00Z',
  updatedAt: '2026-07-23T08:00:00Z',
  archivedAt: null,
  deletedAt: null,
};

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function mockApi(asset: PlatformBannerAsset = banner, total = 1, pickerAsset: PlatformBannerAsset = asset) {
  const carouselBook = { ...book, id: 99, title: '新作品', author: '沈舟' };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/admin/home-carousel') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response([slide]));
    if (path.endsWith('/admin/media/banners?state=ACTIVE&page=0&size=24') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [asset], meta: { total, page: 0, size: 24 } }));
    if (path.endsWith('/admin/media/banners?state=ACTIVE&page=0&size=12') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [pickerAsset], meta: { total: 1, page: 0, size: 12 } }));
    if (path.endsWith('/admin/media/banners?state=ACTIVE&page=0&size=24&query=%E6%98%9F%E6%B5%B7') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [asset], meta: { total: 1, page: 0, size: 24 } }));
    if (path.endsWith('/admin/media/banners?state=ACTIVE&page=1&size=24') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [asset], meta: { total, page: 1, size: 24 } }));
    if (path.endsWith('/admin/home-carousel/books?page=0&size=12') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [carouselBook], meta: { total: 1, page: 0, size: 12 } }));
    if (path.endsWith('/admin/home-carousel/books?page=0&size=12&q=%E6%96%B0%E4%BD%9C') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: [carouselBook], meta: { total: 1, page: 0, size: 12 } }));
    if (path.endsWith('/admin/home-carousel') && init?.method === 'POST') return Promise.resolve(response({ ...slide, slideId: 42, book: { ...book, id: 99, title: '新作品' } }));
    if (path.endsWith('/admin/home-carousel/41') && init?.method === 'PUT') return Promise.resolve(response({ ...slide, enabled: false, version: 4 }));
    if (path.endsWith('/admin/media/banners') && init?.method === 'POST') return Promise.resolve(response({ ...banner, id: '22222222-2222-2222-2222-222222222222', label: '新横幅' }));
    if (path.endsWith('/admin/media/assets/11111111-1111-1111-1111-111111111111/restore') && init?.method === 'POST') return Promise.resolve(response({ ...asset, state: 'ACTIVE' }));
    if (path.endsWith('/admin/home-carousel/audits?limit=20')) return Promise.resolve(response([{
      id: 1, slideId: 41, bookId: 7, action: 'CREATED', details: 'created', operatorUserId: 1, createdAt: '2026-07-23T08:00:00Z',
    }]));
    if (path.endsWith('/admin/media/assets/11111111-1111-1111-1111-111111111111/audits?limit=20')) return Promise.resolve(response([]));
    if (path.endsWith('/admin/media/assets/11111111-1111-1111-1111-111111111111/bindings')) return Promise.resolve(response([]));
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('HomeCarouselOperationsPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the carousel workspace from its two initial resources', async () => {
    mockApi();
    render(<HomeCarouselOperationsPanel />);

    expect(screen.getByRole('heading', { name: '首页作品轮播' })).toBeTruthy();
    expect(await screen.findByText('星海横幅')).toBeTruthy();
  });

  it('creates and toggles carousel slides, uploads banner files, and opens audit history', async () => {
    const fetchMock = mockApi();
    render(<HomeCarouselOperationsPanel />);

    await screen.findByRole('heading', { name: '首页作品轮播' });
    expect(screen.getByText('星海横幅')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: '选择轮播作品' })[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel/books?page=0&size=12', expect.anything()));
    fireEvent.change(screen.getByLabelText('搜索已发布作品'), { target: { value: '新作' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel/books?page=0&size=12&q=%E6%96%B0%E4%BD%9C', expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: '选择作品 新作品' }));
    fireEvent.click(screen.getByRole('button', { name: '添加轮播' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ bookId: 99, enabled: true }),
    })), { timeout: 750 });

    fireEvent.click(screen.getByRole('switch', { name: '星海拾光 首页轮播已启用' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel/41', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        bookId: 7,
        bannerAssetId: banner.id,
        headline: '向星海出发',
        copy: '运营短文案',
        enabled: false,
        rank: 1,
        version: 3,
      }),
    })), { timeout: 750 });

    const file = new File(['banner'], 'banner.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('上传轮播横幅'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('横幅素材名称'), { target: { value: '新横幅' } });
    fireEvent.click(screen.getByRole('button', { name: '上传横幅' }));
    await waitFor(() => {
      const upload = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/admin/media/banners') && init?.method === 'POST');
      expect(upload).toBeTruthy();
      expect((upload?.[1]?.body as FormData).get('file')).toBeTruthy();
      expect((upload?.[1]?.body as FormData).get('label')).toBe('新横幅');
    }, { timeout: 750 });

    fireEvent.click(screen.getByRole('button', { name: '查看首页轮播审计' }));
    expect(await screen.findByRole('heading', { name: '首页轮播审计' })).toBeTruthy();
    expect(screen.getByText('CREATED')).toBeTruthy();
  });

  it('restores an archived banner for reuse', async () => {
    const fetchMock = mockApi({ ...banner, state: 'ARCHIVED' as const });
    render(<HomeCarouselOperationsPanel />);

    await screen.findByRole('button', { name: '恢复 星海横幅' });
    fireEvent.click(screen.getByRole('button', { name: '恢复 星海横幅' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/admin/media/assets/11111111-1111-1111-1111-111111111111/restore',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(await screen.findByText(/已恢复为可用素材。/)).toBeTruthy();
  });

  it('uses the server page metadata when browsing banner assets', async () => {
    const fetchMock = mockApi(banner, 25);
    render(<HomeCarouselOperationsPanel />);

    await screen.findByText('第 1 / 2 页');
    fireEvent.click(screen.getByRole('link', { name: '下一页' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/admin/media/banners?state=ACTIVE&page=1&size=24',
      expect.anything(),
    ));
    expect(await screen.findByText('第 2 / 2 页')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('筛选横幅素材'), { target: { value: '星海' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/admin/media/banners?state=ACTIVE&page=0&size=24&query=%E6%98%9F%E6%B5%B7',
      expect.anything(),
    ));
  });

  it('searches the paged active inventory when replacing a carousel banner', async () => {
    const replacement = {
      ...banner,
      id: '33333333-3333-3333-3333-333333333333',
      label: '远航横幅',
      publicUrl: '/media/banners/33333333-3333-3333-3333-333333333333.png',
    };
    const fetchMock = mockApi(banner, 1, replacement);
    render(<HomeCarouselOperationsPanel />);

    await screen.findByRole('heading', { name: '首页作品轮播' });
    fireEvent.click(screen.getAllByRole('button', { name: '选择横幅素材' })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/admin/media/banners?state=ACTIVE&page=0&size=12',
      expect.anything(),
    ));
    fireEvent.click(await screen.findByRole('button', { name: '使用横幅 远航横幅' }));
    fireEvent.click(screen.getByRole('button', { name: '保存 星海拾光 轮播配置' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel/41', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        bookId: 7,
        bannerAssetId: replacement.id,
        headline: '向星海出发',
        copy: '运营短文案',
        enabled: true,
        rank: 1,
        version: 3,
      }),
    })));
  });

  it('uses the selected published work when updating an existing slide', async () => {
    const fetchMock = mockApi();
    render(<HomeCarouselOperationsPanel />);

    await screen.findByRole('heading', { name: '首页作品轮播' });
    fireEvent.click(screen.getAllByRole('button', { name: '选择轮播作品' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '选择作品 新作品' }));
    fireEvent.click(screen.getByRole('button', { name: '保存 星海拾光 轮播配置' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/home-carousel/41', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        bookId: 99,
        bannerAssetId: banner.id,
        headline: '向星海出发',
        copy: '运营短文案',
        enabled: true,
        rank: 1,
        version: 3,
      }),
    })));
  });
});
