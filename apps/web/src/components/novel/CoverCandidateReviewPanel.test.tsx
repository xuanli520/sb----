import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverCandidateReviewPanel } from './CoverCandidateReviewPanel';

const item = {
  scope: 'BOOK_COVER' as const,
  book: {
    id: 7,
    title: '星海拾光',
    author: '林墨',
    category: '科幻',
    words: 286_000,
    synopsis: '在旧港口收到一封来自星海的来信。',
    cover: '/media/covers/11111111-1111-1111-1111-111111111111.png',
    status: 'PUBLISHED',
    serialStatus: '连载中',
    heat: 9820,
    purchasePrice: 30,
    metrics: { visibleCommentCount: 0, ratingCount: 0, averageRating: 0, recommendationVoteCount: 0, monthlyVoteCount: 0 },
  },
  candidate: {
    id: 71,
    bookId: 7,
    assetId: '22222222-2222-2222-2222-222222222222',
    approvedAssetId: null,
    status: 'PENDING_REVIEW' as const,
    reviewReason: null,
    createdByUserId: 2,
    createdAt: '2026-07-23T08:00:00Z',
    reviewedByUserId: null,
    reviewedAt: null,
  },
};

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('CoverCandidateReviewPanel', () => {
  beforeEach(() => vi.useRealTimers());
  it('loads pending candidates, preserves private preview access, and submits a required approval reason', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/admin/media/cover-candidates?status=PENDING_REVIEW&page=0&size=12')) return Promise.resolve(response({ items: [item], meta: { total: 1, page: 0, size: 12 } }));
      if (path.endsWith('/admin/media/cover-candidates/71/review') && init?.method === 'POST') return Promise.resolve(response({ book: item.book, candidate: { ...item.candidate, status: 'APPROVED', reviewReason: '符合封面规范' } }));
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CoverCandidateReviewPanel />);

    expect(await screen.findByText('星海拾光')).toBeTruthy();
    expect(screen.getByRole('img', { name: '星海拾光 候选封面' }).getAttribute('src')).toBe('/api/novel/admin/media/cover-candidates/71/preview');

    fireEvent.click(screen.getByRole('button', { name: '通过' }));
    expect(await screen.findByText('请填写审核原因。')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('星海拾光 审核原因'), { target: { value: '符合封面规范' } });
    fireEvent.click(screen.getByRole('button', { name: '通过' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/media/cover-candidates/71/review', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ approve: true, reason: '符合封面规范' }),
    })));
    expect(await screen.findByText('《星海拾光》的封面候选已通过。')).toBeTruthy();
  });

  it('uses the selected status when loading another candidate queue', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/admin/media/cover-candidates?status=PENDING_REVIEW&page=0&size=12')) return Promise.resolve(response({ items: [item], meta: { total: 1, page: 0, size: 12 } }));
      if (path.endsWith('/admin/media/cover-candidates?status=APPROVED&page=0&size=12')) return Promise.resolve(response({ items: [], meta: { total: 0, page: 0, size: 12 } }));
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CoverCandidateReviewPanel />);

    await screen.findByText('星海拾光');
    fireEvent.click(screen.getByRole('combobox', { name: '筛选封面候选状态' }));
    fireEvent.click(await screen.findByRole('option', { name: '已通过' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/media/cover-candidates?status=APPROVED&page=0&size=12', expect.anything()));
    expect(await screen.findByText('当前没有已通过的封面候选。')).toBeTruthy();
  });
});
