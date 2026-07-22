'use client';

import { MailCheck, Save, Send, ShieldCheck } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { InlineNotice } from '@/components/novel/NovelShell';
import { type AccountProfile, type EmailDeliverySettings, novelApi } from '@/features/novel/api';

type SettingsDraft = {
  enabled:boolean;
  host:string;
  port:string;
  username:string;
  password:string;
  from:string;
  smtpAuth:boolean;
  sslEnabled:boolean;
  verificationHashSecret:string;
  reason:string;
};

type Notice = { tone:'success' | 'error'; message:string };
type Access = 'checking' | 'denied' | 'allowed';

const emptyDraft: SettingsDraft = {
  enabled: true,
  host: '',
  port: '465',
  username: '',
  password: '',
  from: '',
  smtpAuth: true,
  sslEnabled: true,
  verificationHashSecret: '',
  reason: '',
};

function draftFrom(settings: EmailDeliverySettings): SettingsDraft {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: String(settings.port || 465),
    username: settings.username,
    password: '',
    from: settings.from,
    smtpAuth: settings.smtpAuth,
    sslEnabled: settings.sslEnabled,
    verificationHashSecret: '',
    reason: '',
  };
}

function isSuperAdministrator(profile: AccountProfile) {
  // D-06 defines the sole ADMIN role as the station super administrator.
  return profile.roles.includes('ADMIN');
}

function displayTime(value: string | null) {
  if (!value) return '尚未由超级管理员接管';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
}

function validPort(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : undefined;
}

/**
 * This panel intentionally verifies the role before loading SMTP metadata. The backend remains
 * authoritative for authorization, but readers and authors never see the configuration surface.
 */
