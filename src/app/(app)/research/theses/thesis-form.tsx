'use client';

// Research OS — Thesis 表单共享部件（创建 / 取代）。WP-A7 §5.3 字段。
// i18n 豁免：单用户本地研究工具，文案 zh 硬编码。

import { OPPORTUNITY_TYPES, type OpportunityType } from '@/lib/research/types';

export const OPPORTUNITY_LABELS: Record<OpportunityType, string> = { B: 'B · 业绩/事件驱动', C: 'C · 结构性变化', other: 'other · 其他' };

export const EMPTY_FORM = {
  title: '', body: '', invalidation_conditions: '', watch_metrics: '', next_review_at: '',
  opportunity_type: 'other' as OpportunityType, pillars: '', catalysts: '', horizon_weeks: '4,13,26',
};
export type ThesisFormState = typeof EMPTY_FORM;

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
/** Form → CreateThesisInput. Pillars: `文本 | 如何判定 | YYYY-MM-DD`; catalysts: `文本 | YYYY-MM-DD`. */
export function formToInput(form: ThesisFormState) {
  return {
    title: form.title,
    body: form.body,
    invalidation_conditions: lines(form.invalidation_conditions),
    watch_metrics: lines(form.watch_metrics),
    next_review_at: form.next_review_at,
    opportunity_type: form.opportunity_type,
    pillars: lines(form.pillars).map((line) => {
      const [text, resolvable_by, deadline] = line.split('|').map((x) => x.trim());
      return { text, resolvable_by: resolvable_by ?? '', deadline: deadline || null };
    }),
    catalysts: lines(form.catalysts).map((line) => {
      const [text, expected_date] = line.split('|').map((x) => x.trim());
      return { text, expected_date: expected_date || null };
    }),
    horizon_weeks: form.horizon_weeks.split(/[,，\s]+/).filter(Boolean).map(Number),
  };
}

/** Shared thesis fields for the create and supersede forms. */
export function ThesisFormFields({ form, setForm }: { form: ThesisFormState; setForm: (f: ThesisFormState) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm md:col-span-2">
        标题
        <input className="mt-1 w-full rounded border px-2 py-1.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
      </label>
      <label className="text-sm md:col-span-2">
        正文（核心逻辑）
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
      </label>
      <label className="text-sm">
        机会类型
        <select className="mt-1 w-full rounded border px-2 py-1.5" value={form.opportunity_type} onChange={(e) => setForm({ ...form, opportunity_type: e.target.value as OpportunityType })}>
          {OPPORTUNITY_TYPES.map((o) => <option key={o} value={o}>{OPPORTUNITY_LABELS[o]}</option>)}
        </select>
      </label>
      <label className="text-sm">
        窗口周数（逗号分隔，默认 4,13,26）
        <input className="mt-1 w-full rounded border px-2 py-1.5" value={form.horizon_weeks} onChange={(e) => setForm({ ...form, horizon_weeks: e.target.value })} />
      </label>
      <label className="text-sm md:col-span-2">
        支柱（每行一条：`支柱 | 如何判定 | 截止日期(可选)`）
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={form.pillars} onChange={(e) => setForm({ ...form, pillars: e.target.value })} placeholder="推理需求增速高于训练 | 季报数据中心拆分 | 2026-12-31" />
      </label>
      <label className="text-sm md:col-span-2">
        催化剂（每行一条：`事件 | 预期日期(可选)`）
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={2} value={form.catalysts} onChange={(e) => setForm({ ...form, catalysts: e.target.value })} placeholder="GTC 发布 | 2026-03-15" />
      </label>
      <label className="text-sm">
        失效条件（每行一条，≥1，没有失效条件的 thesis 不允许存在）
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={form.invalidation_conditions} onChange={(e) => setForm({ ...form, invalidation_conditions: e.target.value })} required />
      </label>
      <label className="text-sm">
        观察指标（每行一条，≥1）
        <textarea className="mt-1 w-full rounded border px-2 py-1.5" rows={3} value={form.watch_metrics} onChange={(e) => setForm({ ...form, watch_metrics: e.target.value })} required />
      </label>
      <label className="text-sm">
        下次复核日期
        <input type="date" className="mt-1 w-full rounded border px-2 py-1.5" value={form.next_review_at} onChange={(e) => setForm({ ...form, next_review_at: e.target.value })} required />
      </label>
    </div>
  );
}
