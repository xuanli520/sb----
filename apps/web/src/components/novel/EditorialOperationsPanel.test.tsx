import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorialOperationsPanel } from './EditorialOperationsPanel';

const recommendationBook = {
  id: 1,
  title: '星海拾光',
  author: '林墨',
  category: '科幻',
  words: 286_000,
  synopsis: '旧港口的来信。',
  status: 'PUBLISHED',
  serialStatus: '连载中',
  cover: '#1f6d7a',
  heat: 9_820,
};

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function mockEditorialApi() {
  let recommendations = [{ book: recommendationBook, rank: 1 }];
  let terms = [{ id: 11, term: '星海', enabled: true, rank: 1, createdByUserId: 1, updatedByUserId: 1, createdAt: '2026-07-21T08:00:00Z', updatedAt: '2026-07-21T08:00:00Z' }];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (path.endsWith('/admin/editorial/recommendations/audits?page=0&size=20')) return Promise.resolve(response({ items: [], meta: { total: 0, page: 0, size: 20 } }));
    if (path.endsWith('/admin/hot-searches/audits?page=0&size=20')) return Promise.resolve(response({ items: [], meta: { total: 0, page: 0, size: 20 } }));
    if (path.endsWith('/admin/editorial/recommendations?page=0&size=20') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: recommendations, meta: { total: recommendations.length, page: 0, size: 20 } }));
    if (path.endsWith('/admin/editorial/recommendations') && init?.method === 'POST') {
      const created = {
        book: { ...recommendationBook, id: Number(body.bookId), title: '新上架作品' },
        rank: Number(body.rank),
      };
      recommendations = [created, ...recommendations.map((item, index) => ({ ...item, rank: index + 2 }))];
      return Promise.resolve(response(created));
    }
    const recommendationMatch = path.match(/\/admin\/editorial\/recommendations\/(\d+)$/);
    if (recommendationMatch && init?.method === 'PUT') {
      const id = Number(recommendationMatch[1]);
      const current = recommendations.find((item) => item.book.id === id);
      if (!current) return Promise.reject(new Error('unknown recommendation'));
      const next = { ...current, rank: Number(body.rank) };
      recommendations = recommendations.map((item) => item.book.id === id ? next : item);
      return Promise.resolve(response(next));
    }
    if (recommendationMatch && init?.method === 'DELETE') {
      const id = Number(recommendationMatch[1]);
      recommendations = recommendations.filter((item) => item.book.id !== id);
      return Promise.resolve(response(null));
    }
    if (path.endsWith('/admin/hot-searches?page=0&size=20') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response({ items: terms, meta: { total: terms.length, page: 0, size: 20 } }));
    if (path.endsWith('/admin/hot-searches') && init?.method === 'POST') {
      const created = { id: 12, term: String(body.term), enabled: Boolean(body.enabled), rank: Number(body.rank), createdByUserId: 1, updatedByUserId: 1, createdAt: '2026-07-21T08:01:00Z', updatedAt: '2026-07-21T08:01:00Z' };
      terms = [created, ...terms];
      return Promise.resolve(response(created));
    }
    const hotSearchMatch = path.match(/\/admin\/hot-searches\/(\d+)$/);
    if (hotSearchMatch && init?.method === 'PUT') {
      const id = Number(hotSearchMatch[1]);
      const current = terms.find((item) => item.id === id);
      if (!current) return Promise.reject(new Error('unknown term'));
      const next = { ...current, term: String(body.term), enabled: Boolean(body.enabled), rank: Number(body.rank) };
      terms = terms.map((item) => item.id === id ? next : item);
      return Promise.resolve(response(next));
    }
    if (hotSearchMatch && init?.method === 'DELETE') {
      const id = Number(hotSearchMatch[1]);
      terms = terms.filter((item) => item.id !== id);
      return Promise.resolve(response(null));
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('EditorialOperationsPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('assigns a published book through the admin contract and persists an enabled hot-search toggle', async () => {
    const fetchMock = mockEditorialApi();
    render(<EditorialOperationsPanel />);

    await screen.findByRole('heading', { name: '编辑推荐位' });
    fireEvent.change(screen.getByLabelText('已发布作品 ID'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('推荐目标排序'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '添加推荐' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/editorial/recommendations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ bookId: 9, rank: 1 }),
    })));
    await screen.findByText('新上架作品');

    fireEvent.click(screen.getByRole('switch', { name: '星海 热搜已启用' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/hot-searches/11', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ term: '星海', enabled: false, rank: 1 }),
    })));
  });

  it('asks for confirmation before removing a recommendation', async () => {
    const fetchMock = mockEditorialApi();
    render(<EditorialOperationsPanel />);

    await screen.findByText('星海拾光');
    fireEvent.click(screen.getByRole('button', { name: '移除 星海拾光 推荐' }));
    await screen.findByRole('heading', { name: '确认移除' });
    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/editorial/recommendations/1', expect.objectContaining({ method: 'DELETE' })));
  });
});
