import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/novel-admin',
  useRouter: () => ({ push, refresh }),
}));

import NovelAdminPage from './page';

const pendingComment = {
  id: 81,
  bookId: 7,
  chapterId: 701,
  userId: 56,
  authorName: '需要审核的读者',
  content: '这条评论命中了内容规则。',
  status: 'PENDING_REVIEW',
  createdAt: '2026-07-21T08:00:00Z',
};

const pendingAnnotation = {
  id: 91,
  bookId: 7,
  chapterId: 701,
  userId: 56,
  authorName: '申请分享的读者',
  paragraphIndex: 2,
  selectionStart: 4,
  selectionEnd: 10,
  selectedText: '旧港口的灯火',
  note: '这一段很有画面感。',
  shareIntent: true,
  status: 'PENDING_REVIEW',
  createdAt: '2026-07-21T08:01:00Z',
};

type RedemptionCodeFixture = {
  code: string;
  batchNo: string;
  benefitType: string;
  tokenAmount: number;
  bookId: number | null;
  membershipDays: number;
  status: string;
  expiresAt: string | null;
  redeemedByUserId: number | null;
  redeemedAt: string | null;
};

function redemptionCode(overrides: Partial<RedemptionCodeFixture> & Pick<RedemptionCodeFixture, 'code' | 'batchNo'>): RedemptionCodeFixture {
  return {
    benefitType: 'TOKEN',
    tokenAmount: 0,
    bookId: null,
    membershipDays: 0,
    status: 'ACTIVE',
    expiresAt: null,
    redeemedByUserId: null,
    redeemedAt: null,
    ...overrides,
  };
}

