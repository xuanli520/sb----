import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

import { NovelShell, NovelStatusBadge, formatWordCount, statusLabel } from './NovelShell';

describe('NovelShell', () => {
  beforeEach(() => {
    vi.useRealTimers();
    push.mockReset();
    refresh.mockReset();
  });

  it('formats content and review states for the novel workspaces', () => {
    expect(formatWordCount(286_000)).toBe('28.6 万字');
    expect(formatWordCount(10_000)).toBe('1 万字');
    expect(statusLabel('PENDING_REVIEW')).toBe('待审核');

    render(<NovelStatusBadge status="PUBLISHED" />);
    expect(screen.getByText('已上线')).toBeTruthy();
  });

  it('marks the active workspace and switches development identity through the BFF session endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<NovelShell workspace="author"><p>作者工作台内容</p></NovelShell>);

    expect(screen.getByRole('link', { name: '作家中心' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: '读者' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/session', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ role: 'reader' }),
    })));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(refresh).toHaveBeenCalled();
  });
});
