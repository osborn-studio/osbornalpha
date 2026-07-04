import { useTranslations } from 'next-intl';
import type { Stance } from '@/lib/supabase/database.types';
import { aggregateConfidence, classifyCite, type ConfidenceLevel } from '@/lib/data/evidence-confidence';

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

const LEVEL_TEXT: Record<ConfidenceLevel, string> = {
  high: 'text-up',
  medium: 'text-warn',
  low: 'text-down',
  unknown: 'text-text-muted',
};

const LEVEL_BG: Record<ConfidenceLevel, string> = {
  high: 'bg-up/15 text-up border-up/30',
  medium: 'bg-warn/15 text-warn border-warn/30',
  low: 'bg-down/15 text-down border-down/30',
  unknown: 'bg-bg-card text-text-muted border-border',
};

export function PerspectiveCard({ name, stance, confidence, summary, cites }: Props) {
  const t = useTranslations('components.perspectiveCard');
  const evidence = aggregateConfidence(cites);

  return (
    <div className={`mb-2.5 rounded-md border-l-[3px] bg-bg-card p-3.5 ${STANCE_BORDER[stance]}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">{name}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-dim">{t('confidence')} {confidence.toFixed(1)}/10</span>
          {/* Evidence-confidence badge — evidence.label/kind/counts are dynamic
              values sourced from lib/data/evidence-confidence.ts (out of scope). */}
          {cites.length > 0 && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_BG[evidence.level]}`}
              title={t('evidenceStrengthTitle', {
                label: evidence.label,
                score: (evidence.score * 100).toFixed(0),
                high: evidence.high_count,
                medium: evidence.medium_count,
                low: evidence.low_count,
                unknown: evidence.unknown_count,
              })}
            >
              📊 {evidence.label}
            </span>
          )}
        </div>
      </div>
      <div className="mb-1.5 text-sm leading-relaxed">{summary}</div>
      {cites.length > 0 && (
        <div className="text-[11px] italic text-text-muted">
          <span className="not-italic mr-1">▸ {t('cite')}:</span>
          {cites.map((cite, i) => {
            const v = classifyCite(cite);
            return (
              <span key={i}>
                <span
                  className={`inline-block ${LEVEL_TEXT[v.level]} not-italic mr-0.5`}
                  title={`${v.kind} · ${(v.score * 100).toFixed(0)}%`}
                >
                  {v.emoji}
                </span>
                {cite}
                {i < cites.length - 1 && '; '}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
