'use client';

/**
 * Tiny inline SVG sparkline — for watchlist rows / list views.
 * Deterministic per ticker (so same stock has stable shape across renders).
 */
export function Sparkline({
  ticker,
  changePct,
  width = 80,
  height = 24,
}: {
  ticker: string;
  changePct: number;
  width?: number;
  height?: number;
}) {
  const points = generateSparklinePoints(ticker, changePct, 20);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const pathData = points
    .map((y, i) => {
      const normY = ((y - min) / range) * (height - 4) + 2;
      const px = i * stepX;
      const py = height - normY;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');

  const stroke = changePct > 0 ? 'var(--up)' : changePct < 0 ? 'var(--down)' : 'var(--text-dim)';

  return (
    <svg width={width} height={height} className="block" aria-hidden>
      <path d={pathData} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Deterministic hash → pseudo-random walk
function generateSparklinePoints(ticker: string, changePct: number, n = 20): number[] {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) & 0x7fffffff;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const points: number[] = [];
  let val = 100;
  // bias drift toward the final change_pct direction
  const drift = changePct / 100 / n;
  for (let i = 0; i < n; i++) {
    val *= 1 + drift + (rng() - 0.5) * 0.015;
    points.push(val);
  }
  return points;
}
