import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import LoginPage from './login/page';
import RegisterPage from './register/page';

describe('novel authentication pages', () => {
  beforeEach(() => {
    vi.useRealTimers();
    push.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('validates login credentials before calling the BFF', () => {
    const fetchMock = vi.mocked(fetch);
    render(<LoginPage />);

    fireEvent.submit(screen.getByRole('button', { name: '登录' }).closest('form')!);

    expect(screen.getByLabelText('用户名或邮箱').getAttribute('data-slot')).toBe('input');
    expect(screen.getByRole('button', { name: '登录' }).getAttribute('data-slot')).toBe('button');
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-slot')).toBe('alert');
    expect(alert.textContent).toContain('请输入 3 至 120 位的用户名、邮箱或账号。');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts login credentials to the session BFF and goes to the bookstore', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200 }),
    } as Response);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('用户名或邮箱'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct-horse-battery-staple' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'login', username: 'reader@example.com', password: 'correct-horse-battery-staple' }),
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('rejects mismatched registration passwords without an API request', () => {
    const fetchMock = vi.mocked(fetch);
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '阅界读者' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct-horse-battery-staple' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'different-correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    expect(screen.getByRole('alert').textContent).toContain('两次输入的密码不一致。');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers through the session BFF then returns to the bookstore', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200 }),
    } as Response);
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '阅界读者' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'reader@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'correct-horse-battery-staple' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'correct-horse-battery-staple' } });
    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        username: 'reader@example.com',
        displayName: '阅界读者',
        password: 'correct-horse-battery-staple',
      }),
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });
});
