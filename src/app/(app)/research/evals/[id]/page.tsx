'use client';

// Research OS — Eval 案例详情（Phase 4 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  EVAL_TIMEBOX_LIMITATION,
  type EvalCase,
  type EvalRun,
  type EvidenceItem,
  type SourceDocument,
} from '@/lib/research/types';

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">（无）</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs">
      {items.map((ev, i) => (
        <li key={i}>
          {ev.claim}
          {ev.source_document_ids.length > 0 && (
            <span className="ml-1 text-gray-400">[{ev.source_document_ids.length} 引用]</span>
          )}
          {ev.low_confidence && (
            <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">LOW_CONFIDENCE</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StringList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">（无）</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs">
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  );
}

function RunCard({ run }: { run: EvalRun }) {
  const memo = run.output.memo;
  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-blue-600 px-2 py-0.5 text-sm font-semibold text-white">
          total {run.total}/10
        </span>
        <span className="text-xs text-gray-500">{run.created_at}</span>
        {run.failure_modes.map((m) => (
          <span key={m} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">{m}</span>
        ))}
      </div>

      {/* 六维分格 */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-6">
        {Object.entries(run.scores).map(([dim, score]) => (
          <div key={dim} className="rounded border p-2 text-center">
            <div className="text-lg font-semibold tabular-nums">{score}</div>
            <div className="truncate text-[10px] text-gray-500" title={dim}>{dim}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        gen: {run.output.provenance.gen.model ?? 'n/a'} · judge: {run.output.provenance.judge.model ?? 'n/a'}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-blue-700">
          展开 agent memo 输出与评审 rationale
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded border bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">{memo.title}（confidence: {memo.confidence}）</h4>
            <p className="text-xs"><span className="font-medium">一句话结论：</span>{memo.one_line_conclusion || '（无）'}</p>
            <p className="text-xs"><span className="font-medium">Thesis：</span>{memo.thesis || '（无）'}</p>
            <div><h5 className="text-xs font-medium">支持证据</h5><EvidenceList items={memo.supporting_evidence} /></div>
            <div><h5 className="text-xs font-medium">反方观点</h5><EvidenceList items={memo.counter_arguments} /></div>
            <div><h5 className="text-xs font-medium">关键变量</h5><StringList items={memo.key_variables} /></div>
            <div><h5 className="text-xs font-medium">失效条件</h5><StringList items={memo.invalidation_conditions} /></div>
            <div><h5 className="text-xs font-medium">待验证问题</h5><StringList items={memo.open_questions} /></div>
            <div><h5 className="text-xs font-medium">相关公司/产业链影响</h5><StringList items={memo.related_impacts} /></div>
          </div>
          <div className="space-y-2 rounded border bg-gray-50 p-3">
            <h4 className="text-sm font-semibold">评审 rationale（按维度）</h4>
            {Object.entries(run.output.rationale_per_dimension).length === 0 ? (
              <p className="text-xs text-gray-400">（评审未给出 rationale）</p>
            ) : (
              Object.entries(run.output.rationale_per_dimension).map(([dim, text]) => (
                <p key={dim} className="text-xs">
                  <span className="font-mono font-medium">{dim}</span>
                  <span className="ml-1 tabular-nums text-gray-500">{run.scores[dim] ?? '—'}/10</span>
                  ：{text}
                </p>
              ))
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

export default function EvalCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [evalCase, setEvalCase] = useState<EvalCase | null>(null);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'disabled' | 'not-found'>('loading');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/evals/cases/${params.id}`);
    if (res.status === 401 || res.status === 403) { setStatus("disabled"); return; }
    if (res.status === 404) { setStatus('not-found'); return; }
    const data = await res.json().catch(() => ({}));
    setEvalCase(data.case ?? null);
    setRuns(data.runs ?? []);
    setSources(data.sources ?? []);
    setStatus('ready');
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/research/evals/cases/${params.id}/run`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRunError(
          data?.llm?.message
            ? `${data.llm.stage === 'judge' ? '评审' : '生成'}阶段失败：${data.llm.message}`
            : data?.error?.message ?? `运行失败（${res.status}）`,
        );
        return;
      }
      await load();
    } finally {
      setRunning(false);
    }
  };

  if (status === 'disabled') {
    return <p className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">Research OS 未启用（本地专用）。</p>;
  }
  if (status === 'not-found') {
    return <p className="text-sm text-gray-500">案例不存在。<Link href="/research/evals" className="underline">返回 Eval Lab</Link></p>;
  }
  if (status === 'loading' || !evalCase) {
    return <p className="text-sm text-gray-500">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/research/evals" className="text-xs text-blue-700 underline">← Eval Lab</Link>
        <h1 className="mt-1 text-xl font-semibold">{evalCase.title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          时间盒 as_of <span className="font-medium text-gray-700">{evalCase.as_of}</span>
          {' '}· {evalCase.visible_material.length} 份材料 · {runs.length} 次 run
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">当时可见材料</h2>
          <ul className="space-y-1.5 text-sm">
            {sources.map((s) => (
              <li key={s.id}>
                <Link href="/research/sources" className="underline">{s.title}</Link>
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs">{s.source_type}</span>
                <span className="ml-1 text-xs text-gray-400">trust {s.trust_level}</span>
              </li>
            ))}
            {sources.length === 0 && <li className="text-xs text-gray-400">（材料已从库中删除）</li>}
          </ul>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">Expected（真实后续 · 评审 ground truth）</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {evalCase.expected.notes || '（未填写——建议补齐真实后续事件，事实类维度才有对照）'}
          </p>
          <h3 className="mb-1 mt-3 text-xs font-medium text-gray-500">Rubric（维度 × 权重）</h3>
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(evalCase.rubric).map(([dim, w]) => (
              <li key={dim} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{dim} ×{w}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-base font-medium">Run 历史（{runs.length}）</h2>
          <button
            onClick={runNow}
            disabled={running}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? '运行中：生成 + 评审两阶段，约 30-60s…' : '▶️ 运行评测'}
          </button>
        </div>
        {runError && <p className="mb-2 text-xs text-red-600">{runError}</p>}
        <ul className="space-y-3">
          {runs.map((run) => <RunCard key={run.id} run={run} />)}
          {runs.length === 0 && <li className="text-sm text-gray-500">还没有 run。</li>}
        </ul>
      </section>

      <p className="rounded-lg border border-dashed bg-gray-50 p-3 text-xs text-gray-500">
        {EVAL_TIMEBOX_LIMITATION}
      </p>
    </div>
  );
}
