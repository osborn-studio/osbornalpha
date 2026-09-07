'use client';

import { BellPlus, Check, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PerspectiveClaim } from '@/lib/stocks/perspective-claims';
import { WatchlistRequestError, watchlistJsonRequest } from '@/lib/watchlist/api-client';
import type { WatchlistAlertWithOrigin } from '@/lib/supabase/database.types';

export function PerspectiveClaimAlertDraftButton({
  itemId,
  perspectiveId,
  claim,
  onOpenAlerts,
}: {
  itemId?: string;
  perspectiveId?: string;
  claim: PerspectiveClaim;
  onOpenAlerts?: () => void;
}) {
  const t = useTranslations('components.perspectiveCard');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'existing' | 'error'>('idle');
  if (!itemId || !perspectiveId || !claim.id || !claim.invalidation) return null;

  async function createDraft() {
    setState('saving');
    try {
      await watchlistJsonRequest<{ alert: WatchlistAlertWithOrigin }>('/api/watchlist/alerts/from-claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, perspectiveId, claimId: claim.id }),
      }, 'claim_alert_draft_create_failed');
      setState('saved');
    } catch (error) {
      setState(error instanceof WatchlistRequestError && error.status === 409 ? 'existing' : 'error');
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {state === 'saved' || state === 'existing' ? (
        <>
          <span className="inline-flex h-7 items-center gap-1.5 text-[11px] font-medium text-status-good">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />{t(state === 'existing' ? 'alertDraftExists' : 'alertDraftCreated')}
          </span>
          {onOpenAlerts && <button type="button" onClick={onOpenAlerts} className="h-7 rounded border border-border px-2.5 text-[11px] text-text-dim hover:text-text">{t('reviewAlertDraft')}</button>}
        </>
      ) : (
        <button type="button" onClick={() => void createDraft()} disabled={state === 'saving'} className="inline-flex h-7 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] text-text-dim hover:border-accent/40 hover:text-text disabled:opacity-50">
          {state === 'saving' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <BellPlus className="h-3.5 w-3.5" aria-hidden="true" />}
          {state === 'saving' ? t('creatingAlertDraft') : t('createAlertDraft')}
        </button>
      )}
      {state === 'error' && <span className="text-[11px] text-status-bad" role="alert">{t('alertDraftError')}</span>}
    </div>
  );
}
