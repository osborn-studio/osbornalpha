'use client';

import { Check, CircleX, Clock3, RotateCcw, ShieldQuestion, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PerspectiveClaim } from '@/lib/stocks/perspective-claims';
import type { PerspectiveClaimVerdict } from '@/lib/watchlist/perspective-claim-feedback';

interface ClaimFeedbackView {
  verdict: PerspectiveClaimVerdict;
  reason: string | null;
}

export function PerspectiveClaimFeedbackControls({
  perspectiveId,
  claim,
  feedback,
  saving,
  onSave,
  onClear,
}: {
  perspectiveId?: string;
  claim: PerspectiveClaim;
  feedback?: ClaimFeedbackView;
  saving: boolean;
  onSave: (perspectiveId: string, claimId: string, input: { verdict: PerspectiveClaimVerdict; reason?: string | null }) => Promise<boolean>;
  onClear: (perspectiveId: string, claimId: string) => Promise<boolean>;
}) {
  const t = useTranslations('market.table.drawer.research.feedback.claim');
  const [editing, setEditing] = useState<PerspectiveClaimVerdict | null>(null);
  const [reason, setReason] = useState(feedback?.reason ?? '');
  if (!perspectiveId || !claim.id) return null;

  const save = async (verdict: PerspectiveClaimVerdict) => {
    const ok = await onSave(perspectiveId, claim.id!, { verdict, reason: reason.trim() || null });
    if (ok) setEditing(null);
  };
  const actions: Array<{ verdict: PerspectiveClaimVerdict; icon: typeof ThumbsUp }> = [
    { verdict: 'helpful', icon: ThumbsUp },
    { verdict: 'incorrect', icon: CircleX },
    { verdict: 'outdated', icon: Clock3 },
    { verdict: 'unsupported', icon: ShieldQuestion },
  ];

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <div className="flex items-center gap-1" role="group" aria-label={t('label')}>
        <span className="mr-1 text-[10px] font-medium text-text-muted">{t('label')}</span>
        {actions.map(({ verdict, icon: Icon }) => (
          <button
            key={verdict}
            type="button"
            disabled={saving}
            aria-pressed={feedback?.verdict === verdict}
            aria-label={t(verdict)}
            title={t(verdict)}
            onClick={() => verdict === 'incorrect' || verdict === 'unsupported' ? setEditing(verdict) : void save(verdict)}
            className={`icon-button !h-7 !w-7 !basis-7 ${feedback?.verdict === verdict ? 'border-accent/40 bg-accent/10 text-accent' : ''}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
        {feedback && (
          <button type="button" disabled={saving} onClick={() => void onClear(perspectiveId, claim.id!)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" aria-label={t('clear')} title={t('clear')}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex items-center gap-1.5">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={t('reason')} className="h-8 min-w-0 flex-1 text-[11px]" />
          <button type="button" disabled={saving} onClick={() => void save(editing)} className="icon-button !h-8 !w-8 !basis-8 bg-accent-dim text-white" aria-label={t('save')} title={t('save')}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <button type="button" disabled={saving} onClick={() => setEditing(null)} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('cancel')} title={t('cancel')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}
