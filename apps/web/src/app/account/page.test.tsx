import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ push, refresh }),
}));

import AccountPage from './page';

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function errorResponse(msg: string) {
  return { ok: false, json: async () => ({ msg }) } as Response;
}

function mockAccountApi(
  authorApplication: unknown | ((requestCount: number) => unknown) = null,
  profileUpdate: (requestCount: number) => Response = () => response({ id: 47, name: '更新后的阅界读者', roles: ['READER'] }),
  commentsResponse: (requestCount: number) => Response = () => response({
    items: [
      { id: 71, bookId: 7, chapterId: 12, userId: 47, authorName: '阅界读者', content: '这一章的反转很有张力。', status: 'PENDING_REVIEW', createdAt: '2026-07-21T08:30:00Z' },
      { id: 72, bookId: 404, chapterId: null, userId: 47, authorName: '阅界读者', content: '完整的书评会在审核后公开。', status: 'VISIBLE', createdAt: '2026-07-20T08:30:00Z' },
    ],
    meta: { total: 2, page: 0, size: 20 },
  }),
) {
  let authorApplicationRequestCount = 0;
  let profileUpdateRequestCount = 0;
  let commentsRequestCount = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = String(input).replace('/api/novel/', '');
    const method = (init?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && endpoint === 'account/profile') {
      return Promise.resolve(response({ id: 47, name: '阅界读者', roles: ['READER'] }));
    }
    if (method === 'GET' && endpoint === 'account/bookshelf') {
      return Promise.resolve(response([
        { id: 7, title: '北岸灯塔', author: '林见川', category: '悬疑', words: 32_000, synopsis: '', status: 'PUBLISHED', serialStatus: 'SERIALIZING', cover: '' },
        { id: 9, title: '星海拾光', author: '周以南', category: '科幻', words: 80_000, synopsis: '', status: 'PUBLISHED', serialStatus: 'COMPLETED', cover: '' },
      ]));
    }
    if (method === 'GET' && endpoint === 'account/progress') {
      return Promise.resolve(response([
        { bookId: 7, chapterId: 12, offset: 630, updatedAt: '2026-07-21T08:30:00Z' },
        { bookId: 404, chapterId: 3, offset: 0, updatedAt: '2026-07-20T08:30:00Z' },
      ]));
    }
    if (method === 'GET' && endpoint === 'account/wallet') {
      return Promise.resolve(response({ points: 80, tokens: 120 }));
    }
    if (method === 'GET' && endpoint === 'account/entitlements') {
      return Promise.resolve(response({
        membership: { expiresAt: '2026-08-01T08:30:00Z', active: true },
        books: [{
          bookId: 7,
          bookTitle: '北岸灯塔',
          sourceType: 'REDEMPTION',
          sourceReference: 'SUMMER-BOOK-7',
          purchaseAmount: 40,
          amountUnit: 'TOKEN',
          acquiredAt: '2026-07-21T08:30:00Z',
        }],
      }));
    }
    if (method === 'GET' && endpoint === 'account/author-applications') {
      authorApplicationRequestCount += 1;
      return Promise.resolve(response(
        typeof authorApplication === 'function'
          ? authorApplication(authorApplicationRequestCount)
          : authorApplication,
      ));
    }
    if (method === 'GET' && endpoint === 'account/comments?size=20') {
      commentsRequestCount += 1;
      return Promise.resolve(commentsResponse(commentsRequestCount));
    }
    if (method === 'POST' && endpoint === 'account/checkin') {
      return Promise.resolve(response({ points: 90, awarded: 10 }));
    }
    if (method === 'POST' && endpoint === 'account/redeem') {
      return Promise.resolve(response({ code: 'WELCOME-2026', tokens: 30, balance: 150 }));
    }
    if (method === 'PUT' && endpoint === 'account/profile') {
      profileUpdateRequestCount += 1;
      return Promise.resolve(profileUpdate(profileUpdateRequestCount));
    }
    if (method === 'POST' && endpoint === 'account/author-applications') {
      return Promise.resolve(response({
        id: 91,
        penName: '南枝',
        statement: '完成都市幻想长篇创作。',
        status: 'PENDING',
        reason: '',
        createdAt: '2026-07-21T08:30:00Z',
        decidedAt: null,
      }));
    }

    return Promise.reject(new Error(`Unexpected request: ${method} ${endpoint}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('reader account center', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
    document.cookie = 'novel_csrf=account-test-token';
  });

  it('loads account data, exposes the account navigation entry, and gives direct reading actions', async () => {
    const fetchMock = mockAccountApi();
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '阅界读者' });
    expect(screen.getByRole('link', { name: '个人中心' }).getAttribute('href')).toBe('/account');
    expect(screen.getByRole('link', { name: '个人中心' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getAllByText('北岸灯塔').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('作品 #404').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: '继续阅读《北岸灯塔》' }).every((link) => link.getAttribute('href') === '/reader/7')).toBe(true);
    expect(screen.getByRole('link', { name: '开始阅读《星海拾光》' }).getAttribute('href')).toBe('/reader/9');
    expect(screen.getByRole('link', { name: '阅读《北岸灯塔》' }).getAttribute('href')).toBe('/reader/7');

    for (const endpoint of ['account/profile', 'account/bookshelf', 'account/progress', 'account/wallet', 'account/entitlements', 'account/author-applications', 'account/comments?size=20']) {
      expect(fetchMock).toHaveBeenCalledWith(`/api/novel/${endpoint}`, expect.anything());
    }
  });

  it('shows the current reader comments with their location, moderation state, and time', async () => {
    mockAccountApi();
    render(<AccountPage />);

    expect(await screen.findByRole('heading', { name: '我的评论' })).toBeTruthy();
    expect(screen.getByText('这一章的反转很有张力。')).toBeTruthy();
    expect(screen.getByText('完整的书评会在审核后公开。')).toBeTruthy();
    expect(screen.getByText('作品 #7 · 北岸灯塔')).toBeTruthy();
    expect(screen.getByText(/章节 #12/)).toBeTruthy();
    expect(screen.getAllByText('待审核')).toHaveLength(1);
    expect(screen.getAllByText('已公开')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '阅读评论所在作品 #7' }).getAttribute('href')).toBe('/reader/7');
    expect(screen.getByRole('link', { name: '阅读评论所在作品 #404' }).getAttribute('href')).toBe('/reader/404');
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it('keeps account details available when comments fail and retries only the comments request', async () => {
    const fetchMock = mockAccountApi(null, undefined, (requestCount) => requestCount === 1
      ? errorResponse('评论服务暂不可用')
      : response({
        items: [{ id: 73, bookId: 7, chapterId: null, userId: 47, authorName: '阅界读者', content: '重试后可见的书评。', status: 'PENDING_REVIEW', createdAt: '2026-07-21T09:30:00Z' }],
        meta: { total: 1, page: 0, size: 20 },
      }));
    render(<AccountPage />);

    expect(await screen.findByRole('heading', { name: '阅界读者' })).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('评论服务暂不可用');
    expect(screen.queryByText('个人中心无法加载')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('重试后可见的书评。')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/novel/account/comments?size=20')).toHaveLength(2);
  });

  it('shows current membership and book entitlements without making payment claims', async () => {
    mockAccountApi();
    render(<AccountPage />);

    expect(await screen.findByRole('heading', { name: '已获权益' })).toBeTruthy();
    expect(screen.getByText('当前有效')).toBeTruthy();
    expect(screen.getByText(/有效至 2026/)).toBeTruthy();
    expect(screen.getAllByText('北岸灯塔').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('来源：REDEMPTION · SUMMER-BOOK-7')).toBeTruthy();
    expect(screen.getByText('代币记录：40 TOKEN')).toBeTruthy();
    expect(screen.queryByText(/人民币|支付金额|付款/)).toBeNull();
  });

  it('updates the current display name through the BFF and renders the returned profile', async () => {
    const fetchMock = mockAccountApi();
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '阅界读者' });
    fireEvent.click(screen.getByRole('button', { name: '编辑显示名称' }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '  新的阅界读者  ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存显示名称' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/profile', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ displayName: '新的阅界读者' }),
    })));
    expect(await screen.findByRole('heading', { name: '更新后的阅界读者' })).toBeTruthy();
    expect(screen.getByText('显示名称已更新。')).toBeTruthy();
  });

  it('keeps a failed profile edit available for correction and retry', async () => {
    const fetchMock = mockAccountApi(null, (requestCount) => requestCount === 1
      ? errorResponse('显示名称不能包含控制字符或换行。')
      : response({ id: 47, name: '重试后的读者', roles: ['READER'] }));
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '阅界读者' });
    fireEvent.click(screen.getByRole('button', { name: '编辑显示名称' }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '需要重试的读者' } });
    fireEvent.click(screen.getByRole('button', { name: '保存显示名称' }));

    expect(await screen.findByText('显示名称不能包含控制字符或换行。')).toBeTruthy();
    expect((screen.getByLabelText('显示名称') as HTMLInputElement).value).toBe('需要重试的读者');
    fireEvent.click(screen.getByRole('button', { name: '保存显示名称' }));

    expect(await screen.findByRole('heading', { name: '重试后的读者' })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/novel/account/profile' && init?.method === 'PUT')).toHaveLength(2);
  });

  it('validates blank display names before making a profile update request', async () => {
    const fetchMock = mockAccountApi();
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '阅界读者' });
    fireEvent.click(screen.getByRole('button', { name: '编辑显示名称' }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存显示名称' }));

    expect(await screen.findByText('显示名称不能为空。')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === '/api/novel/account/profile' && init?.method === 'PUT')).toHaveLength(0);
  });

  it('checks in and redeems through the reader BFF endpoints while updating displayed balances', async () => {
    const fetchMock = mockAccountApi();
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '阅界读者' });
    fireEvent.click(screen.getByRole('button', { name: '今日签到' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/checkin', expect.objectContaining({
      method: 'POST',
    })));
    expect(await screen.findByText('签到成功，获得 10 积分。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '今日已签到' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('兑换码'), { target: { value: 'WELCOME-2026' } });
    fireEvent.click(screen.getByRole('button', { name: '确认兑换' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/redeem', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: 'WELCOME-2026' }),
    })));
    expect(await screen.findByText('兑换成功，已到账 30 代币。')).toBeTruthy();
    expect((screen.getByLabelText('兑换码') as HTMLInputElement).value).toBe('');
  });

  it('submits an author application and replaces the entry form with its pending state', async () => {
    const fetchMock = mockAccountApi();
    render(<AccountPage />);

    await screen.findByRole('heading', { name: '作者申请' });
    fireEvent.change(screen.getByLabelText('创作笔名'), { target: { value: '南枝' } });
    fireEvent.change(screen.getByLabelText('创作说明'), { target: { value: '完成都市幻想长篇创作。' } });
    fireEvent.click(screen.getByRole('button', { name: '提交作者申请' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/author-applications', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ penName: '南枝', statement: '完成都市幻想长篇创作。' }),
    })));
    expect(await screen.findByText('作者申请已提交，审核结果会同步显示在这里。')).toBeTruthy();
    expect(screen.getByText('申请审核中')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '提交作者申请' })).toBeNull();
  });

  it('shows the current application decision instead of allowing a duplicate submission', async () => {
    mockAccountApi({
      id: 19,
      penName: '归帆',
      statement: '持续创作科幻短篇。',
      status: 'APPROVED',
      reason: '审核通过',
      createdAt: '2026-07-20T08:30:00Z',
      decidedAt: '2026-07-21T08:30:00Z',
    });
    render(<AccountPage />);

    expect(await screen.findByText('申请已通过')).toBeTruthy();
    expect(screen.getByRole('link', { name: '进入创作台' }).getAttribute('href')).toBe('/author');
    expect(screen.queryByLabelText('创作笔名')).toBeNull();
  });

  it('refreshes a pending author application without reloading the account page', async () => {
    const fetchMock = mockAccountApi((requestCount: number) => requestCount === 1
      ? {
        id: 29,
        penName: '归帆',
        statement: '持续创作科幻短篇。',
        status: 'PENDING',
        reason: '',
        createdAt: '2026-07-20T08:30:00Z',
        decidedAt: null,
      }
      : {
        id: 29,
        penName: '归帆',
        statement: '持续创作科幻短篇。',
        status: 'APPROVED',
        reason: '审核通过',
        createdAt: '2026-07-20T08:30:00Z',
        decidedAt: '2026-07-21T08:30:00Z',
      });
    render(<AccountPage />);

    await screen.findByText('申请审核中');
    const profileRequestCountBeforeRefresh = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/novel/account/profile',
    ).length;
    const applicationRequestCountBeforeRefresh = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/novel/account/author-applications',
    ).length;
    fireEvent.click(screen.getByRole('button', { name: '刷新审核状态' }));

    expect(await screen.findByText('审核已通过，作者身份已生效。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '进入创作台' }).getAttribute('href')).toBe('/author');
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/novel/account/profile'))
      .toHaveLength(profileRequestCountBeforeRefresh + 1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/novel/account/author-applications'))
      .toHaveLength(applicationRequestCountBeforeRefresh + 1);
  });

  it('shows the rejection reason and preserves the pen name for a resubmission', async () => {
    mockAccountApi({
      id: 20,
      penName: '归帆',
      statement: '持续创作科幻短篇。',
      status: 'REJECTED',
      reason: '请补充完整创作计划。',
      createdAt: '2026-07-20T08:30:00Z',
      decidedAt: '2026-07-21T08:30:00Z',
    });
    render(<AccountPage />);

    expect(await screen.findByText('申请被驳回。')).toBeTruthy();
    expect(screen.getByText('请补充完整创作计划。')).toBeTruthy();
    expect((screen.getByLabelText('创作笔名') as HTMLInputElement).value).toBe('归帆');
    expect(screen.getByRole('button', { name: '重新提交申请' })).toBeTruthy();
  });
});
