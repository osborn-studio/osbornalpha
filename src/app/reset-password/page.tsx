'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

// User arrives here from the reset email link. Supabase establishes a recovery
// session automatically from the URL fragment, so updateUser({password}) works.
export default function ResetPasswordPage() {
  const { show } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (!isSupabaseConfigured()) return show('Supabase 未配置');
    if (password.length < 8) return show('密码至少 8 位');
    if (password !== confirm) return show('两次密码不一致');
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) return show(`✗ ${error.message}（链接可能已过期，请重新申请）`);
    setDone(true);
    show('✓ 密码已更新');
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">🔒 设置新密码</h1>
        {done ? (
          <div className="rounded-md bg-up/10 p-3 text-sm">
            ✅ 密码已更新。<div className="mt-3"><Link href="/login" className="text-accent-dim">→ 用新密码登录</Link></div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-dim">输入并确认你的新密码（至少 8 位）。</p>
            <div className="mb-2">
              <label className="mb-1 block text-xs text-text-dim">新密码</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full" autoComplete="new-password" />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-dim">确认新密码</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full" autoComplete="new-password"
                onKeyDown={(e) => e.key === 'Enter' && save()} />
            </div>
            <button onClick={save} disabled={!password || !confirm || busy || !isSupabaseConfigured()}
              className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? '保存中…' : '更新密码'}
            </button>
          </>
        )}
      </div>
      <Disclaimer />
    </>
  );
}
