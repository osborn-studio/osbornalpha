'use client';

// Research OS — Dashboard（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { InvestmentMemo, SourceDocument } from '@/lib/research/types';

export default function ResearchDashboardPage() {
  const [sources, setSources] = useState<SourceDocument[] | null>(null);
  const [memos, setMemos] = useState<InvestmentMemo[] | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/research/sources');
      if (res.status === 501) { setDisabled(true); return; }
      const data = await res.json().catch(() => ({ sources: [] }));
      setSources(data.sources ?? []);
      const mRes = await fetch('/api/research/memos');
      const mData = await mRes.json().catch(() => ({ memos: [] }));
      setMemos(mData.memos ?? []);
    })();
  }, []);

  if (disabled) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="text-base font-semibold">Research OS：本地专用模式未启用</h1>
        <p>
          Research OS 是随 stock-monitor 一起分发的<strong>本地单用户研究工具</strong>，
          数据存在本机 SQLite（research-data/research.db），不部署到生产环境。
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>在项目根目录 .env.local 添加：<code className="rounded bg-amber-100 px-1">RESEARCH_OS_ENABLED=1</code></li>
          <li>重启 dev server（npm run dev）</li>
          <li>运行种子：<code className="rounded bg-amber-100 px-1">RESEARCH_OS_ENABLED=1 npx tsx scripts/research-seed.ts</code></li>
        </ol>
        <p>未启用时所有 /api/research/* 返回 501，生产部署不受影响。</p>
      </div>
    );
  }

  const loading = sources === null || memos === null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Research Dashboard</h1>
      {loading ? (
        <p className="text-sm text-gray-500">加载中…</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Link href="/research/sources" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{sources.length}</div>
              <div className="text-sm text-gray-500">Source documents</div>
            </Link>
            <Link href="/research/memos" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{memos.length}</div>
              <div className="text-sm text-gray-500">Investment memos</div>
            </Link>
          </div>

          <section>
            <h2 className="mb-2 text-base font-medium">最近 Sources</h2>
            <ul className="divide-y rounded-lg border">
              {sources.slice(0, 5).map((s) => (
                <li key={s.id} className="p-3 text-sm">
                  <span className="font-medium">{s.title}</span>
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{s.source_type}</span>
                  <div className="mt-0.5 text-xs text-gray-500">{s.ingested_at}</div>
                </li>
              ))}
              {sources.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 source，先去导入</li>}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-medium">最近 Memos</h2>
            <ul className="divide-y rounded-lg border">
              {memos.slice(0, 5).map((m) => (
                <li key={m.id} className="p-3 text-sm">
                  <Link href={`/research/memos/${m.id}`} className="font-medium underline">{m.title}</Link>
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{m.status}</span>
                  <div className="mt-0.5 text-xs text-gray-500">{m.created_at} · {m.one_line_conclusion}</div>
                </li>
              ))}
              {memos.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 memo</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
