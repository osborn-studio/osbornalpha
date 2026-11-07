// src/components/company/Seg.tsx
'use client';
// Segmented control (canvas `seg`) on tokens; buttons with aria-pressed (plan 2026-11-06 Task 12).
export function Seg<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; disabled?: boolean; title?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-[var(--border)] text-xs">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={o.disabled} title={o.title}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 ${o.value === value ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