const initialRedemptionCodes = [
  redemptionCode({ code: 'SUMMER-2026-A1B2', batchNo: 'SUMMER-2026', tokenAmount: 100 }),
  redemptionCode({ code: 'MEMBER-USED-2026', batchNo: 'MEMBER-2026', benefitType: 'MEMBERSHIP', membershipDays: 30, status: 'REDEEMED', expiresAt: '2030-08-01T00:00:00Z', redeemedByUserId: 47, redeemedAt: '2026-07-20T08:00:00Z' }),
  redemptionCode({ code: 'BOOK-DISABLED-2026', batchNo: 'PARTNER-2026', benefitType: 'BOOK', bookId: 7, status: 'DISABLED' }),
];

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function mockAdminApi(seedCodes = initialRedemptionCodes) {
  let redemptionCodes = seedCodes.map((code) => ({ ...code }));
  let annotations = [{ ...pendingAnnotation }];
  let accounts = [{
    id: 41,
    loginName: 'managed.reader@example.test',
    displayName: '运营管理读者',
    roles: ['READER'],
    enabled: true,
    createdAt: '2026-07-20T08:00:00Z',
  }];
  let categories = [{ id: 11, type: 'CATEGORY', name: '科幻', enabled: true, sortOrder: 10 }];
  let tags = [{ id: 21, type: 'TAG', name: '成长', enabled: true, sortOrder: 10 }];
  const editorialRecommendations = [{
    rank: 1,
    book: { id: 1, title: '星海拾光', author: '林墨', category: '科幻', words: 286000, synopsis: '旧港口的来信。', status: 'PUBLISHED', serialStatus: '连载中', cover: '#1f6d7a', heat: 9820 },
  }];
  const hotSearchTerms = [{ id: 1, term: '星海', enabled: true, rank: 1, createdByUserId: 1, updatedByUserId: 1, createdAt: '2026-07-21T08:00:00Z', updatedAt: '2026-07-21T08:00:00Z' }];
  const accountAudits = [{ id: 501, accountId: 41, previousEnabled: true, enabled: false, reason: '违规内容需要暂停', operatorUserId: 1, createdAt: '2026-07-21T08:00:00Z' }];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (path.endsWith('/admin/dashboard')) return Promise.resolve(response({ activeReaders: 14, todayReads: 33, publishedBooks: 5, pendingReviews: 1, auditLog: [] }));
    if (path.endsWith('/admin/reviews')) return Promise.resolve(response([]));
    if (path.endsWith('/admin/author-applications')) return Promise.resolve(response([]));
    if (path.endsWith('/admin/sensitive-words')) return Promise.resolve(response(['敏感词']));
    if (path.endsWith('/admin/comments?status=PENDING_REVIEW&size=20')) return Promise.resolve(response({ items: [pendingComment], meta: { total: 1, page: 0, size: 20 } }));
    if (path.endsWith('/admin/comments/81/review')) {
      return Promise.resolve(response({ ...pendingComment, status: body.approve ? 'VISIBLE' : 'REJECTED' }));
    }
    if (path.endsWith('/admin/annotations?status=PENDING_REVIEW&size=20')) {
      const pendingAnnotations = annotations.filter((annotation) => annotation.status === 'PENDING_REVIEW');
      return Promise.resolve(response({ items: pendingAnnotations, meta: { total: pendingAnnotations.length, page: 0, size: 20 } }));
    }
    const annotationReviewMatch = path.match(/\/admin\/annotations\/(\d+)\/review$/);
    if (annotationReviewMatch) {
      const annotationId = Number(annotationReviewMatch[1]);
      const current = annotations.find((annotation) => annotation.id === annotationId);
      if (!current) return Promise.reject(new Error(`Unknown annotation: ${annotationId}`));
      const reviewed = { ...current, status: body.approve ? 'VISIBLE' : 'REJECTED' };
      annotations = annotations.map((annotation) => annotation.id === annotationId ? reviewed : annotation);
      return Promise.resolve(response(reviewed));
    }
    if (path.endsWith('/admin/redemption-codes?size=20')) return Promise.resolve(response({ items: redemptionCodes, page: 0, size: 20, total: redemptionCodes.length }));
    if (path.endsWith('/admin/editorial/recommendations')) return Promise.resolve(response(editorialRecommendations));
    if (path.endsWith('/admin/hot-searches')) return Promise.resolve(response(hotSearchTerms));
    if (path.includes('/admin/accounts?')) return Promise.resolve(response({ items: accounts, total: accounts.length, page: 0, size: 20 }));
    const accountStatusMatch = path.match(/\/admin\/accounts\/(\d+)\/status$/);
    if (accountStatusMatch) {
      const accountId = Number(accountStatusMatch[1]);
      const current = accounts.find((account) => account.id === accountId);
      if (!current) return Promise.reject(new Error(`Unknown account: ${accountId}`));
      const enabled = Boolean(body.enabled);
      const account = { ...current, enabled };
      accounts = accounts.map((item) => item.id === accountId ? account : item);
      const audit = { id: 502, accountId, previousEnabled: current.enabled, enabled, reason: String(body.reason), operatorUserId: 1, createdAt: '2026-07-21T09:00:00Z' };
      accountAudits.unshift(audit);
      return Promise.resolve(response({ userId: accountId, enabled, account, changed: true, audit }));
    }
    const accountAuditsMatch = path.match(/\/admin\/accounts\/(\d+)\/status-audits\?limit=20$/);
    if (accountAuditsMatch) return Promise.resolve(response(accountAudits));
    if ((init?.method ?? 'GET') === 'GET' && path.endsWith('/admin/taxonomy/CATEGORY')) return Promise.resolve(response(categories));
    if ((init?.method ?? 'GET') === 'GET' && path.endsWith('/admin/taxonomy/TAG')) return Promise.resolve(response(tags));
    const taxonomyItemMatch = path.match(/\/admin\/taxonomy\/(CATEGORY|TAG)\/(\d+)$/);
    if (taxonomyItemMatch) {
      const type = taxonomyItemMatch[1] as 'CATEGORY' | 'TAG';
      const itemId = Number(taxonomyItemMatch[2]);
      const collection = type === 'CATEGORY' ? categories : tags;
      const current = collection.find((item) => item.id === itemId);
      if (!current) return Promise.reject(new Error(`Unknown taxonomy item: ${itemId}`));
      const next = { ...current, name: String(body.name), enabled: Boolean(body.enabled), sortOrder: Number(body.sortOrder) };
      if (type === 'CATEGORY') categories = categories.map((item) => item.id === itemId ? next : item);
      else tags = tags.map((item) => item.id === itemId ? next : item);
      return Promise.resolve(response(next));
    }
    const taxonomyCreateMatch = path.match(/\/admin\/taxonomy\/(CATEGORY|TAG)$/);
    if (taxonomyCreateMatch && (init?.method ?? 'GET') === 'POST') {
      const type = taxonomyCreateMatch[1] as 'CATEGORY' | 'TAG';
      const collection = type === 'CATEGORY' ? categories : tags;
      const created = { id: Math.max(0, ...collection.map((item) => item.id)) + 1, type, name: String(body.name), enabled: Boolean(body.enabled), sortOrder: Number(body.sortOrder) };
      if (type === 'CATEGORY') categories = [...categories, created];
      else tags = [...tags, created];
      return Promise.resolve(response(created));
    }
    if (path.endsWith('/admin/redemption-codes/generate')) {
      const quantity = Number(body.quantity);
      const batchNo = String(body.batchNo);
      const prefix = String(body.codePrefix ?? 'NVC');
      const generated = Array.from({ length: quantity }, (_, index) => redemptionCode({
        code: `${prefix}-${String(index + 1).padStart(4, '0')}`,
        batchNo,
        tokenAmount: typeof body.tokenAmount === 'number' ? body.tokenAmount : 0,
        membershipDays: typeof body.membershipDays === 'number' ? body.membershipDays : 0,
        bookId: typeof body.bookId === 'number' ? body.bookId : null,
        benefitType: 'COMPOSITE',
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      }));
      redemptionCodes = [...generated, ...redemptionCodes];
      return Promise.resolve(response({ batchNo, codes: generated }));
    }
    if (path.endsWith('/admin/redemption-codes/import')) {
      const imported = redemptionCode({
        code: String(body.code),
        batchNo: String(body.batchNo),
        tokenAmount: typeof body.tokenAmount === 'number' ? body.tokenAmount : 0,
        membershipDays: typeof body.membershipDays === 'number' ? body.membershipDays : 0,
        bookId: typeof body.bookId === 'number' ? body.bookId : null,
        benefitType: 'COMPOSITE',
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      });
      redemptionCodes = [imported, ...redemptionCodes];
      return Promise.resolve(response(imported));
    }
    const disableMatch = path.match(/\/admin\/redemption-codes\/([^/]+)\/disable$/);
    if (disableMatch) {
      const code = decodeURIComponent(disableMatch[1]);
      const disabled = redemptionCodes.find((item) => item.code === code);
      if (!disabled) return Promise.reject(new Error(`Unknown redemption code: ${code}`));
      const next = { ...disabled, status: 'DISABLED' };
      redemptionCodes = redemptionCodes.map((item) => item.code === code ? next : item);
      return Promise.resolve(response(next));
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('admin comment review queue', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it('shows pending comments from the FR-04 moderation endpoint', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('这条评论命中了内容规则。');
    expect(screen.getByText('需要审核的读者')).toBeTruthy();
    expect(screen.getAllByText('待审核').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 条等待人工决定').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('审核说明 81').getAttribute('data-slot')).toBe('input');
    expect(screen.getByRole('button', { name: '通过' }).getAttribute('data-slot')).toBe('button');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/comments?status=PENDING_REVIEW&size=20', expect.anything()));
  });

  it('submits the default approval reason and an operator-supplied rejection reason', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('这条评论命中了内容规则。');
    fireEvent.click(screen.getByRole('button', { name: '通过' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/comments/81/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ approve: true, reason: '内容符合社区规范' }),
    })));

    fireEvent.change(screen.getByLabelText('审核说明 81'), { target: { value: '不符合社区规范，需要修改后重发' } });
    fireEvent.click(screen.getByRole('button', { name: '驳回' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/comments/81/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ approve: false, reason: '不符合社区规范，需要修改后重发' }),
    })));
  });
});

