'use client';

// Research OS — Thesis 详情页（Phase 2 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  THESIS_TRANSITIONS,
  type Thesis,
  type ThesisEvent,
  type ThesisStatus,
} from '@/lib/research/types';
import { EMPTY_FORM, OPPORTUNITY_LABELS, ThesisFormFields, formToInput } from '../thesis-form';

interface QuarterReview { count: number; quarter: string; needs_review: boolean }

const STATUS_COLORS: Record<ThesisStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-800',
  WATCH: 'bg-yellow-100 text-yellow-800',
  AT_RISK: 'bg-orange-100 text-orange-800',
  INVALIDATED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-200 text-gray-500',
};

const EVENT_BADGES: Record<string, string> = {
  SUPPORT: 'bg-green-100 text-green-800',
  WEAKEN: 'bg-orange-100 text-orange-800',
  INVALIDATE: 'bg-red-100 text-red-800',
  STATUS_CHANGE: 'bg-blue-100 text-blue-800',
  KILL_CONDITION_REVISED: 'bg-purple-100 text-purple-800',
  NOTE: 'bg-gray-100 text-gray-600',
};

const ADJUDICATE_ACTIONS = [
  { action: 'ACKNOWLEDGE', label: '✅ 知悉（不改状态）' },
  { action: 'IGNORE', label: '🙈 忽略' },
  { action: 'WATCH', label: '👀 转 WATCH' },
  { action: 'CONFIRM_AT_RISK', label: '⚠️ 确认 AT_RISK' },
  { action: 'CLOSE', label: '🚪 关闭 thesis' },
] as const;

