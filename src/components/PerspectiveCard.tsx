import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { Stance } from '@/lib/supabase/database.types';
import { aggregateConfidence, classifyCite, type ConfidenceLevel } from '@/lib/data/evidence-confidence';
import type { PerspectiveCitation } from '@/lib/external-evidence/types';
import type { PerspectiveClaim } from '@/lib/stocks/perspective-claims';
import { ExternalLink } from '@/components/ExternalLink';

interface Props {
  // Typed as `string` (not the `Persona` union) because the mock/stub data
  // path (src/lib/data/mock.ts) also feeds this component and types its
  // persona ids as plain strings — see GLOSSARY.md "mock data stays dynamic".
  persona: string;
  name: string;
  stance: Stance;
  confidence: number;
  summary: string;
  cites: string[];
  citations?: PerspectiveCitation[];
  claims?: PerspectiveClaim[];
  footer?: ReactNode;
}

const STANCE_BORDER: Record<Stance, string> = {
  bullish: 'border-l-bullish',
  neutral: 'border-l-neutral',
  bearish: 'border-l-bearish',
};

const LEVEL_TEXT: Record<ConfidenceLevel, string> = {
  high: 'text-status-good',
  medium: 'text-warn',
  low: 'text-status-bad',
  unknown: 'text-text-muted',
};

const LEVEL_BG: Record<ConfidenceLevel, string> = {
  high: 'bg-status-good/10 text-status-good border-status-good/30',
  medium: 'bg-warn/15 text-warn border-warn/30',
  low: 'bg-status-bad/10 text-status-bad border-status-bad/30',
  unknown: 'bg-bg-card text-text-muted border-border',
};

export function PerspectiveCard({ persona, name, stance, confidence, summary, cites, citations = [], claims = [], footer }: Props) {
  const t = useTranslations('components.perspectiveCard');
  const tPersonas = useTranslations('components.personas');
  const evidence = aggregateConfidence(cites);
  // Prefer the localized display name keyed by persona id; fall back to the
  // raw `name` (already-resolved Chinese name from the API payload) if the
  // id isn't in the dictionary — defensive against future personas.
  const displayName = tPersonas.has(persona) ? tPersonas(persona) : name;

  return (
    <div className={`mb-2.5 rounded-md border-l-[3px] bg-bg-card p-3.5 ${STANCE_BORDER[stance]}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">{displayName}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-dim">{t('confidence')} {confidence.toFixed(1)}/10</span>
          {/* Evidence-confidence badge — evidence.label/kind/counts are dynamic
              values sourced from lib/data/evidence-confidence.ts (out of scope). */}
          {cites.length > 0 && (
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_BG[evidence.level]}`}
              title={t('evidenceStrengthTitle', {
                label: evidence.label,
                score: (evidence.score * 100).toFixed(0),
                high: evidence.high_count,
                medium: evidence.medium_count,
                low: evidence.low_count,
                unknown: evidence.unknown_count,
              })}
            >
              {evidence.label}
            </span>
          )}
        </div>
      </div>
      {claims.length > 0 ? (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {claims.map((claim, index) => (
            <div key={`${claim.kind}-${index}`} className="py-3 first:pt-2.5 last:pb-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase text-text-muted">
                {t(`claimKinds.${claim.kind}`)}
              </div>
              <p className="text-sm leading-relaxed text-text">{claim.text}</p>
              {claim.dataCites.length > 0 && (
                <p className="mt-1.5 text-[11px] text-text-muted">
                  <span className="font-medium text-text-dim">{t('structuredEvidence')}:</span>{' '}
                  {claim.dataCites.join(' · ')}
                </p>
              )}
              {claim.citations.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {claim.citations.map((citation) => (
                    <div key={citation.id} className="border-l border-border-active pl-2.5 text-[11px]">
                      <ExternalLink href={citation.url} className="font-medium text-text-dim hover:text-accent">
                        {citation.domain} · {t('sourceQuality', { value: Math.round((citation.qualityScore ?? citation.trustScore) * 100) })}
                      </ExternalLink>
                      {citation.excerpt && <blockquote className="mt-0.5 line-clamp-2 text-text-muted">{citation.excerpt}</blockquote>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <div className="mb-1.5 text-sm leading-relaxed">{summary}</div>}
      {claims.length === 0 && cites.length > 0 && (
        <div className="text-[11px] italic text-text-muted">
              <span className="not-italic mr-1">{t('cite')}:</span>
          {cites.map((cite, i) => {
            const v = classifyCite(cite);
            return (
              <span key={i}>
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${LEVEL_TEXT[v.level]} bg-current`} title={`${v.kind} · ${(v.score * 100).toFixed(0)}%`} />
                {cite}
                {i < cites.length - 1 && '; '}
              </span>
            );
          })}
        </div>
      )}
      {claims.length === 0 && citations.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
          <span>{t('webSources')}:</span>
          {citations.map((citation) => (
            <ExternalLink
              key={citation.id}
              href={citation.url}
              className="max-w-[220px] truncate rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-text-dim hover:border-accent hover:text-accent"
              title={`${citation.title} · ${citation.domain}`}
            >
              {citation.domain} · {t('sourceQuality', { value: Math.round((citation.qualityScore ?? citation.trustScore) * 100) })}{(citation.corroborationCount ?? 1) > 1 ? ` · ${t('sourceCount', { count: citation.corroborationCount ?? 1 })}` : ''}
            </ExternalLink>
          ))}
        </div>
      )}
      {footer && <div className="mt-3 border-t border-border/70 pt-2.5">{footer}</div>}
    </div>
  );
}
