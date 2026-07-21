import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: ({ fill, priority, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    void fill;
    void priority;
    return <img alt={alt} {...props} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import BookstorePage from './page';

const books = [
  { id: 9, title: '星海拾光', author: '周以南', category: '科幻', words: 80_000, synopsis: '在失落星图与旧航线之间，寻找一束回家的光。', status: 'PUBLISHED', serialStatus: '连载中', cover: '#2563eb', heat: 9_820 },
  { id: 7, title: '北岸灯塔', author: '林见川', category: '悬疑', words: 32_000, synopsis: '潮汐退去以后，灯塔仍守着一封没有寄出的信。', status: 'PUBLISHED', serialStatus: '连载中', cover: '#475569', heat: 7_600 },
  { id: 11, title: '长安雨歇', author: '沈知微', category: '古言', words: 120_000, synopsis: '一场夜雨过后，旧案与故人都回到了长安。', status: 'PUBLISHED', serialStatus: '已完结', cover: '#9f1239', heat: 6_350 },
  { id: 15, title: '雾港来信', author: '顾清遥', category: '悬疑', words: 460_000, synopsis: '雾港的每一封来信，都指向同一段被隐去的往事。', status: 'PUBLISHED', serialStatus: '连载中', cover: '#0f766e', heat: 5_000 },
];

const facets = {
  categories: ['科幻', '悬疑', '古言'],
  serialStatuses: ['连载中', '已完结'],
  wordCountRanges: [
    { key: 'under-100k', label: '10 万字以下', minWords: null, maxWords: 99_999 },
    { key: '100k-300k', label: '10-30 万字', minWords: 100_000, maxWords: 299_999 },
    { key: '300k-500k', label: '30-50 万字', minWords: 300_000, maxWords: 499_999 },
    { key: 'over-500k', label: '50 万字以上', minWords: 500_000, maxWords: null },
  ],
};

const home = {
  carousel: [books[0], books[2], books[1]],
  recommendations: [books[0], books[2], books[1]],
  hot: [books[0], books[1], books[2]],
  hotSearchTerms: [
    { id: 1, term: '星海', enabled: true, rank: 1, createdByUserId: null, updatedByUserId: 1, createdAt: '2026-07-21T08:00:00Z', updatedAt: '2026-07-21T08:00:00Z' },
    { id: 2, term: '长安', enabled: true, rank: 2, createdByUserId: 1, updatedByUserId: 1, createdAt: '2026-07-21T08:00:00Z', updatedAt: '2026-07-21T08:00:00Z' },
  ],
  facets,
};
const taxonomyCategories = [
  { id: 2, type: 'CATEGORY', name: '空白分类', enabled: true, sortOrder: 10 },
  { id: 1, type: 'CATEGORY', name: '科幻', enabled: true, sortOrder: 20 },
  { id: 3, type: 'CATEGORY', name: '悬疑', enabled: true, sortOrder: 30 },
  { id: 4, type: 'CATEGORY', name: '古言', enabled: true, sortOrder: 40 },
];

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function filterCatalog(url: string) {
  const params = new URLSearchParams(url.split('?')[1]);
  const q = params.get('q') ?? '';
  const category = params.get('category');
  const status = params.get('status');
  const minWords = Number(params.get('minWords') ?? 0);
  const maxWords = params.has('maxWords') ? Number(params.get('maxWords')) : Number.POSITIVE_INFINITY;
  const items = books.filter((book) => (
    (!q || `${book.title}${book.author}${book.synopsis}`.includes(q))
    && (!category || book.category === category)
    && (!status || book.serialStatus === status)
    && book.words >= minWords
    && book.words <= maxWords
  ));
  return { items, meta: { total: items.length, facets, query: { query: q, category: category ?? '', serialStatus: status ?? '', minWords: params.get('minWords'), maxWords: params.get('maxWords') } } };
}

function mockBookstoreApi(options: { homeResponse?: Promise<Response>; catalogResponse?: Promise<Response>; taxonomyResponse?: Promise<Response> } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const endpoint = String(input).replace('/api/novel/', '');

    if (endpoint === 'account/profile') return Promise.resolve(response({ roles: ['READER'] }));
    if (endpoint === 'public/home') return options.homeResponse ?? Promise.resolve(response(home));
    if (endpoint === 'public/taxonomy/categories') return options.taxonomyResponse ?? Promise.resolve(response(taxonomyCategories));
    if (endpoint.startsWith('public/books')) return options.catalogResponse ?? Promise.resolve(response(filterCatalog(endpoint)));

    return Promise.reject(new Error(`Unexpected request: ${endpoint}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('bookstore home page', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        void callback;
        void options;
      }

      observe() {}

      unobserve() {}

      disconnect() {}

      takeRecords() {
        return [];
      }
    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('loads persisted editorial picks and the reproducible heat ranking alongside the catalog', async () => {
    const homeRequest = deferred<Response>();
    const catalogRequest = deferred<Response>();
    mockBookstoreApi({ homeResponse: homeRequest.promise, catalogResponse: catalogRequest.promise });
    render(<BookstorePage />);

    expect(screen.getByLabelText('正在加载编辑推荐')).toBeTruthy();
    expect(screen.getByLabelText('正在加载作品')).toBeTruthy();

    await act(async () => {
      homeRequest.resolve(response(home));
      catalogRequest.resolve(response(filterCatalog('public/books')));
    });

    const carousel = await screen.findByRole('region', { name: '书城精选' });
    expect(carousel.getAttribute('aria-roledescription')).toBe('轮播');
    expect(within(carousel).getAllByRole('group')).toHaveLength(3);
    expect(within(carousel).getByRole('group', { name: '第 2 张，长安雨歇' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '热读榜' })).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('9,820 热度')).toBeTruthy();
    expect(screen.getByRole('link', { name: '开始阅读《星海拾光》' }).getAttribute('href')).toBe('/reader/9');
  });

  it('passes category, word count and serial filters to the server and highlights literal keyword matches', async () => {
    const fetchMock = mockBookstoreApi();
    render(<BookstorePage />);

    await screen.findByRole('region', { name: '书城精选' });
    const mysteryFilter = screen.getByRole('radio', { name: '悬疑' });
    expect(mysteryFilter.getAttribute('data-slot')).toBe('toggle-group-item');
    fireEvent.click(mysteryFilter);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('public/books?category=%E6%82%AC%E7%96%91'))).toBe(true);
    });

    fireEvent.click(screen.getByRole('radio', { name: '10 万字以下' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('category=%E6%82%AC%E7%96%91&maxWords=99999'))).toBe(true);
    });

    fireEvent.change(screen.getByRole('textbox', { name: '搜索作品、作者或关键词' }), { target: { value: '北岸' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('q=%E5%8C%97%E5%B2%B8&category=%E6%82%AC%E7%96%91&maxWords=99999'))).toBe(true);
    });
    expect(await screen.findByText('北岸', { selector: 'mark' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: '雾港来信' })).toBeNull();
  });

  it('runs an enabled hot-search chip through the same bounded catalog search path', async () => {
    const fetchMock = mockBookstoreApi();
    render(<BookstorePage />);

    const chip = await screen.findByRole('button', { name: '星海' });
    fireEvent.click(chip);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('public/books?q=%E6%98%9F%E6%B5%B7'))).toBe(true);
    });
    expect((screen.getByRole('textbox', { name: '搜索作品、作者或关键词' }) as HTMLInputElement).value).toBe('星海');
    expect(await screen.findByText('星海', { selector: 'mark' })).toBeTruthy();
  });

  it('uses enabled taxonomy categories even when a category has no published work, then falls back when taxonomy is unavailable', async () => {
    const fetchMock = mockBookstoreApi();
    const view = render(<BookstorePage />);

    const emptyCategory = await screen.findByRole('radio', { name: '空白分类' });
    expect(emptyCategory).toBeTruthy();
    fireEvent.click(emptyCategory);
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('public/books?category=%E7%A9%BA%E7%99%BD%E5%88%86%E7%B1%BB'))).toBe(true);
    });

    view.unmount();
    mockBookstoreApi({ taxonomyResponse: Promise.reject(new Error('taxonomy unavailable')) });
    render(<BookstorePage />);
    expect(await screen.findByRole('radio', { name: '悬疑' })).toBeTruthy();
  });

  it('keeps discovery usable while a rolling deployment has not supplied home facets yet', async () => {
    mockBookstoreApi({ homeResponse: Promise.resolve(response({ ...home, facets: undefined })) });
    render(<BookstorePage />);

    await screen.findByRole('region', { name: '书城精选' });
    expect(screen.getByRole('radio', { name: '10 万字以下' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '连载中' })).toBeTruthy();
  });
});
