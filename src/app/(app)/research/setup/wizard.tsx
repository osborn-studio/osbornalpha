'use client';

// WP-A11 — 向导壳：进度条、单题卡（题目 / 提示 / 范例）、校验红字、上一题 / 下一题 / 保存草稿。
// i18n 豁免：单用户本地研究工具，文案 zh 硬编码。

import type { ReactNode } from 'react';
import type { Question } from '@/lib/research/setup/questions';

export function ProgressBar({ index, total }: { index: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round(((index + 1) / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500"><span>第 {index + 1} / {total} 题</span><span>{pct}%</span></div>
      <div className="h-1.5 w-full rounded bg-gray-100"><div className="h-1.5 rounded bg-black transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function QuestionCard({ question, children, errors }: { question: Question; children: ReactNode; errors: string[] }) {
  return (
    <section className="space-y-3 rounded-lg border p-5">
      <h2 className="text-base font-medium">{question.prompt}</h2>
      <p className="text-sm text-gray-500">{question.hint}</p>
      <p className="text-xs text-gray-400">范例：{question.example}</p>
      <div className="space-y-3 pt-1">{children}</div>
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-sm text-red-700" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </section>
  );
}

export function WizardNav({ onPrev, onNext, onSaveDraft, nextLabel = '下一题', busy = false, canPrev = true }: {
  onPrev?: () => void; onNext: () => void; onSaveDraft?: () => void; nextLabel?: string; busy?: boolean; canPrev?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={onPrev} disabled={!canPrev || !onPrev || busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">上一题</button>
      <div className="flex gap-2">
        {onSaveDraft && <button type="button" onClick={onSaveDraft} disabled={busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">保存草稿</button>}
        <button type="button" onClick={onNext} disabled={busy} className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50">{busy ? '处理中…' : nextLabel}</button>
      </div>
    </div>
  );
}

export const inputClass = 'mt-1 w-full rounded border px-2 py-1.5 text-sm';
export const labelClass = 'block text-sm';

/** Small list editor: one text row per item, add/remove; blank rows are dropped by the mappers. */
export function ListEditor({ items, onChange, placeholder, max, addLabel = '添加一条' }: {
  items: string[]; onChange: (items: string[]) => void; placeholder?: string; max?: number; addLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input className={inputClass} value={v} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" aria-label="删除" className="mt-1 rounded border px-2 text-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {(max === undefined || items.length < max) && (
        <button type="button" className="text-sm underline" onClick={() => onChange([...items, ''])}>{addLabel}</button>
      )}
    </div>
  );
}
