'use client';

// WP-A11 — thesis 流程：8 题一屏一题 → 预览 → 保存为草稿 / 保存并激活。

import { useMemo, useState, type ReactNode } from 'react';
import type { ScopedCompany } from '@/lib/research/entity-keys/scope';
import { THESIS_QUESTIONS, type ThesisQuestionId } from '@/lib/research/setup/questions';
import { saveOutcomeMessage, staleCompanyIds, thesisFormToInput, validateThesisStep, type ThesisDraft } from '@/lib/research/setup/theses';
import { OPPORTUNITY_TYPES } from '@/lib/research/types';
import { OPPORTUNITY_LABELS } from '../theses/thesis-form';
import { inputClass, labelClass, ListEditor, ProgressBar, QuestionCard, WizardNav } from './wizard';

const OPPORTUNITY_HINTS: Record<string, string> = {
  B: '有明确的财报或事件节点，兑现快、可证伪时间近。',
  C: '行业规则或需求结构改变，兑现慢，但一旦成立影响持久。',
  other: '不属于以上两类；请在核心逻辑里说明为什么值得跟。',
};

export function ThesisFlow({ companies, draft, step, onDraftChange, onStepChange, onSaved, busy, setBusy }: {
  companies: ScopedCompany[];
  draft: ThesisDraft;
  step: number;
  onDraftChange: (d: ThesisDraft) => void;
  onStepChange: (s: number) => void;
  onSaved: (message: string) => void;
  /** In-flight submission lock, owned by the page so a remount cannot reset it. */
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const total = THESIS_QUESTIONS.length + 1; // + preview
  const inScope = useMemo(() => companies.filter((c) => c.in_scope), [companies]);
  const vctx = useMemo(() => ({ inScopeIds: inScope.map((c) => c.entity_id) }), [inScope]);
  const set = (patch: Partial<ThesisDraft>) => onDraftChange({ ...draft, ...patch });

  const next = () => {
    const q = THESIS_QUESTIONS[step];
    if (q) {
      const errs = validateThesisStep(q.id, draft, vctx);
      setErrors(errs);
      if (errs.length) return;
    }
    onStepChange(Math.min(step + 1, total - 1));
  };
  const prev = () => { setErrors([]); onStepChange(Math.max(step - 1, 0)); };

  async function save(activate: boolean) {
    if (busy) return;
    const allErrors = THESIS_QUESTIONS.flatMap((q) => validateThesisStep(q.id, draft, vctx));
    if (allErrors.length) { setErrors(allErrors); return; }
    setBusy(true); setNotice(null);
    try {
      let created: { id: string; title: string };
      try {
        const res = await fetch('/api/research/theses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(thesisFormToInput(draft)) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setNotice(`保存失败：${data?.error?.message ?? res.status}`); return; }
        created = data.thesis;
      } catch (e) {
        setNotice(`保存失败：${e instanceof Error ? e.message : '网络错误'}；草稿已保留，可重试`);
        return;
      }
      // From here the thesis exists: the draft is finalized whatever happens to activation, so a retry
      // never creates a duplicate. Activation transport or server failures are reported, not swallowed.
      let activated: boolean | null = null, error: string | undefined;
      if (activate) {
        try {
          const t = await fetch(`/api/research/theses/${created.id}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'ACTIVE', reason: 'setup wizard' }) });
          const tData = await t.json().catch(() => ({}));
          activated = t.ok; if (!t.ok) error = tData?.error?.message ?? String(t.status);
        } catch (e) { activated = false; error = e instanceof Error ? e.message : '网络错误'; }
      }
      onSaved(saveOutcomeMessage({ title: created.title, activate, activated, error })); // the page resets answers and step atomically
    } finally { setBusy(false); }
  }

  if (step >= THESIS_QUESTIONS.length) {
    const input = thesisFormToInput(draft);
    return (
      <div className="space-y-4">
        <ProgressBar index={step} total={total} />
        <section className="space-y-3 rounded-lg border p-5">
          <h2 className="text-base font-medium">预览</h2>
          <p className="text-sm text-gray-500">确认无误后保存。「保存为草稿」写入 DRAFT；「保存并激活」再把状态切到 ACTIVE（fan-out 只看 ACTIVE / WATCH / AT_RISK）。</p>
          <article className="space-y-2 rounded border bg-gray-50 p-4 text-sm">
            <h3 className="font-medium">{input.title}</h3>
            <p className="text-gray-700">{input.body}</p>
            <p><span className="text-gray-500">机会类型：</span>{OPPORTUNITY_LABELS[input.opportunity_type ?? 'other']}</p>
            <p><span className="text-gray-500">关联公司：</span>{inScope.filter((c) => input.company_ids?.includes(c.entity_id)).map((c) => c.names_zh[0] ?? c.names_en[0]).join('、') || '—'}</p>
            <div><span className="text-gray-500">支柱：</span><ul className="ml-4 list-disc">{input.pillars?.map((p, i) => <li key={i}>{p.text}（判定：{p.resolvable_by}{p.deadline ? `，${p.deadline}` : ''}）</li>)}</ul></div>
            <div><span className="text-gray-500">失效条件：</span><ul className="ml-4 list-disc">{input.invalidation_conditions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <p><span className="text-gray-500">观察指标：</span>{input.watch_metrics.join('、')}</p>
            {input.catalysts && input.catalysts.length > 0 && <p><span className="text-gray-500">催化剂：</span>{input.catalysts.map((c) => `${c.text}${c.expected_date ? `（${c.expected_date}）` : ''}`).join('、')}</p>}
            <p><span className="text-gray-500">窗口：</span>{input.horizon_weeks?.join(' / ')} 周 · 下次复核 {input.next_review_at}</p>
          </article>
          {errors.length > 0 && <ul className="text-sm text-red-700" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          {notice && <p className="text-sm text-blue-800">{notice}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={prev} disabled={busy} className="rounded border px-3 py-1.5 text-sm">上一题</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => void save(false)} disabled={busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">保存为草稿</button>
              <button type="button" onClick={() => void save(true)} disabled={busy} className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50">{busy ? '保存中…' : '保存并激活'}</button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const q = THESIS_QUESTIONS[step]!;
  const body: Record<ThesisQuestionId, () => ReactNode> = {
    title: () => <input className={inputClass} value={draft.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder={q.example} autoFocus />,
    body: () => <textarea className={inputClass} rows={5} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder={q.example} />,
    opportunity_type: () => (
      <div className="space-y-2">
        {OPPORTUNITY_TYPES.map((o) => (
          <label key={o} className="flex items-start gap-2 text-sm">
            <input type="radio" name="opportunity_type" checked={draft.opportunity_type === o} onChange={() => set({ opportunity_type: o })} className="mt-1" />
            <span><span className="font-medium">{OPPORTUNITY_LABELS[o]}</span><span className="block text-gray-500">{OPPORTUNITY_HINTS[o]}</span></span>
          </label>
        ))}
      </div>
    ),
    companies: () => (
      <div className="space-y-3">
        {staleCompanyIds(draft.company_ids, vctx.inScopeIds).length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            以下已选公司已不在名单里，请移除：
            {staleCompanyIds(draft.company_ids, vctx.inScopeIds).map((id) => (
              <button key={id} type="button" className="ml-2 rounded border px-2 text-xs" onClick={() => set({ company_ids: draft.company_ids.filter((x) => x !== id) })}>
                {companies.find((c) => c.entity_id === id)?.names_zh[0] ?? id.slice(0, 8)} ×
              </button>
            ))}
          </div>
        )}
        {inScope.length === 0
      ? <p className="text-sm text-amber-800">名单里还没有 in_scope 的公司，请先完成「公司名单」流程。</p>
      : (
        <div className="grid gap-1 md:grid-cols-2">
          {inScope.map((c) => (
            <label key={c.entity_id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.company_ids.includes(c.entity_id)} onChange={(e) => set({ company_ids: e.target.checked ? [...draft.company_ids, c.entity_id] : draft.company_ids.filter((id) => id !== c.entity_id) })} />
              {c.names_zh[0] ?? c.names_en[0]} <span className="text-gray-400">{c.securities.find((s) => s.is_primary)?.exchange_code ?? c.home_market}</span>
            </label>
          ))}
        </div>
      )}
      </div>
    ),
    pillars: () => (
      <div className="space-y-3">
        {draft.pillars.map((p, i) => (
          <fieldset key={i} className="rounded border p-3">
            <legend className="px-1 text-xs text-gray-500">支柱 {i + 1}</legend>
            <label className={labelClass}>可验证的陈述<input className={inputClass} value={p.text} onChange={(e) => set({ pillars: draft.pillars.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder="2026H2 新签订单同比 > 20%" /></label>
            <label className={labelClass}>用什么数据判定<input className={inputClass} value={p.resolvable_by} onChange={(e) => set({ pillars: draft.pillars.map((x, j) => (j === i ? { ...x, resolvable_by: e.target.value } : x)) })} placeholder="半年报订单披露" /></label>
            <label className={labelClass}>何时能看到（可选，YYYY-MM-DD）<input className={inputClass} value={p.deadline} onChange={(e) => set({ pillars: draft.pillars.map((x, j) => (j === i ? { ...x, deadline: e.target.value } : x)) })} placeholder="2026-09-30" /></label>
            {draft.pillars.length > 2 && <button type="button" className="mt-2 text-xs underline" onClick={() => set({ pillars: draft.pillars.filter((_, j) => j !== i) })}>删除这条</button>}
          </fieldset>
        ))}
        {draft.pillars.length < 4 && <button type="button" className="text-sm underline" onClick={() => set({ pillars: [...draft.pillars, { text: '', resolvable_by: '', deadline: '' }] })}>再加一条支柱</button>}
      </div>
    ),
    invalidation: () => <ListEditor items={draft.invalidation_conditions} onChange={(items) => set({ invalidation_conditions: items })} placeholder="如果 ____ 发生，本 thesis 失效" max={3} addLabel="再加一条失效条件" />,
    metrics_catalysts: () => (
      <div className="space-y-4">
        <div><p className={labelClass}>观察指标（每周要看的数字或事件）</p><ListEditor items={draft.watch_metrics} onChange={(items) => set({ watch_metrics: items })} placeholder="新签订单同比" addLabel="再加一个指标" /></div>
        <div>
          <p className={labelClass}>催化剂（可选，最多 3 条）</p>
          <div className="space-y-2">
            {draft.catalysts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputClass} value={c.text} placeholder="事件" onChange={(e) => set({ catalysts: draft.catalysts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                <input className={`${inputClass} md:w-44`} value={c.expected_date} placeholder="YYYY-MM-DD" onChange={(e) => set({ catalysts: draft.catalysts.map((x, j) => (j === i ? { ...x, expected_date: e.target.value } : x)) })} />
                <button type="button" aria-label="删除" className="mt-1 rounded border px-2 text-sm" onClick={() => set({ catalysts: draft.catalysts.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            {draft.catalysts.length < 3 && <button type="button" className="text-sm underline" onClick={() => set({ catalysts: [...draft.catalysts, { text: '', expected_date: '' }] })}>添加催化剂</button>}
          </div>
        </div>
      </div>
    ),
    horizon: () => (
      <div className="grid gap-3 md:grid-cols-2">
        <label className={labelClass}>观察窗口（周，逗号分隔）<input className={inputClass} value={draft.horizon_weeks} onChange={(e) => set({ horizon_weeks: e.target.value })} /></label>
        <label className={labelClass}>下次复核日期<input type="date" className={inputClass} value={draft.next_review_at} onChange={(e) => set({ next_review_at: e.target.value })} /></label>
      </div>
    ),
  };

  return (
    <div className="space-y-4">
      <ProgressBar index={step} total={total} />
      <QuestionCard question={q} errors={errors}>{body[q.id]()}</QuestionCard>
      <WizardNav onPrev={prev} onNext={next} canPrev={step > 0} nextLabel={step === THESIS_QUESTIONS.length - 1 ? '预览' : '下一题'} onSaveDraft={() => setNotice('草稿已保存在本浏览器')} />
      {notice && <p className="text-sm text-blue-800">{notice}</p>}
    </div>
  );
}
