'use client';

// Research OS — Company Page（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Entity, SourceDocument } from '@/lib/research/types';

interface MemoSummary {
  id: string;
  title: string;
  status: string;
  confidence: string;
  created_at: string;
  open_questions: string[];
}

interface EntityDetail {
  entity: Entity;
  sources: SourceDocument[];
  memos: MemoSummary[];
  open_questions: string[];
}

export default function ResearchCompanyPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/research/entities/${params.id}`);
      if (!res.ok) {
        setError(res.status === 501 ? 'Research OS 未启用（本地专用）' : `加载失败：${res.status}`);
        return;
      }
      setData(await res.json());
    })();
  }, [params.id]);

  async function generateMemo() {
    setGenerating(true);
    try {
      const res = await fetch('/api/research/memos/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_id: params.id }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.memo?.id) {
        window.location.href = `/research/memos/${out.memo.id}`;
      } else {
        setError(`memo 生成失败：${out?.error?.message ?? res.status}`);
      }
    } finally {
      setGenerating(false);
    }
  }

  if (error) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">{error}</div>;
  if (!data) return <p className="p-6 text-sm text-gray-500">加载中…</p>;

  const { entity, sources, memos, open_questions } = data;

  return (
    <div className="space-y-6">
      <header className="rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{entity.name}</h1>
          {entity.ticker && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{entity.ticker}</span>}
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{entity.type}</span>
        </div>
        {entity.description && <p className="mt-2 text-sm text-gray-600">{entity.description}</p>}
        <button
          onClick={generateMemo}
          disabled={generating}
          className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {generating ? '生成中（LLM 调用）…' : '生成投资 Memo'}
        </button>
      </header>

      <section>
        <h2 className="mb-2 text-base font-medium">关联 Sources（{sources.length}）</h2>
        <ul className="divide-y rounded-lg border">
          {sources.map((s) => (
            <li key={s.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.title}</span>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs">{s.source_type}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">{s.ingested_at} · trust {s.trust_level}</div>
            </li>
          ))}
          {sources.length === 0 && (
            <li className="p-3 text-sm text-gray-500">
              暂无关联 source。在 <Link className="underline" href="/research/sources">Sources</Link> 导入时把 entity_ids 填上本实体 id：{entity.id}
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-medium">关联 Memos（{memos.length}）</h2>
        <ul className="divide-y rounded-lg border">
          {memos.map((m) => (
            <li key={m.id} className="p-3 text-sm">
              <Link href={`/research/memos/${m.id}`} className="font-medium underline">{m.title}</Link>
              <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{m.status}</span>
              <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs">conf {m.confidence}</span>
            </li>
          ))}
          {memos.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 memo</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-medium">待验证问题汇总（{open_questions.length}）</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {open_questions.map((q, i) => <li key={i}>{q}</li>)}
          {open_questions.length === 0 && <li className="list-none text-gray-500">暂无</li>}
        </ul>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-dashed p-4 text-sm text-gray-400">Signals（Phase 2 占位）</div>
        <div className="rounded-lg border border-dashed p-4 text-sm text-gray-400">Theses（Phase 2 占位）</div>
      </section>
    </div>
  );
}
