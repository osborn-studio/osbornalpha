import type { Stance } from '@/lib/supabase/database.types';

interface Props {
  name: string;
  stance: Stance;
  confidence: number;
  summary: string;
  cites: string[];
}

const STANCE_BORDER: Record<Stance, string> = {
  bullish: 'border-l-bullish',
  neutral: 'border-l-neutral',
  bearish: 'border-l-bearish',
};

export function PerspectiveCard({ name, stance, confidence, summary, cites }: Props) {
  return (
    <div className={`mb-2.5 rounded-md border-l-[3px] bg-bg-card p-3.5 ${STANCE_BORDER[stance]}`}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-text-dim">信心 {confidence.toFixed(1)}/10</span>
      </div>
      <div className="mb-1.5 text-sm leading-relaxed">{summary}</div>
      {cites.length > 0 && (
        <div className="text-[11px] italic text-text-muted">
          ▸ cite: {cites.join('; ')}
        </div>
      )}
    </div>
  );
}
