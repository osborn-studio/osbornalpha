// ScatterFit — inline SVG scatter with the fitted line (spec §3.4). Its table view is the aligned-pairs table.
import { scatterGeometry } from './chart-geometry';

export function ScatterFit({ pairs, slope, intercept, label, xLabel, yLabel, width = 360, height = 240 }: {
  pairs: readonly { x: number; y: number }[]; slope: number; intercept: number; label: string; xLabel: string; yLabel: string; width?: number; height?: number;
}) {
  if (pairs.length === 0) return null;
  const g = scatterGeometry(pairs, { slope, intercept }, width, height);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[480px]">
      <rect x={28} y={28} width={width - 56} height={height - 56} fill="none" stroke="var(--border)" />
      {g.dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={2.5} fill="var(--text-dim)" />)}
      <line x1={g.line.x1} y1={g.line.y1} x2={g.line.x2} y2={g.line.y2} stroke="var(--accent)" strokeWidth={1.5} />
      <text x={width / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{xLabel}</text>
      <text x={10} y={height / 2} textAnchor="middle" fontSize={10} fill="var(--text-dim)" transform={`rotate(-90 10 ${height / 2})`}>{yLabel}</text>
    </svg>
  );
}
