'use client';

// Research OS — Theses 列表 + 创建（Phase 2 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Thesis, ThesisStatus } from '@/lib/research/types';
import { EMPTY_FORM, OPPORTUNITY_LABELS, ThesisFormFields, formToInput } from './thesis-form';

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
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    const res = await fetch('/api/research/theses');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
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
      const res = await fetch('/api/research/theses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formToInput(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`创建失败：${data?.error?.message ?? res.status}`);
      } else {
        setNotice(`创建成功：${data.thesis.title}`);
        setForm(EMPTY_FORM);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Theses 投资假设（{theses.length}）</h1>

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-medium">新建 thesis</h2>
        <ThesisFormFields form={form} setForm={setForm} />
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
                  {OPPORTUNITY_LABELS[t.opportunity_type ?? 'other']} · 支柱 {(t.pillars ?? []).length} · 失效条件 {t.invalidation_conditions.length} · 观察指标 {t.watch_metrics.length}
                  {t.next_review_at ? ` · 下次复核 ${t.next_review_at}` : ''}
                  {t.supersedes ? ' · 取代旧 thesis' : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
