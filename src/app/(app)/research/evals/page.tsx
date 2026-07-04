'use client';

// Research OS — Eval Lab（Phase 4 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  EVAL_TIMEBOX_LIMITATION,
  type EvalCase,
  type SourceDocument,
} from '@/lib/research/types';

interface EvalCaseSummary extends EvalCase {
  run_count: number;
  last_run_at: string | null;
  last_total: number | null;
}

interface EvalAggregate {
  case_count: number;
  run_count: number;
  avg_total: number | null;
  dimension_averages: Record<string, number>;
  failure_mode_top: Array<{ mode: string; count: number }>;
}

export default function EvalLabPage() {
  const [cases, setCases] = useState<EvalCaseSummary[] | null>(null);
  const [aggregate, setAggregate] = useState<EvalAggregate | null>(null);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [disabled, setDisabled] = useState(false);

  // Create form state.
  const [title, setTitle] = useState('');
  const [asOf, setAsOf] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expectedNotes, setExpectedNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/research/evals/cases');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ cases: [], aggregate: null }));
    setCases(data.cases ?? []);
    setAggregate(data.aggregate ?? null);
    const sRes = await fetch('/api/research/sources');
    const sData = await sRes.json().catch(() => ({ sources: [] }));
    setSources(sData.sources ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleSource = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/research/evals/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          as_of_date: asOf,
          source_document_ids: [...selected],
          expected_notes: expectedNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error?.message ?? `创建失败（${res.status}）`);
        return;
      }
      setTitle(''); setAsOf(''); setSelected(new Set()); setExpectedNotes('');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。
      </div>
    );
  }

  const loading = cases === null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Eval Lab — 历史时间点评测</h1>
      {loading ? (
        <p className="text-sm text-gray-500">加载中…</p>
      ) : (
        <>
          {/* 聚合区：六维平均分 + failure modes 词频 */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-base font-medium">
              聚合报告（{aggregate?.case_count ?? 0} 案例 · {aggregate?.run_count ?? 0} 次 run
              {aggregate?.avg_total != null && <> · 平均 total {aggregate.avg_total}/10</>}）
            </h2>
            {aggregate && aggregate.run_count > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  {Object.entries(aggregate.dimension_averages).map(([dim, avg]) => (
                    <div key={dim} className="flex items-center gap-2 text-xs">
                      <span className="w-40 shrink-0 truncate font-mono" title={dim}>{dim}</span>
                      <div className="h-3 flex-1 rounded bg-gray-100">
                        <div
                          className="h-3 rounded bg-blue-500"
                          style={{ width: `${Math.min(100, (avg / 10) * 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums">{avg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-medium text-gray-500">Failure modes Top 10</h3>
                  {aggregate.failure_mode_top.length === 0 ? (
                    <p className="text-xs text-gray-400">暂无 failure mode</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {aggregate.failure_mode_top.map((f) => (
                        <li key={f.mode} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          {f.mode} × {f.count}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">还没有 run——先在下方案例上点「运行评测」。</p>
            )}
          </section>

          {/* 案例卡 */}
          <section>
            <h2 className="mb-2 text-base font-medium">评测案例（{cases.length}）</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/research/evals/${c.id}`}
                  className="rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="font-medium">{c.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>as_of {c.as_of}</span>
                    <span>{c.visible_material.length} 份材料</span>
                    <span>{c.run_count} 次 run</span>
                    {c.last_total != null && (
                      <span className="font-medium text-gray-700">最近 total {c.last_total}/10</span>
                    )}
                  </div>
                </Link>
              ))}
              {cases.length === 0 && (
                <p className="text-sm text-gray-500">暂无案例——用下方表单创建，或运行 scripts/research-eval-bootstrap.ts</p>
              )}
            </div>
          </section>

          {/* 新建表单 */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 text-base font-medium">新建评测案例</h2>
            <form onSubmit={submit} className="space-y-3 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">标题</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="w-full rounded border px-2 py-1.5"
                    placeholder="例：NVIDIA 2026Q1 财报后判断"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-500">as_of_date（时间盒日期）</span>
                  <input
                    type="date"
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    required
                    className="w-full rounded border px-2 py-1.5"
                  />
                </label>
              </div>
              <div>
                <span className="mb-1 block text-xs text-gray-500">
                  当时可见材料（已入库 sources，已选 {selected.size}）
                </span>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
                  {sources.map((s) => (
                    <label key={s.id} className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSource(s.id)}
                        className="mt-0.5"
                      />
                      <span>
                        {s.title}
                        <span className="ml-1 rounded bg-gray-100 px-1">{s.source_type}</span>
                      </span>
                    </label>
                  ))}
                  {sources.length === 0 && <p className="text-xs text-gray-400">library 里还没有 source</p>}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">
                  expected notes（真实后续事件——评审员的 ground truth）
                </span>
                <textarea
                  value={expectedNotes}
                  onChange={(e) => setExpectedNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded border px-2 py-1.5"
                  placeholder="记录 as_of 之后实际发生了什么：财报结果、股价反应、后续新闻……"
                />
              </label>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '创建中…' : '创建案例'}
              </button>
            </form>
          </section>

          {/* 时间盒诚实声明（verbatim 页脚） */}
          <p className="rounded-lg border border-dashed bg-gray-50 p-3 text-xs text-gray-500">
            {EVAL_TIMEBOX_LIMITATION}
          </p>
        </>
      )}
    </div>
  );
}
