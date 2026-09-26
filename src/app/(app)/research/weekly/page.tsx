'use client';

// Research OS — 周末决定流程（WP-A9）：先冻结人工基线 → 显示本周卡片 → 逐卡决定。
// i18n 豁免：单用户本地研究工具，文案 zh 硬编码。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CARD_FIELDS, CARD_FIELD_LABELS, CARD_PENDING, type CardAssertion, type ResearchCard, type Thesis } from '@/lib/research/types';

type Decision = { id: string; arm: string; action: string; reason: string; card_id: string | null; time_spent_minutes: number | null; frozen_at: string | null; observation_id: string | null; created_at: string };
type WeeklyThesis = { thesis_id: string; card_count: number; cards: ResearchCard[] | null; revealed: boolean; exposed_before_baseline: boolean; baseline: Decision | null; collab_by_card: Record<string, Decision>; ai_candidate_by_card: Record<string, Decision> };
type Status = { week_of: string; theses: WeeklyThesis[]; locked_theses: string[]; all_unlocked: boolean };
type Observation = { observation_id: string; status: string; anchor_status: string; recorded_at: string };

const ACTIONS: Array<[string, string]> = [['adopt', '采纳'], ['shadow', '影子'], ['reject', '否决'], ['extend', '延期']];
const EXPLAIN: Record<string, string> = { policy_blocked: '该 thesis 尚未冻结基线，先完成第一步。', idempotency_conflict: '这条决定已经记录过了，台账只追加不改写。', scope_denied: '卡片或观察不属于当前账户。', invalid_schema: '输入不完整或格式不对。' };

function mondayOf(d: Date) { const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7)); return u.toISOString().slice(0, 10); }

