'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { novelApi } from '@/features/novel/api';

export default function PasswordChangePage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('新密码长度应为 12 至 128 位。');
      return;
    }
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致。');
      return;
    }
    if (newPassword === currentPassword) {
      setError('新密码不能与当前密码相同。');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await novelApi<void>('account/password', 'reader', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.replace('/login?passwordChanged=1');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '密码修改失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f5f1] px-4 py-8 text-stone-900 sm:px-6 lg:py-12">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center">
        <div className="w-full border border-stone-200 bg-white p-6 sm:p-10">
          <p className="text-xs font-semibold text-emerald-700">账户安全</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950">请修改初始密码</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">为继续使用账户与管理权限，请先设置新的密码。</p>
          {error ? <Alert variant="destructive" className="mt-6 rounded-none border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-rose-800"><AlertDescription className="text-inherit">{error}</AlertDescription></Alert> : null}
          <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
            <div><Label htmlFor="current-password">当前密码</Label><Input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={submitting} className="mt-2 h-11 rounded-none" /></div>
            <div><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={submitting} className="mt-2 h-11 rounded-none" /></div>
            <div><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={submitting} className="mt-2 h-11 rounded-none" /></div>
            <Button type="submit" disabled={submitting} className="w-full rounded-none bg-emerald-700 py-3 hover:bg-emerald-800">{submitting ? '正在修改...' : '修改密码并重新登录'}</Button>
          </form>
          <Link href="/login" className="mt-6 inline-block text-sm text-emerald-800 underline">返回登录</Link>
        </div>
      </section>
    </main>
  );
}
