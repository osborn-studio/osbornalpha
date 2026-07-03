'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

type Mode = 'login' | 'register';
type Provider = 'google' | 'github' | 'apple';

const PROVIDERS: { id: Provider; label: string; icon: string }[] = [
  { id: 'google', label: 'Google', icon: 'G' },
  { id: 'github', label: 'GitHub', icon: '⌨' },
  { id: 'apple', label: 'Apple', icon: '' },
];

export function AuthForm({ mode }: { mode: Mode }) {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const configured = isSupabaseConfigured();
  const isLogin = mode === 'login';

  async function submitEmail() {
    if (!configured) return show('Supabase 未配置，请联系管理员');
    if (password.length < 8) return show('密码至少 8 位');
    setBusy(true);
    const sb = getBrowserSupabase();
    if (isLogin) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return show(`✗ ${error.message}`);
      show('✓ 登录成功');
      window.location.href = '/today';
    } else {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) return show(`✗ ${error.message}`);
      setRegistered(true);
      show('✓ 确认邮件已发送');
    }
  }

  async function oauth(provider: Provider) {
    if (!configured) return show('Supabase 未配置，请联系管理员');
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) show(`✗ ${error.message}`);
  }

  if (registered) {
    return (
      <div className="rounded-md bg-up/10 p-3 text-sm">
        ✅ 确认邮件已发送到 <strong>{email}</strong>
        <br />
        <span className="text-xs text-text-dim">点击邮件中的链接完成注册，然后回来登录。</span>
        <div className="mt-3"><Link href="/login" className="text-accent-dim">← 去登录</Link></div>
      </div>
    );
  }

  return (
    <>
      {!configured && (
        <div className="mb-3 rounded-md bg-warn/10 p-3 text-sm text-warn">
          ⚠️ Supabase 环境变量未配置（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）。
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => oauth(p.id)}
            disabled={!configured}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-bg-elev disabled:opacity-50"
          >
            {p.icon ? `${p.icon} ` : ''}{p.label}
          </button>
        ))}
      </div>

      <div className="my-3 flex items-center gap-3 text-xs text-text-dim">
        <span className="h-px flex-1 bg-border" />或用邮箱<span className="h-px flex-1 bg-border" />
      </div>

      <div className="mb-2">
        <label className="mb-1 block text-xs text-text-dim">邮箱</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="w-full" autoComplete="email" />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-xs text-text-dim">密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位" className="w-full"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onKeyDown={(e) => e.key === 'Enter' && submitEmail()} />
      </div>

      <button onClick={submitEmail} disabled={!email || !password || busy || !configured}
        className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? '处理中…' : isLogin ? '登录' : '注册'}
      </button>

      <div className="mt-4 flex justify-between text-xs text-text-dim">
        {isLogin ? (
          <>
            <Link href="/register" className="text-accent-dim">注册新账号</Link>
            <Link href="/forgot-password">忘记密码？</Link>
          </>
        ) : (
          <Link href="/login" className="text-accent-dim">已有账号？登录</Link>
        )}
      </div>
    </>
  );
}
