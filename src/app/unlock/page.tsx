'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';

function UnlockForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get('next') || '/';
  const initialError = params.get('error');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await resp.json();
      if (data.ok) {
        // Use full reload so middleware can pick up the new cookie
        window.location.href = next;
      } else {
        setError(data.error || '解锁失败');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: '#0d1117' }}>
      <div className="w-full max-w-sm rounded-2xl border border-[#30363d] bg-[#161b22] p-7 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-2xl">🔒</span>
          <h1 className="text-xl font-bold text-[#e6edf3]">
            Stock<span className="text-[#58a6ff]">Monitor</span>
          </h1>
        </div>
        <p className="mb-5 text-xs text-[#8b949e]">
          个人股票池每日 AI 监控 · 请输入访问密码
        </p>

        <form onSubmit={submit}>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="访问密码"
            disabled={loading}
            autoComplete="current-password"
            className="mb-3 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff] disabled:opacity-50"
          />
          {error && (
            <div className="mb-3 rounded-md bg-[#cf222e]/15 px-3 py-2 text-xs text-[#ff7b72]">
              ⚠️ {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!password || loading}
            className="w-full rounded-md bg-[#1f6feb] py-2.5 text-sm font-semibold text-white transition hover:bg-[#388bfd] disabled:opacity-50"
          >
            {loading ? '验证中…' : '🔓 解锁'}
          </button>
        </form>

        <div className="mt-5 border-t border-[#30363d] pt-4 text-[10px] leading-relaxed text-[#6e7681]">
          私人开发版本 · 仅授权访问 ·
          数据存于浏览器本地与你的 Supabase 实例 · 不构成任何投资建议
        </div>
      </div>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-[#8b949e]">…</div>}>
      <UnlockForm />
    </Suspense>
  );
}
