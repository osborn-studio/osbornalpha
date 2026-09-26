'use client';

// Research OS — Dashboard（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { InvestmentMemo, PlaybookRun, Signal, SourceDocument, ThesisEvent, ThesisStatus } from '@/lib/research/types';

interface PendingAlert {
  thesis_id: string;
  thesis_title: string;
  thesis_status: ThesisStatus;
  event: ThesisEvent;
}

interface EvalAggregate {
  case_count: number;
  run_count: number;
  avg_total: number | null;
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
  const [pendingPlaybooks, setPendingPlaybooks] = useState<PlaybookRun[]>([]);
  const [evalAgg, setEvalAgg] = useState<EvalAggregate | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/research/sources');
      if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
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
      const pRes = await fetch('/api/research/playbooks?status=PENDING');
      const pData = await pRes.json().catch(() => ({ runs: [] }));
      setPendingPlaybooks(pData.runs ?? []);
      const eRes = await fetch('/api/research/evals/cases');
      const eData = await eRes.json().catch(() => ({ aggregate: null }));
      setEvalAgg(eData.aggregate ?? null);
    })();
  }, []);

  if (disabled) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <h1 className="text-base font-semibold">Research OS：该模块暂未开放</h1>
        <p>
          Research OS 目前为<strong>管理员专用</strong>研究模块（个人云工具规格）。
          需要以 admin 角色登录后才能访问；开放更多用户是权限决策，而非功能缺失。
        </p>
        <p>若你认为应有权限，请登录后联系管理员开通 profiles.role = &apos;admin&apos;。</p>
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
          <Link href="/research/setup" className="block rounded-lg border border-dashed p-4 hover:bg-gray-50">
            <div className="text-sm font-medium">🧭 研究设置向导</div>
            <div className="text-sm text-gray-500">圈定 12–15 家公司、录入 8–12 条 thesis——每题带提示的简答题，阶段 0 的固定入口。</div>
          </Link>
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
            <Link href="/research/playbooks" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">{pendingPlaybooks.length}</div>
              <div className="text-sm text-gray-500">📋 待审批 playbook</div>
            </Link>
            <Link href="/research/evals" className="rounded-lg border p-4 hover:bg-gray-50">
              <div className="text-3xl font-semibold">
                {evalAgg ? `${evalAgg.case_count}/${evalAgg.run_count}` : '—'}
              </div>
              <div className="text-sm text-gray-500">
                🧪 Eval cases/runs{evalAgg?.avg_total != null && <>（平均 {evalAgg.avg_total}/10）</>}
              </div>
            </Link>
          </div>

          {pendingPlaybooks.length > 0 && (
            <section className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
              <h2 className="mb-2 text-base font-medium">📋 待审批 playbook（{pendingPlaybooks.length}）— 高风险动作需人工裁决</h2>
              <ul className="space-y-2">
                {pendingPlaybooks.slice(0, 3).map((run) => (
                  <li key={run.id} className="rounded border border-yellow-200 bg-white p-3 text-sm">
                    <Link href="/research/playbooks" className="font-medium underline">
                      {run.proposed_action}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">{run.created_at}</span>
                    <p className="mt-1 text-xs text-gray-600">{run.rationale}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
