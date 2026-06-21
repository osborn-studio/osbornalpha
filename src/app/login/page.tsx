'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function LoginPage() {
  const { show } = useToast();
  const [showMagic, setShowMagic] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function sendMagicLink() {
    if (!isSupabaseConfigured()) return show('Supabase 未配置');
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return show(`✗ ${error.message}`);
    setSent(true);
    show('✓ 魔法链接已发送');
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">👋 登录 osbornalpha</h1>
        <p className="mb-4 text-sm text-text-dim">用邮箱密码、Google 或其他方式登录。</p>

        <AuthForm mode="login" />

        <div className="mt-5 border-t border-border pt-3 text-center text-xs text-text-dim">
          {!showMagic ? (
            <button onClick={() => setShowMagic(true)}>或使用免密魔法链接登录</button>
          ) : sent ? (
            <span className="text-up">✅ 链接已发到 {email}，查收邮件</span>
          ) : (
            <div className="flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" className="flex-1" />
              <button onClick={sendMagicLink} disabled={!email}
                className="rounded-lg bg-bg-elev px-3 py-2">发送</button>
            </div>
          )}
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
