import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliverySettingsPanel } from './EmailDeliverySettingsPanel';

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) } as Response;
}

const configuredSettings = {
  source: 'ADMIN' as const,
  enabled: true,
  host: 'smtp.qq.com',
  port: 465,
  username: 'noreply@example.test',
  from: 'noreply@example.test',
  smtpAuth: true,
  sslEnabled: true,
  passwordConfigured: true,
  verificationHashSecretConfigured: true,
  updatedByUserId: 1,
  updatedAt: '2026-07-22T08:00:00Z',
};

function mockSettingsApi(roles: string[]) {
  let settings = { ...configuredSettings };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (path.endsWith('/account/profile')) return Promise.resolve(response({ id: 1, name: '超级管理员', roles }));
    if (path.endsWith('/admin/email-delivery-settings/verify') && init?.method === 'POST') return Promise.resolve(response(null));
    if (path.endsWith('/admin/email-delivery-settings') && (init?.method ?? 'GET') === 'GET') return Promise.resolve(response(settings));
    if (path.endsWith('/admin/email-delivery-settings') && init?.method === 'PUT') {
      settings = {
        ...settings,
        enabled: Boolean(body.enabled),
        host: String(body.host),
        port: Number(body.port),
        username: String(body.username),
        from: String(body.from),
        smtpAuth: Boolean(body.smtpAuth),
        sslEnabled: Boolean(body.sslEnabled),
        updatedAt: '2026-07-22T09:00:00Z',
      };
      return Promise.resolve(response(settings));
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('EmailDeliverySettingsPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.cookie = 'novel_csrf=email-settings-test';
  });

  it.each([
    ['reader', ['READER']],
    ['author', ['READER', 'AUTHOR']],
  ])('does not expose or query SMTP settings for a %s account', async (_kind, roles) => {
    const fetchMock = mockSettingsApi(roles);
    render(<EmailDeliverySettingsPanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/account/profile', expect.anything()));
    expect(screen.queryByRole('heading', { name: 'SMTP 邮件服务' })).toBeNull();
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes('/admin/email-delivery-settings'))).toBe(false);
  });

  it('lets the sole ADMIN super administrator save a redacted change and send a verification email', async () => {
    const fetchMock = mockSettingsApi(['READER', 'AUTHOR', 'ADMIN']);
    render(<EmailDeliverySettingsPanel />);

    await screen.findByRole('heading', { name: 'SMTP 邮件服务' });
    expect((screen.getByLabelText('SMTP 密码或授权码') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('验证码哈希密钥') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('SMTP 主机'), { target: { value: 'smtp.example.test' } });
    fireEvent.change(screen.getByLabelText('SMTP 端口'), { target: { value: '2525' } });
    fireEvent.change(screen.getByLabelText('SMTP 变更说明'), { target: { value: '迁移到新的 SMTP 网关' } });
    fireEvent.click(screen.getByRole('button', { name: '保存邮件服务' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/email-delivery-settings', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.example.test',
        port: 2525,
        username: 'noreply@example.test',
        password: '',
        from: 'noreply@example.test',
        smtpAuth: true,
        sslEnabled: true,
        verificationHashSecret: '',
        reason: '迁移到新的 SMTP 网关',
      }),
    })));
    expect(await screen.findByText('SMTP 邮件服务已保存，敏感凭据未回显。')).toBeTruthy();
    expect((screen.getByLabelText('SMTP 密码或授权码') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('验证收件人'), { target: { value: 'station.admin@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证邮件' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/novel/admin/email-delivery-settings/verify', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ recipient: 'station.admin@example.test' }),
    })));
    expect(await screen.findByText('验证邮件已发送至 station.admin@example.test。')).toBeTruthy();
  });
});
