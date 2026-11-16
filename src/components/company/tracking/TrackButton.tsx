// src/components/company/tracking/TrackButton.tsx
// Header / inline action (spec §5.2 "跟踪 ✓"): not watching → POST watch; watching → link to /watchlist/tracking.
// Watching state = inbox?issuerId=&limit=1 (200 / 404), not the unread-scanning GET /watches. Fails closed:
// 401 → sign-in hint, any other read failure → disabled "unavailable" (never offers a blind POST). One POST at a
// time (busy guard). A successful add notifies every subscriber of the issuer (header button, inline button,
// CompanyTrackingView) through watch-sync, and calls `onTracked`; the cap in the error comes from the response.
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { addWatch, isWatching, TrackingApiError } from '@/lib/company/tracking-client';
import { notifyWatchChanged, subscribeWatchChanged } from './watch-sync';
import { useTrackingError } from './WatchPanel';

type State = 'loading' | 'watching' | 'idle' | 'login' | 'unavailable';

export function TrackButton({ issuerId, onTracked }: { issuerId: string; onTracked?: () => void }) {
  const t = useTranslations('tracking');
  const { show } = useToast();
  const errorText = useTrackingError();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => subscribeWatchChanged(issuerId, () => setNonce((n) => n + 1)), [issuerId]);
  useEffect(() => {
    let live = true;
    isWatching(issuerId)
      .then((w) => { if (live) setState(w ? 'watching' : 'idle'); })
      .catch((e) => { if (live) setState(e instanceof TrackingApiError && e.status === 401 ? 'login' : 'unavailable'); });
    return () => { live = false; };
  }, [issuerId, nonce]);
  useEffect(() => { setState('loading'); }, [issuerId]);
  if (state === 'watching') {
    return <Link href="/watchlist/tracking" className="inline-flex min-h-11 items-center text-sm text-accent sm:min-h-9" data-testid="track-button">{t('company.tracking')}</Link>;
  }
  return (
    <Button
      variant="secondary" size="sm" data-testid="track-button" className="min-h-11 sm:min-h-0" disabled={state !== 'idle' || busy}
      onClick={async () => {
        if (inFlight.current) return;
        inFlight.current = true; setBusy(true);
        try { await addWatch({ issuerId }); setState('watching'); notifyWatchChanged(issuerId); onTracked?.(); }
        catch (e) { show(errorText(e, null)); }
        finally { inFlight.current = false; setBusy(false); }
      }}
    >
      {state === 'login' ? t('button.loginRequired') : state === 'unavailable' ? t('button.unavailable') : t('company.track')}
    </Button>
  );
}