describe('admin paragraph annotation review queue', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it('shows requested shares from the FR-04 moderation endpoint with their reader context', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('旧港口的灯火');
    expect(screen.getByRole('heading', { name: '待审核段评与划线' })).toBeTruthy();
    expect(screen.getByText('申请分享的读者')).toBeTruthy();
    expect(screen.getByText('作品 #7 · 章节 #701 · 第 3 段')).toBeTruthy();
    expect(screen.getByText('这一段很有画面感。')).toBeTruthy();
    expect(screen.getByLabelText('段评审核说明 91').getAttribute('data-slot')).toBe('input');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/annotations?status=PENDING_REVIEW&size=20', expect.anything()));
  });

  it('submits the default approval reason and refreshes the queue', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('旧港口的灯火');
    fireEvent.click(screen.getByRole('button', { name: '通过段评 91' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/annotations/91/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ approve: true, reason: '划线分享符合社区规范' }),
    })));
    await screen.findByText('当前没有待审核段评与划线');
    expect(screen.queryByText('旧港口的灯火')).toBeNull();
  });

  it('submits an operator-supplied rejection reason', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('旧港口的灯火');
    fireEvent.change(screen.getByLabelText('段评审核说明 91'), { target: { value: '包含攻击性内容，需要修改后重发' } });
    fireEvent.click(screen.getByRole('button', { name: '驳回段评 91' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/annotations/91/review', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ approve: false, reason: '包含攻击性内容，需要修改后重发' }),
    })));
    await screen.findByText('当前没有待审核段评与划线');
  });
});

