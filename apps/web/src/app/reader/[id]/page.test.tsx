import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/reader/7',
  useRouter: () => ({ push, refresh }),
}));

import Reader from './page';

const book = {
  id: 7,
  title: '雾港纪事',
  author: '林见川',
  category: '幻想',
  words: 62_000,
  synopsis: '测试作品简介',
  status: 'PUBLISHED',
  serialStatus: 'SERIALIZING',
  cover: '/cover.png',
  purchasePrice: 30,
};

const detail = {
  book,
  chapters: [
    { id: 101, title: '潮汐之前', content: '第一段。\n第二段。', published: true, orderNo: 1 },
    { id: 102, title: '灯塔来信', content: '第三段。\n第四段。', published: true, orderNo: 2 },
    { id: 103, title: '北岸的雨', content: '第五段。', published: true, orderNo: 3 },
  ],
  comments: [],
};

type PageMode = 'slide' | 'cover' | 'simulation';
type RewardHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type AnnotationHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PurchaseHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SubscriptionHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ChapterCommentsHandler = (chapterId: number, input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CommentPostHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ReaderApiOptions = {
  bookDetail?: unknown;
  protectedReading?: unknown;
  rewardHandler?: RewardHandler;
  annotationHandler?: AnnotationHandler;
  purchaseHandler?: PurchaseHandler;
  chapterComments?: Record<number, unknown[]>;
  chapterCommentsHandler?: ChapterCommentsHandler;
  commentPostHandler?: CommentPostHandler;
  annotations?: unknown[];
  publicAnnotations?: Record<number, unknown[]>;
  interactionStats?: { visibleCommentCount: number; ratingCount: number; averageRating: number; recommendationVoteCount: number; monthlyVoteCount: number };
  wallet?: { tokens: number };
  entitlements?: { membership: unknown; books: unknown[] };
  shelfSaved?: boolean;
  subscription?: { bookId: number; subscribed: boolean; subscribedAt: string | null };
  subscriptionHandler?: SubscriptionHandler;
};

let readerPageTrack: { pageCount: number; width: number; scrollTo: ReturnType<typeof vi.fn> } | undefined;

function mockReaderPageTrack(pageCount: number, width = 360) {
  const scrollTo = vi.fn(function scrollTo(this: HTMLElement, options: { left?: number }) {
    this.scrollLeft = options.left ?? 0;
  });
  readerPageTrack = { pageCount, width, scrollTo };
  Object.defineProperties(HTMLDivElement.prototype, {
    clientWidth: {
      configurable: true,
      get() {
        return this.classList.contains('reader-chapter-pages') ? readerPageTrack?.width ?? 0 : 0;
      },
    },
    scrollWidth: {
      configurable: true,
      get() {
        return this.classList.contains('reader-chapter-pages')
          ? (readerPageTrack?.pageCount ?? 1) * (readerPageTrack?.width ?? 0)
          : 0;
      },
    },
    scrollTo: { configurable: true, value: scrollTo },
  });
  return scrollTo;
}

function response(data: unknown) {
  return {
    ok: true,
    json: async () => ({ data }),
  } as Response;
}

function failedResponse(msg: string) {
  return {
    ok: false,
    json: async () => ({ data: null, msg }),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function preference(pageMode: PageMode) {
  return {
    theme: 'paper' as const,
    font: 'serif',
    fontSize: 19,
    lineHeight: 190,
    brightness: 85,
    pageMode,
  };
}

function mockReaderApi(pageMode: PageMode, progress: unknown = null, options: ReaderApiOptions = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);

    if (path.endsWith('/public/books/7')) return Promise.resolve(response(options.bookDetail ?? detail));
    if (path.endsWith('/account/books/7/reading')) {
      return Promise.resolve(options.protectedReading === undefined ? failedResponse('login required') : response(options.protectedReading));
    }
    if (path.endsWith('/public/books/7/interactions')) return Promise.resolve(response(options.interactionStats ?? {
      visibleCommentCount: 0,
      ratingCount: 0,
      averageRating: 0,
      recommendationVoteCount: 0,
      monthlyVoteCount: 0,
    }));
    const chapterCommentsMatch = path.match(/\/(?:public|account)\/books\/7\/comments\?chapterId=(\d+)&page=(\d+)&size=(\d+)$/);
    if (chapterCommentsMatch) {
      const chapterId = Number(chapterCommentsMatch[1]);
      const page = Number(chapterCommentsMatch[2]);
      const size = Number(chapterCommentsMatch[3]);
      const items = options.chapterComments?.[chapterId] ?? [];
      return options.chapterCommentsHandler?.(chapterId, input, init)
        ?? Promise.resolve(response({ items, meta: { total: items.length, page, size } }));
    }
    if (path.endsWith('/account/preferences/reading')) {
      if (init?.method === 'PUT') return Promise.resolve(response(JSON.parse(String(init.body))));
      return Promise.resolve(response(preference(pageMode)));
    }
    if (path.endsWith('/account/bookshelf/7')) return Promise.resolve(response({ saved: options.shelfSaved ?? false }));
    if (path.endsWith('/account/subscriptions/7')) {
      if (options.subscriptionHandler) return options.subscriptionHandler(input, init);
      if (init?.method === 'PUT') return Promise.resolve(response({ bookId: 7, subscribed: true, subscribedAt: '2026-07-23T00:00:00Z' }));
      if (init?.method === 'DELETE') return Promise.resolve(response({ bookId: 7, subscribed: false, subscribedAt: null }));
      return Promise.resolve(response(options.subscription ?? { bookId: 7, subscribed: false, subscribedAt: null }));
    }
    if (path.endsWith('/account/books/7/bookmarks')) return Promise.resolve(response([]));
    if (path.endsWith('/account/books/7/progress')) {
      const currentBookProgress = Array.isArray(progress)
        ? progress.find((item) => typeof item === 'object' && item !== null && (item as { bookId?: unknown }).bookId === 7) ?? null
        : progress;
      return Promise.resolve(response(currentBookProgress));
    }
    if (path.endsWith('/account/annotations?bookId=7&size=100')) {
      return Promise.resolve(response({ items: options.annotations ?? [], meta: { total: options.annotations?.length ?? 0, page: 0, size: 100 } }));
    }
    if (path.endsWith('/account/wallet')) return Promise.resolve(response(options.wallet ?? { tokens: 120 }));
    if (path.endsWith('/account/entitlements')) return Promise.resolve(response(options.entitlements ?? { membership: null, books: [] }));
    const publicAnnotationsMatch = path.match(/\/public\/books\/7\/chapters\/(\d+)\/annotations$/);
    if (publicAnnotationsMatch) {
      const items = options.publicAnnotations?.[Number(publicAnnotationsMatch[1])] ?? [];
      return Promise.resolve(response({ items, meta: { total: items.length, page: 0, size: 20 } }));
    }
    if (path.endsWith('/account/books/7/chapters/101/annotations')) {
      if (init?.method === 'GET') {
        const items = options.publicAnnotations?.[101] ?? [];
        return Promise.resolve(response({ items, meta: { total: items.length, page: 0, size: 20 } }));
      }
      return options.annotationHandler?.(input, init) ?? Promise.resolve(response({
        id: 91,
        bookId: 7,
        chapterId: 101,
        userId: 3,
        authorName: '演示读者',
        paragraphIndex: 0,
        selectionStart: 0,
        selectionEnd: 3,
        selectedText: '第一段',
        note: '',
        shareIntent: false,
        status: 'PRIVATE',
        createdAt: '2026-07-21T00:00:00Z',
      }));
    }
    if (path.endsWith('/account/books/7/votes/monthly')) return Promise.resolve(response({ count: 1 }));
    if (path.endsWith('/account/books/7/comments')) return options.commentPostHandler?.(input, init) ?? Promise.resolve(response({
      id: 701,
      bookId: 7,
      chapterId: 101,
      userId: 3,
      authorName: '演示读者',
      content: '测试评论',
      status: 'VISIBLE',
      createdAt: '2026-07-21T00:00:00Z',
    }));
    if (path.endsWith('/account/books/7/reward')) return options.rewardHandler?.(input, init) ?? Promise.resolve(response({ bookId: 7, amount: 1, balance: 99 }));
    if (path.endsWith('/account/books/7/purchase')) return options.purchaseHandler?.(input, init) ?? Promise.resolve(response({ bookId: 7, purchased: true, balance: 90 }));
    return Promise.resolve(response({}));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockMotionPreference(matches: boolean) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches, addEventListener, removeEventListener }));
}

