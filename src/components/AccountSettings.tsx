'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { UserIdentity } from '@supabase/supabase-js';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

type Provider = 'google' | 'github' | 'apple';
const LINKABLE: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
  { id: 'apple', label: 'Apple' },
];

export function AccountSettings() {
  const { show } = useToast();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [plan, setPlan] = useState<string>('free');
  const [newEmail, setNewEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured();

  async function refresh() {
    if (!configured) return;
    const sb = getBrowserSupabase();
    const { data: { user: u } } = await sb.auth.getUser();
    if (!u) { setUser(null); return; }
    setUser({ id: u.id, email: u.email });
    setIdentities(u.identities ?? []);
    const { data: prof } = await sb.from('profiles').select('plan').eq('id', u.id).maybeSingle<{ plan: string }>();
    if (prof?.plan) setPlan(prof.plan);
  }
  useEffect(() => { refresh(); }, []);

  async function changeEmail() {
    if (!newEmail) return;
    setBusy(true);
    const { error } = await getBrowserSupabase().auth.updateUser({ email: newEmail });
    setBusy(false);
    if (error) return show(`✗ ${error.message}`);
    show('✓ 确认邮件已发到新旧邮箱，按提示确认');
    setNewEmail('');
  }

  async function changePassword() {
    if (newPw.length < 8) return show('密码至少 8 位');
    setBusy(true);
    const { error } = await getBrowserSupabase().auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) return show(`✗ ${error.message}`);
    show('✓ 密码已更新');
    setNewPw('');
  }

  async function link(provider: Provider) {
    const { error } = await getBrowserSupabase().auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) show(`✗ ${error.message}`);
  }

  async function unlink(identity: UserIdentity) {
    if (identities.length <= 1) return show('✗ 至少保留一种登录方式');
    const { error } = await getBrowserSupabase().auth.unlinkIdentity(identity);
    if (error) return show(`✗ ${error.message}`);
    show('✓ 已解绑');
    refresh();
  }

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    setUser(null);
    show('✓ 已登出');
  }

  if (!user) {
    return (
      <div className="flex items-center justify-between">
        <div className="text-sm">
          访客模式 — 数据存浏览器本地
          {!configured && <div className="mt-1 text-[11px] text-warn">⚠️ Supabase 未配置，无法登录</div>}
        </div>
        {configured && (
          <Link href="/login" className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white">登录 / 注册</Link>
        )}
      </div>
    );
  }

  const linkedProviders = new Set(identities.map((i) => i.provider));

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{user.email}</div>
          <div className="text-[11px] text-text-dim">套餐：{plan === 'pro' ? 'Pro' : 'Free'} · ID {user.id.slice(0, 8)}…</div>
        </div>
        <button onClick={logout} className="rounded border border-border px-3 py-1.5 text-xs">登出</button>
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-1 text-xs text-text-dim">修改邮箱</div>
        <div className="flex gap-2">
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            placeholder="新邮箱" className="flex-1" />
          <button onClick={changeEmail} disabled={!newEmail || busy}
            className="rounded bg-bg-card border border-border px-3 py-2 text-xs disabled:opacity-50">更新</button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-text-dim">修改密码</div>
        <div className="flex gap-2">
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
            placeholder="新密码（≥8 位）" className="flex-1" autoComplete="new-password" />
          <button onClick={changePassword} disabled={!newPw || busy}
            className="rounded bg-bg-card border border-border px-3 py-2 text-xs disabled:opacity-50">更新</button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-text-dim">第三方账号绑定</div>
        <div className="flex flex-col gap-2">
          {LINKABLE.map((p) => {
            const linked = linkedProviders.has(p.id);
            const idn = identities.find((i) => i.provider === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                <span>{p.label}{linked && <span className="ml-2 text-[11px] text-up">已绑定</span>}</span>
                {linked
                  ? <button onClick={() => idn && unlink(idn)} className="text-xs text-down">解绑</button>
                  : <button onClick={() => link(p.id)} className="text-xs text-accent-dim">绑定</button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
