'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpenText, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';

type SessionResponse = {
  code?: number;
  msg?: string;
};

const loginNamePattern = /^[A-Za-z0-9._@+-]{3,120}$/;

function authErrorMessage(message: string | undefined, fallback: string): string {
  switch (message) {
    case 'login name is already registered':
      return '该用户名已经注册，请直接登录或换一个用户名。';
    case 'authentication service is unavailable':
      return '认证服务暂时不可用，请稍后重试。';
    case 'invalid request origin':
      return '请求已被安全策略拦截，请刷新页面后重试。';
    default:
      return message || fallback;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDisplayName = displayName.trim();
    const normalizedUsername = username.trim();

    if (!normalizedDisplayName || normalizedDisplayName.length > 128) {
      setError('请输入 1 至 128 位的显示名称。');
      return;
    }
    if (!loginNamePattern.test(normalizedUsername)) {
      setError('用户名仅支持 3 至 120 位的字母、数字和 . _ @ + - 。');
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('密码长度应为 12 至 128 位。');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('两次输入的密码不一致。');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/novel/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          username: normalizedUsername,
          displayName: normalizedDisplayName,
          password,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SessionResponse;
      if (!response.ok || payload.code !== undefined && payload.code !== 200) {
        throw new Error(authErrorMessage(payload.msg, '注册失败，请稍后重试。'));
      }
      router.push('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '注册失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f5f1] px-4 py-8 text-stone-900 sm:px-6 lg:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden border border-stone-200 bg-white lg:grid-cols-[minmax(340px,.82fr)_minmax(0,1fr)]" aria-labelledby="register-title">
          <div className="order-2 flex min-h-[560px] flex-col p-6 sm:p-10 lg:order-1">
            <Link href="/" className="inline-flex w-fit items-center gap-2 text-stone-950" aria-label="返回阅界书城">
              <span className="grid size-8 place-items-center bg-emerald-700 text-white"><BookOpenText size={18} aria-hidden="true" /></span>
              <span className="text-lg font-semibold">阅界</span>
            </Link>
            <div className="my-auto max-w-sm py-10 lg:py-0">
              <p className="text-xs font-semibold text-emerald-700">创建读者账户</p>
              <h1 id="register-title" className="mt-2 text-3xl font-semibold text-stone-950">把喜欢的故事留在身边</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">新账户会自动登录，并从书城开始你的阅读记录。</p>

              {error ? <p role="alert" className="mt-6 border-l-4 border-rose-600 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

              <form className="mt-7 space-y-4" onSubmit={submit} noValidate>
                <div>
                  <label htmlFor="register-display-name" className="block text-sm font-medium text-stone-800">显示名称</label>
                  <input
                    id="register-display-name"
                    name="displayName"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={submitting}
                    className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:cursor-wait disabled:bg-stone-100"
                    placeholder="你希望被怎样称呼"
                  />
                </div>
                <div>
                  <label htmlFor="register-username" className="block text-sm font-medium text-stone-800">用户名</label>
                  <input
                    id="register-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={submitting}
                    className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:cursor-wait disabled:bg-stone-100"
                    placeholder="name@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="register-password" className="block text-sm font-medium text-stone-800">密码</label>
                    <span className="text-xs text-stone-500">12 至 128 位</span>
                  </div>
                  <div className="relative mt-2">
                    <input
                      id="register-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={submitting}
                      className="w-full border border-stone-300 bg-white px-3 py-2.5 pr-11 text-sm outline-none transition-colors focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:cursor-wait disabled:bg-stone-100"
                    />
                    <button
                      type="button"
                      title={showPassword ? '隐藏密码' : '显示密码'}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={submitting}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-stone-500 hover:text-emerald-800 disabled:cursor-wait"
                    >
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="register-password-confirmation" className="block text-sm font-medium text-stone-800">确认密码</label>
                  <div className="relative mt-2">
                    <input
                      id="register-password-confirmation"
                      name="passwordConfirmation"
                      type={showPasswordConfirmation ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={passwordConfirmation}
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      disabled={submitting}
                      className="w-full border border-stone-300 bg-white px-3 py-2.5 pr-11 text-sm outline-none transition-colors focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 disabled:cursor-wait disabled:bg-stone-100"
                    />
                    <button
                      type="button"
                      title={showPasswordConfirmation ? '隐藏密码' : '显示密码'}
                      aria-label={showPasswordConfirmation ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                      disabled={submitting}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-stone-500 hover:text-emerald-800 disabled:cursor-wait"
                    >
                      {showPasswordConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center gap-2 bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-500"
                >
                  {submitting ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : null}
                  {submitting ? '正在创建账户...' : '创建账户'}
                </button>
              </form>
            </div>
            <p className="text-sm text-stone-600">已有账户？ <Link href="/login" className="font-semibold text-emerald-800 hover:text-emerald-950">登录</Link></p>
          </div>

          <div className="order-1 hidden min-h-[560px] flex-col justify-between bg-stone-900 p-10 text-white lg:order-2 lg:flex">
            <p className="text-sm font-medium text-emerald-300">阅界书城</p>
            <div>
              <BookOpenText size={30} aria-hidden="true" className="text-emerald-300" />
              <h2 className="mt-6 max-w-sm text-4xl font-semibold leading-tight">读完的每一页，都值得被记住。</h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-stone-300">建立账户后，书架、书签和阅读偏好会和你一起前行。</p>
            </div>
            <p className="text-xs text-stone-400">为读者、作者与故事而建</p>
          </div>
        </section>
      </div>
    </main>
  );
}
