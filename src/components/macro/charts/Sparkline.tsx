// Sparkline — inline SVG trend of the last ≤ 12 periods (spec §3.2). Its data table is the indicator page table view.
import { sparklinePoints } from './chart-geometry';

export function Sparkline({ values, label, width = 96, height = 22 }: { values: readonly string[]; label: string; width?: number; height?: number }) {
  const points = sparklinePoints(values, width, height);
  if (!points) return <span className="text-text-dim">—</span>;
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke="var(--text-dim)" strokeWidth={1.5} points={points} />
    </svg>
  );
}
