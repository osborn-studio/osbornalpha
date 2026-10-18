'use client';

// Inline form under an approved PAPER_TRADE run: loads the prefill view from
// /api/research/playbooks/[id]/registration, lets the user pick companies and
// adjust ticker / market / action / confidence / horizon, then POSTs to
// /api/research/playbooks/[id]/register. zh copy is hard-coded (research i18n exemption).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clampRationale, type RegistrationCandidate, RegistrationDefaults } from '@/lib/research/playbook-registration';
import type { CoreMarket } from '@/lib/securities/model';
import type { DecisionAction, DecisionHorizon } from '@/lib/supabase/database.types';

interface RegistrationView {
  run: { id: string; rationale: string; review_at: string | null };
  source_title: string;
  defaults: RegistrationDefaults;
  candidates: RegistrationCandidate[];
  analyst: { id: string; display_name: string } | null;
  registered_count: number;
  registrable: boolean;
}

interface Row {
  key: string;
  entity_id: string | null;
  name: string;
  ticker: string;
  market: CoreMarket | '';
  action: DecisionAction;
  confidence: string;
  horizon: DecisionHorizon | '';
  selected: boolean;
  registered: boolean;
  note: string | null;
}

const ACTIONS: DecisionAction[] = ['buy', 'add', 'trim', 'sell', 'hold', 'pass'];
const ACTION_ZH: Record<DecisionAction, string> = { buy: '买入', add: '加仓', trim: '减仓', sell: '卖出', hold: '持有', pass: '观望' };
const MARKETS: CoreMarket[] = ['A', 'HK', 'US'];
const HORIZON_ZH: Record<DecisionHorizon, string> = { short: '短期', mid: '中期', long: '长期' };
const input = 'rounded border px-2 py-1 text-xs';
const MAX_BATCH = 20;
const CODE_ZH: Record<string, string> = {
  duplicate_item: '同一标的或公司重复',
  entity_not_in_run: '该公司不属于此 run 的论点/备忘',
  run_not_registrable: '该 run 不是已批准的 PAPER_TRADE',
  'ticker not valid for market': '标的与市场不匹配',
};