export function EmailDeliverySettingsPanel() {
  const [access, setAccess] = useState<Access>('checking');
  const [settings, setSettings] = useState<EmailDeliverySettings>();
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [notice, setNotice] = useState<Notice>();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const next = await novelApi<EmailDeliverySettings>('admin/email-delivery-settings', 'admin');
      setSettings(next);
      setDraft(draftFrom(next));
      setNotice(undefined);
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : '邮件服务配置暂时无法加载。' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await novelApi<AccountProfile>('account/profile');
        if (cancelled) return;
        if (!isSuperAdministrator(profile)) {
          setAccess('denied');
          return;
        }
        setAccess('allowed');
        await loadSettings();
      } catch {
        if (!cancelled) setAccess('denied');
      }
    })();
    return () => { cancelled = true; };
  }, [loadSettings]);

  const updateDraft = <Field extends keyof SettingsDraft>(field: Field, value: SettingsDraft[Field]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const port = validPort(draft.port);
    const needsPassword = settings?.source !== 'ADMIN' || !settings.passwordConfigured;
    const needsHashSecret = settings?.source !== 'ADMIN' || !settings.verificationHashSecretConfigured;
    if (!draft.host.trim()) {
      setNotice({ tone: 'error', message: '请填写 SMTP 主机。' });
      return;
    }
    if (!port) {
      setNotice({ tone: 'error', message: 'SMTP 端口必须是 1 到 65535 之间的整数。' });
      return;
    }
    if (!draft.username.trim() || !draft.from.trim()) {
      setNotice({ tone: 'error', message: '请填写 SMTP 用户名和发件人地址。' });
      return;
    }
    if (needsPassword && !draft.password.trim()) {
      setNotice({ tone: 'error', message: '首次接管邮件服务时必须填写 SMTP 密码或授权码。' });
      return;
    }
    if (needsHashSecret && !draft.verificationHashSecret.trim()) {
      setNotice({ tone: 'error', message: '首次接管邮件服务时必须填写验证码哈希密钥。' });
      return;
    }
    if (!draft.reason.trim()) {
      setNotice({ tone: 'error', message: '请填写本次邮件服务变更说明。' });
      return;
    }

    setSaving(true);
    try {
      const updated = await novelApi<EmailDeliverySettings>('admin/email-delivery-settings', 'admin', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: draft.enabled,
          host: draft.host.trim(),
          port,
          username: draft.username.trim(),
          password: draft.password,
          from: draft.from.trim(),
          smtpAuth: draft.smtpAuth,
          sslEnabled: draft.sslEnabled,
          verificationHashSecret: draft.verificationHashSecret,
          reason: draft.reason.trim(),
        }),
      });
      setSettings(updated);
      setDraft(draftFrom(updated));
      setNotice({ tone: 'success', message: 'SMTP 邮件服务已保存，敏感凭据未回显。' });
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : 'SMTP 邮件服务保存失败。' });
    } finally {
      setSaving(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!testRecipient.trim()) {
      setNotice({ tone: 'error', message: '请填写用于接收验证邮件的地址。' });
      return;
    }
    setVerifying(true);
    try {
      await novelApi<void>('admin/email-delivery-settings/verify', 'admin', {
        method: 'POST',
        body: JSON.stringify({ recipient: testRecipient.trim() }),
      });
      setNotice({ tone: 'success', message: `验证邮件已发送至 ${testRecipient.trim()}。` });
    } catch (reason) {
      setNotice({ tone: 'error', message: reason instanceof Error ? reason.message : 'SMTP 验证邮件发送失败。' });
    } finally {
      setVerifying(false);
    }
  };

  // A non-super-administrator must not get a visible configuration entry, even on a typed URL.
  if (access === 'checking' || access === 'denied') return null;

  const secretsMustBeEntered = settings?.source !== 'ADMIN';
  const canVerify = settings?.source === 'ADMIN' && settings.enabled;

  return (
    <section className="mt-7 border border-stone-200 bg-white" aria-labelledby="email-delivery-settings-heading">
      <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-700">系统配置 · 超级管理员</p>
          <h2 id="email-delivery-settings-heading" className="mt-1 text-xl font-semibold text-stone-950">SMTP 邮件服务</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">用于邮箱验证码投递。密码和验证码哈希密钥仅可写入，保存后不会显示在浏览器或审计页面。</p>
        </div>
        <ShieldCheck className="shrink-0 text-emerald-700" size={21} aria-hidden="true" />
      </div>

      {notice ? <div className="px-5 pt-5"><InlineNotice tone={notice.tone}>{notice.message}</InlineNotice></div> : null}
      {loading ? <div className="grid gap-4 px-5 py-6 md:grid-cols-3"><Skeleton className="h-16 rounded-none bg-stone-100" /><Skeleton className="h-16 rounded-none bg-stone-100" /><Skeleton className="h-16 rounded-none bg-stone-100" /></div> : null}
      {!loading && !settings ? <div className="flex flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-stone-600">尚未取得 SMTP 邮件服务配置。</p><Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()} className="rounded-none border-stone-300 bg-white text-stone-700 hover:border-emerald-700 hover:text-emerald-800">重试</Button></div> : null}
      {!loading && settings ? (
        <>
          <div className="grid gap-px border-b border-stone-100 bg-stone-100 sm:grid-cols-3">
            <div className="bg-white px-5 py-4"><p className="text-xs text-stone-500">当前来源</p><p className="mt-1 font-medium text-stone-950">{settings.source === 'ADMIN' ? '超级管理员配置' : '部署环境配置'}</p></div>
            <div className="bg-white px-5 py-4"><p className="text-xs text-stone-500">凭据状态</p><p className="mt-1 font-medium text-stone-950">{settings.passwordConfigured && settings.verificationHashSecretConfigured ? '敏感凭据已配置' : '尚需补全敏感凭据'}</p></div>
            <div className="bg-white px-5 py-4"><p className="text-xs text-stone-500">最近保存</p><p className="mt-1 font-medium text-stone-950">{displayTime(settings.updatedAt)}</p></div>
          </div>

          <form onSubmit={(event) => void save(event)} className="px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div><Label htmlFor="smtp-host" className="text-stone-700">SMTP 主机</Label><Input id="smtp-host" aria-label="SMTP 主机" required maxLength={255} value={draft.host} onChange={(event) => updateDraft('host', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="smtp.qq.com" /></div>
              <div><Label htmlFor="smtp-port" className="text-stone-700">SMTP 端口</Label><Input id="smtp-port" aria-label="SMTP 端口" type="number" min="1" max="65535" step="1" inputMode="numeric" required value={draft.port} onChange={(event) => updateDraft('port', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" /></div>
              <div><Label htmlFor="smtp-from" className="text-stone-700">发件人地址</Label><Input id="smtp-from" aria-label="SMTP 发件人地址" type="email" required maxLength={320} value={draft.from} onChange={(event) => updateDraft('from', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="noreply@example.com" /></div>
              <div><Label htmlFor="smtp-username" className="text-stone-700">SMTP 用户名</Label><Input id="smtp-username" aria-label="SMTP 用户名" required maxLength={255} autoComplete="username" value={draft.username} onChange={(event) => updateDraft('username', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="邮箱账号" /></div>
              <div><Label htmlFor="smtp-password" className="text-stone-700">SMTP 密码或授权码</Label><Input id="smtp-password" aria-label="SMTP 密码或授权码" type="password" maxLength={1024} autoComplete="new-password" required={secretsMustBeEntered || !settings.passwordConfigured} value={draft.password} onChange={(event) => updateDraft('password', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder={secretsMustBeEntered ? '首次接管时必填' : '留空则保留当前值'} /></div>
              <div><Label htmlFor="email-verification-hash-secret" className="text-stone-700">验证码哈希密钥</Label><Input id="email-verification-hash-secret" aria-label="验证码哈希密钥" type="password" maxLength={1024} autoComplete="new-password" required={secretsMustBeEntered || !settings.verificationHashSecretConfigured} value={draft.verificationHashSecret} onChange={(event) => updateDraft('verificationHashSecret', event.target.value)} disabled={saving} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder={secretsMustBeEntered ? '首次接管时必填' : '留空则保留当前值'} /></div>
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-stone-100 pt-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="flex items-center gap-2"><Switch checked={draft.enabled} onCheckedChange={(enabled) => updateDraft('enabled', enabled)} disabled={saving} aria-label="启用 SMTP 邮件服务" className="data-[state=checked]:bg-emerald-700" /><span className="text-sm text-stone-700">启用邮件验证码投递</span></div>
                <div className="flex items-center gap-2"><Switch checked={draft.smtpAuth} onCheckedChange={(enabled) => updateDraft('smtpAuth', enabled)} disabled={saving} aria-label="启用 SMTP 认证" className="data-[state=checked]:bg-emerald-700" /><span className="text-sm text-stone-700">SMTP 认证</span></div>
                <div className="flex items-center gap-2"><Switch checked={draft.sslEnabled} onCheckedChange={(enabled) => updateDraft('sslEnabled', enabled)} disabled={saving} aria-label="启用 SMTP SSL" className="data-[state=checked]:bg-emerald-700" /><span className="text-sm text-stone-700">SSL/TLS</span></div>
              </div>
              <Button type="submit" disabled={saving} className="h-10 shrink-0 rounded-none bg-emerald-700 px-4 hover:bg-emerald-800"><Save size={16} aria-hidden="true" />{saving ? '保存中…' : '保存邮件服务'}</Button>
            </div>
            <div className="mt-4"><Label htmlFor="smtp-change-reason" className="text-stone-700">变更说明</Label><Textarea id="smtp-change-reason" aria-label="SMTP 变更说明" required maxLength={512} value={draft.reason} onChange={(event) => updateDraft('reason', event.target.value)} disabled={saving} className="mt-2 min-h-20 resize-y rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="说明本次服务配置调整的原因" /></div>
          </form>

          <form onSubmit={(event) => void verify(event)} className="flex flex-col gap-3 border-t border-stone-100 px-5 py-5 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1"><Label htmlFor="smtp-test-recipient" className="text-stone-700">验证收件人</Label><Input id="smtp-test-recipient" aria-label="验证收件人" type="email" required maxLength={320} value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} disabled={!canVerify || verifying} className="mt-2 h-10 rounded-none border-stone-300 bg-white text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20" placeholder="接收一封不含验证码的测试邮件" /></div>
            <Button type="submit" disabled={!canVerify || verifying} className="h-10 shrink-0 rounded-none bg-stone-900 px-4 hover:bg-stone-800"><Send size={16} aria-hidden="true" />{verifying ? '发送中…' : '发送验证邮件'}</Button>
          </form>
          {!canVerify ? <p className="px-5 pb-5 text-xs leading-5 text-stone-500"><MailCheck className="mr-1 inline-block text-stone-500" size={14} aria-hidden="true" />保存一套已启用的超级管理员 SMTP 配置后，才能发送验证邮件。</p> : null}
        </>
      ) : null}
    </section>
  );
}
