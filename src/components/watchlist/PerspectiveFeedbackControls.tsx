'use client';

import { Check, CircleAlert, Clock3, RotateCcw, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';

interface Props {
  perspective: PerspectiveRow;
  saving: boolean;
  onSave: (
    perspectiveId: string,
    input: { verdict: 'helpful' | 'incorrect' | 'outdated'; reason?: string | null; correctedStance?: PerspectiveRow['stance'] | null },
  ) => Promise<boolean>;
  onClear: (perspectiveId: string) => Promise<boolean>;
}

export function PerspectiveFeedbackControls({ perspective, saving, onSave, onClear }: Props) {
  const t = useTranslations('market.table.drawer.research.feedback');
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(perspective.feedback?.reason ?? '');
  const [correctedStance, setCorrectedStance] = useState<PerspectiveRow['stance'] | ''>(
    perspective.feedback?.correctedStance ?? '',
  );
  if (!perspective.id) return <p className="text-[11px] text-text-muted">{t('notSaved')}</p>;
  const active = perspective.feedback?.verdict;
  const save = async (verdict: 'helpful' | 'incorrect' | 'outdated') => {
    const ok = await onSave(perspective.id!, {
      verdict,
      reason: verdict === 'incorrect' ? reason : null,
      correctedStance: verdict === 'incorrect' ? correctedStance || null : null,
    });
    if (ok) setEditing(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('label')}>
        <button type="button" disabled={saving} aria-pressed={active === 'helpful'} onClick={() => void save('helpful')}
          className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] ${active === 'helpful' ? 'border-status-good/40 bg-status-good/10 text-status-good' : 'border-border text-text-dim hover:text-text'}`}>
          <ThumbsUp className="h-3 w-3" aria-hidden="true" />{t('helpful')}
        </button>
        <button type="button" disabled={saving} aria-pressed={active === 'incorrect'} onClick={() => setEditing(true)}
          className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] ${active === 'incorrect' ? 'border-status-bad/40 bg-status-bad/10 text-status-bad' : 'border-border text-text-dim hover:text-text'}`}>
          <CircleAlert className="h-3 w-3" aria-hidden="true" />{t('incorrect')}
        </button>
        <button type="button" disabled={saving} aria-pressed={active === 'outdated'} onClick={() => void save('outdated')}
          className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[11px] ${active === 'outdated' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-border text-text-dim hover:text-text'}`}>
          <Clock3 className="h-3 w-3" aria-hidden="true" />{t('outdated')}
        </button>
        {active && <button type="button" disabled={saving} onClick={() => void onClear(perspective.id!)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" aria-label={t('clear')} title={t('clear')}><RotateCcw className="h-3 w-3" aria-hidden="true" /></button>}
      </div>
      {editing && (
        <div className="mt-2 grid gap-2 rounded border border-border/70 bg-bg-elevated/60 p-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
          <select value={correctedStance} onChange={(event) => setCorrectedStance(event.target.value as PerspectiveRow['stance'] | '')} aria-label={t('correctedStance')} className="h-8 text-[11px]">
            <option value="">{t('keepStance')}</option>
            <option value="bullish">{t('stances.bullish')}</option>
            <option value="neutral">{t('stances.neutral')}</option>
            <option value="bearish">{t('stances.bearish')}</option>
          </select>
          <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('reason')} aria-label={t('reason')} className="h-8 min-w-0 text-[11px]" />
          <div className="flex gap-1">
            <button type="button" disabled={saving} onClick={() => void save('incorrect')} className="icon-button !h-8 !w-8 !basis-8 bg-accent-dim text-white" aria-label={t('save')} title={t('save')}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="h-8 px-2 text-[11px] text-text-muted hover:text-text">{t('cancel')}</button>
          </div>
        </div>
      )}
      {(perspective.outcomes?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {perspective.outcomes!.map((outcome) => (
            <span key={`${outcome.horizonDays}:${outcome.evaluatedAt}`} className={outcome.directionCorrect ? 'text-status-good' : 'text-warn'}>
              {t('outcome', { days: outcome.horizonDays, value: `${outcome.returnPct >= 0 ? '+' : ''}${outcome.returnPct.toFixed(1)}%` })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