// datetime-local wants local wall-clock minutes; the API wants ISO with zone.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PlaybookRegisterForm({ runId, onRegistered }: { runId: string; onRegistered: () => void }) {
  const [view, setView] = useState<RegistrationView | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [rationale, setRationale] = useState('');
  const [recommendedAt, setRecommendedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const manualSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/playbooks/${runId}/registration`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) { setNotice(`读取失败：${data?.error?.message ?? res.status}`); return; }
      const v = data as RegistrationView;
      setView(v);
      setRationale(clampRationale(v.defaults.rationale));
      setRecommendedAt(toLocalInput(v.defaults.recommended_at));
      setRows(v.candidates.map((c) => ({
        key: c.entity_id, entity_id: c.entity_id, name: c.name, ticker: c.ticker ?? '', market: c.market ?? '',
        action: v.defaults.action, confidence: String(v.defaults.confidence), horizon: v.defaults.horizon ?? '',
        selected: c.selected, registered: c.registered_recommendation_id !== null,
        note: c.registered_recommendation_id ? '已登记' : !c.supported ? (c.ticker_source === 'none' ? '无标的，请手填' : '市场不支持') : null,
      })));
    } catch {
      setNotice('读取失败：网络错误');
    }
  }, [runId]);

  useEffect(() => { void load(); }, [load]);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addManualRow() {
    const key = `manual-${++manualSeq.current}`;
    setRows((rs) => [...rs, { key, entity_id: null, name: '手填', ticker: '', market: '', action: view?.defaults.action ?? 'buy',
      confidence: String(view?.defaults.confidence ?? 50), horizon: view?.defaults.horizon ?? '', selected: true, registered: false, note: null }]);
  }

  const chosen = rows.filter((r) => r.selected && !r.registered && r.ticker.trim() && r.market);
  const incomplete = rows.filter((r) => r.selected && !r.registered && (!r.ticker.trim() || !r.market)).length;
  const rationaleChanged = view ? rationale !== clampRationale(view.defaults.rationale) : true;

  async function submit() {
    if (!view || chosen.length === 0 || chosen.length > MAX_BATCH) return;
    setBusy(true); setNotice(null); setErrorKey(null);
    const sent = chosen.map((r) => r.key);
    let data: any;
    let ok = false;
    let status = 0;
    try {
      const res = await fetch(`/api/research/playbooks/${runId}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: chosen.map((r) => ({
            entity_id: r.entity_id, ticker: r.ticker.trim(), market: r.market, action: r.action,
            confidence: r.confidence.trim() === '' ? undefined : Math.min(100, Math.max(0, Math.round(Number(r.confidence)))),
            horizon: r.horizon || undefined,
          })),
          rationale: rationaleChanged && rationale ? rationale : undefined,
          recommended_at: recommendedAt ? new Date(recommendedAt).toISOString() : undefined,
        }),
      });
      ok = res.ok; status = res.status;
      data = await res.json().catch(() => ({}));
    } catch {
      setNotice('登记失败：网络错误');
      return;
    } finally { setBusy(false); }

    if (!ok) {
      const idx = data?.error?.item_index;
      const key = typeof idx === 'number' ? sent[idx] ?? null : null;
      setErrorKey(key);
      const row = key ? rows.find((r) => r.key === key) : undefined;
      const where = row ? `（${row.name}${row.ticker ? ` ${row.ticker}` : ''}）` : '';
      setNotice(`登记失败${where}：${CODE_ZH[data?.error?.message] ?? data?.error?.message ?? status}`);
      return;
    }
    const successText = `已登记 ${data.created?.length ?? 0} 条，跳过 ${data.skipped?.length ?? 0} 条。`;
    await load().catch(() => {});
    setNotice(successText);
    onRegistered();
  }

  if (!view) return <p className="mt-2 text-xs text-gray-500">{notice ?? '读取登记信息…'}</p>;

  return (
    <div className="mt-2 space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">登记为分析师建议 · 来源「{view.source_title || '—'}」</span>
        {view.analyst && (
          <Link href={`/analyst/${view.analyst.id}`} className="underline">归属 {view.analyst.display_name}</Link>
        )}
        {!view.analyst && <span className="text-gray-500">归属「Research Playbook」（首次登记时创建）</span>}
        {view.registered_count > 0 && <span className="text-gray-500">已登记 {view.registered_count} 条</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">建议时间（默认审批时间，不得晚于现在）
          <input type="datetime-local" className={`${input} w-52`} max={toLocalInput(new Date().toISOString())} value={recommendedAt} onChange={(e) => setRecommendedAt(e.target.value)} />
        </label>
        <label className="flex min-w-[20rem] flex-1 flex-col gap-0.5">理由（整批共用）
          <input className={input} value={rationale} placeholder="留空则使用 run 理由" onChange={(e) => setRationale(e.target.value)} maxLength={4000} />
        </label>
      </div>
      <table className="w-full text-left">
        <thead className="text-gray-500">
          <tr><th className="pr-2">选</th><th className="pr-2">公司</th><th className="pr-2">标的</th><th className="pr-2">市场</th><th className="pr-2">方向</th><th className="pr-2">信心</th><th className="pr-2">期限</th><th>状态</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`${r.registered ? 'opacity-60' : ''} ${r.key === errorKey ? 'bg-red-50' : ''}`}>
              <td className="pr-2"><input type="checkbox" aria-label={`选择 ${r.name}`} checked={r.selected} disabled={r.registered} onChange={(e) => update(r.key, { selected: e.target.checked })} /></td>
              <td className="pr-2">{r.name}</td>
              <td className="pr-2"><input className={`${input} w-28`} aria-label={`${r.name} 标的`} value={r.ticker} placeholder="600519.SH / 00700.HK / NVDA" onChange={(e) => update(r.key, { ticker: e.target.value })} disabled={r.registered} /></td>
              <td className="pr-2">
                <select className={input} value={r.market} onChange={(e) => update(r.key, { market: e.target.value as CoreMarket | '' })} disabled={r.registered}>
                  <option value="">—</option>
                  {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </td>
              <td className="pr-2">
                <select className={input} value={r.action} onChange={(e) => update(r.key, { action: e.target.value as DecisionAction })} disabled={r.registered}>
                  {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_ZH[a]}</option>)}
                </select>
              </td>
              <td className="pr-2"><input type="number" min={0} max={100} step={1} aria-label={`${r.name} 信心`} className={`${input} w-16`} value={r.confidence} onChange={(e) => update(r.key, { confidence: e.target.value })} disabled={r.registered} /></td>
              <td className="pr-2">
                <select className={input} value={r.horizon} onChange={(e) => update(r.key, { horizon: e.target.value as DecisionHorizon | '' })} disabled={r.registered}>
                  <option value="">未定</option>
                  {(Object.keys(HORIZON_ZH) as DecisionHorizon[]).map((h) => <option key={h} value={h}>{HORIZON_ZH[h]}</option>)}
                </select>
              </td>
              <td className="text-gray-500">{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addManualRow} className="rounded border px-2 py-1">新增一行</button>
        <button type="button" onClick={submit} disabled={busy || !view.registrable || chosen.length === 0 || chosen.length > MAX_BATCH} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
          {busy ? '登记中…' : `登记 ${chosen.length} 条为建议`}
        </button>
        {incomplete > 0 && <span className="text-amber-700">已勾选但缺标的/市场：{incomplete} 行未发送</span>}
        {chosen.length > MAX_BATCH && <span className="text-red-700">最多一次登记 {MAX_BATCH} 条</span>}
        {!view.registrable && <span className="text-red-700">该 run 不是已批准的 PAPER_TRADE，不能登记。</span>}
        {notice && <span className="text-blue-800">{notice}</span>}
      </div>
      <p className="text-gray-500">模拟成交价取建议日 K 线收盘，由 /analyst 的「刷新评分」写入；不构成投资建议。</p>
    </div>
  );
}
