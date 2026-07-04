'use client';

// Research OS — Theses 列表 + 创建（Phase 2 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Thesis, ThesisStatus } from '@/lib/research/types';

const STATUS_COLORS: Record<ThesisStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-800',
  WATCH: 'bg-yellow-100 text-yellow-800',
  AT_RISK: 'bg-orange-100 text-orange-800',
  INVALIDATED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-200 text-gray-500',
};

const STATUS_ORDER: ThesisStatus[] = ['ACTIVE', 'WATCH', 'AT_RISK', 'DRAFT', 'INVALIDATED', 'CLOSED'];

export default function ResearchThesesPage() {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', body: '', invalidation_conditions: '', watch_metrics: '', next_review_at: '',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/research/theses');
    if (res.status === 501) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ theses: [] }));
    setTheses(data.theses ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const byStatus = new Map<ThesisStatus, Thesis[]>();
    for (const t of theses) {
      const list = byStatus.get(t.status) ?? [];
      list.push(t);
      byStatus.set(t.status, list);
    }
    return STATUS_ORDER.filter((s) => byStatus.has(s)).map((s) => [s, byStatus.get(s)!] as const);
  }, [theses]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
      const res = await fetch('/api/research/theses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          invalidation_conditions: lines(form.invalidation_conditions),
          watch_metrics: lines(form.watch_metrics),
          next_review_at: form.next_review_at,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`创建失败：${data?.error?.message ?? res.status}`);
      } else {
        setNotice(`创建成功：${data.thesis.title}`);
        setForm({ title: '', body: '', invalidation_conditions: '', watch_metrics: '', next_review_at: '' });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 为本地专用模式，未启用。请在本地 .env.local 设置 RESEARCH_OS_ENABLED=1 后重启 dev server。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Theses 投资假设（{theses.length}）</h1>

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-medium">新建 thesis</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            标题
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="text-sm md:col-span-2">
            正文（核心逻辑）
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            失效条件（每行一条，≥1，没有失效条件的 thesis 不允许存在）
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={3}
              value={form.invalidation_conditions}
              onChange={(e) => setForm({ ...form, invalidation_conditions: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            观察指标（每行一条，≥1）
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={3}
              value={form.watch_metrics}
              onChange={(e) => setForm({ ...form, watch_metrics: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            下次复核日期
            <input
              type="date"
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.next_review_at}
              onChange={(e) => setForm({ ...form, next_review_at: e.target.value })}
              required
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? '创建中…' : '创建 thesis（初始 DRAFT）'}
        </button>
        {notice && <p className="text-sm text-blue-800">{notice}</p>}
      </form>

      {theses.length === 0 && <p className="text-sm text-gray-500">暂无 thesis。</p>}
      {grouped.map(([status, list]) => (
        <section key={status}>
          <h2 className="mb-2 flex items-center gap-2 text-base font-medium">
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[status]}`}>{status}</span>
            <span>（{list.length}）</span>
          </h2>
          <ul className="divide-y rounded-lg border">
            {list.map((t) => (
              <li key={t.id} className="p-3 text-sm">
                <Link href={`/research/theses/${t.id}`} className="font-medium underline">
                  {t.title}
                </Link>
                <div className="mt-0.5 text-xs text-gray-500">
                  失效条件 {t.invalidation_conditions.length} · 观察指标 {t.watch_metrics.length}
                  {t.next_review_at ? ` · 下次复核 ${t.next_review_at}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
