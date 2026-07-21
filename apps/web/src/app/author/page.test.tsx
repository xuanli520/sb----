import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/author',
  useRouter: () => ({ push, refresh }),
}));

import AuthorPage from './page';

const books = [
  { id: 1, title: '北岸灯塔', author: '林见川', category: '悬疑', words: 32_000, synopsis: '第一部测试作品', status: 'PUBLISHED', serialStatus: 'SERIALIZING', cover: '' },
  { id: 2, title: '夜航南岸', author: '林见川', category: '科幻', words: 18_000, synopsis: '第二部测试作品', status: 'DRAFT', serialStatus: 'SERIALIZING', cover: '' },
];

type ChapterFixture = {
  id: number;
  bookId: number;
  volumeId: number | null;
  title: string;
  content: string;
  published: boolean;
  status: string;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  reviewReason: string;
  orderNo: number;
};

type RewardReportFixture = {
  items: Array<{ id: number; bookId: number; bookTitle: string; rewarderUserId: number; tokenAmount: number; rewardedAt: string }>;
  summary: { rewardCount: number; totalTokens: number; amountUnit: string };
  meta: { total: number; page: number; size: number; bookId: number | null; from: string | null; to: string | null; timeZone: string; dateBoundary: string; recordInclusion: string };
};

type AnalyticsReportFixture = {
  summary: {
    currentFavoriteCount: number;
    purchaseCount: number;
    purchaseTokenAmount: number;
    activeReaderBookCount: number;
    activeReaderCount: number;
    completedReaderBookCount: number;
    averageReadThroughPercent: number;
    amountUnit: string;
  };
  dailyTrend: Array<{ date: string; favoriteAddCount: number; purchaseCount: number; purchaseTokenAmount: number }>;
  bookMetrics: Array<{ bookId: number; bookTitle: string; currentFavoriteCount: number; purchaseCount: number; purchaseTokenAmount: number; activeReaderBookCount: number; averageReadThroughPercent: number }>;
  availability: { subscription: { available: boolean; reason: string }; retention: { available: boolean; reason: string } };
  meta: {
    from: string;
    to: string;
    timeZone: string;
    dateBoundary: string;
    maximumWindowDays: number;
    bookMetricTotal: number;
    returnedBookMetricLimit: number;
    bookMetricsTruncated: boolean;
    shelfTrendInclusion: string;
    purchaseInclusion: string;
    readThroughDefinition: string;
  };
};

type CommentFixture = { id: number; bookId: number; chapterId: number | null; userId: number; authorName: string; content: string; status: string; createdAt: string };
type AnnotationFixture = {
  id: number;
  bookId: number;
  chapterId: number;
  userId: number;
  authorName: string;
  paragraphIndex: number;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
  note: string;
  shareIntent: boolean;
  status: string;
  createdAt: string;
};
type FeedbackPageFixture<T> = { items: T[]; meta: { total: number; page: number; size: number } };

function chapter(overrides: Partial<ChapterFixture> & Pick<ChapterFixture, 'id' | 'bookId' | 'title' | 'orderNo'>): ChapterFixture {
  return {
    volumeId: null,
    content: '测试正文',
    published: false,
    status: 'DRAFT',
    scheduledPublishAt: null,
    publishedAt: null,
    reviewReason: '',
    ...overrides,
  };
}

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function rejected(message: string) {
  return { ok: false, json: async () => ({ msg: message }) } as Response;
}

function rewardReportFixture(): RewardReportFixture {
  return {
    items: [
      { id: 901, bookId: 1, bookTitle: '北岸灯塔', rewarderUserId: 301, tokenAmount: 35, rewardedAt: '2026-07-21T08:30:00Z' },
      { id: 900, bookId: 2, bookTitle: '夜航南岸', rewarderUserId: 302, tokenAmount: 15, rewardedAt: '2026-07-20T09:15:00Z' },
    ],
    summary: { rewardCount: 2, totalTokens: 50, amountUnit: 'TOKEN' },
    meta: {
      total: 2,
      page: 0,
      size: 10,
      bookId: null,
      from: null,
      to: null,
      timeZone: 'Asia/Shanghai',
      dateBoundary: 'FROM_INCLUSIVE_TO_INCLUSIVE',
      recordInclusion: 'SUCCESSFUL_BOOK_REWARD_DEBIT_ONLY',
    },
  };
}