export default function ResearchThesisDetailPage() {
  const params = useParams<{ id: string }>();
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [events, setEvents] = useState<ThesisEvent[]>([]);
  const [review, setReview] = useState<QuarterReview | null>(null);
  const [supersedeForm, setSupersedeForm] = useState(EMPTY_FORM);
  const [showSupersede, setShowSupersede] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/theses/${params.id}`);
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    if (res.status === 404) { setNotFound(true); return; }
    const data = await res.json().catch(() => ({}));
    setThesis(data.thesis ?? null);
    setEvents(data.events ?? []);
    setReview(data.review ?? null);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  async function transition(to: ThesisStatus) {
    const reason = window.prompt(`转移到 ${to} 的理由？`) ?? '';
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/research/theses/${params.id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(`转移失败：${data?.error?.message ?? res.status}`);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function reviseKillCondition(index: number, current: string) {
    const newText = window.prompt(`修订失效条件 ${index + 1} 的新写法（原版会保留在修订历史）：`, current);
    if (newText === null) return;
    const reason = window.prompt('修订原因（口径为何写错）？') ?? '';
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/research/theses/${params.id}/kill-condition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index, new_text: newText, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(`修订失败：${data?.error?.message ?? res.status}`);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function supersede(e: React.FormEvent) {
    e.preventDefault();
    const reason = window.prompt('取代原因（哪条支柱错了）？') ?? '';
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/research/theses/${params.id}/supersede`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...formToInput(supersedeForm), reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(`取代失败：${data?.error?.message ?? res.status}`);
      else {
        setNotice(`已创建新 thesis：${data.thesis.title}（DRAFT，窗口从零计）`);
        setSupersedeForm(EMPTY_FORM);
        setShowSupersede(false);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function runMonitor() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/research/theses/${params.id}/monitor`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`监控失败：${data?.llm?.message ?? data?.error?.message ?? res.status}`);
      } else {
        setNotice(`监控完成：verdict=${data.verdict}${data.event ? '，已产生待裁决 alert' : '（无事件）'}`);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function adjudicate(eventId: string, action: string) {
    const reason = window.prompt(`裁决理由（${action}）？`) ?? '';
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/research/theses/${params.id}/alerts/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(`裁决失败：${data?.error?.message ?? res.status}`);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 为本地专用模式，未启用。
      </div>
    );
  }
  if (notFound) return <p className="text-sm text-gray-500">Thesis 不存在。<Link className="underline" href="/research/theses">返回列表</Link></p>;
  if (!thesis) return <p className="text-sm text-gray-500">加载中…</p>;

  const allowed = THESIS_TRANSITIONS[thesis.status] ?? [];
  const isMonitorAlert = (e: ThesisEvent) =>
    ['SUPPORT', 'WEAKEN', 'INVALIDATE'].includes(e.event_type);
  const pendingAlerts = events.filter((e) => isMonitorAlert(e) && e.detail.pending === true);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{thesis.title}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[thesis.status]}`}>{thesis.status}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-gray-700">{thesis.body}</p>
        <p className="text-xs text-gray-500">
          {OPPORTUNITY_LABELS[thesis.opportunity_type ?? 'other']} · 窗口 {(thesis.horizon_weeks ?? [4, 13, 26]).join('/')} 周 · 创建 {thesis.created_at}
          {thesis.next_review_at ? ` · 下次复核 ${thesis.next_review_at}` : ''}
        </p>
        {thesis.supersedes && (
          <p className="text-xs text-gray-600">
            取代旧 thesis：<Link className="underline" href={`/research/theses/${thesis.supersedes}`}>{thesis.supersedes}</Link>（窗口从零计，不继承）
          </p>
        )}
        {review && review.needs_review && (
          <p className="rounded border border-purple-300 bg-purple-50 p-2 text-xs text-purple-900">
            本季（{review.quarter}）失效条件已修订 {review.count} 次，超过 2 次，需要复盘失效条件的写法。
          </p>
        )}
      </div>

      {notice && (
        <p className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900">{notice}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {allowed.map((to) => (
          <button
            key={to}
            onClick={() => transition(to)}
            disabled={busy}
            className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            → {to}
          </button>
        ))}
        {(thesis.status === 'INVALIDATED' || thesis.status === 'CLOSED') && (
          <button
            onClick={() => setShowSupersede((v) => !v)}
            disabled={busy}
            className="rounded border border-purple-400 px-3 py-1.5 text-sm text-purple-900 hover:bg-purple-50 disabled:opacity-50"
          >
            {showSupersede ? '收起取代表单' : '以新 thesis 取代（§7.4.3）'}
          </button>
        )}
        <button
          onClick={runMonitor}
          disabled={busy}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? '运行中…' : '🛰 立即运行 monitor'}
        </button>
      </div>

      {showSupersede && (
        <form onSubmit={supersede} className="space-y-3 rounded-lg border border-purple-300 p-4">
          <h2 className="text-base font-medium">新 thesis（取代 {thesis.title}）</h2>
          <p className="text-xs text-gray-600">方向仍对但支柱错：全部字段重新填写，不继承旧 thesis；窗口从创建时刻起算。</p>
          <ThesisFormFields form={supersedeForm} setForm={setSupersedeForm} />
          <button type="submit" disabled={busy} className="rounded bg-purple-700 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '创建中…' : '创建取代 thesis（初始 DRAFT）'}
          </button>
        </form>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">支柱（{(thesis.pillars ?? []).length}）</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(thesis.pillars ?? []).map((p) => (
              <li key={p.id}>
                {p.text}
                <span className="text-xs text-gray-500">{p.resolvable_by ? ` · 判定：${p.resolvable_by}` : ''}{p.deadline ? ` · 截止 ${p.deadline}` : ''}</span>
              </li>
            ))}
            {(thesis.pillars ?? []).length === 0 && <li className="list-none text-gray-500">未填写支柱。支柱错误走「取代」，不可原地修改。</li>}
          </ul>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">催化剂（{(thesis.catalysts ?? []).length}）</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(thesis.catalysts ?? []).map((c, i) => <li key={i}>{c.text}{c.expected_date ? <span className="text-xs text-gray-500"> · 预期 {c.expected_date}</span> : null}</li>)}
            {(thesis.catalysts ?? []).length === 0 && <li className="list-none text-gray-500">未填写催化剂。</li>}
          </ul>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">失效条件</h2>
          <ul className="space-y-1 text-sm">
            {thesis.invalidation_conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-1">{i + 1}. {c}</span>
                {thesis.status !== 'CLOSED' && (
                  <button onClick={() => reviseKillCondition(i, c)} disabled={busy} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50" title="只允许修正口径写错，原版保留">
                    修订写法
                  </button>
                )}
              </li>
            ))}
          </ul>
          {(thesis.kill_condition_revisions ?? []).length > 0 && (
            <details className="mt-3 text-xs text-gray-600">
              <summary>修订历史（{(thesis.kill_condition_revisions ?? []).length}）{review ? ` · 本季 ${review.count} 次` : ''}</summary>
              <ul className="mt-1 space-y-1">
                {(thesis.kill_condition_revisions ?? []).map((r, i) => (
                  <li key={i}>{r.at} · 条件 {r.index + 1}：「{r.old_text}」→「{r.new_text}」（{r.reason}）</li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">观察指标</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {thesis.watch_metrics.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </section>
      </div>

      {pendingAlerts.length > 0 && (
        <section className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <h2 className="mb-2 text-base font-medium">⚠️ 待裁决 alerts（{pendingAlerts.length}）</h2>
          <ul className="space-y-3">
            {pendingAlerts.map((e) => (
              <li key={e.id} className="rounded border border-orange-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${EVENT_BADGES[e.event_type]}`}>{e.event_type}</span>
                  <span className="text-xs text-gray-500">{e.created_at}</span>
                  {typeof e.detail.suggested_status === 'string' && (
                    <span className="text-xs text-gray-500">建议状态: {e.detail.suggested_status}</span>
                  )}
                </div>
                <p className="mt-1 text-gray-700">{String(e.detail.rationale ?? '')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ADJUDICATE_ACTIONS.map(({ action, label }) => (
                    <button
                      key={action}
                      onClick={() => adjudicate(e.id, action)}
                      disabled={busy}
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-medium">事件时间线（{events.length}）</h2>
        <ul className="divide-y rounded-lg border">
          {events.map((e) => (
            <li key={e.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs ${EVENT_BADGES[e.event_type] ?? 'bg-gray-100'}`}>
                  {e.event_type}
                </span>
                <span className="text-xs text-gray-500">{e.created_at}</span>
                {isMonitorAlert(e) && (
                  <span className="text-xs text-gray-500">
                    {e.detail.pending === true ? '· 待裁决' : `· 已裁决: ${String((e.detail.resolution as any)?.action ?? '')}`}
                  </span>
                )}
              </div>
              <div className="mt-1 text-gray-600">
                {e.event_type === 'STATUS_CHANGE'
                  ? `${String(e.detail.from)} → ${String(e.detail.to)}${e.detail.reason ? `（${String(e.detail.reason)}）` : ''}`
                  : e.event_type === 'KILL_CONDITION_REVISED'
                    ? `失效条件 ${Number(e.detail.index) + 1}：「${String(e.detail.old_text)}」→「${String(e.detail.new_text)}」${e.detail.reason ? `（${String(e.detail.reason)}）` : ''}`
                    : e.event_type === 'NOTE' && typeof e.detail.superseded_by === 'string'
                      ? <>已被新 thesis 取代：<Link className="underline" href={`/research/theses/${e.detail.superseded_by}`}>{e.detail.superseded_by}</Link>{e.detail.reason ? `（${String(e.detail.reason)}）` : ''}</>
                      : String(e.detail.rationale ?? '')}
              </div>
            </li>
          ))}
          {events.length === 0 && <li className="p-3 text-sm text-gray-500">暂无事件</li>}
        </ul>
      </section>
    </div>
  );
}