async function renderReader(mode: PageMode = 'slide', progress: unknown = null, chapterTitle = '潮汐之前', options: ReaderApiOptions = {}) {
  const fetchMock = mockReaderApi(mode, progress, options);
  render(<Reader params={Promise.resolve({ id: '7' })} />);
  await screen.findByRole('heading', { name: chapterTitle });
  return fetchMock;
}

function selectParagraphText(paragraph: HTMLElement, start: number, end: number) {
  const textNode = paragraph.firstChild;
  if (!textNode) throw new Error('paragraph does not contain text');
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(paragraph);
}

function readerParagraph(index: number) {
  const paragraph = screen.getByTestId('reader-current-chapter').querySelector(`[data-paragraph-index="${index}"]`);
  if (!(paragraph instanceof HTMLElement)) throw new Error(`reader paragraph ${index} is missing`);
  return paragraph;
}

describe('reader page modes', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    readerPageTrack = undefined;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    push.mockReset();
    refresh.mockReset();
    mockMotionPreference(false);
  });

  it.each([
    ['slide', 'paired-slide'],
    ['cover', 'cover-reveal'],
    ['simulation', 'page-turn'],
  ] as const)('uses the %s chapter transition with the correct direction', async (mode, effect) => {
    await renderReader(mode);

    const surface = screen.getByTestId('reader-page-surface');
    expect(surface.getAttribute('data-page-mode')).toBe(mode);
    expect(surface.getAttribute('aria-keyshortcuts')).toBe('ArrowLeft ArrowRight PageUp PageDown');

    fireEvent.click(screen.getByRole('button', { name: '下一章' }));

    await screen.findByRole('heading', { name: '灯塔来信' });
    const transition = screen.getByTestId('reader-transition-layer');
    expect(transition.getAttribute('data-transition-mode')).toBe(mode);
    expect(transition.getAttribute('data-transition-effect')).toBe(effect);
    expect(transition.getAttribute('data-transition-direction')).toBe('forward');
    expect(screen.getByTestId('reader-current-chapter').getAttribute('data-transition-effect')).toBe(effect);
    expect(screen.getByRole('status').textContent).toContain('已切换至第 2 章《灯塔来信》');
  });

  it.each([
    ['slide', 'paired-slide'],
    ['cover', 'cover-reveal'],
    ['simulation', 'page-turn'],
  ] as const)('turns an in-chapter page with the %s transition', async (mode, effect) => {
    const scrollTo = mockReaderPageTrack(3);
    await renderReader(mode);

    expect(screen.getByTestId('reader-current-chapter').querySelector('.reader-chapter-pages')?.clientWidth).toBe(360);
    expect(screen.getByTestId('reader-current-chapter').querySelector('.reader-chapter-pages')?.scrollWidth).toBe(1080);
    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 1 / 3 页'));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 2 / 3 页'));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 360, behavior: 'auto' });
    const transition = screen.getByTestId('reader-transition-layer');
    expect(transition.getAttribute('data-transition-effect')).toBe(effect);
    expect(transition.getAttribute('data-transition-direction')).toBe('forward');
  });

  it('keeps the selected page visible after its transition finishes', async () => {
    mockReaderPageTrack(3);
    await renderReader();

    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 1 / 3 页'));
    const pageTrack = screen.getByTestId('reader-current-chapter').querySelector('.reader-chapter-pages');
    if (!(pageTrack instanceof HTMLDivElement)) throw new Error('reader page track is missing');

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(pageTrack.scrollLeft).toBe(360);

    act(() => { vi.advanceTimersByTime(460); });

    expect(screen.queryByTestId('reader-transition-layer')).toBeNull();
    expect(screen.getByTestId('reader-current-chapter').querySelector('.reader-chapter-pages')).toBe(pageTrack);
    expect(pageTrack.scrollLeft).toBe(360);
  });

  it('moves backward across a chapter boundary to the previous chapter final page', async () => {
    mockReaderPageTrack(3);
    await renderReader('slide', { bookId: 7, chapterId: 102, offset: 0, updatedAt: '2026-07-20T00:01:00Z' }, '灯塔来信', {
      protectedReading: detail,
    });

    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 1 / 3 页'));
    fireEvent.click(screen.getByRole('button', { name: '上一章' }));

    await screen.findByRole('heading', { name: '潮汐之前' });
    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 3 / 3 页'));
    expect(screen.getByTestId('reader-transition-layer').getAttribute('data-transition-direction')).toBe('backward');
  });

  it('keeps page navigation functional without visual animation under reduced motion', async () => {
    mockMotionPreference(true);
    mockReaderPageTrack(3);
    await renderReader('simulation');

    const surface = screen.getByTestId('reader-page-surface');
    await waitFor(() => expect(surface.getAttribute('data-motion')).toBe('reduced'));
    fireEvent.keyDown(surface, { key: 'ArrowRight' });

    await waitFor(() => expect(screen.getByTestId('reader-current-chapter').textContent).toContain('第 2 / 3 页'));
    expect(screen.queryByTestId('reader-transition-layer')).toBeNull();
  });

  it('persists the selected page mode and uses it for the next transition', async () => {
    const fetchMock = await renderReader('slide');

    fireEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    expect(screen.getByRole('slider', { name: '字号' }).getAttribute('data-slot')).toBe('slider-thumb');
    expect(screen.getByRole('slider', { name: '行距' }).getAttribute('data-slot')).toBe('slider-thumb');
    fireEvent.click(screen.getByRole('combobox', { name: '翻页模式' }));
    fireEvent.click(await screen.findByRole('option', { name: '覆盖' }));

    await waitFor(() => expect(screen.getByTestId('reader-page-surface').getAttribute('data-page-mode')).toBe('cover'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/preferences/reading',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(preference('cover')),
      }),
    ));

    fireEvent.click(screen.getByRole('button', { name: '下一章' }));
    await screen.findByRole('heading', { name: '灯塔来信' });
    expect(screen.getByTestId('reader-transition-layer').getAttribute('data-transition-effect')).toBe('cover-reveal');
  });

  it('uses the shared toggle group to persist the selected reading theme', async () => {
    const fetchMock = await renderReader('slide');

    fireEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    const paperTheme = screen.getByRole('radio', { name: '纸白' });
    expect(paperTheme.getAttribute('data-slot')).toBe('toggle-group-item');
    expect(paperTheme.getAttribute('data-state')).toBe('on');

    fireEvent.click(screen.getByRole('radio', { name: '夜读' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/preferences/reading',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...preference('slide'), theme: 'night' }),
      }),
    ));
    expect(screen.getByRole('radio', { name: '夜读' }).getAttribute('data-state')).toBe('on');
  });

  it('persists a committed font-size change from the shared slider', async () => {
    const fetchMock = await renderReader('slide');

    fireEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    const fontSize = screen.getByRole('slider', { name: '字号' });
    fireEvent.keyDown(fontSize, { key: 'ArrowRight' });
    fireEvent.keyUp(fontSize, { key: 'ArrowRight' });

    await waitFor(() => expect(fontSize.getAttribute('aria-valuenow')).toBe('20'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/preferences/reading',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...preference('slide'), fontSize: 20 }),
      }),
    ));
  });

  it('applies and persists the selected font family and brightness settings', async () => {
    const fetchMock = await renderReader('slide');

    fireEvent.click(screen.getByRole('button', { name: '阅读设置' }));
    const chapter = screen.getByTestId('reader-current-chapter');
    expect(chapter.style.fontFamily).toContain('Songti SC');
    expect(chapter.style.fontFamily).toContain('Noto Sans SC Local');
    expect(chapter.style.filter).toBe('brightness(85%)');

    fireEvent.click(screen.getByRole('combobox', { name: '字体' }));
    fireEvent.click(await screen.findByRole('option', { name: '无衬线' }));

    await waitFor(() => expect(chapter.style.fontFamily).toContain('PingFang SC'));
    expect(chapter.style.fontFamily).toContain('Noto Sans SC Local');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/preferences/reading',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...preference('slide'), font: 'sans' }),
      }),
    ));

    const brightness = screen.getByRole('slider', { name: '亮度' });
    fireEvent.keyDown(brightness, { key: 'ArrowRight' });
    fireEvent.keyUp(brightness, { key: 'ArrowRight' });

    await waitFor(() => expect(brightness.getAttribute('aria-valuenow')).toBe('86'));
    expect(chapter.style.filter).toBe('brightness(86%)');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/preferences/reading',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ...preference('slide'), font: 'sans', brightness: 86 }),
      }),
    ));
  });

  it('restores the saved chapter for this book without overwriting valid progress', async () => {
    const fetchMock = await renderReader('slide',
      { bookId: 7, chapterId: 102, offset: 24, updatedAt: '2026-07-20T00:01:00Z' },
      '灯塔来信',
      { shelfSaved: true });

    expect(screen.getByRole('heading', { name: '灯塔来信' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '已加入书架' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/bookshelf/7', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/books/7/progress', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/novel/account/bookshelf', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith('/api/novel/account/progress', expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/novel/account/progress',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('falls back to the first chapter when saved progress refers to a missing chapter', async () => {
    const fetchMock = await renderReader('slide',
      { bookId: 7, chapterId: 999, offset: 24, updatedAt: '2026-07-20T00:01:00Z' },
      '潮汐之前',
      { protectedReading: detail });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/progress',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ bookId: 7, chapterId: 101, offset: 0 }),
      }),
    ));
    expect(screen.getByTestId('reader-current-chapter').textContent).toContain('潮汐之前');
  });

  it('skips visual animation under reduced motion while keeping keyboard chapter navigation available', async () => {
    mockMotionPreference(true);
    await renderReader('simulation');

    const surface = screen.getByTestId('reader-page-surface');
    await waitFor(() => expect(surface.getAttribute('data-motion')).toBe('reduced'));
    surface.focus();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });

    await screen.findByRole('heading', { name: '灯塔来信' });
    expect(document.activeElement).toBe(surface);
    expect(screen.queryByTestId('reader-transition-layer')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('已减少动态效果');
  });

  it('opens the mobile chapter directory and selects a chapter from its scroll area', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', { protectedReading: detail });

    fireEvent.click(screen.getByRole('button', { name: '打开阅读目录' }));

    const directory = await screen.findByRole('dialog', { name: '雾港纪事' });
    expect(directory.querySelector('[data-slot="scroll-area"]')).toBeTruthy();
    fireEvent.click(within(directory).getByRole('button', { name: /灯塔来信/ }));

    await screen.findByRole('heading', { name: '灯塔来信' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '雾港纪事' })).toBeNull());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/progress',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ bookId: 7, chapterId: 102, offset: 0 }),
      }),
    ));
  });

  it('restores the protected reader rating after a refresh', async () => {
    await renderReader('slide', [], '潮汐之前', {
      protectedReading: { ...detail, currentUserRating: 4 },
    });

    expect(screen.getByRole('button', { name: '评分 4 星' }).querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    expect(screen.getByRole('button', { name: '评分 5 星' }).querySelector('svg')?.getAttribute('fill')).toBe('none');
  });

  it('restores the authenticated reader free-subscription state separately from the bookshelf', async () => {
    const fetchMock = await renderReader('slide', null, '潮汐之前', {
      protectedReading: detail,
      shelfSaved: true,
      subscription: { bookId: 7, subscribed: true, subscribedAt: '2026-07-23T00:00:00Z' },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/subscriptions/7',
      expect.anything(),
    ));
    const subscriptionButton = await screen.findByRole('button', { name: '取消订阅' });
    expect(subscriptionButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '已加入书架' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '免费订阅' })).toBeTruthy();
  });

  it('does not request free-subscription state for an anonymous preview reader', async () => {
    const fetchMock = await renderReader();

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/novel/account/subscriptions/7',
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: '订阅作品' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('subscribes and unsubscribes a free work through the dedicated idempotent endpoints', async () => {
    const fetchMock = await renderReader('slide', null, '潮汐之前', { protectedReading: detail });

    fireEvent.click(screen.getByRole('button', { name: '订阅作品' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/subscriptions/7',
      expect.objectContaining({ method: 'PUT' }),
    ));
    expect(await screen.findByText('已免费订阅本作品。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消订阅' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '取消订阅' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/subscriptions/7',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    expect(await screen.findByText('已取消订阅本作品。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '订阅作品' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps a loaded free subscription state when cancellation fails', async () => {
    await renderReader('slide', null, '潮汐之前', {
      protectedReading: detail,
      subscriptionHandler: (_input, init) => init?.method === 'DELETE'
        ? Promise.resolve(failedResponse('订阅服务暂不可用'))
        : Promise.resolve(response({ bookId: 7, subscribed: true, subscribedAt: '2026-07-23T00:00:00Z' })),
    });

    const subscriptionButton = await screen.findByRole('button', { name: '取消订阅' });
    fireEvent.click(subscriptionButton);

    expect(await screen.findByText('订阅服务暂不可用')).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消订阅' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('writes authenticated reading progress on a page-hide heartbeat without blocking reading', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', { protectedReading: detail });

    fireEvent(window, new Event('pagehide'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/progress',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ bookId: 7, chapterId: 101, offset: 0 }),
        keepalive: true,
      }),
    ));
  });

  it('keeps locked chapter bodies out of the reader and routes a reader to the entitlement decision', async () => {
    const lockedDetail = {
      ...detail,
      access: { fullBookAccess: false, source: 'PREVIEW' },
      chapters: [
        { ...detail.chapters[0], readable: true, access: 'PREVIEW' },
        { ...detail.chapters[1], content: null, readable: false, access: 'ENTITLEMENT_REQUIRED' },
      ],
    };
    await renderReader('slide', [], '潮汐之前', { bookDetail: lockedDetail });

    expect(screen.queryByText('第三段。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '第 2 章 · 灯塔来信，需要阅读权益' }));

    expect(screen.getByTestId('reader-current-chapter').textContent).toContain('潮汐之前');
    expect(await screen.findByRole('heading', { name: '获得整本阅读权益' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('第 2 章《灯塔来信》需要整本阅读权益');
  });

  it('loads approved public paragraph annotations for the active readable chapter', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      publicAnnotations: {
        101: [{
          id: 501,
          bookId: 7,
          chapterId: 101,
          authorName: '公开读者',
          paragraphIndex: 0,
          selectionStart: 0,
          selectionEnd: 3,
          selectedText: '第一段',
          note: '这个开场很有画面感。',
          createdAt: '2026-07-21T00:00:00Z',
        }],
      },
      interactionStats: {
        visibleCommentCount: 5,
        ratingCount: 3,
        averageRating: 4.7,
        recommendationVoteCount: 9,
        monthlyVoteCount: 2,
      },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/public/books/7/chapters/101/annotations',
      expect.anything(),
    ));
    expect(await screen.findByText('这个开场很有画面感。')).toBeTruthy();
    expect(screen.getByText('4.7 分 · 3 人评分 · 推荐票 9 · 月票 2')).toBeTruthy();
    expect(readerParagraph(0).querySelector('mark')?.getAttribute('data-annotation-source')).toBe('public');
  });

  it('loads visible comments for only the active chapter instead of using the book detail comments', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      bookDetail: {
        ...detail,
        comments: [{
          id: 301,
          bookId: 7,
          chapterId: 102,
          userId: 8,
          authorName: '其他章节读者',
          content: '详情接口中的全书评论',
          status: 'VISIBLE',
          createdAt: '2026-07-21T00:00:00Z',
        }],
      },
      chapterComments: {
        101: [{
          id: 302,
          bookId: 7,
          chapterId: 101,
          userId: 9,
          authorName: '本章读者',
          content: '只属于第一章的评论',
          status: 'VISIBLE',
          createdAt: '2026-07-21T00:00:00Z',
        }],
      },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/public/books/7/comments?chapterId=101&page=0&size=20',
      expect.anything(),
    ));
    expect(await screen.findByText('只属于第一章的评论')).toBeTruthy();
    expect(screen.queryByText('详情接口中的全书评论')).toBeNull();
  });

  it('paginates chapter comments through the shared reader controls', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      chapterCommentsHandler: (_chapterId, input) => {
        const page = Number(new URL(String(input), 'https://novel.test').searchParams.get('page'));
        return Promise.resolve(response({
          items: [{
            id: 400 + page,
            bookId: 7,
            chapterId: 101,
            userId: 9,
            authorName: '分页读者',
            content: page === 0 ? '第一页章评' : '第二页章评',
            status: 'VISIBLE',
            createdAt: '2026-07-21T00:00:00Z',
          }],
          meta: { total: 21, page, size: 20 },
        }));
      },
    });

    expect(await screen.findByText('第一页章评')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '下一页' }));
    expect(await screen.findByText('第二页章评')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/public/books/7/comments?chapterId=101&page=1&size=20',
      expect.anything(),
    ));
  });

  it('ignores a slower comment response from the previously selected chapter', async () => {
    const firstChapterComments = deferred<Response>();
    const secondChapterComments = deferred<Response>();
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      chapterCommentsHandler: (chapterId) => chapterId === 101
        ? firstChapterComments.promise
        : secondChapterComments.promise,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/public/books/7/comments?chapterId=101&page=0&size=20',
      expect.anything(),
    ));
    fireEvent.click(screen.getByRole('button', { name: '下一章' }));
    await screen.findByRole('heading', { name: '灯塔来信' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/public/books/7/comments?chapterId=102&page=0&size=20',
      expect.anything(),
    ));

    firstChapterComments.resolve(response({
      items: [{
        id: 303,
        bookId: 7,
        chapterId: 101,
        userId: 10,
        authorName: '慢响应读者',
        content: '迟到的第一章评论',
        status: 'VISIBLE',
        createdAt: '2026-07-21T00:00:00Z',
      }],
      meta: { total: 1, page: 0, size: 20 },
    }));
    await waitFor(() => expect(screen.queryByText('迟到的第一章评论')).toBeNull());

    secondChapterComments.resolve(response({
      items: [{
        id: 304,
        bookId: 7,
        chapterId: 102,
        userId: 11,
        authorName: '第二章读者',
        content: '第二章的当前评论',
        status: 'VISIBLE',
        createdAt: '2026-07-21T00:00:00Z',
      }],
      meta: { total: 1, page: 0, size: 20 },
    }));
    expect(await screen.findByText('第二章的当前评论')).toBeTruthy();
  });

  it('shows a visible comment immediately and keeps it when an older list request finishes', async () => {
    const chapterComments = deferred<Response>();
    const publishedComment = {
      id: 305,
      bookId: 7,
      chapterId: 101,
      userId: 3,
      authorName: '演示读者',
      content: '刚刚发布的章评',
      status: 'VISIBLE',
      createdAt: '2026-07-21T00:00:00Z',
    };
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      chapterCommentsHandler: () => chapterComments.promise,
      commentPostHandler: () => Promise.resolve(response(publishedComment)),
    });

    const input = screen.getByRole('textbox', { name: '发表评论' });
    fireEvent.change(input, { target: { value: publishedComment.content } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chapterId: 101, content: publishedComment.content }),
      }),
    ));
    expect(await screen.findByText(publishedComment.content)).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.getByText('评论已发布')).toBeTruthy();

    chapterComments.resolve(response({ items: [], meta: { total: 0, page: 0, size: 20 } }));
    await waitFor(() => expect(screen.getByText(publishedComment.content)).toBeTruthy());
  });

  it('keeps a failed comment submission and its draft visible to the reader', async () => {
    await renderReader('slide', [], '潮汐之前', {
      commentPostHandler: () => Promise.resolve(failedResponse('请先登录后发表评论')),
    });

    const input = screen.getByRole('textbox', { name: '发表评论' });
    fireEvent.change(input, { target: { value: '登录失败时保留草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(await screen.findByText('请先登录后发表评论')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('登录失败时保留草稿');
  });

  it('shows a recoverable error when the current chapter comments cannot be loaded', async () => {
    let attempts = 0;
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      chapterCommentsHandler: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.resolve(failedResponse('评论服务暂不可用'))
          : Promise.resolve(response({
            items: [{
              id: 306,
              bookId: 7,
              chapterId: 101,
              userId: 12,
              authorName: '恢复后的读者',
              content: '重新加载后的本章评论',
              status: 'VISIBLE',
              createdAt: '2026-07-21T00:00:00Z',
            }],
            meta: { total: 1, page: 0, size: 20 },
          }));
      },
    });

    expect((await screen.findByRole('alert')).textContent).toContain('评论服务暂不可用');
    fireEvent.click(screen.getByRole('button', { name: '重新加载本章评论' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/public/books/7/comments?chapterId=101&page=0&size=20'))).toHaveLength(2));
    expect(await screen.findByText('重新加载后的本章评论')).toBeTruthy();
  });

  it('sends a monthly vote through the reader BFF route', async () => {
    const fetchMock = await renderReader();

    fireEvent.click(screen.getByRole('button', { name: '投月票' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/votes/monthly',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(screen.getByText('月票已送出，作品当前获得 1 张月票。')).toBeTruthy();
  });

  it('uses the server-provided token price to acquire a whole-book entitlement without sending a price', async () => {
    const purchaseRequest = deferred<Response>();
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      purchaseHandler: () => purchaseRequest.promise,
    });

    expect(screen.getByText('整本阅读权益：30 代币')).toBeTruthy();
    expect(screen.getByText('当前代币：120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '使用 30 代币获得' }));

    expect(await screen.findByRole('heading', { name: '获得整本阅读权益' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '确认获得权益' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/purchase',
      expect.objectContaining({ method: 'POST' }),
    ));
    const purchaseRequestInit = fetchMock.mock.calls.find(([path]) => String(path).endsWith('/account/books/7/purchase'))?.[1];
    expect(purchaseRequestInit?.body).toBeUndefined();
    expect(screen.getByRole('button', { name: '确认中...' }).hasAttribute('disabled')).toBe(true);

    purchaseRequest.resolve(response({ bookId: 7, purchased: true, balance: 90 }));

    expect(await screen.findByText('《雾港纪事》的整本阅读权益已确认，当前代币余额 90。')).toBeTruthy();
    expect(screen.getByText('已获得整本阅读权益。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看账户权益' }).getAttribute('href')).toBe('/account');
    expect(screen.queryByRole('button', { name: '使用 30 代币获得' })).toBeNull();
  });

  it('keeps an insufficient-token acquisition failure visible and directs readers to redemption', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      purchaseHandler: () => Promise.resolve(failedResponse('insufficient tokens')),
    });

    fireEvent.click(screen.getByRole('button', { name: '使用 30 代币获得' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认获得权益' }));

    expect(await screen.findByText('代币余额不足，请先在个人中心兑换代币。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '获得整本阅读权益' })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/account/books/7/purchase'))).toHaveLength(1);
  });

  it('does not offer acquisition when the account has already received this book entitlement', async () => {
    await renderReader('slide', [], '潮汐之前', {
      entitlements: {
        membership: null,
        books: [{ bookId: 7, bookTitle: '雾港纪事' }],
      },
    });

    expect(screen.getByText('已获得整本阅读权益。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看账户权益' }).getAttribute('href')).toBe('/account');
    expect(screen.queryByRole('button', { name: /使用 .* 代币获得/ })).toBeNull();
  });

  it('saves an exact selected paragraph slice as a private highlight and restores its highlight state', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      annotations: [{
        id: 90,
        bookId: 7,
        chapterId: 101,
        userId: 3,
        authorName: '演示读者',
        paragraphIndex: 1,
        selectionStart: 0,
        selectionEnd: 3,
        selectedText: '第二段',
        note: '',
        shareIntent: false,
        status: 'PRIVATE',
        createdAt: '2026-07-21T00:00:00Z',
      }],
    });

    expect(readerParagraph(1).querySelector('mark')?.getAttribute('data-annotation-status')).toBe('PRIVATE');
    selectParagraphText(readerParagraph(0), 0, 3);

    const draft = await screen.findByTestId('reader-annotation-draft');
    expect(within(draft).getByText('第一段')).toBeTruthy();
    fireEvent.change(within(draft).getByRole('textbox', { name: '划线感想' }), { target: { value: '开场很安静' } });
    fireEvent.click(within(draft).getByRole('button', { name: '保存划线' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/chapters/101/annotations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          paragraphIndex: 0,
          selectionStart: 0,
          selectionEnd: 3,
          selectedText: '第一段',
          note: '开场很安静',
          shareIntent: false,
        }),
      }),
    ));
    expect(await screen.findByText('划线已保存。')).toBeTruthy();
    expect(readerParagraph(0).querySelector('mark')?.getAttribute('data-annotation-status')).toBe('PRIVATE');
  });

  it('sends explicit share intent for a selected paragraph and presents its review state', async () => {
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      annotationHandler: () => Promise.resolve(response({
        id: 92,
        bookId: 7,
        chapterId: 101,
        userId: 3,
        authorName: '演示读者',
        paragraphIndex: 0,
        selectionStart: 0,
        selectionEnd: 3,
        selectedText: '第一段',
        note: '想和大家讨论',
        shareIntent: true,
        status: 'PENDING_REVIEW',
        createdAt: '2026-07-21T00:00:00Z',
      })),
    });

    selectParagraphText(readerParagraph(0), 0, 3);
    const draft = await screen.findByTestId('reader-annotation-draft');
    fireEvent.change(within(draft).getByRole('textbox', { name: '划线感想' }), { target: { value: '想和大家讨论' } });
    fireEvent.click(within(draft).getByRole('checkbox', { name: '申请公开分享' }));
    fireEvent.click(within(draft).getByRole('button', { name: '保存划线' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/chapters/101/annotations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          paragraphIndex: 0,
          selectionStart: 0,
          selectionEnd: 3,
          selectedText: '第一段',
          note: '想和大家讨论',
          shareIntent: true,
        }),
      }),
    ));
    expect(await screen.findByText('划线已保存，分享申请已进入审核。')).toBeTruthy();
    expect(readerParagraph(0).querySelector('mark')?.getAttribute('data-annotation-status')).toBe('PENDING_REVIEW');
  });

  it.each(['0', '1.5', '-20', 'abc'])('rejects a non-positive or non-whole reward amount locally: %s', async (amount) => {
    const fetchMock = await renderReader();
    const input = screen.getByRole('textbox', { name: '打赏代币' });

    fireEvent.change(input, { target: { value: amount } });
    fireEvent.click(screen.getByRole('button', { name: '打赏' }));

    expect(screen.getByTestId('reader-reward-feedback').textContent).toBe('请输入大于 0 的整数代币数。');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/novel/account/books/7/reward',
      expect.anything(),
    );
  });

  it('sends a token reward through the reader BFF and shows its pending and successful response states', async () => {
    const rewardRequest = deferred<Response>();
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      rewardHandler: () => rewardRequest.promise,
    });
    const input = screen.getByRole('textbox', { name: '打赏代币' });

    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '打赏' }));

    expect(screen.getByTestId('reader-reward-feedback').textContent).toBe('正在打赏 25 代币…');
    expect(screen.getByRole('button', { name: '打赏中…' }).hasAttribute('disabled')).toBe(true);
    expect(input.hasAttribute('disabled')).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/novel/account/books/7/reward',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 25 }),
      }),
    ));
    const requestHeaders = new Headers(fetchMock.mock.calls.find(([path]) => String(path).endsWith('/account/books/7/reward'))?.[1]?.headers);
    expect(requestHeaders.get('idempotency-key')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    rewardRequest.resolve(response({ bookId: 7, amount: 25, balance: 75 }));

    expect((await screen.findByTestId('reader-reward-feedback')).textContent).toBe('打赏成功，已送出 25 代币，账户余额 75 代币。');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('reuses the generated idempotency key when a failed reward is retried', async () => {
    let attempts = 0;
    const fetchMock = await renderReader('slide', [], '潮汐之前', {
      rewardHandler: () => Promise.resolve(attempts++ === 0
        ? failedResponse('打赏结果暂时无法确认')
        : response({ bookId: 7, amount: 25, balance: 75 })),
    });
    const input = screen.getByRole('textbox', { name: '打赏代币' });

    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: '打赏' }));

    expect((await screen.findByTestId('reader-reward-feedback')).textContent).toBe('打赏结果暂时无法确认');
    expect(screen.getByRole('button', { name: '打赏' }).hasAttribute('disabled')).toBe(false);
    expect(input.hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '打赏' }));

    expect((await screen.findByTestId('reader-reward-feedback')).textContent).toBe('打赏成功，已送出 25 代币，账户余额 75 代币。');
    const rewardRequests = fetchMock.mock.calls.filter(([path]) => String(path).endsWith('/account/books/7/reward'));
    expect(rewardRequests).toHaveLength(2);
    const firstKey = new Headers(rewardRequests[0][1]?.headers).get('idempotency-key');
    const retryKey = new Headers(rewardRequests[1][1]?.headers).get('idempotency-key');
    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(retryKey).toBe(firstKey);
  });
});