function analyticsReportFixture(): AnalyticsReportFixture {
  return {
    summary: {
      currentFavoriteCount: 12,
      purchaseCount: 4,
      purchaseTokenAmount: 120,
      activeReaderBookCount: 5,
      activeReaderCount: 4,
      completedReaderBookCount: 2,
      averageReadThroughPercent: 65.5,
      amountUnit: 'TOKEN',
    },
    dailyTrend: [
      { date: '2026-07-20', favoriteAddCount: 2, purchaseCount: 1, purchaseTokenAmount: 30 },
      { date: '2026-07-21', favoriteAddCount: 3, purchaseCount: 2, purchaseTokenAmount: 60 },
    ],
    bookMetrics: [
      { bookId: 1, bookTitle: '北岸灯塔', currentFavoriteCount: 9, purchaseCount: 3, purchaseTokenAmount: 90, activeReaderBookCount: 4, averageReadThroughPercent: 70 },
      { bookId: 2, bookTitle: '夜航南岸', currentFavoriteCount: 3, purchaseCount: 1, purchaseTokenAmount: 30, activeReaderBookCount: 1, averageReadThroughPercent: 47.5 },
    ],
    availability: {
      subscription: { available: false, reason: 'No author-attributed subscription event or entitlement is stored.' },
      retention: { available: false, reason: 'Reading progress retains only the latest position per reader and book; no return-event history is stored.' },
    },
    meta: {
      from: '2026-07-20',
      to: '2026-07-21',
      timeZone: 'Asia/Shanghai',
      dateBoundary: 'FROM_INCLUSIVE_TO_INCLUSIVE',
      maximumWindowDays: 90,
      bookMetricTotal: 2,
      returnedBookMetricLimit: 12,
      bookMetricsTruncated: false,
      shelfTrendInclusion: 'CURRENT_BOOKSHELF_ROWS_ADDED_IN_WINDOW; REMOVED_ROWS_ARE_NOT_RETAINED',
      purchaseInclusion: 'PURCHASE_ENTITLEMENT_WITH_MATCHING_BOOK_PURCHASE_TOKEN_DEBIT',
      readThroughDefinition: 'CURRENT_PROGRESS_UPDATED_IN_WINDOW; PUBLISHED_CHAPTER_POSITION_PLUS_CAPPED_OFFSET_FRACTION',
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

type MockAuthorApiOptions = {
  rejectBookUpdate?: boolean;
  rejectBookDelete?: boolean;
  rejectChapterUpdate?: boolean;
  rejectRewardReport?: boolean;
  rejectAnalyticsReport?: boolean;
  rejectAnnotations?: boolean;
  rewardReport?: RewardReportFixture | ((page: number) => RewardReportFixture);
  rewardRequest?: Promise<Response>;
  analyticsReport?: AnalyticsReportFixture;
  analyticsRequest?: Promise<Response>;
  annotationPage?: FeedbackPageFixture<AnnotationFixture> | ((bookId: number, page: number) => FeedbackPageFixture<AnnotationFixture>);
  annotationRequest?: Promise<Response>;
};

function mockAuthorApi(options: MockAuthorApiOptions = {}) {
  let bookItems = books.map((book) => ({ ...book }));
  const volumesByBook: Record<number, Array<{ id: number; bookId: number; title: string; orderNo: number; createdAt: string }>> = {
    1: [{ id: 101, bookId: 1, title: '灯塔卷', orderNo: 1, createdAt: '2026-07-21T08:00:00Z' }],
    2: [{ id: 201, bookId: 2, title: '夜航卷', orderNo: 1, createdAt: '2026-07-21T08:00:00Z' }],
  };
  const chaptersByBook: Record<number, ChapterFixture[]> = {
    1: [
      chapter({ id: 1001, bookId: 1, volumeId: 101, title: '抵达旧港', orderNo: 1, published: true, status: 'PUBLISHED', publishedAt: '2026-07-20T08:00:00Z' }),
      chapter({ id: 1002, bookId: 1, volumeId: 101, title: '未寄出的信', orderNo: 2 }),
      chapter({ id: 1003, bookId: 1, volumeId: 101, title: '备选存稿', orderNo: 3 }),
      chapter({ id: 1004, bookId: 1, volumeId: 101, title: '潮汐预告', orderNo: 4, status: 'SCHEDULED', scheduledPublishAt: '2030-01-02T01:30:00Z' }),
    ],
    2: [chapter({ id: 2001, bookId: 2, volumeId: 201, title: '离岸风', orderNo: 1 })],
  };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = String(input).replace('/api/novel/', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

    if (method === 'GET' && endpoint === 'author/books') return Promise.resolve(response(bookItems));

    if (method === 'GET' && endpoint.startsWith('author/reward-records?')) {
      if (options.rewardRequest) return options.rewardRequest;
      if (options.rejectRewardReport) return Promise.resolve(rejected('reward report service is unavailable'));
      const parameters = new URLSearchParams(endpoint.split('?')[1]);
      const page = Number(parameters.get('page') ?? 0);
      const report = typeof options.rewardReport === 'function' ? options.rewardReport(page) : options.rewardReport ?? rewardReportFixture();
      return Promise.resolve(response({
        ...report,
        meta: {
          ...report.meta,
          page,
          size: Number(parameters.get('size') ?? 10),
          bookId: parameters.has('bookId') ? Number(parameters.get('bookId')) : null,
          from: parameters.get('from'),
          to: parameters.get('to'),
        },
      }));
    }

    if (method === 'GET' && (endpoint === 'author/analytics' || endpoint.startsWith('author/analytics?'))) {
      if (options.analyticsRequest) return options.analyticsRequest;
      if (options.rejectAnalyticsReport) return Promise.resolve(rejected('author analytics service is unavailable'));
      const parameters = endpoint.includes('?') ? new URLSearchParams(endpoint.split('?')[1]) : new URLSearchParams();
      const report = options.analyticsReport ?? analyticsReportFixture();
      return Promise.resolve(response({
        ...report,
        meta: {
          ...report.meta,
          from: parameters.get('from') ?? report.meta.from,
          to: parameters.get('to') ?? report.meta.to,
        },
      }));
    }

    const bookDetail = endpoint.match(/^author\/books\/(\d+)$/);
    if (method === 'PUT' && bookDetail) {
      if (options.rejectBookUpdate) return Promise.resolve(rejected('book metadata can only be edited while the book is a draft or rejected'));
      const bookId = Number(bookDetail[1]);
      const item = bookItems.find((book) => book.id === bookId);
      if (!item) return Promise.resolve(rejected(`Unknown book: ${bookId}`));
      const updated = {
        ...item,
        title: String(body.title),
        category: String(body.category),
        synopsis: String(body.synopsis),
        serialStatus: String(body.serialStatus),
      };
      bookItems = bookItems.map((book) => book.id === bookId ? updated : book);
      return Promise.resolve(response(updated));
    }
    if (method === 'DELETE' && bookDetail) {
      if (options.rejectBookDelete) return Promise.resolve(rejected('book has reader or transaction records and cannot be deleted'));
      const bookId = Number(bookDetail[1]);
      bookItems = bookItems.filter((book) => book.id !== bookId);
      return Promise.resolve(response({ id: bookId, deleted: true }));
    }

    const volumeList = endpoint.match(/^author\/books\/(\d+)\/volumes$/);
    if (method === 'GET' && volumeList) return Promise.resolve(response(volumesByBook[Number(volumeList[1])] ?? []));
    if (method === 'POST' && volumeList) {
      const bookId = Number(volumeList[1]);
      const volume = {
        id: Math.max(0, ...volumesByBook[bookId].map((item) => item.id)) + 1,
        bookId,
        title: String(body.title),
        orderNo: volumesByBook[bookId].length + 1,
        createdAt: '2026-07-21T12:00:00Z',
      };
      volumesByBook[bookId].push(volume);
      return Promise.resolve(response(volume));
    }

    const chapterList = endpoint.match(/^author\/books\/(\d+)\/chapters$/);
    if (method === 'GET' && chapterList) return Promise.resolve(response(chaptersByBook[Number(chapterList[1])] ?? []));
    if (method === 'POST' && chapterList) {
      const bookId = Number(chapterList[1]);
      const item = chapter({
        id: Math.max(0, ...chaptersByBook[bookId].map((existing) => existing.id)) + 1,
        bookId,
        volumeId: typeof body.volumeId === 'number' ? body.volumeId : null,
        title: String(body.title),
        content: String(body.content),
        orderNo: chaptersByBook[bookId].length + 1,
        status: body.submit ? 'PUBLISHED' : 'DRAFT',
        published: Boolean(body.submit),
      });
      chaptersByBook[bookId].push(item);
      return Promise.resolve(response(item));
    }

    const chapterDetail = endpoint.match(/^author\/books\/(\d+)\/chapters\/(\d+)$/);
    if (method === 'PUT' && chapterDetail) {
      if (options.rejectChapterUpdate) return Promise.resolve(rejected('only draft, scheduled, or published chapters can be edited'));
      const bookId = Number(chapterDetail[1]);
      const chapterId = Number(chapterDetail[2]);
      const item = chaptersByBook[bookId]?.find((existing) => existing.id === chapterId);
      if (!item) return Promise.resolve(rejected(`Unknown chapter: ${chapterId}`));
      const status = item.status === 'PUBLISHED' ? 'NEEDS_REVIEW' : item.status;
      const updated = {
        ...item,
        title: String(body.title),
        content: String(body.content),
        volumeId: typeof body.volumeId === 'number' ? body.volumeId : item.volumeId,
        status,
        published: status === 'PUBLISHED',
        scheduledPublishAt: status === 'NEEDS_REVIEW' ? null : item.scheduledPublishAt,
        reviewReason: status === 'NEEDS_REVIEW' ? '已修改已发布章节，等待整书复核' : '',
      };
      chaptersByBook[bookId] = chaptersByBook[bookId].map((existing) => existing.id === chapterId ? updated : existing);
      bookItems = bookItems.map((book) => book.id === bookId ? { ...book, words: book.words - item.content.length + updated.content.length, status: status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : book.status } : book);
      return Promise.resolve(response(updated));
    }
    if (method === 'DELETE' && chapterDetail) {
      const bookId = Number(chapterDetail[1]);
      const chapterId = Number(chapterDetail[2]);
      const item = chaptersByBook[bookId]?.find((existing) => existing.id === chapterId);
      if (!item) return Promise.resolve(rejected(`Unknown chapter: ${chapterId}`));
      chaptersByBook[bookId] = chaptersByBook[bookId].filter((existing) => existing.id !== chapterId);
      bookItems = bookItems.map((book) => book.id === bookId ? { ...book, words: book.words - item.content.length } : book);
      return Promise.resolve(response({ id: chapterId, deleted: true }));
    }

    const createDraft = endpoint.match(/^author\/books\/(\d+)\/volumes\/(\d+)\/chapters$/);
    if (method === 'POST' && createDraft) {
      const bookId = Number(createDraft[1]);
      const item = chapter({
        id: Math.max(0, ...chaptersByBook[bookId].map((existing) => existing.id)) + 1,
        bookId,
        volumeId: Number(createDraft[2]),
        title: String(body.title),
        content: String(body.content),
        orderNo: chaptersByBook[bookId].length + 1,
      });
      chaptersByBook[bookId].push(item);
      return Promise.resolve(response(item));
    }

    const scheduleDraft = endpoint.match(/^author\/books\/(\d+)\/chapters\/(\d+)\/schedule$/);
    if (method === 'POST' && scheduleDraft) {
      const bookId = Number(scheduleDraft[1]);
      const chapterId = Number(scheduleDraft[2]);
      const item = chaptersByBook[bookId].find((existing) => existing.id === chapterId);
      if (!item) return Promise.reject(new Error(`Unknown chapter: ${chapterId}`));
      const scheduled = { ...item, status: 'SCHEDULED', scheduledPublishAt: String(body.publishAt) };
      chaptersByBook[bookId] = chaptersByBook[bookId].map((existing) => existing.id === chapterId ? scheduled : existing);
      return Promise.resolve(response(scheduled));
    }

    const feedback = endpoint.match(/^author\/books\/(\d+)\/(comments|annotations)\?(.+)$/);
    if (method === 'GET' && feedback) {
      const bookId = Number(feedback[1]);
      const resource = feedback[2];
      const parameters = new URLSearchParams(feedback[3]);
      const page = Number(parameters.get('page') ?? 0);
      const size = Number(parameters.get('size') ?? 20);
      const commentsByBook: Record<number, CommentFixture[]> = {
        1: [
          { id: 11, bookId: 1, chapterId: 1001, userId: 41, authorName: '读者甲', content: '等待人工确认的段落', status: 'PENDING_REVIEW', createdAt: '2026-07-21T08:00:00Z' },
          { id: 12, bookId: 1, chapterId: null, userId: 42, authorName: '读者乙', content: '已经发布的书评', status: 'VISIBLE', createdAt: '2026-07-21T09:00:00Z' },
          { id: 13, bookId: 1, chapterId: null, userId: 43, authorName: '读者丙', content: '被驳回的书评', status: 'REJECTED', createdAt: '2026-07-21T10:00:00Z' },
        ],
        2: [{ id: 21, bookId: 2, chapterId: null, userId: 44, authorName: '读者丁', content: '第二部的评论', status: 'VISIBLE', createdAt: '2026-07-21T11:00:00Z' }],
      };
      const annotationsByBook: Record<number, AnnotationFixture[]> = {
        1: [
          { id: 301, bookId: 1, chapterId: 1001, userId: 51, authorName: '段评读者', paragraphIndex: 0, selectionStart: 0, selectionEnd: 5, selectedText: '雨落在旧港', note: '很喜欢这一段的氛围。', shareIntent: true, status: 'PENDING_REVIEW', createdAt: '2026-07-21T08:15:00Z' },
          { id: 302, bookId: 1, chapterId: 1001, userId: 52, authorName: '书友乙', paragraphIndex: 1, selectionStart: 2, selectionEnd: 8, selectedText: '信使留下了徽章', note: '伏笔很有意思。', shareIntent: true, status: 'VISIBLE', createdAt: '2026-07-21T09:15:00Z' },
        ],
        2: [],
      };
      if (resource === 'comments') {
        const items = commentsByBook[bookId] ?? [];
        return Promise.resolve(response({ items: items.slice(page * size, (page + 1) * size), meta: { total: items.length, page, size } }));
      }
      if (options.annotationRequest) return options.annotationRequest;
      if (options.rejectAnnotations) return Promise.resolve(rejected('shared annotation service is unavailable'));
      const annotationFixture = typeof options.annotationPage === 'function'
        ? options.annotationPage(bookId, page)
        : options.annotationPage;
      if (annotationFixture) return Promise.resolve(response({ ...annotationFixture, meta: { ...annotationFixture.meta, page, size } }));
      const items = annotationsByBook[bookId] ?? [];
      return Promise.resolve(response({ items: items.slice(page * size, (page + 1) * size), meta: { total: items.length, page, size } }));
    }

    return Promise.reject(new Error(`Unexpected request: ${endpoint}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('author manuscript workspace', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    push.mockReset();
    refresh.mockReset();
  });

  it('loads author-owned comments and explicitly shared annotations for the selected work', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: /灯塔卷/ });
    await screen.findByRole('heading', { name: '第 2 章 · 未寄出的信' });
    expect(screen.getByText('已排期')).toBeTruthy();
    await screen.findByText('等待人工确认的段落');
    await screen.findByText('已经发布的书评');
    await screen.findByText('被驳回的书评');
    expect(screen.getByText('待审核')).toBeTruthy();
    expect(screen.getByText('已公开')).toBeTruthy();
    expect(screen.getByText('未通过')).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole('tab', { name: '分享段评' }));
    await screen.findByText('雨落在旧港');
    expect(screen.getByText('很喜欢这一段的氛围。')).toBeTruthy();
    expect(screen.getByText('信使留下了徽章')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /夜航南岸.*继续编辑/ }));

    await screen.findByRole('button', { name: /夜航卷/ });
    await screen.findByRole('heading', { name: '第 1 章 · 离岸风' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '读者评论' }));
    await screen.findByText('第二部的评论');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2/chapters', expect.anything()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2/comments?size=20', expect.anything()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2/annotations?size=20', expect.anything()));
  });

  it('renders only explicitly shared annotations and never exposes author moderation controls', async () => {
    mockAuthorApi({
      annotationPage: {
        items: [
          { id: 401, bookId: 1, chapterId: 1001, userId: 70, authorName: '私密读者', paragraphIndex: 0, selectionStart: 0, selectionEnd: 4, selectedText: '不应显示的私密标注', note: '不应显示的私密备注', shareIntent: false, status: 'PRIVATE', createdAt: '2026-07-21T08:00:00Z' },
          { id: 402, bookId: 1, chapterId: 1001, userId: 71, authorName: '分享读者', paragraphIndex: 1, selectionStart: 0, selectionEnd: 4, selectedText: '明确分享的文本', note: '明确分享的段评', shareIntent: true, status: 'PENDING_REVIEW', createdAt: '2026-07-21T08:30:00Z' },
        ],
        meta: { total: 2, page: 0, size: 20 },
      },
    });
    render(<AuthorPage />);

    await screen.findByText('等待人工确认的段落');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '分享段评' }));
    expect(await screen.findByText('明确分享的文本')).toBeTruthy();
    expect(screen.queryByText('不应显示的私密标注')).toBeNull();
    expect(screen.queryByText('不应显示的私密备注')).toBeNull();
    expect(screen.queryByRole('button', { name: /通过|驳回|审核/ })).toBeNull();
  });

  it('shows empty, loading, and retryable failure states for shared annotations', async () => {
    const pending = deferred<Response>();
    mockAuthorApi({ annotationRequest: pending.promise });
    const firstRender = render(<AuthorPage />);

    await screen.findByText('等待人工确认的段落');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '分享段评' }));
    expect(screen.getByText('正在加载分享段评...')).toBeTruthy();
    await act(async () => {
      pending.resolve(response({ items: [], meta: { total: 0, page: 0, size: 20 } }));
    });
    expect(await screen.findByText('暂时没有分享段评')).toBeTruthy();
    firstRender.unmount();

    const fetchMock = mockAuthorApi({ rejectAnnotations: true });
    render(<AuthorPage />);
    await screen.findByText('等待人工确认的段落');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '分享段评' }));
    expect(await screen.findByText(/分享段评无法显示：shared annotation service is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/novel/author/books/1/annotations?size=20')).toHaveLength(2));
  });

  it('uses the shared pagination controls to load later shared-annotation pages', async () => {
    const fetchMock = mockAuthorApi({
      annotationPage: (_bookId, page) => page === 1
        ? {
          items: [{ id: 502, bookId: 1, chapterId: 1001, userId: 82, authorName: '第二页读者', paragraphIndex: 2, selectionStart: 0, selectionEnd: 6, selectedText: '第二页段评文本', note: '第二页备注', shareIntent: true, status: 'VISIBLE', createdAt: '2026-07-21T10:00:00Z' }],
          meta: { total: 21, page, size: 20 },
        }
        : {
          items: [{ id: 501, bookId: 1, chapterId: 1001, userId: 81, authorName: '第一页读者', paragraphIndex: 1, selectionStart: 0, selectionEnd: 6, selectedText: '第一页段评文本', note: '第一页备注', shareIntent: true, status: 'VISIBLE', createdAt: '2026-07-21T09:00:00Z' }],
          meta: { total: 21, page, size: 20 },
        },
    });
    render(<AuthorPage />);

    await screen.findByText('等待人工确认的段落');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '分享段评' }));
    expect(await screen.findByText('第一页段评文本')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: '分享段评分页' })).getByRole('link', { name: '下一页' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/annotations?page=1&size=20', expect.anything()));
    expect(await screen.findByText('第二页段评文本')).toBeTruthy();
  });

  it('creates a volume and saves a draft inside the selected volume', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: /灯塔卷/ });
    fireEvent.change(screen.getByLabelText('卷册名称'), { target: { value: '回声卷' } });
    fireEvent.click(screen.getByRole('button', { name: '新建卷册' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/volumes', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: '回声卷' }),
    })));
    await screen.findByRole('button', { name: /回声卷/ });

    fireEvent.change(screen.getByLabelText('章节标题'), { target: { value: '新存稿' } });
    fireEvent.change(screen.getByLabelText('章节正文'), { target: { value: '这一章将被保存在新建卷册。' } });
    fireEvent.click(screen.getByRole('button', { name: '保存章节草稿' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/volumes/102/chapters', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: '新存稿', content: '这一章将被保存在新建卷册。' }),
    })));
    await screen.findByRole('heading', { name: '第 5 章 · 新存稿' });
    expect(screen.getByText('章节草稿已保存')).toBeTruthy();
  });

  it('schedules the draft selected from the chapter list with a future timestamp', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    const draftHeading = await screen.findByRole('heading', { name: '第 3 章 · 备选存稿' });
    const draftItem = draftHeading.closest('article');
    expect(draftItem).not.toBeNull();
    fireEvent.click(within(draftItem as HTMLElement).getByRole('button', { name: '选择草稿' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '待排期草稿' }).closest('article')?.textContent).toContain('备选存稿'));

    fireEvent.change(screen.getByLabelText('发布时间'), { target: { value: '2030-01-02T13:30' } });
    fireEvent.click(screen.getByRole('button', { name: '安排定时发布' }));

    const expectedPublishAt = new Date('2030-01-02T13:30').toISOString();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/chapters/1003/schedule', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ publishAt: expectedPublishAt }),
    })));
    await waitFor(() => {
      const item = screen.getByRole('heading', { name: '第 3 章 · 备选存稿' }).closest('article');
      expect(item).not.toBeNull();
      expect(within(item as HTMLElement).getByText('已排期')).toBeTruthy();
    });
  });

  it('reports an expired publication time without sending a schedule request', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '安排定时发布' });
    fireEvent.change(screen.getByLabelText('发布时间'), { target: { value: '2020-01-01T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: '安排定时发布' }));

    await screen.findByText('发布时间必须是当前时间之后的有效日期。');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/schedule'))).toBe(false);
  });

  it('updates metadata for an eligible draft book through the author API', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '编辑作品《夜航南岸》' });
    fireEvent.click(screen.getByRole('button', { name: '编辑作品《夜航南岸》' }));
    await screen.findByRole('dialog', { name: '修改作品信息' });

    fireEvent.change(screen.getByLabelText('编辑作品名称'), { target: { value: '夜航新岸' } });
    fireEvent.change(screen.getByLabelText('编辑作品简介'), { target: { value: '更新后的故事简介' } });
    fireEvent.click(screen.getByRole('button', { name: '保存作品信息' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ title: '夜航新岸', category: '科幻', synopsis: '更新后的故事简介', serialStatus: '连载中' }),
    })));
    await screen.findByText('《夜航新岸》的作品信息已保存');
    expect(screen.getByText('夜航新岸')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '修改作品信息' })).toBeNull();
  });

  it('edits a scheduled chapter without losing its scheduled publication state', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '编辑章节《潮汐预告》' });
    fireEvent.click(screen.getByRole('button', { name: '编辑章节《潮汐预告》' }));
    await screen.findByRole('dialog', { name: '修改章节' });

    fireEvent.change(screen.getByLabelText('编辑章节标题'), { target: { value: '潮汐修订稿' } });
    fireEvent.change(screen.getByLabelText('编辑章节正文'), { target: { value: '更新后的排期正文' } });
    fireEvent.click(screen.getByRole('button', { name: '保存章节' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/chapters/1004', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ title: '潮汐修订稿', content: '更新后的排期正文' }),
    })));
    await waitFor(() => {
      const item = screen.getByRole('heading', { name: '第 4 章 · 潮汐修订稿' }).closest('article');
      expect(item).not.toBeNull();
      expect(within(item as HTMLElement).getByText('已排期')).toBeTruthy();
    });
  });

  it('surfaces the server review state after editing a published chapter', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '编辑章节《抵达旧港》' });
    fireEvent.click(screen.getByRole('button', { name: '编辑章节《抵达旧港》' }));
    await screen.findByText('修改已发布章节后，服务端会将章节和整部作品转入复核，修改不会立即公开。');

    fireEvent.change(screen.getByLabelText('编辑章节标题'), { target: { value: '重访旧港' } });
    fireEvent.change(screen.getByLabelText('编辑章节正文'), { target: { value: '公开章节的修订正文' } });
    fireEvent.click(screen.getByRole('button', { name: '保存章节' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/chapters/1001', expect.objectContaining({ method: 'PUT' })));
    await screen.findByText('《重访旧港》已保存，已发布章节的修改已送入整书复核。');
    await waitFor(() => {
      const item = screen.getByRole('heading', { name: '第 1 章 · 重访旧港' }).closest('article');
      expect(item).not.toBeNull();
      expect(within(item as HTMLElement).getByText('需复核')).toBeTruthy();
      expect(within(item as HTMLElement).getByText('已修改已发布章节，等待整书复核')).toBeTruthy();
    });
  });

  it('deletes an eligible draft chapter after explicit confirmation', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '删除章节《备选存稿》' });
    fireEvent.click(screen.getByRole('button', { name: '删除章节《备选存稿》' }));
    await screen.findByRole('alertdialog', { name: '删除章节' });
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/1/chapters/1003', expect.objectContaining({ method: 'DELETE' })));
    await screen.findByText('《备选存稿》已删除');
    await waitFor(() => expect(screen.queryByRole('heading', { name: '第 3 章 · 备选存稿' })).toBeNull());
  });

  it('deletes an eligible draft book after explicit confirmation', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '删除作品《夜航南岸》' });
    fireEvent.click(screen.getByRole('button', { name: '删除作品《夜航南岸》' }));
    await screen.findByRole('alertdialog', { name: '删除作品' });
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2', expect.objectContaining({ method: 'DELETE' })));
    await screen.findByText('《夜航南岸》及其未发布内容已删除');
    await waitFor(() => expect(screen.queryByRole('button', { name: '编辑作品《夜航南岸》' })).toBeNull());
  });

  it('keeps the confirmation open and shows the server rejection when a deletion is refused', async () => {
    const fetchMock = mockAuthorApi({ rejectBookDelete: true });
    render(<AuthorPage />);

    await screen.findByRole('button', { name: '删除作品《夜航南岸》' });
    fireEvent.click(screen.getByRole('button', { name: '删除作品《夜航南岸》' }));
    await screen.findByRole('alertdialog', { name: '删除作品' });
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/books/2', expect.objectContaining({ method: 'DELETE' })));
    const rejection = await screen.findByRole('alert');
    expect(rejection.textContent).toContain('删除未完成：book has reader or transaction records and cannot be deleted');
    expect(screen.getByRole('alertdialog', { name: '删除作品' })).toBeTruthy();
    expect(screen.getAllByText('夜航南岸', { selector: 'span' }).length).toBeGreaterThan(0);
  });

  it('shows author-owned shelf, purchase, and current read-through analytics without fabricating subscription or retention', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    const analytics = await screen.findByRole('region', { name: '收藏、购书与阅读进度' });
    expect(await within(analytics).findByText('12')).toBeTruthy();
    expect(within(analytics).getByText('65.5%')).toBeTruthy();
    expect(within(analytics).getByText(/当前没有按作品或作者归因的订阅事件/)).toBeTruthy();
    expect(within(analytics).getByText(/阅读进度只保存最新位置，无法还原读者回访序列/)).toBeTruthy();
    expect(within(analytics).getByRole('columnheader', { name: '新增收藏' })).toBeTruthy();
    expect(within(analytics).getByRole('row', { name: /2026-07-21.*3.*2.*60/ })).toBeTruthy();
    expect(within(analytics).getByRole('row', { name: /北岸灯塔.*9.*3.*70%/ })).toBeTruthy();
    expect(within(analytics).getByText(/代币不是法币收入/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/analytics', expect.anything()));
  });

  it('passes a selected work and bounded date range to author analytics', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    const analytics = await screen.findByRole('region', { name: '收藏、购书与阅读进度' });
    await within(analytics).findByText('12');
    fireEvent.click(within(analytics).getByRole('combobox', { name: '作品数据作品筛选' }));
    fireEvent.click(await screen.findByRole('option', { name: '夜航南岸' }));
    fireEvent.change(within(analytics).getByLabelText('作品数据起始日期'), { target: { value: '2026-07-01' } });
    fireEvent.change(within(analytics).getByLabelText('作品数据结束日期'), { target: { value: '2026-07-21' } });
    fireEvent.click(within(analytics).getByRole('button', { name: '查询' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/analytics?bookId=2&from=2026-07-01&to=2026-07-21', expect.anything()));
  });

  it('shows a focused retry state when author analytics cannot load', async () => {
    mockAuthorApi({ rejectAnalyticsReport: true });
    render(<AuthorPage />);

    const analytics = await screen.findByRole('region', { name: '收藏、购书与阅读进度' });
    expect(await within(analytics).findByText('作品数据无法显示：author analytics service is unavailable')).toBeTruthy();
    expect(within(analytics).getByRole('button', { name: '重试' })).toBeTruthy();
  });

  it('loads the token-only reward report with its aggregate and record table', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    await within(rewards).findByRole('cell', { name: '北岸灯塔' });
    expect(within(rewards).getByText('读者 #301')).toBeTruthy();
    expect(within(rewards).getByText('50')).toBeTruthy();
    expect(within(rewards).getByRole('columnheader', { name: '代币' })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/reward-records?page=0&size=10', expect.anything()));
  });

  it('uses the shared pagination navigation to load the next reward report page', async () => {
    const pagedReport = rewardReportFixture();
    pagedReport.meta.total = 12;
    const fetchMock = mockAuthorApi({ rewardReport: pagedReport });
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    const pagination = await within(rewards).findByRole('navigation', { name: '打赏记录分页' });
    const previous = within(pagination).getByRole('link', { name: '上一页' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(previous.getAttribute('tabindex')).toBe('-1');

    fireEvent.click(within(pagination).getByRole('link', { name: '下一页' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/reward-records?page=1&size=10', expect.anything()));
    expect(within(pagination).getByText('第 2 页')).toBeTruthy();
  });

  it('keeps pagination available to recover from an empty stale reward page', async () => {
    const firstPage = rewardReportFixture();
    firstPage.meta.total = 12;
    const stalePage = rewardReportFixture();
    stalePage.items = [];
    stalePage.meta.total = 2;
    const fetchMock = mockAuthorApi({ rewardReport: (page) => page === 1 ? stalePage : firstPage });
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    const firstPagination = await within(rewards).findByRole('navigation', { name: '打赏记录分页' });
    fireEvent.click(within(firstPagination).getByRole('link', { name: '下一页' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/reward-records?page=1&size=10', expect.anything()));

    expect(await within(rewards).findByText('暂时没有符合条件的打赏记录')).toBeTruthy();
    const stalePagination = within(rewards).getByRole('navigation', { name: '打赏记录分页' });
    expect(within(stalePagination).getByText('第 2 页')).toBeTruthy();
    expect(within(stalePagination).getByRole('link', { name: '上一页' }).getAttribute('aria-disabled')).toBe('false');
    expect(within(stalePagination).getByRole('link', { name: '下一页' }).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(within(stalePagination).getByRole('link', { name: '上一页' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/reward-records?page=0&size=10', expect.anything()));
    expect(await within(rewards).findByText('第 1 页')).toBeTruthy();
  });

  it('sends selected work and inclusive date filters when querying reward records', async () => {
    const fetchMock = mockAuthorApi();
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    await within(rewards).findByRole('cell', { name: '北岸灯塔' });
    fireEvent.click(within(rewards).getByRole('combobox', { name: '作品' }));
    fireEvent.click(await screen.findByRole('option', { name: '夜航南岸' }));
    fireEvent.change(within(rewards).getByLabelText('打赏记录起始日期'), { target: { value: '2026-07-01' } });
    fireEvent.change(within(rewards).getByLabelText('打赏记录结束日期'), { target: { value: '2026-07-21' } });
    fireEvent.click(within(rewards).getByRole('button', { name: '查询' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/author/reward-records?bookId=2&from=2026-07-01&to=2026-07-21&page=0&size=10', expect.anything()));
  });

  it('shows a dedicated empty state when a reward query has no records', async () => {
    const emptyReport = rewardReportFixture();
    emptyReport.items = [];
    emptyReport.summary = { rewardCount: 0, totalTokens: 0, amountUnit: 'TOKEN' };
    emptyReport.meta = { ...emptyReport.meta, total: 0 };
    mockAuthorApi({ rewardReport: emptyReport });
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    expect(await within(rewards).findByText('暂时没有符合条件的打赏记录')).toBeTruthy();
    expect(within(rewards).queryByRole('navigation', { name: '打赏记录分页' })).toBeNull();
  });

  it('shows an accessible loading state before the reward report resolves', async () => {
    const pendingReward = deferred<Response>();
    mockAuthorApi({ rewardRequest: pendingReward.promise });
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    expect(await within(rewards).findByText('正在加载打赏记录...')).toBeTruthy();
    await act(async () => { pendingReward.resolve(response(rewardReportFixture())); });
    expect(await within(rewards).findByRole('cell', { name: '北岸灯塔' })).toBeTruthy();
  });

  it('shows the API failure and retry action when the reward report is unavailable', async () => {
    mockAuthorApi({ rejectRewardReport: true });
    render(<AuthorPage />);

    const rewards = await screen.findByRole('region', { name: '读者打赏记录' });
    expect(await within(rewards).findByText('打赏记录无法显示：reward report service is unavailable')).toBeTruthy();
    expect(within(rewards).getByRole('button', { name: '重试' })).toBeTruthy();
  });
});
