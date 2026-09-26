'use client';

// WP-A11 — 公司名单流程：勾选候选 → 每家一屏（理由 / 已知实体键 / 名称纠正）→ 候选外公司 → 汇总确认 → 写入。

import { useMemo, useState } from 'react';
import type { ScopedCompany } from '@/lib/research/entity-keys/scope';
import { HOME_MARKETS, KEY_NAMES, type HomeMarket, type KeyName } from '@/lib/research/entity-keys/types';
import { COMPANY_QUESTIONS, type CompanyQuestionId } from '@/lib/research/setup/questions';
import { companiesStepErrors, companiesSubmitErrors, reconcileAddedCompany, rosterKeys, type OwnerCompanyAnswer } from '@/lib/research/setup/companies';
import { TARGETS } from '@/lib/research/setup/progress';
import { inputClass, labelClass, ProgressBar, QuestionCard, WizardNav } from './wizard';

const MARKET_LABEL: Record<HomeMarket, string> = { A: 'A 股', HK: '港股', US: '美股', other: '其他' };
const KEY_LABEL: Record<KeyName, string> = { lei: 'LEI（20 位）', usci: '统一社会信用代码（18 位）', cninfo_org_id: '巨潮 orgId', cik: 'SEC CIK' };
const q = (id: CompanyQuestionId) => COMPANY_QUESTIONS.find((x) => x.id === id)!;

export const emptyAnswer = (row: ScopedCompany | null): OwnerCompanyAnswer => ({
  entity_id: row?.entity_id ?? null,
  rationale: row?.scope_rationale ?? '',
  names_zh: row?.names_zh.join('\n') ?? '',
  names_en: row?.names_en.join('\n') ?? '',
  home_market: (row?.home_market as HomeMarket) ?? 'A',
  exchange_code: row?.securities.find((s) => s.is_primary)?.exchange_code ?? '',
  listed_on: '',
  keys: { lei: '', usci: '', cninfo_org_id: '', cik: '' },
});

