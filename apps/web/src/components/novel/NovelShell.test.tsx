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

  it('marks the active workspace and switches development identity through the BFF session endpoint', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/novel/account/profile') {
        return Promise.resolve({ ok: true, json: async () => ({ data: { roles: ['READER', 'AUTHOR'] } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: null }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="author"><p>作者工作台内容</p></NovelShell>);

    expect((await screen.findByRole('link', { name: '作家中心' })).getAttribute('aria-current')).toBe('page');
    const workspaceMenu = screen.getByRole('button', { name: '当前工作区：作者工作区，打开工作区菜单' });
    expect(workspaceMenu.querySelector('[data-slot="avatar"]')).not.toBeNull();
    fireEvent.pointerDown(workspaceMenu, { button: 0, ctrlKey: false });

    const readerButton = await screen.findByRole('menuitem', { name: '读者身份' });
    fireEvent.click(readerButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'reader' }),
    })));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(refresh).toHaveBeenCalled();
  });

  it('uses the inherited sheet primitive to keep navigation reachable on narrow screens', async () => {
    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    const navigationTrigger = screen.getByRole('button', { name: '打开导航菜单' });
    expect(navigationTrigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(navigationTrigger);

    expect((await screen.findByRole('dialog')).getAttribute('data-slot')).toBe('sheet-content');
    expect(screen.getByRole('navigation', { name: '移动端小说平台导航' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '书城' }).getAttribute('aria-current')).toBe('page');
  });

  it('only exposes workspaces granted by the server-side session roles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { roles: ['READER'] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="reader"><p>书城内容</p></NovelShell>);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/profile', expect.anything()));
    expect(screen.getByRole('link', { name: '书城' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '作家中心' })).toBeNull();
    expect(screen.queryByRole('link', { name: '运营中心' })).toBeNull();
  });
});
