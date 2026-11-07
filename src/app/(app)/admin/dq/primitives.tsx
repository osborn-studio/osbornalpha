// Shared building blocks of the /admin/dq page (moved out of AdminDqClient.tsx unchanged, plan 3
// Task 19b) so the new panels reuse them. Existing tokens only.
import type { ReactNode } from 'react';

export type Row = Record<string, unknown>;
export type Col = { label: string; num?: boolean };
export type T = (key: string, values?: Record<string, string | number>) => string;

export const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
export const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
export const count = (row: Row, key: string) => s((row.counts as Record<string, unknown> | null)?.[key] ?? 0);
// Fixed semantic tones: never text-up/text-down, which flip with the market colour scheme.
export const STATUS_TONE: Record<string, string> = {
  fresh: '', success: '', stale: 'text-warn', partial: 'text-warn', running: 'text-text-dim',
  missing: 'text-text-muted', error: 'text-danger', failed: 'text-danger', rejected: 'text-danger',
  complete: '', complete_with_gaps: 'text-warn', complete_with_failures: 'text-warn',
};
// Tailwind 3 cannot apply an opacity modifier to a var() colour, so mix it explicitly.
export const DANGER_BG = 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]';
export const td = 'whitespace-nowrap px-2 py-1.5';
export const num = `${td} text-right tabular-nums`;
export const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';

export function Pill({ value, tone }: { value: string; tone?: string }) {
  return <span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${tone ?? STATUS_TONE[value] ?? 'text-text-dim'}`}>{value}</span>;
}

// The note may wrap (Claude Design canvas: the overdue card's note is not truncated).
export function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      {note ? <div className="mt-1 break-words text-[11px] text-text-muted">{note}</div> : null}
    </div>
  );
}

export function Table({ head, children, empty }: { head: Col[]; children: ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
        <thead className="bg-bg-card text-text-dim"><tr>{head.map((h) => <th key={h.label} scope="col" className={`whitespace-nowrap px-2 py-1.5 font-medium ${h.num ? 'text-right' : ''}`}>{h.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {children.length ? children : <tr><td colSpan={head.length} className="px-2 py-3 text-text-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Detail({ value, className }: { value: unknown; className?: string }) {
  const json = JSON.stringify(value ?? {});
  return (
    <details className={className}>
      <summary className="cursor-pointer truncate font-mono text-text-muted">{json}</summary>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-card p-2 font-mono text-[11px]">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </details>
  );
}
