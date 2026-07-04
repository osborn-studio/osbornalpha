'use client';

// Research OS — Signals 页面（Phase 2 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Entity, Signal } from '@/lib/research/types';

const TYPE_COLORS: Record<string, string> = {
  DEVELOPER: 'bg-sky-100 text-sky-800',
  MODEL_USAGE: 'bg-violet-100 text-violet-800',
  PRODUCT: 'bg-emerald-100 text-emerald-800',
  COMPANY: 'bg-amber-100 text-amber-800',
  SUPPLY_CHAIN: 'bg-orange-100 text-orange-800',
  POLICY: 'bg-rose-100 text-rose-800',
};

const DIRECTION_COLORS: Record<string, string> = {
  POSITIVE: 'bg-green-100 text-green-800',
  NEGATIVE: 'bg-red-100 text-red-800',
  MIXED: 'bg-yellow-100 text-yellow-800',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

export default function ResearchSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/research/signals');
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    const data = await res.json().catch(() => ({ signals: [] }));
    setSignals(data.signals ?? []);
    setPendingCount(data.pending_source_count ?? 0);
    const eRes = await fetch('/api/research/entities');
    const eData = await eRes.json().catch(() => ({ entities: [] }));
    setEntities(new Map((eData.entities ?? []).map((e: Entity) => [e.id, e])));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function extract() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/research/signals/extract', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(`提取失败：${data?.llm?.message ?? data?.error?.message ?? res.status}`);
      } else {
        const droppedNote = (data.dropped?.length ?? 0) > 0 ? `，剔除 ${data.dropped.length} 条无效信号` : '';
        setNotice(`提取完成：created=${data.created?.length ?? 0}, skippedSources=${data.skippedSources ?? 0}${droppedNote}`);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  const byDay = useMemo(() => {
    const groups = new Map<string, Signal[]>();
    for (const s of signals) {
      const day = s.created_at.slice(0, 10);
      const list = groups.get(day) ?? [];
      list.push(s);
      groups.set(day, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [signals]);

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Signals 信号雷达（{signals.length}）</h1>
        <button
          onClick={extract}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? '提取中…（LLM 调用可能需要 1-2 分钟）' : `🔄 提取新信号（待处理源 ${pendingCount}）`}
        </button>
      </div>
      {notice && (
        <p className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900">{notice}</p>
      )}
      {signals.length === 0 && (
        <p className="text-sm text-gray-500">
          暂无信号。先导入 radar 源（scripts/research-ingest-radar.ts），再点「提取新信号」。
        </p>
      )}
      {byDay.map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-base font-medium">{day}（{list.length}）</h2>
          <ul className="divide-y rounded-lg border">
            {list.map((s) => (
              <li key={s.id} className="space-y-1.5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${TYPE_COLORS[s.signal_type] ?? 'bg-gray-100'}`}>
                    {s.signal_type}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${DIRECTION_COLORS[s.direction] ?? 'bg-gray-100'}`}>
                    {s.direction}
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">conf: {s.confidence}</span>
                </div>
                <p className="text-gray-600">{s.summary}</p>
                {s.entity_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.entity_ids.map((id) => {
                      const e = entities.get(id);
                      if (!e) return null;
                      return e.type === 'COMPANY' ? (
                        <Link
                          key={id}
                          href={`/research/companies/${id}`}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 hover:bg-indigo-100"
                        >
                          {e.name}{e.ticker ? ` (${e.ticker})` : ''}
                        </Link>
                      ) : (
                        <span key={id} className="rounded-full border px-2 py-0.5 text-xs text-gray-600">
                          {e.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                {s.research_questions.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-gray-500">
                    {s.research_questions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                )}
                <div className="text-xs text-gray-400">
                  {s.source_document_ids.length} 个来源 · model: {s.llm_provenance.model ?? 'n/a'}
                  {Array.isArray(s.metadata.unmatched_names) && (s.metadata.unmatched_names as string[]).length > 0 &&
                    ` · 未匹配实体: ${(s.metadata.unmatched_names as string[]).join(', ')}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