export default function WeeklyPage() {
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [status, setStatus] = useState<Status | null>(null);
  const [theses, setTheses] = useState<Record<string, Thesis>>({});
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [baselineForm, setBaselineForm] = useState<Record<string, { decision: string; reason: string }>>({});
  const [cardForm, setCardForm] = useState<Record<string, { decision: string; reason: string; observation_id: string }>>({});
  const [observations, setObservations] = useState<Record<string, Observation[]>>({});
  const revealedAt = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSeq = useRef(0);

  const api = useCallback(async (body?: Record<string, unknown>) => {
    const res = await fetch(`/api/research/weekly?week=${encodeURIComponent(week)}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, week_of: week }) } : undefined);
    const data = await res.json().catch(() => ({}));
    const code = data?.error?.code as string | undefined;
    // Only authentication/authorization failures disable the page; ledger policy codes are shown as notices.
    if (res.status === 401 || (res.status === 403 && (code === 'FORBIDDEN' || code === 'UNAUTHORIZED' || code === 'not_authenticated'))) { setDisabled(true); throw new Error('forbidden'); }
    if (!res.ok) throw new Error(code ?? data?.error?.message ?? String(res.status));
    return data;
  }, [week]);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api(), fetch('/api/research/theses').then(r => r.ok ? r.json() : { theses: [] })]);
      if (seq !== requestSeq.current || s.week_of !== week) return; // a newer week was selected meanwhile
      setStatus(s); setTheses(Object.fromEntries(((t.theses ?? []) as Thesis[]).map(x => [x.id, x])));
      // Timing starts when cards are actually visible, including resumed sessions that were revealed earlier.
      if ((s as Status).theses.some(th => th.cards && th.cards.length) && revealedAt.current === null) revealedAt.current = Date.now();
    } finally { if (seq === requestSeq.current) setLoading(false); }
  }, [api, week]);
  // Week change: drop the previous week's status and forms before anything can be submitted against the new week.
  useEffect(() => { setStatus(null); setBaselineForm({}); setCardForm({}); setObservations({}); revealedAt.current = null; setNotice(null); }, [week]);
  useEffect(() => { load().catch((e) => setNotice(EXPLAIN[(e as Error).message] ?? (e as Error).message)); }, [load]);

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true); setNotice(null);
    try { await api(body); setNotice(ok); await load(); } catch (e) { const m = (e as Error).message; if (m !== 'forbidden') setNotice(EXPLAIN[m] ?? `操作失败：${m}`); } finally { setBusy(false); }
  }
  async function loadObservations(thesisId: string) {
    const res = await fetch(`/api/research/weekly/observations?thesis=${thesisId}`); const data = await res.json().catch(() => ({ observations: [] }));
    setObservations((o) => ({ ...o, [thesisId]: data.observations ?? [] }));
  }
  const minutesSpent = () => (revealedAt.current ? Math.max(0, Math.round((Date.now() - revealedAt.current) / 60000)) : null);
  const title = (id: string) => theses[id]?.title ?? id;
  const locked = useMemo(() => status?.theses.filter(t => t.card_count > 0 && !t.baseline) ?? [], [status]);
  const unlocked = useMemo(() => status?.theses.filter(t => t.cards) ?? [], [status]);

  if (disabled) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。</div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">周末决定流程</h1>
        <label className="text-sm">周（周一）<input type="date" className="ml-2 rounded border px-2 py-1" value={week} onChange={(e) => setWeek(mondayOf(new Date(e.target.value + 'T00:00:00Z')))} /></label>
        <span className="text-xs text-gray-500">四臂：先冻结你的看法（human_baseline）→ 系统记录卡片立场（ai_candidate）→ 你逐卡决定（collab）→ averaged 由报表推导。任何决定都不触发交易。</span>
      </div>
      {notice && <p className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-900">{notice}</p>}

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-medium">第一步 · 冻结本周看法（看卡之前）</h2>
        <p className="mt-1 text-xs text-gray-500">每个有卡片的 thesis 先写下你此刻的判断。冻结后才会显示该 thesis 的卡片；时间戳由服务器记录，不可改写。</p>
        {locked.length === 0 && <p className="mt-2 text-sm text-gray-500">{status?.theses.length ? '本周所有有卡片的 thesis 都已冻结基线。' : '本周没有卡片。先在本地运行 scripts/research-cards.ts 生成。'}</p>}
        <ul className="mt-3 space-y-3">
          {locked.map((t) => {
            const f = baselineForm[t.thesis_id] ?? { decision: 'shadow', reason: '' };
            return (
              <li key={t.thesis_id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Link className="font-medium underline" href={`/research/theses/${t.thesis_id}`}>{title(t.thesis_id)}</Link><span className="text-xs text-gray-500">{t.card_count} 张卡片待看</span>{t.exposed_before_baseline && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">卡片已在别处看过，本周不能再冻结独立基线</span>}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <select className="rounded border px-2 py-1" value={f.decision} onChange={(e) => setBaselineForm({ ...baselineForm, [t.thesis_id]: { ...f, decision: e.target.value } })}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <input className="flex-1 rounded border px-2 py-1" placeholder="一句理由（必填）" value={f.reason} onChange={(e) => setBaselineForm({ ...baselineForm, [t.thesis_id]: { ...f, reason: e.target.value } })} />
                  <button disabled={busy || loading || !f.reason.trim()} onClick={() => run({ action: 'freeze', thesis_id: t.thesis_id, decision: f.decision, reason: f.reason }, '基线已冻结。')} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">冻结</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">第二步 · 看卡并逐卡决定</h2>
          <button disabled={busy || loading || (status?.theses.filter(t => t.baseline).length ?? 0) === 0} onClick={() => { if (revealedAt.current === null) revealedAt.current = Date.now(); void run({ action: 'reveal' }, '卡片已显示，系统立场已记录。'); }} className="rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50">显示已解锁 thesis 的卡片</button>
        </div>
        {unlocked.length === 0 && <p className="mt-2 text-sm text-gray-500">{loading ? '加载中…' : '冻结基线后点击「显示卡片」。'}</p>}
        <ul className="mt-3 space-y-4">
          {unlocked.flatMap((t) => (t.cards ?? []).map((card) => {
            const done = t.collab_by_card[card.id]; const ai = t.ai_candidate_by_card[card.id];
            const f = cardForm[card.id] ?? { decision: 'shadow', reason: '', observation_id: '' };
            const byId = new Map(card.assertions.map((a) => [a.id, a]));
            return (
              <li key={card.id} className={`rounded-lg border p-4 ${card.status === 'blocked' ? 'border-red-300 bg-red-50' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs ${card.kind === 'counter' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>{card.kind === 'counter' ? '反证 / 陌生来源' : '证据'}</span>
                  <span className="font-medium">{card.title}</span>
                  <Link className="text-xs underline" href={`/research/theses/${card.thesis_id}`}>{title(card.thesis_id)}</Link>
                  <span className="text-xs text-gray-500">基线：{t.baseline?.action}{ai ? ` · 系统立场：${ai.action}` : ''}</span>
                </div>
                {card.status === 'blocked' ? <p className="mt-2 text-sm text-red-900">该卡被合规规则拦截，正文不展示。</p> : (
                  <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    {CARD_FIELDS.map((fld) => { const v = card.fields[fld]; return (
                      <div key={fld}><dt className="text-xs font-medium text-gray-600">{CARD_FIELD_LABELS[fld]}</dt>
                        <dd>{!v || v === CARD_PENDING ? <span className="text-gray-400">{CARD_PENDING}</span> : <ul className="list-disc pl-5">{(v as string[]).map(id => byId.get(id)).filter((a): a is CardAssertion => !!a).map(a => <li key={a.id}>{a.text} <Link className="text-xs text-gray-500 underline" href={`/research/sources/${a.source_id}?v=${encodeURIComponent(a.source_version)}`}>[{a.source_id.slice(0, 8)}@{a.source_version}]</Link></li>)}</ul>}</dd></div>); })}
                  </dl>
                )}
                {card.status === 'blocked' ? <p className="mt-3 text-xs text-red-800">被拦截的卡片不记录系统立场，也不接受决定。</p> : done ? <p className="mt-3 text-sm text-green-800">已决定：{done.action}（{done.reason}）{done.time_spent_minutes != null ? ` · 用时 ${done.time_spent_minutes} 分` : ''}{done.observation_id ? ` · 观察 ${done.observation_id.slice(0, 8)}` : ''}</p> : (
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <select className="rounded border px-2 py-1" value={f.decision} onChange={(e) => setCardForm({ ...cardForm, [card.id]: { ...f, decision: e.target.value } })}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <input className="flex-1 rounded border px-2 py-1" placeholder="一句理由（必填）" value={f.reason} onChange={(e) => setCardForm({ ...cardForm, [card.id]: { ...f, reason: e.target.value } })} />
                    <select className="rounded border px-2 py-1" value={f.observation_id} onFocus={() => { if (!observations[card.thesis_id]) void loadObservations(card.thesis_id); }} onChange={(e) => setCardForm({ ...cardForm, [card.id]: { ...f, observation_id: e.target.value } })}>
                      <option value="">不关联观察</option>{(observations[card.thesis_id] ?? []).map(o => <option key={o.observation_id} value={o.observation_id}>{o.observation_id.slice(0, 8)} · {o.status}</option>)}
                    </select>
                    <button disabled={busy || loading || !f.reason.trim()} onClick={() => run({ action: 'decide', card_id: card.id, decision: f.decision, reason: f.reason, time_spent_minutes: minutesSpent(), observation_id: f.observation_id || null }, '决定已记录。')} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">记录决定</button>
                  </div>
                )}
              </li>
            );
          }))}
        </ul>
      </section>
      <p className="text-xs text-gray-500">观察的自动创建仍走 <Link className="underline" href="/research/observations">变化与观察</Link>（S4 候选）；这里只能关联已存在的观察。四臂报表：本地运行 scripts/arm-report.ts。</p>
    </div>
  );
}