/** Screens: 0 = select, 1..n = one per selected company, n+1 = new companies, n+2 = review. */
export function CompaniesFlow({ companies, answers, step, onAnswersChange, onStepChange, onSaved, onRefresh, busy, setBusy }: {
  companies: ScopedCompany[];
  answers: Record<string, OwnerCompanyAnswer>;
  step: number;
  onAnswersChange: (a: Record<string, OwnerCompanyAnswer>) => void;
  onStepChange: (s: number) => void;
  onSaved: (message: string) => void;
  /** Reload the company list after a partially successful submission. */
  onRefresh: () => Promise<void>;
  /** In-flight submission lock, owned by the page so a remount cannot reset it. */
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // Roster from the draft, not from the fetched list: a company created in a partial run stays selectable before refresh.
  const { selected: selectedIds, added: newKeys } = useMemo(() => rosterKeys(answers), [answers]);
  const rowOf = (id: string) => companies.find((x) => x.entity_id === id);
  const nameOf = (id: string) => rowOf(id)?.names_zh[0] ?? rowOf(id)?.names_en[0] ?? answers[id]?.names_zh.split('\n')[0] ?? answers[id]?.names_en.split('\n')[0] ?? id;
  const total = selectedIds.length + 3;
  const byMarket = useMemo(() => {
    const groups = new Map<string, ScopedCompany[]>();
    for (const c of companies) (groups.get(c.home_market) ?? groups.set(c.home_market, []).get(c.home_market)!).push(c);
    return [...groups.entries()].sort();
  }, [companies]);
  const setAnswer = (key: string, a: OwnerCompanyAnswer | null) => {
    const next = { ...answers };
    if (a === null) delete next[key]; else next[key] = a;
    onAnswersChange(next);
  };

  const stepErrors = (s: number) => companiesStepErrors({ step: s, selected: selectedIds.map((id) => answers[id]!), added: newKeys.map((k) => answers[k]!) });
  const next = () => {
    const errs = stepErrors(step);
    setErrors(errs);
    if (errs.length) return;
    onStepChange(Math.min(step + 1, total - 1));
  };
  const prev = () => { setErrors([]); onStepChange(Math.max(step - 1, 0)); };

  async function submit() {
    if (busy) return;
    // Every answer is validated before the first write; an incomplete one sends the owner back to its screen.
    const check = companiesSubmitErrors({ selected: selectedIds.map((id) => answers[id]!), added: newKeys.map((k) => answers[k]!) });
    if (check.errors.length) { setErrors(check.errors); if (check.firstStep !== null) onStepChange(check.firstStep); return; }
    setBusy(true); setNotice(null);
    const failures: string[] = [];
    let current = answers;
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const post = async (url: string, method: string, body: unknown): Promise<{ ok: boolean; data: { company?: { entity_id: string }; error?: { message?: string } }; status: string }> => {
      try {
        const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { ok: res.ok, data: await res.json().catch(() => ({})), status: String(res.status) };
      } catch (e) {
        return { ok: false, data: {}, status: e instanceof Error ? e.message : '网络错误' };
      }
    };
    try {
      // 1. Owner-added companies first: each success is reconciled into the draft as an existing company,
      //    so a retry after a later failure PATCHes it instead of POSTing it again (which would be 409).
      for (const k of newKeys) {
        const a = current[k]!;
        const { ok, data, status } = await post('/api/research/entity-keys', 'POST', a);
        if (!ok || !data.company) { failures.push(`${a.names_zh || a.names_en}：${data.error?.message ?? status}`); continue; }
        current = reconcileAddedCompany(current, k, data.company.entity_id);
        onAnswersChange(current);
      }
      // 2. Selected companies (including the ones just created).
      for (const id of Object.keys(current).filter((k) => !k.startsWith('new:'))) {
        const a = current[id]!;
        const keys = Object.fromEntries(KEY_NAMES.filter((k) => a.keys[k].trim() !== '').map((k) => [k, a.keys[k].trim()]));
        const { ok, data, status } = await post(`/api/research/entity-keys/${id}`, 'PATCH',
          { in_scope: true, rationale: a.rationale, keys, ...(lines(a.names_zh).length ? { names_zh: lines(a.names_zh) } : {}), ...(lines(a.names_en).length ? { names_en: lines(a.names_en) } : {}) });
        if (!ok) failures.push(`${nameOf(id)}：${data.error?.message ?? status}`);
      }
      // 3. Removals last, and only when everything above succeeded: nothing leaves the list on a partial run.
      if (failures.length === 0) {
        for (const c of companies) {
          if (c.in_scope && !current[c.entity_id]) {
            const { ok, data, status } = await post(`/api/research/entity-keys/${c.entity_id}`, 'PATCH', { in_scope: false, rationale: '本轮未入选' });
            if (!ok) failures.push(`${c.names_zh[0] ?? c.names_en[0]}：移出失败 ${data.error?.message ?? status}`);
          }
        }
      }
      if (failures.length) { setErrors([...failures, '已成功的部分已写入并保留在草稿里；修正后可直接重试。']); await onRefresh(); return; }
      onSaved(`名单已写入：${Object.keys(current).length} 家`); // the page resets answers and step atomically
    } finally { setBusy(false); }
  }

  const screen = (() => {
    if (step === 0) {
      const question = q('select');
      return (
        <QuestionCard question={question} errors={errors}>
          {byMarket.map(([market, rows]) => (
            <div key={market}>
              <p className="text-xs font-medium text-gray-500">{MARKET_LABEL[market as HomeMarket] ?? market}</p>
              <div className="grid gap-1 md:grid-cols-2">
                {rows.map((c) => (
                  <label key={c.entity_id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!answers[c.entity_id]} onChange={(e) => setAnswer(c.entity_id, e.target.checked ? emptyAnswer(c) : null)} />
                    {c.names_zh[0] ?? c.names_en[0]} <span className="text-gray-400">{c.securities.find((s) => s.is_primary)?.exchange_code}</span>
                    {c.in_scope && <span className="rounded bg-green-100 px-1 text-xs text-green-800">已在名单</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-500">已选 {selectedIds.length + newKeys.length} 家（目标 {TARGETS.companies[0]}–{TARGETS.companies[1]}）。一家都不勾也可以直接下一步，去添加候选外公司。</p>
          <button type="button" className="text-sm underline" onClick={() => { setAnswer(`new:${Date.now()}`, emptyAnswer(null)); onStepChange(selectedIds.length + 1); }}>添加候选外公司</button>
        </QuestionCard>
      );
    }
    if (step <= selectedIds.length) {
      const id = selectedIds[step - 1]!;
      const a = answers[id]!;
      const c = rowOf(id) ?? { entity_id: id, keys: { lei: null, usci: null, cninfo_org_id: null, cik: null }, missing: [] as KeyName[], names_zh: [], names_en: [] };
      const set = (patch: Partial<OwnerCompanyAnswer>) => setAnswer(id, { ...a, ...patch });
      return (
        <QuestionCard question={{ ...q('rationale'), prompt: `${nameOf(id)}：${q('rationale').prompt}` }} errors={errors}>
          <textarea className={inputClass} rows={3} value={a.rationale} onChange={(e) => set({ rationale: e.target.value })} placeholder={q('rationale').example} autoFocus />
          <details className="rounded border p-3 text-sm" open={c.missing.length > 0}>
            <summary className="cursor-pointer">{q('keys').prompt}{c.missing.length > 0 && <span className="ml-2 text-xs text-amber-700">缺 {c.missing.join(' / ')}</span>}</summary>
            <p className="mt-1 text-xs text-gray-500">{q('keys').hint}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {KEY_NAMES.map((k) => (
                <label key={k} className={labelClass}>{KEY_LABEL[k]}{c.keys[k] && <span className="ml-1 text-xs text-gray-400">现有：{c.keys[k]}</span>}
                  <input className={inputClass} value={a.keys[k]} onChange={(e) => set({ keys: { ...a.keys, [k]: e.target.value } })} placeholder={c.keys[k] ? '留空沿用现有' : '未知可留空'} />
                </label>
              ))}
            </div>
          </details>
          <details className="rounded border p-3 text-sm">
            <summary className="cursor-pointer">{q('names').prompt}</summary>
            <p className="mt-1 text-xs text-gray-500">{q('names').hint}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className={labelClass}>中文名（每行一个）<textarea className={inputClass} rows={2} value={a.names_zh} onChange={(e) => set({ names_zh: e.target.value })} /></label>
              <label className={labelClass}>英文名（每行一个）<textarea className={inputClass} rows={2} value={a.names_en} onChange={(e) => set({ names_en: e.target.value })} /></label>
            </div>
          </details>
        </QuestionCard>
      );
    }
    if (step === selectedIds.length + 1) {
      const question = q('new_company');
      return (
        <QuestionCard question={question} errors={errors}>
          {newKeys.map((k) => {
            const a = answers[k]!;
            const set = (patch: Partial<OwnerCompanyAnswer>) => setAnswer(k, { ...a, ...patch });
            return (
              <fieldset key={k} className="grid gap-2 rounded border p-3 md:grid-cols-2">
                <label className={labelClass}>中文名<input className={inputClass} value={a.names_zh} onChange={(e) => set({ names_zh: e.target.value })} /></label>
                <label className={labelClass}>英文名<input className={inputClass} value={a.names_en} onChange={(e) => set({ names_en: e.target.value })} /></label>
                <label className={labelClass}>主市场<select className={inputClass} value={a.home_market} onChange={(e) => set({ home_market: e.target.value as HomeMarket })}>{HOME_MARKETS.map((m) => <option key={m} value={m}>{MARKET_LABEL[m]}</option>)}</select></label>
                <label className={labelClass}>主证券代码<input className={inputClass} value={a.exchange_code} onChange={(e) => set({ exchange_code: e.target.value })} placeholder="600446.SH / 0268.HK / PLTR" /></label>
                <label className={labelClass}>上市日期（可留空）<input className={inputClass} value={a.listed_on} onChange={(e) => set({ listed_on: e.target.value })} placeholder="YYYY-MM-DD" /></label>
                <label className={`${labelClass} md:col-span-2`}>为什么进名单<textarea className={inputClass} rows={2} value={a.rationale} onChange={(e) => set({ rationale: e.target.value })} /></label>
                <button type="button" className="text-xs underline" onClick={() => setAnswer(k, null)}>删除这家</button>
              </fieldset>
            );
          })}
          <button type="button" className="text-sm underline" onClick={() => setAnswer(`new:${Date.now()}`, emptyAnswer(null))}>添加一家候选外公司</button>
          {newKeys.length === 0 && <p className="text-xs text-gray-500">没有就直接下一步。</p>}
        </QuestionCard>
      );
    }
    const question = q('review');
    const count = selectedIds.length + newKeys.length;
    const warn = count < TARGETS.companies[0] ? `目前 ${count} 家，少于目标 ${TARGETS.companies[0]} 家（只提醒，不阻止）。` : count > TARGETS.companies[1] ? `目前 ${count} 家，多于目标 ${TARGETS.companies[1]} 家（只提醒，不阻止）。` : `${count} 家，在目标区间内。`;
    return (
      <QuestionCard question={question} errors={errors}>
        <p className="text-sm text-amber-800">{warn}</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1">公司</th><th>市场</th><th>代码</th><th>缺失键</th><th>理由</th></tr></thead>
          <tbody>
            {selectedIds.map((id) => { const c = rowOf(id); const a = answers[id]!; return (
              <tr key={id} className="border-t"><td className="py-1">{nameOf(id)}{!c && <span className="ml-1 text-xs text-blue-700">已创建，待刷新</span>}</td><td>{MARKET_LABEL[(c?.home_market ?? a.home_market) as HomeMarket]}</td><td>{c?.securities.find((s) => s.is_primary)?.exchange_code ?? a.exchange_code.toUpperCase()}</td><td>{(c?.missing ?? KEY_NAMES).filter((k) => a.keys[k].trim() === '').join(' / ') || '—'}</td><td className="text-gray-700">{a.rationale}</td></tr>
            ); })}
            {newKeys.map((k) => { const a = answers[k]!; return (
              <tr key={k} className="border-t"><td className="py-1">{a.names_zh} <span className="text-xs text-blue-700">新增</span></td><td>{MARKET_LABEL[a.home_market]}</td><td>{a.exchange_code.toUpperCase()}</td><td>{KEY_NAMES.filter((x) => a.keys[x].trim() === '').join(' / ') || '—'}</td><td className="text-gray-700">{a.rationale}</td></tr>
            ); })}
          </tbody>
        </table>
        {companies.some((c) => c.in_scope && !answers[c.entity_id]) && <p className="text-xs text-gray-500">未勾选但目前在名单里的公司将被移出（理由记为「本轮未入选」）。</p>}
        {notice && <p className="text-sm text-blue-800">{notice}</p>}
      </QuestionCard>
    );
  })();

  return (
    <div className="space-y-4">
      <ProgressBar index={step} total={total} />
      {screen}
      <WizardNav onPrev={prev} canPrev={step > 0} busy={busy}
        onNext={step === total - 1 ? () => void submit() : next}
        nextLabel={step === total - 1 ? '确认并写入名单' : step === total - 2 ? '汇总' : '下一题'}
        onSaveDraft={() => setNotice('草稿已保存在本浏览器')} />
    </div>
  );
}
