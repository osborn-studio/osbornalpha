'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function LoginPage() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendMagicLink() {
    if (!isSupabaseConfigured()) {
      show('Supabase 未配置，请联系管理员');
      return;
    }
    setSending(true);
    const sb = getBrowserSupabase();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setSending(false);
    if (error) {
      show(`✗ ${error.message}`);
      return;
    }
    setSent(true);
    show('✓ 魔法链接已发送至邮箱');
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-2 text-2xl font-bold">👋 登录 Stock Monitor</h1>
        <p className="mb-4 text-sm text-text-dim">
          输入邮箱，我们会发一条魔法登录链接。无需密码。
        </p>

        {!isSupabaseConfigured() && (
          <div className="mb-3 rounded-md bg-warn/10 p-3 text-sm text-warn">
            ⚠️ Supabase 环境变量未配置。请在 Vercel Dashboard 设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。
          </div>
        )}

        {sent ? (
          <div className="rounded-md bg-up/10 p-3 text-sm">
            ✅ 邮件已发送到 <strong>{email}</strong>
            <br />
            <span className="text-xs text-text-dim">检查收件箱（含垃圾邮件），点击链接完成登录。</span>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-dim">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full"
              />
            </div>
            <button
              onClick={sendMagicLink}
              disabled={!email || sending || !isSupabaseConfigured()}
              className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? '发送中...' : '✉️ 发送魔法链接'}
            </button>
          </>
        )}

        <div className="mt-4 text-center text-xs text-text-dim">
          <Link href="/">← 返回（继续访客模式）</Link>
        </div>
      </div>

      <Disclaimer />
    </>
  );
}
