// src/components/company/MiniBars.tsx
'use client';
// Inline bars of one grid row (plan 2026-11-06 Task 12; spec §5.3): the table stays primary; withheld
// or missing cells are dashed outlines; negative values hang below the zero line.
export function MiniBars({ series, label }: { series: { key: string; value: number | null; blank: boolean }[]; label: string }) {
  const w = 100, h = 46, pad = 15;
  const vals = series.map((s) => s.value).filter((v): v is number => v !== null);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = max - min || 1;
  const zero = h * (max / span);
  return (
    <svg viewBox={`0 0 ${series.length * w} ${h}`} width="100%" height={h} role="img" aria-label={label} preserveAspectRatio="none">
      <line x1={0} x2={series.length * w} y1={zero} y2={zero} stroke="var(--border)" />
      {series.map((s, i) => {
        if (s.value === null) return <rect key={s.key} x={i * w + pad} y={h - 6} width={w - 2 * pad} height={6} fill="none" stroke="var(--text-muted)" strokeDasharray="3 3" />;
        const bh = Math.max(1, (Math.abs(s.value) / span) * h);
        return <rect key={s.key} x={i * w + pad} y={s.value >= 0 ? zero - bh : zero} width={w - 2 * pad} height={bh} fill="var(--accent)" fillOpacity={0.55} />;
      })}
    </svg>
  );
}