describe('admin redemption-code operations', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it('shows redemption lifecycle details and only offers disable for an unredeemed active code', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('SUMMER-2026-A1B2');
    expect(screen.getAllByRole('table').some((table) => table.getAttribute('data-slot') === 'table')).toBe(true);
    expect(screen.getByText('SUMMER-2026')).toBeTruthy();
    expect(screen.getByText('100 代币')).toBeTruthy();
    expect(screen.getByText('用户 #47')).toBeTruthy();
    expect(screen.getByRole('button', { name: '禁用 SUMMER-2026-A1B2' }).getAttribute('data-slot')).toBe('button');
    expect(screen.queryByRole('button', { name: '禁用 MEMBER-USED-2026' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '禁用 SUMMER-2026-A1B2' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/redemption-codes/SUMMER-2026-A1B2/disable', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: '运营中心手动停用' }),
    })));
    await waitFor(() => expect(screen.queryByRole('button', { name: '禁用 SUMMER-2026-A1B2' })).toBeNull());
  });

  it('generates a batch with combined token, membership, and book benefits', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('兑换码管理');
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('生成批次'), { target: { value: 'summer-2026' } });
    fireEvent.change(screen.getByLabelText('码前缀'), { target: { value: 'summer' } });
    fireEvent.change(screen.getByLabelText('生成代币数量'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('生成会员天数'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('生成书籍 ID'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('生成到期时间'), { target: { value: '2030-08-01T12:30' } });
    fireEvent.click(screen.getByRole('button', { name: '生成兑换码' }));

    const expiresAt = new Date('2030-08-01T12:30').toISOString();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/redemption-codes/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ quantity: 2, batchNo: 'SUMMER-2026', codePrefix: 'SUMMER', tokenAmount: 100, membershipDays: 30, bookId: 7, expiresAt }),
    })));
    await waitFor(() => expect(screen.getAllByText('SUMMER-0001')).toHaveLength(2));
    expect(screen.getAllByText(/批次 SUMMER-2026 已生成 2 个兑换码/)).not.toHaveLength(0);
  });

  it('imports one code with its entitlement into a named batch', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByRole('heading', { name: '导入兑换码' });
    fireEvent.change(screen.getByLabelText('导入兑换码'), { target: { value: 'partner-2026-x9y8' } });
    fireEvent.change(screen.getByLabelText('导入批次'), { target: { value: 'partner-2026' } });
    fireEvent.change(screen.getByLabelText('导入代币数量'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: '导入单个码' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/redemption-codes/import', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: 'PARTNER-2026-X9Y8', batchNo: 'PARTNER-2026', tokenAmount: 42 }),
    })));
    await screen.findByText('兑换码 PARTNER-2026-X9Y8 已导入批次 PARTNER-2026');
  });
});

describe('admin account and taxonomy operations', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it('filters accounts, requires an audit reason, suspends a user, and shows the decision history', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByText('运营管理读者');
    fireEvent.pointerDown(screen.getByLabelText('账号状态筛选'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: '已暂停' }));
    fireEvent.pointerDown(screen.getByLabelText('账号角色筛选'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: '作者' }));
    fireEvent.change(screen.getByLabelText('账号关键词'), { target: { value: 'managed.reader' } });
    fireEvent.click(screen.getByRole('button', { name: '检索账号' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/accounts?status=SUSPENDED&role=AUTHOR&page=0&size=20&query=managed.reader', expect.anything()));

    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    await screen.findByText('请填写账号状态说明，系统会将其保留在审计记录中。');
    fireEvent.change(screen.getByLabelText('账号状态说明 41'), { target: { value: '违规内容需要暂停' } });
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/accounts/41/status', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ enabled: false, reason: '违规内容需要暂停' }),
    })));
    await screen.findByRole('button', { name: '恢复' });

    fireEvent.click(screen.getByRole('button', { name: '查看账号审计 41' }));
    await screen.findByRole('heading', { name: '账号状态审计' });
    expect(screen.getAllByText('违规内容需要暂停').length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/accounts/41/status-audits?limit=20', expect.anything()));
  });

  it('creates a category and persists a taxonomy switch through the admin API', async () => {
    const fetchMock = mockAdminApi();
    render(<NovelAdminPage />);

    await screen.findByRole('heading', { name: '分类管理' });
    fireEvent.change(screen.getByLabelText('新分类'), { target: { value: '历史' } });
    fireEvent.change(screen.getByLabelText('新分类排序'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: '添加分类' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/taxonomy/CATEGORY', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '历史', enabled: true, sortOrder: 50 }),
    })));
    await screen.findByDisplayValue('历史');

    fireEvent.click(screen.getByRole('switch', { name: '科幻 分类已启用' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/taxonomy/CATEGORY/11', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: '科幻', enabled: false, sortOrder: 10 }),
    })));
  });
});
