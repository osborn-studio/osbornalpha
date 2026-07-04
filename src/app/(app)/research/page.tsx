'use client';

// Research OS — Dashboard（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { InvestmentMemo, Signal, SourceDocument, ThesisEvent, ThesisStatus } from '@/lib/research/types';

interface PendingAlert {
  thesis_id: string;
  thesis_title: string;
  thesis_status: ThesisStatus;
  event: ThesisEvent;
}

const VERDICT_BADGES: Record<string, string> = {
  SUPPORT: 'bg-green-100 text-green-800',
  WEAKEN: 'bg-orange-100 text-orange-800',
  INVALIDATE: 'bg-red-100 text-red-800',
};

export default function ResearchDashboardPage() {
  const [sources, setSources] = useState<SourceDocument[] | null>(null);
  const [memos, setMemos] = useState<InvestmentMemo[] | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
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
      const sRes = await fetch('/api/research/signals');
      const sData = await sRes.json().catch(() => ({ signals: [] }));
      setSignals(sData.signals ?? []);
      const aRes = await fetch('/api/research/theses/alerts');
      const aData = await aRes.json().catch(() => ({ alerts: [] }));
      setAlerts(aData.alerts ?? []);
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/research/sources" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{sources.length}</div>
              <div className="text-sm text-gray-500">Source documents</div>
            </Link>
            <Link href="/research/signals" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">
                {signals.filter((s) => s.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}
              </div>
              <div className="text-sm text-gray-500">今日 signals（共 {signals.length}）</div>
            </Link>
            <Link href="/research/theses" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{alerts.length}</div>
              <div className="text-sm text-gray-500">待裁决 alerts</div>
            </Link>
            <Link href="/research/memos" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{memos.length}</div>
              <div className="text-sm text-gray-500">Investment memos</div>
            </Link>
          </div>

          {alerts.length > 0 && (
            <section className="rounded-lg border border-orange-300 bg-orange-50 p-4">
              <h2 className="mb-2 text-base font-medium">⚠️ 待裁决 alerts（{alerts.length}）— 系统不会自动改 thesis 状态</h2>
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li key={a.event.id} className="rounded border border-orange-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${VERDICT_BADGES[a.event.event_type] ?? 'bg-gray-100'}`}>
                        {a.event.event_type}
                      </span>
                      <Link href={`/research/theses/${a.thesis_id}`} className="font-medium underline">
                        {a.thesis_title}
                      </Link>
                      <span className="text-xs text-gray-500">{a.thesis_status} · {a.event.created_at}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{String(a.event.detail.rationale ?? '')}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
