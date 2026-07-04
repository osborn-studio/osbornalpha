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
  const [disabled, setDisabled] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/theses/${params.id}`);
    if (res.status === 501) { setDisabled(true); return; }
    if (res.status === 404) { setNotFound(true); return; }
    const data = await res.json().catch(() => ({}));
    setThesis(data.thesis ?? null);
    setEvents(data.events ?? []);
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
          创建 {thesis.created_at}{thesis.next_review_at ? ` · 下次复核 ${thesis.next_review_at}` : ''}
        </p>
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
        <button
          onClick={runMonitor}
          disabled={busy}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? '运行中…' : '🛰 立即运行 monitor'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-base font-medium">失效条件</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {thesis.invalidation_conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
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
