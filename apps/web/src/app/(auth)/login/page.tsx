'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpenText, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';

type SessionResponse = {
  code?: number;
  msg?: string;
  data?: { passwordChangeRequired?: boolean };
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(message: string | undefined, fallback: string): string {
  switch (message) {
    case 'invalid credentials':
      return '用户名或密码不正确。';
    case 'authentication service is unavailable':
      return '认证服务暂时不可用，请稍后重试。';
    case 'invalid request origin':
      return '请求已被安全策略拦截，请刷新页面后重试。';
    default:
      return message || fallback;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();

    if (normalizedUsername.length > 120 || !emailPattern.test(normalizedUsername)) {
      setError('请输入有效的邮箱地址。');
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('密码长度应为 12 至 128 位。');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/novel/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'login', username: normalizedUsername, password }),
      });
      const payload = await response.json().catch(() => ({})) as SessionResponse;
      if (!response.ok || payload.code !== undefined && payload.code !== 200) {
        throw new Error(authErrorMessage(payload.msg, '登录失败，请稍后重试。'));
      }
      router.push(payload.data?.passwordChangeRequired ? '/account/password' : '/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f5f1] px-4 py-8 text-stone-900 sm:px-6 lg:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden border border-stone-200 bg-white lg:grid-cols-[minmax(0,1fr)_minmax(340px,.82fr)]" aria-labelledby="login-title">
          <div className="hidden min-h-[520px] flex-col justify-between bg-emerald-800 p-10 text-white lg:flex">
            <Link href="/" className="inline-flex w-fit items-center gap-2 text-lg font-semibold" aria-label="返回阅界书城">
              <span className="grid size-9 place-items-center border border-white/35 bg-white/10"><BookOpenText size={20} aria-hidden="true" /></span>
              阅界
            </Link>
            <div>
              <p className="text-sm font-medium text-emerald-100">阅界书城</p>
              <h1 className="mt-3 max-w-sm text-4xl font-semibold leading-tight">从这一页，继续你的阅读。</h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-emerald-100">登录后可同步书架、阅读进度和收藏的章节。</p>
            </div>
            <p className="text-xs text-emerald-100">故事仍在更新</p>
          </div>

          <div className="flex min-h-[520px] flex-col p-6 sm:p-10">
            <Link href="/" className="inline-flex w-fit items-center gap-2 text-stone-950 lg:hidden" aria-label="返回阅界书城">
              <span className="grid size-8 place-items-center bg-emerald-700 text-white"><BookOpenText size={18} aria-hidden="true" /></span>
              <span className="text-lg font-semibold">阅界</span>
            </Link>
            <div className="my-auto max-w-sm py-10 lg:py-0">
              <p className="text-xs font-semibold text-emerald-700">读者登录</p>
              <h2 id="login-title" className="mt-2 text-3xl font-semibold text-stone-950">欢迎回来</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">使用已验证邮箱登录，继续阅读与管理书架。</p>

              {error ? <Alert variant="destructive" className="mt-6 rounded-none border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-rose-800"><AlertDescription className="text-inherit">{error}</AlertDescription></Alert> : null}

              <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
                <div>
                  <Label htmlFor="login-username" className="text-stone-800">邮箱</Label>
                  <Input
                    id="login-username"
                    name="username"
                    type="email"
                    autoComplete="email"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={submitting}
                    className="mt-2 h-11 rounded-none border-stone-300 bg-white px-3 text-stone-900 placeholder:text-stone-400 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 disabled:cursor-wait disabled:bg-stone-100"
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="login-password" className="text-stone-800">密码</Label>
                    <span className="text-xs text-stone-500">12 至 128 位</span>
                  </div>
                  <div className="relative mt-2">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={submitting}
                      className="h-11 rounded-none border-stone-300 bg-white px-3 pr-11 text-stone-900 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 disabled:cursor-wait disabled:bg-stone-100"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={showPassword ? '隐藏密码' : '显示密码'}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={submitting}
                      className="absolute inset-y-0 right-0 size-10 rounded-none text-stone-500 hover:bg-transparent hover:text-emerald-800 disabled:cursor-wait"
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-auto w-full rounded-none bg-emerald-700 px-4 py-3 hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-500"
                >
                  {submitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : null}
                  {submitting ? '正在登录...' : '登录'}
                </Button>
              </form>
            </div>
            <p className="text-sm text-stone-600">还没有账户？ <Link href="/register" className="font-semibold text-emerald-800 hover:text-emerald-950">创建账户</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}
