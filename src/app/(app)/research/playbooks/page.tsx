'use client';

// Research OS — Playbooks 发起 / 人工审批 / 历史（Phase 3 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。
// ⚠️ PAPER_TRADE 仅为纸面记录：本系统没有、也永远不会有任何真实交易通道。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  ApprovalStatus,
  AxiomCheckResult,
  InvestmentMemo,
  PlaybookRun,
  ProposedAction,
  Thesis,
} from '@/lib/research/types';
import { PROPOSED_ACTIONS } from '@/lib/research/types';

const STATUS_BADGES: Record<ApprovalStatus, string> = {
  NOT_REQUIRED: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const ACTION_LABELS: Record<ProposedAction, string> = {
  WATCHLIST: 'WATCHLIST（加观察清单）',
  PAPER_TRADE: 'PAPER_TRADE（纸面记录，需审批）',
  RESEARCH_MORE: 'RESEARCH_MORE（继续研究）',
  UPDATE_THESIS: 'UPDATE_THESIS（人工修订 thesis）',
  CLOSE_THESIS: 'CLOSE_THESIS（关闭 thesis，需审批）',
};

interface Suggestion {
  proposed_action: ProposedAction;
  rationale: string;
  risks: string[];
  confidence_note: string;
  metadata: Record<string, unknown>;
}

export default function ResearchPlaybooksPage() {
  const [runs, setRuns] = useState<PlaybookRun[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [memos, setMemos] = useState<InvestmentMemo[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [axiomFailures, setAxiomFailures] = useState<AxiomCheckResult[]>([]);
  const [sourceKey, setSourceKey] = useState('');
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [form, setForm] = useState({
    proposed_action: 'RESEARCH_MORE' as ProposedAction,
    rationale: '',
    risks: '',
  });
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/research/playbooks');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ runs: [] }));
    setRuns(data.runs ?? []);
    const tRes = await fetch('/api/research/theses');
    const tData = await tRes.json().catch(() => ({ theses: [] }));
    setTheses((tData.theses ?? []).filter((t: Thesis) =>
      ['ACTIVE', 'WATCH', 'AT_RISK'].includes(t.status)));
    const mRes = await fetch('/api/research/memos');
    const mData = await mRes.json().catch(() => ({ memos: [] }));
    setMemos((mData.memos ?? []).filter((m: InvestmentMemo) => m.status === 'REVIEWED'));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sourceTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of theses) map.set(`thesis:${t.id}`, t.title);
    for (const m of memos) map.set(`memo:${m.id}`, m.title);
    return map;
  }, [theses, memos]);

  function sourceRef(key: string): { thesis_id?: string; memo_id?: string } | null {
    const [kind, id] = key.split(':');
    if (!id) return null;
    return kind === 'thesis' ? { thesis_id: id } : { memo_id: id };
  }

  function runSourceLabel(run: PlaybookRun): string {
    const key = run.thesis_id ? `thesis:${run.thesis_id}` : `memo:${run.memo_id}`;
    const kind = run.thesis_id ? 'thesis' : 'memo';
    return `${kind}「${sourceTitles.get(key) ?? key}」`;
  }

  async function suggest() {
    const ref = sourceRef(sourceKey);
    if (!ref) { setNotice('先选择一个来源（thesis 或 memo）'); return; }
    setBusy(true); setNotice(null); setSuggestNote(null); setAxiomFailures([]);
    try {
      const res = await fetch('/api/research/playbooks/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ref),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`生成建议失败：${data?.error?.message ?? res.status}`);
      } else if (!data.suggestion) {
        setNotice(`LLM 不可用：${data?.llm?.message ?? '未知错误'}`);
      } else {
        const s: Suggestion = data.suggestion;
        setForm({
          proposed_action: s.proposed_action,
          rationale: s.rationale,
          risks: s.risks.join('\n'),
        });
        setSuggestNote(
          `🤖 ${data.llm.model} 建议 ${s.proposed_action} · ${s.confidence_note}` +
          (s.metadata?.downgraded_from ? `（原输出 ${String(s.metadata.downgraded_from)} 非法，已降级）` : ''),
        );
      }
    } finally { setBusy(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ref = sourceRef(sourceKey);
    if (!ref) { setNotice('先选择一个来源（thesis 或 memo）'); return; }
    setBusy(true); setNotice(null); setAxiomFailures([]);
    try {
      const res = await fetch('/api/research/playbooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...ref,
          proposed_action: form.proposed_action,
          rationale: form.rationale,
          risks: form.risks.split('\n').map((x) => x.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data?.error?.code === 'AXIOM_BLOCKED') {
        setAxiomFailures((data.error.results ?? []).filter((r: AxiomCheckResult) => !r.passed));
        setNotice('被 axiom 门拦截，run 未创建：');
      } else if (!res.ok) {
        setNotice(`创建失败：${data?.error?.message ?? res.status}`);
      } else {
        setNotice(`创建成功（${data.run.approval_status === 'PENDING' ? '已进入待审批' : '无需审批'}）`);
        setForm({ proposed_action: 'RESEARCH_MORE', rationale: '', risks: '' });
        setSuggestNote(null);
        await load();
      }
    } finally { setBusy(false); }
  }

  async function decide(run: PlaybookRun, verb: 'approve' | 'reject') {
    const decision = (decisions[run.id] ?? '').trim();
    if (!decision) { setNotice('审批意见（decision）必填'); return; }
    setBusy(true); setNotice(null);
    try {
      const res = await fetch(`/api/research/playbooks/${run.id}/${verb}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`${verb === 'approve' ? '批准' : '驳回'}失败：${data?.error?.message ?? res.status}`);
      } else {
        const exec = data.execution;
        setNotice(
          verb === 'approve'
            ? `已批准。${exec?.executed ? `已执行：${exec.note}` : exec?.execution_error ? `执行失败（run 保持 APPROVED）：${exec.execution_error}` : exec?.note ?? ''}`
            : '已驳回。',
        );
        setDecisions((d) => ({ ...d, [run.id]: '' }));
        await load();
      }
    } finally { setBusy(false); }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。
      </div>
    );
  }

  const pending = runs.filter((r) => r.approval_status === 'PENDING');
  const history = runs.filter((r) => r.approval_status !== 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Playbooks 行动审批（{runs.length}）</h1>
        <p className="mt-1 text-xs text-gray-500">
          ⚠️ PAPER_TRADE 仅为纸面记录，本系统没有任何真实交易通道；所有内容为研究辅助，不构成投资建议。
        </p>
      </div>

      {/* ① 发起 */}
      <form onSubmit={create} className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-medium">① 发起 playbook</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            来源（ACTIVE/WATCH/AT_RISK thesis 或 REVIEWED memo）
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              required
            >
              <option value="">— 选择来源 —</option>
              {theses.map((t) => (
                <option key={t.id} value={`thesis:${t.id}`}>[thesis · {t.status}] {t.title}</option>
              ))}
              {memos.map((m) => (
                <option key={m.id} value={`memo:${m.id}`}>[memo · REVIEWED] {m.title}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            动作
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={form.proposed_action}
              onChange={(e) => setForm({ ...form, proposed_action: e.target.value as ProposedAction })}
            >
              {PROPOSED_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Rationale（为什么）
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={3}
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              required
            />
          </label>
          <label className="text-sm md:col-span-2">
            Risks（每行一条，≥1）
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5"
              rows={3}
              value={form.risks}
              onChange={(e) => setForm({ ...form, risks: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={suggest}
            disabled={busy || !sourceKey}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            🤖 生成建议（可编辑后再创建）
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? '处理中…' : '创建 playbook run'}
          </button>
        </div>
        {suggestNote && <p className="text-sm text-blue-800">{suggestNote}</p>}
        {notice && <p className="text-sm text-blue-800">{notice}</p>}
        {axiomFailures.length > 0 && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {axiomFailures.map((r) => (
              <div key={r.axiom_code}>⛔ {r.axiom_code}（{r.severity}）：{r.message}</div>
            ))}
          </div>
        )}
      </form>

      {/* ② 待审批 */}
      <section className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <h2 className="mb-2 text-base font-medium">② 待审批（{pending.length}）— 高风险动作必须人工裁决</h2>
        {pending.length === 0 && <p className="text-sm text-gray-500">暂无待审批 run。</p>}
        <ul className="space-y-3">
          {pending.map((run) => (
            <li key={run.id} className="rounded border border-yellow-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGES[run.approval_status]}`}>
                  {run.approval_status}
                </span>
                <span className="font-medium">{run.proposed_action}</span>
                <span className="text-xs text-gray-500">来源 {runSourceLabel(run)} · {run.created_at}</span>
              </div>
              <p className="mt-1 text-xs text-gray-700">Rationale：{run.rationale}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                {run.risks.map((r, i) => <li key={i}>风险：{r}</li>)}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="w-64 rounded border px-2 py-1 text-xs"
                  placeholder="审批意见（必填）"
                  value={decisions[run.id] ?? ''}
                  onChange={(e) => setDecisions((d) => ({ ...d, [run.id]: e.target.value }))}
                />
                <button
                  onClick={() => decide(run, 'approve')}
                  disabled={busy}
                  className="rounded bg-green-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                >
                  ✅ 批准
                </button>
                <button
                  onClick={() => decide(run, 'reject')}
                  disabled={busy}
                  className="rounded bg-red-700 px-3 py-1 text-xs text-white disabled:opacity-50"
                >
                  ❌ 驳回
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ③ 历史 */}
      <section>
        <h2 className="mb-2 text-base font-medium">③ 历史（{history.length}）</h2>
        {history.length === 0 && <p className="text-sm text-gray-500">暂无历史 run。</p>}
        <ul className="divide-y rounded-lg border">
          {history.map((run) => (
            <li key={run.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGES[run.approval_status]}`}>
                  {run.approval_status}
                </span>
                <span className="font-medium">{run.proposed_action}</span>
                {run.thesis_id && (
                  <Link href={`/research/theses/${run.thesis_id}`} className="text-xs underline">
                    {runSourceLabel(run)}
                  </Link>
                )}
                {run.memo_id && (
                  <Link href={`/research/memos/${run.memo_id}`} className="text-xs underline">
                    {runSourceLabel(run)}
                  </Link>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                创建 {run.created_at}
                {run.review_at ? ` · 裁决 ${run.review_at}` : ''}
                {run.human_decision ? ` · 意见「${run.human_decision}」` : ''}
              </div>
              <p className="mt-0.5 text-xs text-gray-600">{run.rationale}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
