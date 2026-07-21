import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', async () => ({
  default: (await import('react')).forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
    ({ children, href, ...props }, ref) => <a ref={ref} href={href} {...props}>{children}</a>,
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/author',
  useRouter: () => ({ push, refresh }),
}));

import { InlineNotice, NovelShell, NovelStatusBadge, formatWordCount, statusLabel } from './NovelShell';

describe('NovelShell', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
    document.cookie = '';
  });

  it('formats content and review states for the novel workspaces', () => {
    expect(formatWordCount(286_000)).toBe('28.6 万字');
    expect(formatWordCount(10_000)).toBe('1 万字');
    expect(statusLabel('PENDING_REVIEW')).toBe('待审核');

    render(<NovelStatusBadge status="PUBLISHED" />);
    expect(screen.getByText('已上线').getAttribute('data-slot')).toBe('badge');
  });

  it('uses the inherited alert primitive for reader-facing notices', () => {
    render(<InlineNotice tone="error">无法加载作品</InlineNotice>);

    const notice = screen.getByRole('status');
    expect(notice.getAttribute('data-slot')).toBe('alert');
    expect(notice.textContent).toContain('无法加载作品');
  });

  it('uses real profile roles for workspace navigation and has no development identity switcher', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (String(input) === '/api/novel/account/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ data: { name: '星河读者', roles: ['READER', 'AUTHOR'] } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: null }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="author"><p>作者工作台内容</p></NovelShell>);

    expect((await screen.findByRole('link', { name: '作家中心' })).getAttribute('aria-current')).toBe('page');
    const accountMenu = screen.getByRole('button', { name: '当前账户：星河读者，打开账户菜单' });
    expect(accountMenu.querySelector('[data-slot="avatar"]')).not.toBeNull();
    fireEvent.pointerDown(accountMenu, { button: 0, ctrlKey: false });

    expect((await screen.findByRole('menuitem', { name: '个人中心' })).getAttribute('href')).toBe('/account');
    expect(screen.getByRole('menuitem', { name: '打开作者工作区' }).getAttribute('href')).toBe('/author');
    expect(screen.getByRole('menuitem', { name: '退出登录' })).toBeTruthy();
    expect(screen.queryByText('开发身份')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /身份$/ })).toBeNull();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input) === '/api/novel/session' && init?.method === 'POST')).toBe(false);
  });

  it('uses the inherited sheet primitive to keep navigation reachable on narrow screens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ msg: 'login required' }) }));
    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    await screen.findByRole('link', { name: '登录' });
    const navigationTrigger = screen.getByRole('button', { name: '打开导航菜单' });
    expect(navigationTrigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(navigationTrigger);

    expect((await screen.findByRole('dialog')).getAttribute('data-slot')).toBe('sheet-content');
    expect(screen.getByRole('navigation', { name: '移动端小说平台导航' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '书城' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link', { name: '个人中心' })).toBeNull();
  });

  it('shows login and registration only after an anonymous profile check', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ msg: 'login required' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    expect((await screen.findByRole('link', { name: '登录' })).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('link', { name: '注册' }).getAttribute('href')).toBe('/register');
    expect(screen.queryByRole('link', { name: '个人中心' })).toBeNull();
    expect(screen.queryByRole('button', { name: /当前账户：/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/profile', expect.anything());
  });

  it('only exposes workspaces granted by the server-side account roles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { name: '普通读者', roles: ['READER'] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/profile', expect.anything()));
    expect(screen.getByRole('link', { name: '书城' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '个人中心' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '作家中心' })).toBeNull();
    expect(screen.queryByRole('link', { name: '站长中心' })).toBeNull();
  });

  it('adds author and administrator workspaces only for their real account roles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { name: '站长读者', roles: ['READER', 'AUTHOR', 'ADMIN'] } }),
    }));

    render(<NovelShell workspace="admin"><p>站长工作台内容</p></NovelShell>);

    expect((await screen.findByRole('link', { name: '作家中心' })).getAttribute('href')).toBe('/author');
    expect(screen.getByRole('link', { name: '站长中心' }).getAttribute('href')).toBe('/novel-admin');
    const accountMenu = screen.getByRole('button', { name: '当前账户：站长读者，打开账户菜单' });
    fireEvent.pointerDown(accountMenu, { button: 0, ctrlKey: false });
    expect((await screen.findByRole('menuitem', { name: '打开站长工作区' })).getAttribute('href')).toBe('/novel-admin');
  });

  it('logs out through the session BFF with the csrf cookie proof and returns to anonymous navigation', async () => {
    document.cookie = 'novel_csrf=shell-csrf-token';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/novel/account/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ data: { name: '已登录读者', roles: ['READER'] } }) });
      }
      if (String(input) === '/api/novel/session' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: async () => ({ code: 200, data: null }) });
      }
      return Promise.reject(new Error(`Unexpected request: ${String(input)}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    const accountMenu = await screen.findByRole('button', { name: '当前账户：已登录读者，打开账户菜单' });
    fireEvent.pointerDown(accountMenu, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: '退出登录' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input, init]) => String(input) === '/api/novel/session' && init?.method === 'DELETE');
      expect(call).toBeDefined();
      expect(new Headers(call?.[1]?.headers).get('x-novel-csrf')).toBe('shell-csrf-token');
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: '登录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /当前账户：/ })).toBeNull();
  });
});
