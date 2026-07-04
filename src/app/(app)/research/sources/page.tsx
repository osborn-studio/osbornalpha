'use client';

// Research OS — Sources 页面（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，
// 不进 G 系 i18n（next-intl messages）管辖。见 docs/research-os/2026-07-04-phase1-skeleton.md T2。

import { useCallback, useEffect, useState } from 'react';
import type { SourceDocument } from '@/lib/research/types';

const SOURCE_TYPES = ['GITHUB_RADAR', 'MODEL_USAGE', 'EARNINGS_CALL', 'NEWS', 'FILING', 'NOTE', 'MANUAL'];
const TRUST_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

export default function ResearchSourcesPage() {
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', source_type: 'NEWS', url: '', trust_level: 'MEDIUM', raw_text: '',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/research/sources');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ sources: [] }));
    setSources(data.sources ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/research/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          source_type: form.source_type,
          url: form.url || undefined,
          trust_level: form.trust_level,
          raw_text: form.raw_text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`导入失败：${data?.error?.message ?? res.status}`);
      } else if (data.duplicate) {
        setNotice(`内容已存在（去重命中），id: ${data.id}`);
      } else {
        setNotice(`导入成功，id: ${data.id}`);
        setForm({ title: '', source_type: 'NEWS', url: '', trust_level: 'MEDIUM', raw_text: '' });
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
      <h1 className="text-xl font-semibold">Sources 资料导入</h1>

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            标题
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            类型
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.source_type}
              onChange={(e) => setForm({ ...form, source_type: e.target.value })}
            >
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">
            URL（可选）
            <input
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </label>
          <label className="text-sm">
            信任级别
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.trust_level}
              onChange={(e) => setForm({ ...form, trust_level: e.target.value })}
            >
              {TRUST_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          正文（原始文本，导入后不可修改）
          <textarea
            className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
            rows={8}
            value={form.raw_text}
            onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? '导入中…' : '导入 Source'}
        </button>
        {notice && <p className="text-sm text-gray-600">{notice}</p>}
      </form>

      <section>
        <h2 className="mb-2 text-base font-medium">已导入（{sources.length}）</h2>
        <ul className="divide-y rounded-lg border">
          {sources.map((s) => (
            <li key={s.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.title}</span>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs">{s.source_type}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {s.ingested_at} · trust {s.trust_level} · hash {s.content_hash.slice(0, 12)}…
              </div>
            </li>
          ))}
          {sources.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 source</li>}
        </ul>
      </section>
    </div>
  );
}
