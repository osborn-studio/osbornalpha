'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function ForgotPasswordPage() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!isSupabaseConfigured()) return show('Supabase 未配置');
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return show(`✗ ${error.message}`);
    setSent(true);
    show('✓ 重置邮件已发送');
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">🔑 找回密码</h1>
        <p className="mb-4 text-sm text-text-dim">输入注册邮箱，我们发一条密码重置链接。</p>

        {sent ? (
          <div className="rounded-md bg-up/10 p-3 text-sm">
            ✅ 重置链接已发到 <strong>{email}</strong>
            <br /><span className="text-xs text-text-dim">点击邮件链接设置新密码（链接有时效，过期可重发）。</span>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-dim">邮箱</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className="w-full"
                onKeyDown={(e) => e.key === 'Enter' && send()} />
            </div>
            <button onClick={send} disabled={!email || busy || !isSupabaseConfigured()}
              className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? '发送中…' : '发送重置链接'}
            </button>
          </>
        )}

        <div className="mt-4 text-center text-xs text-text-dim">
          <Link href="/login" className="text-accent-dim">← 返回登录</Link>
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
